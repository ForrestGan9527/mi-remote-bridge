import AppKit
import ApplicationServices
import AudioToolbox
import AVFoundation
import Carbon
import CoreAudio
import Foundation
import Speech

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

func defaultInputDeviceID() -> AudioDeviceID? {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultInputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var deviceID = AudioDeviceID(0)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    let status = AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &address,
        0,
        nil,
        &size,
        &deviceID
    )
    return status == noErr && deviceID != 0 ? deviceID : nil
}

func setDefaultInputDevice(_ deviceID: AudioDeviceID) -> Bool {
    var id = deviceID
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultInputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    let status = AudioObjectSetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &address,
        0,
        nil,
        UInt32(MemoryLayout<AudioDeviceID>.size),
        &id
    )
    return status == noErr
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

    // US ANSI virtual key codes for plain ASCII characters. Pinyin output is
    // ASCII-only, so this is enough to replay it as normal keyboard events.
    static let byCharacter: [Character: CGKeyCode] = [
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5,
        "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12,
        "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
        "1": 18, "2": 19, "3": 20, "4": 21, "6": 22,
        "5": 23, "=": 24, "9": 25, "7": 26, "-": 27,
        "8": 28, "0": 29, "]": 30, "o": 31,
        "u": 32, "[": 33, "i": 34, "p": 35, "\n": 36,
        "l": 37, "j": 38, "'": 39, "k": 40, ";": 41,
        "\\": 42, ",": 43, "/": 44, "n": 45, "m": 46,
        ".": 47, "\t": 48, " ": 49, "`": 50
    ]

    static let shiftedSymbols: [Character: Character] = [
        "!": "1", "@": "2", "#": "3", "$": "4", "%": "5",
        "^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
        "_": "-", "+": "=", "{": "[", "}": "]", "|": "\\",
        ":": ";", "\"": "'", "<": ",", ">": ".", "?": "/", "~": "`"
    ]
}

func axCopyElement(_ element: AXUIElement, _ attribute: String) -> AXUIElement? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success,
          let value,
          CFGetTypeID(value) == AXUIElementGetTypeID() else {
        return nil
    }
    return unsafeBitCast(value, to: AXUIElement.self)
}

func axRole(_ element: AXUIElement) -> String? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &value) == .success else {
        return nil
    }
    return value as? String
}

func axIsTextRole(_ role: String) -> Bool {
    let roles: Set<String> = [
        kAXTextFieldRole as String,
        kAXTextAreaRole as String,
        kAXComboBoxRole as String,
        "AXSearchField"
    ]
    return roles.contains(role)
}

func axReadText(_ element: AXUIElement) -> String? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &value) == .success,
          let value else {
        return nil
    }
    if let text = value as? String {
        return text
    }
    if let attributed = value as? NSAttributedString {
        return attributed.string
    }
    return nil
}

func axFindText(in element: AXUIElement, depth: Int, visited: Int) -> AXUIElement? {
    guard depth < 10, visited < 500 else { return nil }
    if let role = axRole(element), axIsTextRole(role) {
        return element
    }
    var childrenRef: CFTypeRef?
    guard AXUIElementCopyAttributeValue(
        element,
        kAXChildrenAttribute as CFString,
        &childrenRef
    ) == .success,
          let children = childrenRef as? [AXUIElement] else {
        return nil
    }
    var count = visited
    for child in children {
        count += 1
        if let found = axFindText(in: child, depth: depth + 1, visited: count) {
            return found
        }
    }
    return nil
}

func axFocusedTextElement() -> AXUIElement? {
    guard let application = NSWorkspace.shared.frontmostApplication else { return nil }
    let appElement = AXUIElementCreateApplication(application.processIdentifier)
    if let focused = axCopyElement(appElement, kAXFocusedUIElementAttribute as String),
       let role = axRole(focused),
       axIsTextRole(role) {
        return focused
    }
    if let window = axCopyElement(appElement, kAXFocusedWindowAttribute as String) {
        return axFindText(in: window, depth: 0, visited: 0)
    }
    return nil
}

func insertedText(before: String, after: String) -> String? {
    if before == after { return nil }
    let old = Array(before)
    let new = Array(after)
    var prefix = 0
    while prefix < old.count, prefix < new.count, old[prefix] == new[prefix] {
        prefix += 1
    }
    var suffix = 0
    while suffix < old.count - prefix,
          suffix < new.count - prefix,
          old[old.count - 1 - suffix] == new[new.count - 1 - suffix] {
        suffix += 1
    }
    let start = prefix
    let end = new.count - suffix
    guard start < end else { return nil }
    return String(new[start..<end])
}

final class TextCapture {
    private let queue = DispatchQueue(label: "remote-bridge.text-capture")
    private var element: AXUIElement?
    private var beforeValue = ""
    private var lastValue = ""
    private var lastChangeAt = Date()
    private var startedAt = Date()
    private var timer: DispatchSourceTimer?
    private var copiedText = ""
    private var sourceAppName = ""
    private var sourceBundleId = ""

    func begin() {
        cancel()
        let app = NSWorkspace.shared.frontmostApplication
        sourceAppName = app?.localizedName ?? ""
        sourceBundleId = app?.bundleIdentifier ?? ""
        element = axFocusedTextElement()
        beforeValue = element.flatMap(axReadText) ?? ""
        lastValue = beforeValue
        copiedText = ""
        startedAt = Date()
        lastChangeAt = startedAt
    }

    func finish() {
        guard element != nil else { return }
        copiedText = ""
        startedAt = Date()
        lastChangeAt = Date()
        let source = DispatchSource.makeTimerSource(queue: queue)
        source.schedule(deadline: .now() + 0.4, repeating: 0.4)
        source.setEventHandler { [weak self] in
            self?.poll()
        }
        timer = source
        source.resume()
    }

    func cancel() {
        timer?.cancel()
        timer = nil
        element = nil
        beforeValue = ""
        lastValue = ""
        copiedText = ""
        sourceAppName = ""
        sourceBundleId = ""
    }

    private func poll() {
        guard let element else {
            cancel()
            return
        }
        let now = Date()
        if let current = axReadText(element), current != lastValue {
            lastValue = current
            lastChangeAt = now
        }
        let stableFor = now.timeIntervalSince(lastChangeAt)
        let elapsed = now.timeIntervalSince(startedAt)
        if lastValue == beforeValue {
            if elapsed > 20 { cancel() }
            return
        }
        if stableFor >= 2.5 || elapsed >= 20 {
            let text = insertedText(before: beforeValue, after: lastValue) ?? ""
            if !text.isEmpty && text != copiedText {
                copiedText = text
                copyToClipboard(text)
                emitCapturedText(text, final: false)
            }
        }
        if !copiedText.isEmpty && now.timeIntervalSince(lastChangeAt) > 3.0 {
            emitCapturedText(copiedText, final: true)
            cancel()
            return
        }
        if elapsed > 20 {
            if !copiedText.isEmpty {
                emitCapturedText(copiedText, final: true)
            }
            cancel()
        }
    }

    private func emitCapturedText(_ text: String, final: Bool) {
        emit([
            "type": "captured-text",
            "origin": "capture",
            "final": final,
            "text": text,
            "app": sourceAppName,
            "bundleId": sourceBundleId
        ])
    }

    private func copyToClipboard(_ text: String) {
        DispatchQueue.main.async {
            let pasteboard = NSPasteboard.general
            pasteboard.clearContents()
            pasteboard.setString(text, forType: .string)
        }
    }
}

final class AppleSpeechRecognizer {
    private let queue = DispatchQueue(label: "remote-bridge.apple-speech")
    private let locale = Locale(identifier: "zh-CN")
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var format: AVAudioFormat?
    private var latestText = ""
    private var lastEmittedText = ""
    private var finalEmitted = false
    private var active = false
    private var warmingUp = false
    private var finishPending = false
    private var pendingAudio: [Data] = []
    private var drainTimer: DispatchSourceTimer?
    private var finishTimer: DispatchSourceTimer?
    private var bufferErrorEmitted = false
    private var receivedBytes = 0
    private var peakAmplitude = 0

    var enabled = false

    init() {
        recognizer = SFSpeechRecognizer(locale: locale)
    }

    var authorizationName: String {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    var isAvailable: Bool {
        recognizer?.isAvailable ?? false
    }

    var supportsOnDevice: Bool {
        recognizer?.supportsOnDeviceRecognition ?? false
    }

    var isActive: Bool {
        active
    }

    func setEnabled(_ value: Bool) {
        enabled = value
        if !value {
            queue.async {
                self.cancelLocked()
            }
        }
    }

    func requestAuthorization(completion: @escaping (SFSpeechRecognizerAuthorizationStatus) -> Void) {
        DispatchQueue.main.async {
            NSApplication.shared.activate(ignoringOtherApps: true)
            SFSpeechRecognizer.requestAuthorization { status in
                DispatchQueue.main.async {
                    completion(status)
                    sendStatus()
                }
            }
        }
    }

    func start(sampleRate: Double) -> (Bool, String) {
        guard enabled else {
            return (false, "本机语音识别未启用")
        }
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            return (false, "需要先在系统设置中允许语音识别权限")
        }
        guard let recognizer = recognizer ?? SFSpeechRecognizer(locale: locale),
              recognizer.isAvailable else {
            return (false, "Apple 语音识别当前不可用")
        }
        guard let audioFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: sampleRate,
            channels: 1,
            interleaved: true
        ) else {
            return (false, "无法创建语音识别音频格式")
        }

        var startError: String?
        queue.sync {
            self.cancelLocked()
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.taskHint = .dictation
            request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition

            self.request = request
            self.format = audioFormat
            self.latestText = ""
            self.lastEmittedText = ""
            self.finalEmitted = false
            self.active = true
            self.warmingUp = true
            self.finishPending = false
            self.pendingAudio.removeAll(keepingCapacity: true)
            self.bufferErrorEmitted = false
            self.receivedBytes = 0
            self.peakAmplitude = 0

            self.task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self else { return }
                self.queue.async {
                    guard self.active else { return }
                    if let result {
                        let text = result.bestTranscription.formattedString
                        if !text.isEmpty {
                            self.latestText = text
                            if text != self.lastEmittedText {
                                self.lastEmittedText = text
                                emit([
                                    "type": "speech-text",
                                    "source": "apple",
                                    "text": text,
                                    "final": false
                                ])
                            }
                        }
                        if result.isFinal {
                            self.finishLocked(error: nil)
                        }
                    }
                    if let error {
                        self.finishLocked(error: error.localizedDescription)
                    }
                }
            }

            if self.task != nil {
                self.beginWarmupLocked()
            } else {
                startError = "无法启动 Apple 语音识别"
                self.cleanupLocked()
            }
        }

        if let startError {
            return (false, startError)
        }
        return (true, "ok")
    }

    func append(_ data: Data) {
        guard data.count >= MemoryLayout<Int16>.size else { return }
        queue.async {
            guard self.active else { return }
            self.receivedBytes += data.count
            data.withUnsafeBytes { raw in
                guard let samples = raw.bindMemory(to: Int16.self).baseAddress else { return }
                for index in 0..<(data.count / MemoryLayout<Int16>.size) {
                    let value = abs(Int(samples[index]))
                    if value > self.peakAmplitude { self.peakAmplitude = value }
                }
            }
            if self.warmingUp {
                if self.pendingAudio.count < 64 {
                    self.pendingAudio.append(data)
                }
                return
            }
            self.appendAudioLocked(data)
        }
    }

    private func beginWarmupLocked() {
        warmingUp = true
        finishPending = false
        drainTimer?.cancel()
        drainTimer = nil
        pendingAudio.removeAll(keepingCapacity: true)
        let stepSeconds = 0.1
        // A short real-time warm-up avoids dropping the first buffer on some
        // systems without adding noticeable latency.
        let steps = 1
        for index in 1...steps {
            queue.asyncAfter(
                deadline: .now() + .milliseconds(Int(stepSeconds * 1000) * index)
            ) { [weak self] in
                guard let self, self.active, self.warmingUp else { return }
                self.appendSilenceLocked(seconds: stepSeconds)
                guard index == steps else { return }
                self.warmingUp = false
                let chunks = self.pendingAudio
                self.pendingAudio.removeAll(keepingCapacity: true)
                for chunk in chunks {
                    self.appendAudioLocked(chunk)
                }
                if self.finishPending {
                    self.finishPending = false
                    self.endAudioLocked()
                }
            }
        }
    }

    private func startDrainLocked() {
        drainTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(100))
        timer.setEventHandler { [weak self] in
            self?.drainOneLocked()
        }
        drainTimer = timer
        timer.resume()
    }

    private func drainOneLocked() {
        guard active else {
            drainTimer?.cancel()
            drainTimer = nil
            return
        }
        if pendingAudio.isEmpty {
            if finishPending {
                finishPending = false
                endAudioLocked()
            }
            return
        }
        let chunk = pendingAudio.removeFirst()
        appendAudioLocked(chunk)
    }

    func finish() {
        queue.async { [weak self] in
            guard let self, self.active else { return }
            if self.warmingUp {
                self.finishPending = true
                return
            }
            self.endAudioLocked()
        }
    }

    func cancel() {
        enabled = false
        queue.async {
            self.cancelLocked()
        }
    }

    private func endAudioLocked() {
        drainTimer?.cancel()
        drainTimer = nil
        request?.endAudio()
        finishTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 4.0)
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            self.finishLocked(error: nil)
        }
        finishTimer = timer
        timer.resume()
    }

    private func appendAudioLocked(_ data: Data) {
        guard let request = request, let format = format else { return }
        let frames = data.count / MemoryLayout<Int16>.size
        guard frames > 0,
              let buffer = AVAudioPCMBuffer(
                pcmFormat: format,
                frameCapacity: AVAudioFrameCount(frames)
              ), let destination = buffer.int16ChannelData?[0] else {
            if !bufferErrorEmitted {
                bufferErrorEmitted = true
                emitError("无法创建语音识别音频缓冲区", code: "speech_audio_failed")
            }
            return
        }
        buffer.frameLength = AVAudioFrameCount(frames)
        data.withUnsafeBytes { raw in
            guard let source = raw.bindMemory(to: Int16.self).baseAddress else {
                return
            }
            destination.update(from: source, count: frames)
        }
        request.append(buffer)
    }

    private func appendSilenceLocked(seconds: Double) {
        guard let request = request, let format = format else { return }
        let frames = AVAudioFrameCount(format.sampleRate * seconds)
        guard frames > 0,
              let buffer = AVAudioPCMBuffer(
                pcmFormat: format,
                frameCapacity: frames
              ), let pointer = buffer.int16ChannelData?[0] else {
            return
        }
        buffer.frameLength = frames
        pointer.initialize(repeating: 0, count: Int(frames))
        request.append(buffer)
    }

    private func finishLocked(error: String?) {
        guard !finalEmitted else { return }
        finalEmitted = true
        let text = latestText.trimmingCharacters(in: .whitespacesAndNewlines)
        var message = error?.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty && (message == nil || message == "cancelled") {
            message = "没有识别到文字（收到 \(receivedBytes) 字节音频）"
        } else if text.isEmpty, let existing = message, !existing.isEmpty {
            message = "\(existing)（音频 \(receivedBytes) 字节，峰值 \(peakAmplitude)）"
        }

        var payload: [String: Any] = [
            "type": "speech-text",
            "source": "apple",
            "text": text,
            "final": true,
            "audioBytes": receivedBytes,
            "peakAmplitude": peakAmplitude
        ]
        if let message, !message.isEmpty {
            payload["error"] = message
        }
        emit(payload)
        cleanupLocked()
    }

    private func cancelLocked() {
        active = false
        warmingUp = false
        finishPending = false
        pendingAudio.removeAll(keepingCapacity: false)
        receivedBytes = 0
        peakAmplitude = 0
        drainTimer?.cancel()
        drainTimer = nil
        finalEmitted = true
        finishTimer?.cancel()
        finishTimer = nil
        task?.cancel()
        task = nil
        request?.endAudio()
        request = nil
        format = nil
        latestText = ""
        lastEmittedText = ""
    }

    private func cleanupLocked() {
        active = false
        warmingUp = false
        finishPending = false
        pendingAudio.removeAll(keepingCapacity: false)
        receivedBytes = 0
        peakAmplitude = 0
        drainTimer?.cancel()
        drainTimer = nil
        finishTimer?.cancel()
        finishTimer = nil
        task = nil
        request = nil
        format = nil
        latestText = ""
        lastEmittedText = ""
    }
}

final class KeyInjector {
    private var functionHeld = false
    private var functionKeyCode: CGKeyCode = 63
    private var customTriggerHeld = false
    private var customTriggerKeyCode: CGKeyCode?
    private var customTriggerFlags: CGEventFlags = []
    private var customTriggerModifiers: [(CGKeyCode, CGEventFlags)] = []

    var accessibilityTrusted: Bool {
        AXIsProcessTrusted()
    }

    private var voiceTriggerHeld: Bool {
        functionHeld || customTriggerHeld
    }

    func isRemoteAppFrontmost() -> Bool {
        isRustDeskFrontmost()
    }

    private func isAsciiCapable(_ source: TISInputSource) -> Bool {
        guard let raw = TISGetInputSourceProperty(
            source,
            kTISPropertyInputSourceIsASCIICapable
        ) else {
            return false
        }
        let value = Unmanaged<CFBoolean>.fromOpaque(raw).takeUnretainedValue()
        return CFBooleanGetValue(value)
    }

    /// Key codes only make sense with a Latin layout. If a Chinese input
    /// method is active, the locally posted pinyin letters would be consumed
    /// by macOS instead of reaching the remote desktop window.
    private func switchToAsciiInputSource() -> (restore: TISInputSource?, error: String?) {
        guard let current = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue() else {
            return (nil, nil)
        }
        if isAsciiCapable(current) {
            return (nil, nil)
        }
        guard let ascii = TISCopyCurrentASCIICapableKeyboardLayoutInputSource()?
            .takeRetainedValue() else {
            return (nil, "请先把 Mac 输入法切到英文（ABC）")
        }
        guard TISSelectInputSource(ascii) == noErr else {
            return (nil, "无法切换到 Mac 英文输入法，请手动切换到 ABC")
        }
        Thread.sleep(forTimeInterval: 0.15)
        return (current, nil)
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

    private func isRustDeskFrontmost() -> Bool {
        guard let app = NSWorkspace.shared.frontmostApplication else { return false }
        let name = app.localizedName ?? ""
        let bundleId = app.bundleIdentifier ?? ""
        return name.range(of: "RustDesk", options: .caseInsensitive) != nil
            || bundleId.range(of: "rustdesk", options: .caseInsensitive) != nil
    }

    private func waitForRustDeskFrontmost(timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(max(0, timeout))
        repeat {
            if isRustDeskFrontmost() { return true }
            Thread.sleep(forTimeInterval: 0.1)
        } while Date() < deadline
        return false
    }

    /// Types plain ASCII text as real key down/up events. This is used for
    /// pinyin: the events are forwarded by remote-desktop clients such as
    /// RustDesk and interpreted by the remote Chinese input method.
    func typeText(
        _ text: String,
        waitForRustDesk: Bool = false,
        waitTimeout: TimeInterval = 20
    ) -> (Bool, String) {
        guard accessibilityTrusted else {
            return (false, "需要先在系统设置中授予辅助功能权限")
        }
        guard !text.isEmpty else {
            return (false, "没有可输入的拼音文字")
        }
        guard let source = CGEventSource(stateID: .hidSystemState) else {
            return (false, "无法创建输入事件源")
        }

        // `audio-end` releases the voice trigger after the audio queue drains.
        // Wait for that release so typing while Fn / Right Control is still
        // held does not turn into shortcuts.
        let releaseDeadline = Date().addingTimeInterval(5)
        while voiceTriggerHeld && Date() < releaseDeadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if voiceTriggerHeld {
            releaseVoiceTrigger()
        }

        if waitForRustDesk && !waitForRustDeskFrontmost(timeout: waitTimeout) {
            return (false, "等待 RustDesk 窗口超时，请先切换到 RustDesk")
        }

        let inputSource = switchToAsciiInputSource()
        if let error = inputSource.error {
            return (false, error)
        }
        defer {
            if let restore = inputSource.restore {
                // Let the remote client finish consuming the key events before
                // restoring the user's Chinese input method.
                Thread.sleep(forTimeInterval: 0.2)
                TISSelectInputSource(restore)
            }
        }
        let switchedNote = inputSource.restore == nil
            ? ""
            : "（已临时切换 Mac 输入法到 ABC）"

        let appName = NSWorkspace.shared.frontmostApplication?.localizedName ?? "前台应用"
        let maxKeys = 2400
        var typed = 0
        var skipped = 0

        for character in text {
            if typed >= maxKeys { break }
            var base = character
            var needsShift = false

            if base.isUppercase, let lowered = base.lowercased().first {
                base = lowered
                needsShift = true
            } else if let shifted = KeyMap.shiftedSymbols[base] {
                base = shifted
                needsShift = true
            }

            guard let keyCode = KeyMap.byCharacter[base] else {
                skipped += 1
                continue
            }

            if needsShift {
                postShift(true, source: source)
            }

            let flags: CGEventFlags = needsShift ? .maskShift : []
            guard let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true),
                  let up = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false) else {
                if needsShift { postShift(false, source: source) }
                skipped += 1
                continue
            }
            down.flags = flags
            up.flags = flags
            down.post(tap: .cghidEventTap)
            up.post(tap: .cghidEventTap)
            if needsShift {
                postShift(false, source: source)
            }

            typed += 1
            // Give the remote-desktop client and the remote IME time to keep
            // up with the synthetic key stream.
            Thread.sleep(forTimeInterval: 0.012)
        }

        guard typed > 0 else {
            return (false, "没有可输入的 ASCII 字符")
        }

        let preview = text.count > 80 ? String(text.prefix(80)) + "…" : text
        let skippedNote = skipped > 0 ? "，跳过 \(skipped) 个字符" : ""
        return (
            true,
            "已向 \(appName) 输入拼音 \(typed) 个字符：\(preview)\(skippedNote)\(switchedNote)"
        )
    }

    /// Types arbitrary Unicode text into the current macOS focus without
    /// going through an input method. Used by the "Mac 直输" output mode.
    func typeUnicodeText(_ text: String) -> (Bool, String) {
        guard accessibilityTrusted else {
            return (false, "需要先在系统设置中授予辅助功能权限")
        }
        guard !text.isEmpty else {
            return (false, "没有可输入的文字")
        }
        guard let source = CGEventSource(stateID: .hidSystemState) else {
            return (false, "无法创建输入事件源")
        }

        let releaseDeadline = Date().addingTimeInterval(5)
        while voiceTriggerHeld && Date() < releaseDeadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if voiceTriggerHeld {
            releaseVoiceTrigger()
        }

        let appName = NSWorkspace.shared.frontmostApplication?.localizedName ?? "前台应用"
        var typed = 0

        for character in text {
            if character == "\n" {
                guard let down = CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: true),
                      let up = CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: false) else {
                    continue
                }
                down.post(tap: .cghidEventTap)
                up.post(tap: .cghidEventTap)
                typed += 1
                Thread.sleep(forTimeInterval: 0.004)
                continue
            }

            let units = Array(String(character).utf16)
            guard let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true),
                  let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) else {
                continue
            }
            units.withUnsafeBufferPointer { buffer in
                guard let base = buffer.baseAddress else { return }
                down.keyboardSetUnicodeString(
                    stringLength: buffer.count,
                    unicodeString: base
                )
            }
            down.post(tap: .cghidEventTap)
            up.post(tap: .cghidEventTap)
            typed += 1
            Thread.sleep(forTimeInterval: 0.004)
        }

        guard typed > 0 else {
            return (false, "没有可输入的文字")
        }
        return (true, "已向 \(appName) 直接输入 \(typed) 个字符")
    }

    /// Pastes text into the current macOS focus by temporarily placing it on
    /// the pasteboard and posting Command-V, then restoring the old string.
    func pasteText(_ text: String) -> (Bool, String) {
        guard accessibilityTrusted else {
            return (false, "需要先在系统设置中授予辅助功能权限")
        }
        guard !text.isEmpty else {
            return (false, "没有可输入的文字")
        }
        if IsSecureEventInputEnabled() {
            return (false, "当前应用开启了安全输入，无法自动粘贴")
        }
        guard let source = CGEventSource(stateID: .hidSystemState) else {
            return (false, "无法创建输入事件源")
        }

        let releaseDeadline = Date().addingTimeInterval(5)
        while voiceTriggerHeld && Date() < releaseDeadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if voiceTriggerHeld {
            releaseVoiceTrigger()
        }

        let appName = NSWorkspace.shared.frontmostApplication?.localizedName ?? "前台应用"
        var previous: String?
        DispatchQueue.main.sync {
            let pasteboard = NSPasteboard.general
            previous = pasteboard.string(forType: .string)
            pasteboard.clearContents()
            pasteboard.setString(text, forType: .string)
        }

        if let commandDown = CGEvent(keyboardEventSource: source, virtualKey: 55, keyDown: true) {
            commandDown.type = .flagsChanged
            commandDown.flags = .maskCommand
            commandDown.post(tap: .cghidEventTap)
        }
        Thread.sleep(forTimeInterval: 0.02)
        if let vDown = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: true),
           let vUp = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: false) {
            vDown.flags = .maskCommand
            vUp.flags = .maskCommand
            vDown.post(tap: .cghidEventTap)
            vUp.post(tap: .cghidEventTap)
        }
        Thread.sleep(forTimeInterval: 0.02)
        if let commandUp = CGEvent(keyboardEventSource: source, virtualKey: 55, keyDown: false) {
            commandUp.type = .flagsChanged
            commandUp.flags = []
            commandUp.post(tap: .cghidEventTap)
        }

        Thread.sleep(forTimeInterval: 0.45)
        DispatchQueue.main.sync {
            let pasteboard = NSPasteboard.general
            pasteboard.clearContents()
            if let previous {
                pasteboard.setString(previous, forType: .string)
            }
        }
        return (true, "已向 \(appName) 直接粘贴 \(text.count) 个字符")
    }

    private func postShift(_ down: Bool, source: CGEventSource) {
        guard let event = CGEvent(
            keyboardEventSource: source,
            virtualKey: 56,
            keyDown: down
        ) else { return }
        event.type = .flagsChanged
        event.flags = down ? .maskShift : []
        event.post(tap: .cghidEventTap)
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
        if trigger == "custom" {
            pressCustomVoiceTrigger()
            return
        }
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
        case "rightControl":
            keyCode = 62
            flagValue = .maskControl
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
        } else if trigger == "rightControl" {
            flags.formUnion(CGEventFlags(rawValue: 0x0000_2000))
        }
        down.type = .flagsChanged
        down.flags = flags
        down.post(tap: .cghidEventTap)
        functionHeld = true
        functionKeyCode = keyCode
    }

    func releaseVoiceTrigger() {
        if customTriggerHeld {
            releaseCustomVoiceTrigger()
            return
        }
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

    private func pressCustomVoiceTrigger() {
        guard !customTriggerHeld,
              accessibilityTrusted,
              let shortcut = voiceTriggerShortcut,
              let code = shortcut["code"] as? String,
              let keyCode = KeyMap.byCode[code],
              let source = CGEventSource(stateID: .hidSystemState) else {
            return
        }

        let requested = (shortcut["modifiers"] as? [String]) ?? []
        let ordered = ["control", "option", "shift", "cmd", "fn"].filter {
            requested.contains($0)
        }
        var flags: CGEventFlags = []
        customTriggerModifiers = []

        for modifier in ordered {
            guard let info = modifierKeyInfo(modifier) else { continue }
            flags.formUnion(info.flags)
            guard let down = CGEvent(
                keyboardEventSource: source,
                virtualKey: info.keyCode,
                keyDown: true
            ) else { continue }
            down.type = .flagsChanged
            down.flags = flags
            down.post(tap: .cghidEventTap)
            customTriggerModifiers.append((info.keyCode, info.flags))
        }

        guard let down = CGEvent(
            keyboardEventSource: source,
            virtualKey: keyCode,
            keyDown: true
        ) else {
            releaseModifiers(source: source, pressed: customTriggerModifiers)
            customTriggerModifiers = []
            return
        }
        down.flags = flags
        down.post(tap: .cghidEventTap)
        customTriggerHeld = true
        customTriggerKeyCode = keyCode
        customTriggerFlags = flags
    }

    private func releaseCustomVoiceTrigger() {
        guard customTriggerHeld else { return }
        customTriggerHeld = false
        guard let source = CGEventSource(stateID: .hidSystemState) else {
            customTriggerModifiers = []
            customTriggerKeyCode = nil
            return
        }

        if let keyCode = customTriggerKeyCode,
           let up = CGEvent(
            keyboardEventSource: source,
            virtualKey: keyCode,
            keyDown: false
           ) {
            up.flags = customTriggerFlags
            up.post(tap: .cghidEventTap)
        }
        customTriggerKeyCode = nil

        var flags = customTriggerFlags
        for (keyCode, modifierFlags) in customTriggerModifiers.reversed() {
            flags.remove(modifierFlags)
            if let up = CGEvent(
                keyboardEventSource: source,
                virtualKey: keyCode,
                keyDown: false
            ) {
                up.type = .flagsChanged
                up.flags = flags
                up.post(tap: .cghidEventTap)
            }
        }
        customTriggerModifiers = []
        customTriggerFlags = []
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
let typingQueue = DispatchQueue(label: "remote-bridge.helper.typing")
let output = VirtualAudioOutput()
let keys = KeyInjector()
let textCapture = TextCapture()
let appleSpeech = AppleSpeechRecognizer()
var selectedDevice: AudioDeviceInfo?
var voiceTrigger = "fn"
var voiceTriggerShortcut: [String: Any]?
var captureTextEnabled = true
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
        "voiceTriggerShortcut": voiceTriggerShortcut ?? NSNull(),
        "active": output.isActive,
        "captureTextEnabled": captureTextEnabled,
        "appleSpeechEnabled": appleSpeech.enabled,
        "appleSpeechActive": appleSpeech.isActive,
        "appleSpeechAuthorization": appleSpeech.authorizationName,
        "appleSpeechAvailable": appleSpeech.isAvailable,
        "appleSpeechOnDevice": appleSpeech.supportsOnDevice,
        "frontmostApp": frontmost?.localizedName ?? "",
        "frontmostBundleId": frontmost?.bundleIdentifier ?? "",
        "secureInput": IsSecureEventInputEnabled(),
        "defaultInputName": defaultInputDeviceID().flatMap {
            stringProperty($0, kAudioObjectPropertyName)
        } ?? "",
        "defaultInputUID": defaultInputDeviceID().flatMap {
            stringProperty($0, kAudioDevicePropertyDeviceUID)
        } ?? "",
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
           ["fn", "rightOption", "rightCommand", "rightControl", "none", "custom"].contains(trigger) {
            voiceTrigger = trigger
        }
        if let shortcut = command["voiceTriggerShortcut"] as? [String: Any],
           (shortcut["type"] as? String) == "keys",
           let code = shortcut["code"] as? String,
           KeyMap.byCode[code] != nil {
            voiceTriggerShortcut = shortcut
        } else if command.keys.contains("voiceTriggerShortcut") {
            voiceTriggerShortcut = nil
        }
        configureDevice(command["audioDevice"] as? String)
        return

    case "set-default-input":
        guard let device = selectedDevice ?? findVirtualDevice(preferredName: preferredDeviceName) else {
            emitError("没有可用的虚拟音频设备", code: "virtual_device_missing")
            sendStatus()
            return
        }
        if !setDefaultInputDevice(device.id) {
            emitError("无法设置系统默认输入设备", code: "default_input_failed")
        }
        sendStatus()
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

    case "set-capture-text":
        captureTextEnabled = (command["enabled"] as? Bool) ?? true
        if !captureTextEnabled {
            textCapture.cancel()
        }
        sendStatus()
        return

    case "set-speech-recognition":
        appleSpeech.setEnabled((command["enabled"] as? Bool) ?? false)
        sendStatus()
        return

    case "request-speech-access":
        appleSpeech.requestAuthorization { _ in }
        sendStatus()
        return

    case "clear-text":
        DispatchQueue.main.async {
            NSPasteboard.general.clearContents()
        }
        return

    case "copy-text":
        guard let text = command["text"] as? String, !text.isEmpty else {
            return
        }
        let limited = String(text.prefix(4000))
        DispatchQueue.main.async {
            let pasteboard = NSPasteboard.general
            pasteboard.clearContents()
            pasteboard.setString(limited, forType: .string)
        }
        emit(["type": "captured-text", "origin": "copy", "text": limited])
        return

    case "type-text":
        guard let text = command["text"] as? String, !text.isEmpty else {
            emit([
                "type": "action-result",
                "action": "typeText",
                "ok": false,
                "message": "没有可输入的拼音文字"
            ])
            return
        }
        let limited = String(text.prefix(2400))
        let requestedDelay = (command["delayMs"] as? NSNumber)?.doubleValue ?? 0
        let delayMs = max(0, min(10_000, requestedDelay))
        let waitForRustDesk = (command["waitForRustDesk"] as? Bool) ?? false
        let requestedWait = (command["waitTimeoutMs"] as? NSNumber)?.doubleValue ?? 20_000
        let waitTimeout = max(0, min(30_000, requestedWait)) / 1000
        typingQueue.async {
            if delayMs > 0 {
                Thread.sleep(forTimeInterval: delayMs / 1000)
            }
            let result = keys.typeText(
                limited,
                waitForRustDesk: waitForRustDesk,
                waitTimeout: waitTimeout
            )
            emit([
                "type": "action-result",
                "action": "typeText",
                "ok": result.0,
                "message": result.1
            ])
            sendStatus()
        }
        return

    case "auto-type-text":
        guard let text = command["text"] as? String, !text.isEmpty else {
            emit([
                "type": "action-result",
                "action": "autoTypeText",
                "ok": false,
                "message": "没有可输入的文字"
            ])
            return
        }
        let limited = String(text.prefix(4000))
        if keys.isRemoteAppFrontmost() {
            emit([
                "type": "route-text",
                "target": "windows",
                "text": limited
            ])
            return
        }
        typingQueue.async {
            let result = keys.typeUnicodeText(limited)
            emit([
                "type": "action-result",
                "action": "autoTypeText",
                "ok": result.0,
                "message": result.1
            ])
            sendStatus()
        }
        return

    case "paste-text":
        guard let text = command["text"] as? String, !text.isEmpty else {
            emit([
                "type": "action-result",
                "action": "pasteMacText",
                "ok": false,
                "message": "没有可输入的文字"
            ])
            return
        }
        let limited = String(text.prefix(4000))
        typingQueue.async {
            let result = keys.pasteText(limited)
            emit([
                "type": "action-result",
                "action": "pasteMacText",
                "ok": result.0,
                "message": result.1
            ])
            sendStatus()
        }
        return

    case "type-unicode-text":
        guard let text = command["text"] as? String, !text.isEmpty else {
            emit([
                "type": "action-result",
                "action": "typeUnicodeText",
                "ok": false,
                "message": "没有可输入的文字"
            ])
            return
        }
        let limited = String(text.prefix(4000))
        typingQueue.async {
            let result = keys.typeUnicodeText(limited)
            emit([
                "type": "action-result",
                "action": "typeUnicodeText",
                "ok": result.0,
                "message": result.1
            ])
            sendStatus()
        }
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
        if captureTextEnabled {
            textCapture.begin()
        } else {
            textCapture.cancel()
        }
        if appleSpeech.enabled {
            let speech = appleSpeech.start(sampleRate: sampleRate)
            if !speech.0 {
                emitError(speech.1, code: "speech_start_failed")
            }
        }
        if !appleSpeech.enabled {
            keys.pressVoiceTrigger(trigger)
        }
        emit([
            "type": "audio-started",
            "device": device.name,
            "sampleRate": sampleRate,
            "voiceTrigger": appleSpeech.enabled ? "none" : trigger,
            "accessibility": keys.accessibilityTrusted
        ])
        return

    case "audio":
        guard let data = command["data"] as? String,
              let audio = Data(base64Encoded: data) else {
            return
        }
        appleSpeech.append(audio)
        output.enqueue(audio)
        return

    case "audio-end":
        appleSpeech.finish()
        output.finish {
            commandQueue.async {
                keys.releaseVoiceTrigger()
                if captureTextEnabled {
                    textCapture.finish()
                } else {
                    textCapture.cancel()
                }
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
        appleSpeech.cancel()
        output.stop()
        keys.releaseVoiceTrigger()
        exit(0)

    default:
        emitError("未知的控制命令：\(type)", code: "unknown_command")
    }
}

func speechAuthorizationName(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
}

if CommandLine.arguments.contains("--request-speech") {
    let app = NSApplication.shared
    app.setActivationPolicy(.regular)
    let window = NSWindow(
        contentRect: NSRect(x: 0, y: 0, width: 440, height: 150),
        styleMask: [.titled, .closable],
        backing: .buffered,
        defer: false
    )
    window.title = "Remote Bridge 语音识别"
    let label = NSTextField(labelWithString: "正在请求语音识别权限…")
    label.frame = NSRect(x: 22, y: 72, width: 396, height: 44)
    label.font = NSFont.systemFont(ofSize: 14)
    window.contentView?.addSubview(label)
    window.center()
    window.makeKeyAndOrderFront(nil)
    app.activate(ignoringOtherApps: true)
    SFSpeechRecognizer.requestAuthorization { status in
        DispatchQueue.main.async {
            label.stringValue = "授权状态：\(speechAuthorizationName(status))"
            emit([
                "type": "speech-authorization",
                "status": speechAuthorizationName(status)
            ])
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                exit(0)
            }
        }
    }
    app.run()
    exit(0)
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
