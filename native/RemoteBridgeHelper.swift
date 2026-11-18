import AppKit
import ApplicationServices
import AudioToolbox
import AVFoundation
import Carbon
import CoreAudio
import Foundation

// A small, local-only helper for the Remote Bridge web app.
// It receives PCM and actions over stdin as newline-delimited JSON and writes
// audio into a virtual loopback device (MiRemoteV / SayAll / BlackHole).

struct AudioDeviceInfo {
    let id: AudioDeviceID
    let name: String
    let uid: String
    let outputChannels: Int
}

let outputLock = NSLock()

func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          var line = String(data: data, encoding: .utf8) else { return }
    line += "\n"
    outputLock.lock()
    FileHandle.standardOutput.write(Data(line.utf8))
    outputLock.unlock()
}

func emitError(_ message: String, code: String = "helper_error") {
    emit(["type": "error", "code": code, "message": message])
}

func stringProperty(_ objectID: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String? {
    var address = AudioObjectPropertyAddress(
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var value: CFString? = nil
    var size = UInt32(MemoryLayout<CFString?>.size)
    let status = withUnsafeMutablePointer(to: &value) { pointer in
        AudioObjectGetPropertyData(objectID, &address, 0, nil, &size, pointer)
    }
    guard status == noErr, let result = value else { return nil }
    return result as String
}

func channelCount(_ deviceID: AudioDeviceID, scope: AudioObjectPropertyScope) -> Int {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyStreamConfiguration,
        mScope: scope,
        mElement: kAudioObjectPropertyElementMain
    )
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(deviceID, &address, 0, nil, &size) == noErr,
          size > 0 else { return 0 }

    let raw = UnsafeMutableRawPointer.allocate(
        byteCount: Int(size),
        alignment: MemoryLayout<AudioBufferList>.alignment
    )
    defer { raw.deallocate() }
    guard AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, raw) == noErr else {
        return 0
    }
    let list = UnsafeMutableAudioBufferListPointer(raw.assumingMemoryBound(to: AudioBufferList.self))
    return list.reduce(0) { $0 + Int($1.mNumberChannels) }
}

func allAudioDevices() -> [AudioDeviceInfo] {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var size: UInt32 = 0
    let system = AudioObjectID(kAudioObjectSystemObject)
    guard AudioObjectGetPropertyDataSize(system, &address, 0, nil, &size) == noErr else {
        return []
    }
    let count = Int(size) / MemoryLayout<AudioDeviceID>.size
    var ids = [AudioDeviceID](repeating: 0, count: count)
    guard AudioObjectGetPropertyData(system, &address, 0, nil, &size, &ids) == noErr else {
        return []
    }

    return ids.compactMap { id in
        guard let name = stringProperty(id, kAudioObjectPropertyName) else { return nil }
        let uid = stringProperty(id, kAudioDevicePropertyDeviceUID) ?? ""
        let outputs = channelCount(id, scope: kAudioObjectPropertyScopeOutput)
        guard outputs > 0 else { return nil }
        return AudioDeviceInfo(id: id, name: name, uid: uid, outputChannels: outputs)
    }
}

func findVirtualDevice(preferredName: String?) -> AudioDeviceInfo? {
    let devices = allAudioDevices()
    if let preferredName, !preferredName.isEmpty {
        if let exact = devices.first(where: {
            $0.name.caseInsensitiveCompare(preferredName) == .orderedSame
                || $0.uid == preferredName
        }) {
            return exact
        }
        if let partial = devices.first(where: {
            $0.name.localizedCaseInsensitiveContains(preferredName)
        }) {
            return partial
        }
    }

    let priorities = ["MiRemoteV", "SayAll", "BlackHole"]
    for needle in priorities {
        if let match = devices.first(where: {
            $0.name.localizedCaseInsensitiveContains(needle)
                || $0.uid.localizedCaseInsensitiveContains(needle)
        }) {
            return match
        }
    }
    return nil
}

func repairVirtualDeviceLevel(_ device: AudioDeviceInfo) {
    let volumeSelector = AudioObjectPropertySelector(kAudioDevicePropertyVolumeScalar)
    let muteSelector = AudioObjectPropertySelector(kAudioDevicePropertyMute)
    let scopes: [AudioObjectPropertyScope] = [
        kAudioObjectPropertyScopeOutput,
        kAudioObjectPropertyScopeGlobal
    ]
    let elements: [AudioObjectPropertyElement] = [
        kAudioObjectPropertyElementMain,
        1,
        2
    ]
    var target: Float = 1.0
    var unmuted: UInt32 = 0

    for scope in scopes {
        for element in elements {
            var volumeAddress = AudioObjectPropertyAddress(
                mSelector: volumeSelector,
                mScope: scope,
                mElement: element
            )
            if AudioObjectHasProperty(device.id, &volumeAddress) {
                AudioObjectSetPropertyData(
                    device.id,
                    &volumeAddress,
                    0,
                    nil,
                    UInt32(MemoryLayout<Float>.size),
                    &target
                )
            }

            var muteAddress = AudioObjectPropertyAddress(
                mSelector: muteSelector,
                mScope: scope,
                mElement: element
            )
            if AudioObjectHasProperty(device.id, &muteAddress) {
                AudioObjectSetPropertyData(
                    device.id,
                    &muteAddress,
                    0,
                    nil,
                    UInt32(MemoryLayout<UInt32>.size),
                    &unmuted
                )
            }
        }
    }
}

private struct KeyMap {
    static let byCode: [String: CGKeyCode] = [
        "KeyA": 0, "KeyS": 1, "KeyD": 2, "KeyF": 3, "KeyH": 4, "KeyG": 5,
        "KeyZ": 6, "KeyX": 7, "KeyC": 8, "KeyV": 9, "KeyB": 11, "KeyQ": 12,
        "KeyW": 13, "KeyE": 14, "KeyR": 15, "KeyY": 16, "KeyT": 17,
        "Digit1": 18, "Digit2": 19, "Digit3": 20, "Digit4": 21, "Digit6": 22,
        "Digit5": 23, "Equal": 24, "Digit9": 25, "Digit7": 26, "Minus": 27,
        "Digit8": 28, "Digit0": 29, "BracketRight": 30, "KeyO": 31,
        "KeyU": 32, "BracketLeft": 33, "KeyI": 34, "KeyP": 35, "Enter": 36,
        "KeyL": 37, "KeyJ": 38, "Quote": 39, "KeyK": 40, "Semicolon": 41,
        "Backslash": 42, "Comma": 43, "Slash": 44, "KeyN": 45, "KeyM": 46,
        "Period": 47, "Tab": 48, "Space": 49, "Backquote": 50,
        "Backspace": 51, "Escape": 53,
        "F17": 64, "F18": 79, "F19": 80, "F20": 90,
        "F5": 96, "F6": 97, "F7": 98, "F3": 99, "F8": 100, "F9": 101,
        "F11": 103, "F13": 105, "F16": 106, "F14": 107, "F10": 109,
        "F12": 111, "F15": 113,
        "Home": 115, "PageUp": 116, "Delete": 117, "F4": 118, "End": 119,
        "F2": 120, "PageDown": 121, "F1": 122,
        "ArrowLeft": 123, "ArrowRight": 124, "ArrowDown": 125, "ArrowUp": 126,
        "NumpadEnter": 76
    ]
}

final class KeyInjector {
    private var functionHeld = false
    private var functionKeyCode: CGKeyCode = 63

    var accessibilityTrusted: Bool {
        AXIsProcessTrusted()
    }

    func requestAccessibility() -> Bool {
        let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        let options = [promptKey: true] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    func inject(combo: [String: Any]) -> (Bool, String) {
        guard accessibilityTrusted else {
            return (false, "需要先在系统设置中授予辅助功能权限")
        }
        guard let source = CGEventSource(stateID: .hidSystemState) else {
            return (false, "无法创建输入事件源")
        }
        guard let code = combo["code"] as? String,
              let keyCode = KeyMap.byCode[code] else {
            return (false, "不支持的按键")
        }

        let requested = (combo["modifiers"] as? [String]) ?? []
        let ordered = ["control", "option", "shift", "cmd", "fn"].filter {
            requested.contains($0)
        }
        var flags: CGEventFlags = []
        var pressedModifiers: [(CGKeyCode, CGEventFlags)] = []

        for modifier in ordered {
            guard let modifierKey = modifierKeyInfo(modifier) else { continue }
            flags.formUnion(modifierKey.flags)
            pressedModifiers.append((modifierKey.keyCode, modifierKey.flags))
            guard let down = CGEvent(
                keyboardEventSource: source,
                virtualKey: modifierKey.keyCode,
                keyDown: true
            ) else {
                continue
            }
            down.type = .flagsChanged
            down.flags = flags
            down.post(tap: .cghidEventTap)
        }

        guard let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false) else {
            releaseModifiers(source: source, pressed: pressedModifiers)
            return (false, "无法创建键盘事件")
        }
        down.flags = flags
        up.flags = flags
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
        releaseModifiers(source: source, pressed: pressedModifiers)
        return (true, "ok")
    }

    func postMedia(_ command: String) -> (Bool, String) {
        guard accessibilityTrusted else {
            return (false, "需要先在系统设置中授予辅助功能权限")
        }
        let keyType: Int32
        switch command {
        case "volumeUp": keyType = 0
        case "volumeDown": keyType = 1
        case "mute": keyType = 7
        case "playPause": keyType = 16
        case "nextTrack": keyType = 17
        case "previousTrack": keyType = 18
        default: return (false, "不支持的媒体动作")
        }

        guard let down = mediaEvent(keyType: keyType, isDown: true),
              let up = mediaEvent(keyType: keyType, isDown: false) else {
            return (false, "无法创建媒体按键")
        }
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
        return (true, "ok")
    }

    private struct TextFocusCandidate {
        let element: AXUIElement
        let role: String
        let inWebArea: Bool
        let area: CGFloat
    }

    func focusInput() -> (Bool, String) {
        guard accessibilityTrusted else {
            return (false, "需要先在系统设置中授予辅助功能权限")
        }
        guard let application = NSWorkspace.shared.frontmostApplication else {
            return (false, "没有找到前台应用")
        }
        let appElement = AXUIElementCreateApplication(application.processIdentifier)
        let appName = application.localizedName ?? "未知应用"

        // Chromium / Electron only build a rich accessibility tree on demand.
        AXUIElementSetAttributeValue(
            appElement,
            "AXEnhancedUserInterface" as CFString,
            kCFBooleanTrue
        )

        if let focused = copyElementAttribute(appElement, kAXFocusedUIElementAttribute as String),
           let role = role(of: focused),
           isTextRole(role),
           focusOrClick(focused, appElement: appElement, preferClick: false) {
            return (true, "ok")
        }

        var roots: [AXUIElement] = []
        if let window = copyElementAttribute(appElement, kAXFocusedWindowAttribute as String) {
            roots.append(window)
        }
        if let window = copyElementAttribute(appElement, kAXMainWindowAttribute as String) {
            roots.append(window)
        }
        roots.append(appElement)

        var candidates: [TextFocusCandidate] = []
        for root in roots {
            collectTextCandidates(
                in: root,
                depth: 0,
                visited: 0,
                inWebArea: false,
                into: &candidates
            )
            if !candidates.isEmpty { break }
        }
        guard !candidates.isEmpty else {
            return (false, "没有找到可聚焦的输入框（\(appName)）")
        }

        // Prefer fields inside the web content area (browser omniboxes are
        // outside of it). Then prefer the largest field, which is usually the
        // chat / document input rather than a small search box.
        let webCandidates = candidates.filter { $0.inWebArea }
        let browserBundleIds: Set<String> = [
            "com.apple.Safari",
            "com.google.Chrome",
            "com.google.Chrome.canary",
            "com.google.chrome.for.testing",
            "com.microsoft.edgemac",
            "com.brave.Browser",
            "org.mozilla.firefox",
            "company.thebrowser.Browser",
            "com.vivaldi.Vivaldi",
            "com.operasoftware.Opera"
        ]
        let bundleId = application.bundleIdentifier ?? ""
        let normalizedBundleId = bundleId.lowercased()
        let isBrowser = browserBundleIds.contains(bundleId)
            || normalizedBundleId.contains("chrome")
            || normalizedBundleId.contains("chromium")
            || normalizedBundleId.contains("firefox")
            || normalizedBundleId.contains("safari")
        if isBrowser && webCandidates.isEmpty {
            // Do not hijack the browser address bar when the page content is
            // not exposed to accessibility.
            return (false, "没有找到页面输入框（\(appName)），请先在页面上点一下目标输入框")
        }
        var pool = webCandidates.isEmpty ? candidates : webCandidates
        pool.sort { candidateScore($0) > candidateScore($1) }

        for candidate in pool {
            let ok = focusOrClick(
                candidate.element,
                appElement: appElement,
                preferClick: candidate.inWebArea
            )
            if ok {
                return (true, "ok")
            }
        }
        return (false, "没有找到可聚焦的输入框（\(appName)）")
    }

    private func role(of element: AXUIElement) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(
            element,
            kAXRoleAttribute as CFString,
            &value
        ) == .success else {
            return nil
        }
        return value as? String
    }

    private func isTextRole(_ role: String) -> Bool {
        let acceptable: Set<String> = [
            kAXTextFieldRole as String,
            kAXTextAreaRole as String,
            kAXComboBoxRole as String,
            "AXSearchField"
        ]
        return acceptable.contains(role)
    }

    private func copyElementAttribute(_ element: AXUIElement, _ attribute: String) -> AXUIElement? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(
            element,
            attribute as CFString,
            &value
        ) == .success,
              let value,
              CFGetTypeID(value) == AXUIElementGetTypeID() else {
            return nil
        }
        return unsafeBitCast(value, to: AXUIElement.self)
    }

    private func elementSize(_ element: AXUIElement) -> CGSize {
        var sizeRef: CFTypeRef?
        var size = CGSize.zero
        if AXUIElementCopyAttributeValue(
            element,
            kAXSizeAttribute as CFString,
            &sizeRef
        ) == .success,
           let sizeRef,
           CFGetTypeID(sizeRef) == AXValueGetTypeID() {
            let sizeValue = unsafeBitCast(sizeRef, to: AXValue.self)
            _ = AXValueGetValue(sizeValue, .cgSize, &size)
        }
        return size
    }

    private func candidateScore(_ candidate: TextFocusCandidate) -> CGFloat {
        var score = candidate.area
        if candidate.role == (kAXTextAreaRole as String) {
            score += 25_000
        } else if candidate.role == "AXSearchField" {
            score -= 10_000
        }
        return score
    }

    private func collectTextCandidates(
        in element: AXUIElement,
        depth: Int,
        visited: Int,
        inWebArea: Bool,
        into candidates: inout [TextFocusCandidate]
    ) {
        guard depth < 12, visited < 1_200 else { return }
        let role = role(of: element)
        if let role, isTextRole(role) {
            if !candidates.contains(where: { CFEqual($0.element, element) }) {
                let size = elementSize(element)
                let area = max(size.width, 0) * max(size.height, 0)
                candidates.append(TextFocusCandidate(
                    element: element,
                    role: role,
                    inWebArea: inWebArea,
                    area: area
                ))
            }
            return
        }

        let insideWebArea = inWebArea || role == "AXWebArea"
        if role == "AXWebArea" {
            // Chromium / Electron web content stays collapsed until a client
            // asks for manual accessibility.
            AXUIElementSetAttributeValue(
                element,
                "AXManualAccessibility" as CFString,
                kCFBooleanTrue
            )
        }

        var children: [AXUIElement] = []
        for attribute in [
            kAXChildrenAttribute as String,
            "AXContents",
            "AXVisibleChildren"
        ] {
            var value: CFTypeRef?
            guard AXUIElementCopyAttributeValue(
                element,
                attribute as CFString,
                &value
            ) == .success,
                  let array = value as? [AXUIElement] else {
                continue
            }
            children.append(contentsOf: array)
        }
        if children.isEmpty { return }

        var count = visited
        var seen = Set<CFHashCode>()
        for child in children {
            let hash = CFHash(child)
            guard !seen.contains(hash) else { continue }
            seen.insert(hash)
            count += 1
            collectTextCandidates(
                in: child,
                depth: depth + 1,
                visited: count,
                inWebArea: insideWebArea,
                into: &candidates
            )
        }
    }

    private func focusedElementMatches(_ element: AXUIElement, appElement: AXUIElement) -> Bool {
        guard let focused = copyElementAttribute(
            appElement,
            kAXFocusedUIElementAttribute as String
        ) else {
            return false
        }
        return CFEqual(focused, element)
    }

    private func focusOrClick(
        _ element: AXUIElement,
        appElement: AXUIElement,
        preferClick: Bool
    ) -> Bool {
        if !preferClick {
            _ = focus(element)
            if focusedElementMatches(element, appElement: appElement) {
                return true
            }
        }
        if click(element) {
            usleep(60_000)
            if focusedElementMatches(element, appElement: appElement) {
                return true
            }
        }
        if focus(element) {
            usleep(40_000)
            return focusedElementMatches(element, appElement: appElement)
        }
        return false
    }

    private func click(_ element: AXUIElement) -> Bool {
        var positionRef: CFTypeRef?
        var sizeRef: CFTypeRef?
        var position = CGPoint.zero
        var size = CGSize.zero
        guard AXUIElementCopyAttributeValue(
            element,
            kAXPositionAttribute as CFString,
            &positionRef
        ) == .success,
              let positionRef,
              CFGetTypeID(positionRef) == AXValueGetTypeID() else {
            return false
        }
        let positionValue = unsafeBitCast(positionRef, to: AXValue.self)
        guard AXValueGetValue(positionValue, .cgPoint, &position) else {
            return false
        }
        if AXUIElementCopyAttributeValue(
            element,
            kAXSizeAttribute as CFString,
            &sizeRef
        ) == .success,
           let sizeRef,
           CFGetTypeID(sizeRef) == AXValueGetTypeID() {
            let sizeValue = unsafeBitCast(sizeRef, to: AXValue.self)
            _ = AXValueGetValue(sizeValue, .cgSize, &size)
        }
        let center = CGPoint(
            x: position.x + max(size.width, 2) / 2,
            y: position.y + max(size.height, 2) / 2
        )
        guard let source = CGEventSource(stateID: .hidSystemState),
              let move = CGEvent(
                mouseEventSource: source,
                mouseType: .mouseMoved,
                mouseCursorPosition: center,
                mouseButton: .left
              ),
              let down = CGEvent(
                mouseEventSource: source,
                mouseType: .leftMouseDown,
                mouseCursorPosition: center,
                mouseButton: .left
              ),
              let up = CGEvent(
                mouseEventSource: source,
                mouseType: .leftMouseUp,
                mouseCursorPosition: center,
                mouseButton: .left
              ) else {
            return false
        }
        move.post(tap: .cghidEventTap)
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
        return true
    }

    func pressVoiceTrigger(_ trigger: String) {
        guard trigger != "none", accessibilityTrusted else { return }
        let keyCode: CGKeyCode?
        let flagValue: CGEventFlags
        switch trigger {
        case "fn":
            keyCode = 63
            flagValue = .maskSecondaryFn
        case "rightOption":
            keyCode = 61
            flagValue = .maskAlternate
        case "rightCommand":
            keyCode = 54
            flagValue = .maskCommand
        default:
            return
        }
        guard let keyCode,
              let source = CGEventSource(stateID: .hidSystemState),
              let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true) else {
            return
        }
        var flags = flagValue
        if trigger == "rightOption" {
            flags.formUnion(CGEventFlags(rawValue: 0x0000_0040))
        } else if trigger == "rightCommand" {
            flags.formUnion(CGEventFlags(rawValue: 0x0000_0010))
        }
        down.type = .flagsChanged
        down.flags = flags
        down.post(tap: .cghidEventTap)
        functionHeld = true
        functionKeyCode = keyCode
    }

    func releaseVoiceTrigger() {
        guard functionHeld else { return }
        functionHeld = false
        guard let source = CGEventSource(stateID: .hidSystemState),
              let up = CGEvent(keyboardEventSource: source, virtualKey: functionKeyCode, keyDown: false) else {
            return
        }
        up.type = .flagsChanged
        up.flags = []
        up.post(tap: .cghidEventTap)
    }

    private func modifierKeyInfo(_ modifier: String) -> (keyCode: CGKeyCode, flags: CGEventFlags)? {
        switch modifier {
        case "control":
            return (59, [.maskControl, CGEventFlags(rawValue: 0x0000_0001)])
        case "option":
            return (58, [.maskAlternate, CGEventFlags(rawValue: 0x0000_0020)])
        case "shift":
            return (56, [.maskShift, CGEventFlags(rawValue: 0x0000_0002)])
        case "cmd":
            return (55, [.maskCommand, CGEventFlags(rawValue: 0x0000_0008)])
        case "fn":
            return (63, [.maskSecondaryFn])
        default:
            return nil
        }
    }

    private func releaseModifiers(
        source: CGEventSource,
        pressed: [(CGKeyCode, CGEventFlags)]
    ) {
        var flags: CGEventFlags = pressed.reduce([]) { partial, item in
            partial.union(item.1)
        }
        for (keyCode, modifierFlags) in pressed.reversed() {
            flags.subtract(modifierFlags)
            guard let up = CGEvent(
                keyboardEventSource: source,
                virtualKey: keyCode,
                keyDown: false
            ) else {
                continue
            }
            up.type = .flagsChanged
            up.flags = flags
            up.post(tap: .cghidEventTap)
        }
    }

    private func mediaEvent(keyType: Int32, isDown: Bool) -> CGEvent? {
        let flags: Int = isDown ? 0xa00 : 0xb00
        return NSEvent.otherEvent(
            with: .systemDefined,
            location: .zero,
            modifierFlags: [],
            timestamp: ProcessInfo.processInfo.systemUptime,
            windowNumber: 0,
            context: nil,
            subtype: 8,
            data1: (Int(keyType) << 16) | flags,
            data2: -1
        )?.cgEvent
    }

    private func focus(_ element: AXUIElement) -> Bool {
        var settable: DarwinBoolean = false
        guard AXUIElementIsAttributeSettable(
            element,
            kAXFocusedAttribute as CFString,
            &settable
        ) == .success, settable.boolValue else {
            return false
        }
        return AXUIElementSetAttributeValue(
            element,
            kAXFocusedAttribute as CFString,
            kCFBooleanTrue
        ) == .success
    }
}

final class VirtualAudioOutput {
    private var engine: AVAudioEngine?
    private var player: AVAudioPlayerNode?
    private var sourceFormat: AVAudioFormat?
    private var device: AudioDeviceInfo?
    private var active = false
    private var sessionGeneration: UInt64 = 0

    var currentDevice: AudioDeviceInfo? { device }
    var isActive: Bool { active }

    func start(device: AudioDeviceInfo, sampleRate: Double) -> (Bool, String) {
        stop()
        sessionGeneration &+= 1
        let generation = sessionGeneration

        guard sampleRate >= 8000, sampleRate <= 96000 else {
            return (false, "不支持的采样率")
        }
        guard let format = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: 1,
            interleaved: false
        ) else {
            return (false, "无法创建音频格式")
        }

        repairVirtualDeviceLevel(device)

        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)

        guard let outputUnit = engine.outputNode.audioUnit else {
            return (false, "无法打开音频输出单元")
        }
        var deviceID = device.id
        let setDeviceResult = AudioUnitSetProperty(
            outputUnit,
            kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global,
            0,
            &deviceID,
            UInt32(MemoryLayout<AudioDeviceID>.size)
        )
        guard setDeviceResult == noErr else {
            return (false, "无法选择虚拟音频设备，状态码 \(setDeviceResult)")
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            return (false, "音频引擎启动失败：\(error.localizedDescription)")
        }
        player.play()

        self.engine = engine
        self.player = player
        self.sourceFormat = format
        self.device = device
        self.active = true

        NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: engine,
            queue: .main
        ) { [weak self] _ in
            guard let self, self.sessionGeneration == generation, self.active else { return }
            emitError("虚拟音频设备配置发生变化，语音输出已停止", code: "audio_configuration_changed")
            self.stop()
        }

        return (true, device.name)
    }

    func enqueue(_ data: Data) {
        guard active, let player, let format = sourceFormat else { return }
        let frames = data.count / 2
        guard frames > 0,
              let buffer = AVAudioPCMBuffer(
                  pcmFormat: format,
                  frameCapacity: AVAudioFrameCount(frames)
              ),
              let channel = buffer.floatChannelData?[0] else {
            return
        }
        buffer.frameLength = AVAudioFrameCount(frames)
        data.withUnsafeBytes { raw in
            let samples = raw.bindMemory(to: Int16.self)
            let count = min(frames, samples.count)
            for index in 0..<count {
                channel[index] = Float(samples[index]) / 32768.0
            }
        }
        player.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
        if !player.isPlaying {
            player.play()
        }
    }

    func finish(completion: @escaping () -> Void) {
        guard active, let player, let format = sourceFormat else {
            completion()
            return
        }
        let tailFrames = AVAudioFrameCount(format.sampleRate * 0.3)
        guard let silence = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: tailFrames) else {
            stop()
            completion()
            return
        }
        silence.frameLength = tailFrames
        if let channels = silence.floatChannelData {
            for channelIndex in 0..<Int(format.channelCount) {
                memset(
                    channels[channelIndex],
                    0,
                    Int(tailFrames) * MemoryLayout<Float>.size
                )
            }
        }
        let generation = sessionGeneration
        player.scheduleBuffer(
            silence,
            at: nil,
            options: [],
            completionCallbackType: .dataPlayedBack
        ) { [weak self] _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                guard let self,
                      self.active,
                      self.sessionGeneration == generation else {
                    return
                }
                self.stop()
                completion()
            }
        }
    }

    func stop() {
        active = false
        sessionGeneration &+= 1
        player?.stop()
        engine?.stop()
        player = nil
        engine = nil
        sourceFormat = nil
        device = nil
    }
}

let commandQueue = DispatchQueue(label: "remote-bridge.helper.commands")
let output = VirtualAudioOutput()
let keys = KeyInjector()
var selectedDevice: AudioDeviceInfo?
var voiceTrigger = "fn"
var preferredDeviceName: String? = ProcessInfo.processInfo.environment["SYSTEM_AUDIO_DEVICE"]

func currentStatus() -> [String: Any] {
    var devices: [[String: Any]] = []
    for device in allAudioDevices() {
        devices.append([
            "id": device.id,
            "name": device.name,
            "uid": device.uid,
            "outputChannels": device.outputChannels
        ])
    }
    let frontmost = NSWorkspace.shared.frontmostApplication
    var status: [String: Any] = [
        "type": "status",
        "audioAvailable": selectedDevice != nil,
        "accessibility": keys.accessibilityTrusted,
        "voiceTrigger": voiceTrigger,
        "active": output.isActive,
        "frontmostApp": frontmost?.localizedName ?? "",
        "frontmostBundleId": frontmost?.bundleIdentifier ?? "",
        "secureInput": IsSecureEventInputEnabled(),
        "devices": devices
    ]
    if let selectedDevice {
        status["device"] = selectedDevice.name
        status["deviceUID"] = selectedDevice.uid
        status["outputChannels"] = selectedDevice.outputChannels
    } else {
        status["device"] = NSNull()
        status["deviceUID"] = NSNull()
        status["outputChannels"] = 0
    }
    return status
}

func sendStatus() {
    emit(currentStatus())
}

func configureDevice(_ requested: String?) {
    preferredDeviceName = requested?.isEmpty == false ? requested : preferredDeviceName
    selectedDevice = findVirtualDevice(preferredName: preferredDeviceName)
    if let selectedDevice {
        emit([
            "type": "configured",
            "device": selectedDevice.name,
            "deviceUID": selectedDevice.uid,
            "outputChannels": selectedDevice.outputChannels
        ])
    } else {
        emitError(
            "未找到 MiRemoteV / SayAll / BlackHole 虚拟音频设备。请先安装虚拟麦克风驱动。",
            code: "virtual_device_missing"
        )
    }
    sendStatus()
}

func handle(_ command: [String: Any]) {
    guard let type = command["type"] as? String else { return }

    switch type {
    case "configure":
        if let trigger = command["voiceTrigger"] as? String,
           ["fn", "rightOption", "rightCommand", "none"].contains(trigger) {
            voiceTrigger = trigger
        }
        configureDevice(command["audioDevice"] as? String)
        return

    case "status":
        // Pick up a virtual device that was installed after launch.
        if selectedDevice == nil {
            selectedDevice = findVirtualDevice(preferredName: preferredDeviceName)
        }
        sendStatus()
        return

    case "request-accessibility":
        let trusted = keys.requestAccessibility()
        emit(["type": "accessibility", "trusted": trusted])
        sendStatus()
        return

    case "audio-start":
        guard let device = selectedDevice ?? findVirtualDevice(preferredName: preferredDeviceName) else {
            emitError("没有可用的虚拟音频设备", code: "virtual_device_missing")
            return
        }
        selectedDevice = device
        let sampleRate = (command["sampleRate"] as? NSNumber)?.doubleValue ?? 48000
        let trigger = (command["voiceTrigger"] as? String) ?? voiceTrigger
        voiceTrigger = trigger
        let started = output.start(device: device, sampleRate: sampleRate)
        guard started.0 else {
            emitError(started.1, code: "audio_start_failed")
            return
        }
        keys.pressVoiceTrigger(trigger)
        emit([
            "type": "audio-started",
            "device": device.name,
            "sampleRate": sampleRate,
            "voiceTrigger": trigger,
            "accessibility": keys.accessibilityTrusted
        ])
        return

    case "audio":
        guard let data = command["data"] as? String,
              let audio = Data(base64Encoded: data) else {
            return
        }
        output.enqueue(audio)
        return

    case "audio-end":
        output.finish {
            commandQueue.async {
                keys.releaseVoiceTrigger()
                emit(["type": "audio-ended"])
            }
        }
        return

    case "key":
        let result = keys.inject(combo: command)
        emit([
            "type": "action-result",
            "action": "key",
            "ok": result.0,
            "message": result.1
        ])
        sendStatus()
        return

    case "media":
        let mediaCommand = (command["command"] as? String) ?? ""
        let result = keys.postMedia(mediaCommand)
        emit([
            "type": "action-result",
            "action": mediaCommand,
            "ok": result.0,
            "message": result.1
        ])
        sendStatus()
        return

    case "focus-input":
        let result = keys.focusInput()
        emit([
            "type": "action-result",
            "action": "focusInput",
            "ok": result.0,
            "message": result.1
        ])
        sendStatus()
        return

    case "quit":
        output.stop()
        keys.releaseVoiceTrigger()
        exit(0)

    default:
        emitError("未知的控制命令：\(type)", code: "unknown_command")
    }
}

emit([
    "type": "hello",
    "helperVersion": 1,
    "accessibility": keys.accessibilityTrusted,
    "platform": "macOS"
])
configureDevice(preferredDeviceName)

DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine(strippingNewline: true) {
        guard !line.isEmpty else { continue }
        guard let data = line.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            emitError("控制消息不是有效 JSON", code: "invalid_json")
            continue
        }
        commandQueue.async {
            handle(object)
        }
    }
    commandQueue.async {
        output.stop()
        keys.releaseVoiceTrigger()
        exit(0)
    }
}

RunLoop.main.run()
