import AppKit
import Darwin
import Foundation

private let httpPort = ProcessInfo.processInfo.environment["REMOTE_BRIDGE_HTTP_PORT"] ?? "3000"
private let httpsPort = ProcessInfo.processInfo.environment["REMOTE_BRIDGE_HTTPS_PORT"] ?? "3443"
private let consoleURL = URL(string: "http://localhost:\(httpPort)/pc")!
private let suppressBrowser = ProcessInfo.processInfo.environment["REMOTE_BRIDGE_NO_BROWSER"] == "1"

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var statusLine: NSMenuItem!
    private var serverProcess: Process?
    private var logHandle: FileHandle?
    private var stopping = false
    private var expectedStop = false
    private var openedConsole = false
    private var signalSources: [DispatchSourceSignal] = []

    private var appDir: URL {
        Bundle.main.resourceURL!.appendingPathComponent("app", isDirectory: true)
    }

    private var nodeURL: URL {
        Bundle.main.resourceURL!.appendingPathComponent("runtime/node", isDirectory: false)
    }

    private var helperURL: URL {
        appDir.appendingPathComponent(
            "native/RemoteBridgeHelper.app/Contents/MacOS/RemoteBridgeHelper",
            isDirectory: false
        )
    }

    private var supportDir: URL {
        if let custom = ProcessInfo.processInfo.environment["REMOTE_BRIDGE_DATA_DIR"],
           !custom.isEmpty {
            return URL(fileURLWithPath: custom, isDirectory: true)
        }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("RemoteBridge", isDirectory: true)
    }

    private var logURL: URL {
        FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Logs/RemoteBridge/server.log", isDirectory: false)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        installSignalHandlers()
        buildMenu()
        startServer()
    }

    private func installSignalHandlers() {
        for sig in [SIGTERM, SIGINT, SIGHUP] {
            signal(sig, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
            source.setEventHandler {
                NSApp.terminate(nil)
            }
            source.resume()
            signalSources.append(source)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopping = true
        stopServer()
    }

    // MARK: - Menu

    private func buildMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            if let image = NSImage(
                systemSymbolName: "dot.radiowaves.left.and.right",
                accessibilityDescription: "Remote Bridge"
            ) {
                image.isTemplate = true
                button.image = image
            } else {
                button.title = "RB"
            }
        }

        let menu = NSMenu()
        statusLine = NSMenuItem(title: "正在启动…", action: nil, keyEquivalent: "")
        statusLine.isEnabled = false
        menu.addItem(statusLine)
        menu.addItem(NSMenuItem.separator())

        let console = NSMenuItem(title: "打开遥控台", action: #selector(openConsole), keyEquivalent: "o")
        console.target = self
        menu.addItem(console)

        let restart = NSMenuItem(title: "重新启动服务", action: #selector(restartServer), keyEquivalent: "r")
        restart.target = self
        menu.addItem(restart)

        let logs = NSMenuItem(title: "查看日志", action: #selector(openLog), keyEquivalent: "l")
        logs.target = self
        menu.addItem(logs)

        menu.addItem(NSMenuItem.separator())
        let quit = NSMenuItem(title: "退出 Remote Bridge", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)

        statusItem.menu = menu
    }

    private func setStatus(_ text: String) {
        statusLine.title = text
    }

    @objc private func openConsole() {
        NSWorkspace.shared.open(consoleURL)
    }

    @objc private func openLog() {
        try? FileManager.default.createDirectory(
            at: logURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        if !FileManager.default.fileExists(atPath: logURL.path) {
            FileManager.default.createFile(atPath: logURL.path, contents: Data())
        }
        NSWorkspace.shared.open(logURL)
    }

    @objc private func restartServer() {
        stopServer()
        openedConsole = false
        startServer()
    }

    @objc private func quit() {
        stopping = true
        stopServer()
        NSApp.terminate(nil)
    }

    // MARK: - Server lifecycle

    private func startServer() {
        setStatus("正在启动…")
        let fm = FileManager.default
        do {
            try fm.createDirectory(at: supportDir, withIntermediateDirectories: true)
            try fm.createDirectory(at: supportDir.appendingPathComponent("certs"), withIntermediateDirectories: true)
            try fm.createDirectory(at: logURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            if !fm.fileExists(atPath: logURL.path) {
                fm.createFile(atPath: logURL.path, contents: Data())
            }
            logHandle = try FileHandle(forWritingTo: logURL)
            logHandle?.seekToEndOfFile()
            let stamp = ISO8601DateFormatter().string(from: Date())
            logHandle?.write(Data("\n===== Remote Bridge \(stamp) =====\n".utf8))
        } catch {
            showError("无法创建数据目录", detail: error.localizedDescription)
            return
        }

        guard fm.isExecutableFile(atPath: nodeURL.path) else {
            showError("应用不完整", detail: "缺少内置 Node 运行时，请重新安装应用。")
            return
        }
        guard fm.fileExists(atPath: appDir.appendingPathComponent("server.js").path) else {
            showError("应用不完整", detail: "缺少服务端文件，请重新安装应用。")
            return
        }

        // If something is already answering on the port, do not start a second
        // server; just open the console.
        probeHealth { [weak self] healthy in
            guard let self else { return }
            if healthy {
                self.setStatus("服务已运行 · localhost:\(httpPort)")
                if !self.openedConsole {
                    self.openedConsole = true
                    if !suppressBrowser { self.openConsole() }
                }
                return
            }
            self.launchNode()
        }
    }

    private func launchNode() {
        expectedStop = false
        let process = Process()
        process.executableURL = nodeURL
        process.arguments = [appDir.appendingPathComponent("server.js").path]
        process.currentDirectoryURL = appDir
        process.standardOutput = logHandle
        process.standardError = logHandle

        var environment = ProcessInfo.processInfo.environment
        environment["DATA_DIR"] = supportDir.path
        environment["CERT_DIR"] = supportDir.appendingPathComponent("certs").path
        environment["HELPER_PATH"] = helperURL.path
        environment["DISABLE_NATIVE_BUILD"] = "1"
        environment["NODE_ENV"] = "production"
        environment["PORT"] = httpPort
        environment["HTTPS_PORT"] = httpsPort
        environment["PATH"] = environment["PATH"]
            ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        if environment["PATH"]?.isEmpty != false {
            environment["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        }
        process.environment = environment

        process.terminationHandler = { [weak self] finished in
            DispatchQueue.main.async {
                guard let self else { return }
                if self.serverProcess === finished {
                    self.serverProcess = nil
                }
                if self.stopping || self.expectedStop { return }
                self.setStatus("服务已停止")
                self.showError(
                    "遥控服务已停止",
                    detail: "退出码 \(finished.terminationStatus)。请查看日志了解原因。"
                )
            }
        }

        do {
            try process.run()
            serverProcess = process
            waitForHealth(attempts: 60)
        } catch {
            showError("无法启动服务", detail: error.localizedDescription)
        }
    }

    private func stopServer() {
        guard let process = serverProcess, process.isRunning else {
            serverProcess = nil
            return
        }
        expectedStop = true
        let pid = process.processIdentifier
        process.terminate()
        let deadline = Date().addingTimeInterval(3)
        while process.isRunning && Date() < deadline {
            usleep(100_000)
        }
        if process.isRunning {
            kill(pid, SIGKILL)
        }
        serverProcess = nil
    }

    private func probeHealth(completion: @escaping (Bool) -> Void) {
        guard let url = URL(string: "http://127.0.0.1:\(httpPort)/api/health") else {
            completion(false)
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 0.6
        URLSession.shared.dataTask(with: request) { _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async { completion(ok) }
        }.resume()
    }

    private func waitForHealth(attempts: Int) {
        if attempts <= 0 {
            setStatus("启动失败")
            showError("服务启动超时", detail: "请查看日志 \(logURL.path)")
            return
        }
        guard let url = URL(string: "http://127.0.0.1:\(httpPort)/api/health") else { return }
        var request = URLRequest(url: url)
        request.timeoutInterval = 0.6
        URLSession.shared.dataTask(with: request) { [weak self] _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async {
                guard let self else { return }
                if ok && self.serverProcess?.isRunning == true {
                    self.setStatus("服务运行中 · localhost:\(httpPort)")
                    if !self.openedConsole {
                        self.openedConsole = true
                        if !suppressBrowser { self.openConsole() }
                    }
                } else {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                        self.waitForHealth(attempts: attempts - 1)
                    }
                }
            }
        }.resume()
    }

    private func showError(_ title: String, detail: String) {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = detail
        alert.alertStyle = .warning
        alert.addButton(withTitle: "好")
        alert.runModal()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
