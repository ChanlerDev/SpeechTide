import Foundation
import AVFoundation
import Speech

final class DictationController: NSObject {
  private var recognizer: SFSpeechRecognizer?
  private var audioEngine: AVAudioEngine?
  private var currentRequest: SFSpeechAudioBufferRecognitionRequest?
  private var activeTaskCount = 0
  private var activeTasks: [SFSpeechRecognitionTask] = []
  private var currentSegmentId = 0
  private var accumulatedText = ""
  private var sessionId: String?
  private var sessionStartedAt: Date?
  private var requireOnDevice = false
  private var segmentDurationMs: Int?
  private var stopRequested = false
  private var audioFile: AVAudioFile?
  private var segmentTimer: DispatchSourceTimer?
  private var localeIdentifier: String?

  func handleMessage(_ message: [String: Any]) {
    guard let type = message["type"] as? String else { return }
    switch type {
    case "status":
      let requestId = message["requestId"] as? String ?? ""
      sendStatus(requestId: requestId)
    case "start":
      let requestId = message["requestId"] as? String ?? ""
      handleStart(requestId: requestId, message: message)
    case "stop":
      let requestId = message["requestId"] as? String ?? ""
      handleStop(requestId: requestId)
    default:
      break
    }
  }

  private func sendStatus(requestId: String) {
    let status = SFSpeechRecognizer.authorizationStatus()
    if status == .notDetermined {
      SFSpeechRecognizer.requestAuthorization { [weak self] newStatus in
        self?.sendStatusResponse(requestId: requestId, authStatus: newStatus)
      }
      return
    }
    sendStatusResponse(requestId: requestId, authStatus: status)
  }

  private func sendStatusResponse(requestId: String, authStatus: SFSpeechRecognizerAuthorizationStatus) {
    if authStatus != .authorized {
      send([
        "type": "status",
        "requestId": requestId,
        "available": false,
        "supportsOnDevice": false,
        "locale": Locale.current.identifier,
        "reason": authStatus == .denied ? "denied" : "not authorized"
      ])
      return
    }
    let locale = localeIdentifier.flatMap { Locale(identifier: $0) } ?? Locale.current
    guard let recognizer = SFSpeechRecognizer(locale: locale) else {
      send([
        "type": "status",
        "requestId": requestId,
        "available": false,
        "supportsOnDevice": false,
        "locale": locale.identifier,
        "reason": "recognizer unavailable"
      ])
      return
    }
    if !recognizer.isAvailable {
      send([
        "type": "status",
        "requestId": requestId,
        "available": false,
        "supportsOnDevice": recognizer.supportsOnDeviceRecognition,
        "locale": locale.identifier,
        "reason": "service unavailable"
      ])
      return
    }
    send([
      "type": "status",
      "requestId": requestId,
      "available": true,
      "supportsOnDevice": recognizer.supportsOnDeviceRecognition,
      "locale": locale.identifier
    ])
  }

  private func handleStart(requestId: String, message: [String: Any]) {
    guard sessionId == nil else {
      sendError(requestId: requestId, message: "session already running")
      return
    }
    let sessionId = message["sessionId"] as? String ?? UUID().uuidString
    let requireOnDevice = message["requireOnDevice"] as? Bool ?? false
    let locale = message["locale"] as? String
    let audioPath = message["audioPath"] as? String
    let segmentDurationMs = message["segmentDurationMs"] as? Int

    self.sessionId = sessionId
    self.sessionStartedAt = Date()
    self.requireOnDevice = requireOnDevice
    self.segmentDurationMs = segmentDurationMs
    self.localeIdentifier = locale
    self.accumulatedText = ""
    self.stopRequested = false

    ensureAuthorized { [weak self] authorized in
      guard let self = self else { return }
      if !authorized {
        self.sendError(requestId: requestId, message: "speech authorization denied")
        self.resetSession()
        return
      }
      do {
        try self.startRecognition(audioPath: audioPath)
        self.send([
          "type": "started",
          "requestId": requestId,
          "sessionId": sessionId
        ])
      } catch {
        self.sendError(requestId: requestId, message: error.localizedDescription)
        self.resetSession()
      }
    }
  }

  private func handleStop(requestId: String) {
    guard let sessionId = sessionId else {
      sendError(requestId: requestId, message: "no active session")
      return
    }
    stopRequested = true
    stopSegmentTimer()
    audioEngine?.stop()
    audioEngine?.inputNode.removeTap(onBus: 0)
    currentRequest?.endAudio()
    send([
      "type": "stopped",
      "requestId": requestId,
      "sessionId": sessionId
    ])
    checkFinalizeIfNeeded()
  }

  private func startRecognition(audioPath: String?) throws {
    let locale = localeIdentifier.flatMap { Locale(identifier: $0) } ?? Locale.current
    guard let recognizer = SFSpeechRecognizer(locale: locale) else {
      throw NSError(domain: "Speech", code: 2, userInfo: [NSLocalizedDescriptionKey: "recognizer unavailable"])
    }
    self.recognizer = recognizer

    if requireOnDevice && !recognizer.supportsOnDeviceRecognition {
      throw NSError(domain: "Speech", code: 3, userInfo: [NSLocalizedDescriptionKey: "on-device not supported"])
    }

    let audioEngine = AVAudioEngine()
    let inputNode = audioEngine.inputNode
    let inputFormat = inputNode.outputFormat(forBus: 0)

    if let audioPath = audioPath {
      let url = URL(fileURLWithPath: audioPath)
      audioFile = try AVAudioFile(forWriting: url, settings: inputFormat.settings)
    }

    self.audioEngine = audioEngine
    beginNewRequest()

    inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
      guard let self = self else { return }
      if let file = self.audioFile {
        do {
          try file.write(from: buffer)
        } catch {
          self.sendError(message: "audio write failed")
        }
      }
      self.currentRequest?.append(buffer)
    }

    audioEngine.prepare()
    try audioEngine.start()

    startSegmentTimerIfNeeded()
  }

  private func beginNewRequest() {
    currentSegmentId += 1
    let segmentId = currentSegmentId
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    request.requiresOnDeviceRecognition = requireOnDevice
    currentRequest = request
    activeTaskCount += 1

    var taskRef: SFSpeechRecognitionTask?
    taskRef = recognizer?.recognitionTask(with: request) { [weak self] result, error in
      guard let self = self else { return }
      if let result = result {
        let text = result.bestTranscription.formattedString
        if result.isFinal {
          if !text.isEmpty {
            self.appendFinal(text)
          }
          self.finishSegment(task: taskRef)
        } else if !self.stopRequested && segmentId == self.currentSegmentId {
          self.sendPartial(self.accumulatedText + text)
        }
      } else if error != nil {
        self.finishSegment(task: taskRef, error: error)
      }
    }

    if let taskRef = taskRef {
      activeTasks.append(taskRef)
    }
  }

  private func finishSegment(task: SFSpeechRecognitionTask?, error: Error? = nil) {
    activeTaskCount = max(0, activeTaskCount - 1)
    if let task = task {
      activeTasks.removeAll { $0 === task }
    }
    if let error = error, !stopRequested {
      sendError(message: error.localizedDescription)
      stopRequested = true
    }
    checkFinalizeIfNeeded()
  }

  private func appendFinal(_ text: String) {
    if accumulatedText.isEmpty {
      accumulatedText = text
    } else {
      let separator = accumulatedText.hasSuffix(" ") ? "" : " "
      accumulatedText += separator + text
    }
  }

  private func startSegmentTimerIfNeeded() {
    guard let durationMs = segmentDurationMs, durationMs > 0 else { return }
    let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global())
    timer.schedule(deadline: .now() + .milliseconds(durationMs), repeating: .milliseconds(durationMs))
    timer.setEventHandler { [weak self] in
      self?.restartSegment()
    }
    timer.resume()
    segmentTimer = timer
  }

  private func restartSegment() {
    if stopRequested { return }
    let previousRequest = currentRequest
    beginNewRequest()
    previousRequest?.endAudio()
  }

  private func stopSegmentTimer() {
    segmentTimer?.cancel()
    segmentTimer = nil
  }

  private func checkFinalizeIfNeeded() {
    guard stopRequested else { return }
    if activeTaskCount == 0 {
      let durationMs: Int
      if let started = sessionStartedAt {
        durationMs = Int(Date().timeIntervalSince(started) * 1000)
      } else {
        durationMs = 0
      }
      send([
        "type": "final",
        "sessionId": sessionId ?? "",
        "text": accumulatedText,
        "durationMs": durationMs
      ])
      resetSession()
    }
  }

  private func resetSession() {
    audioEngine?.stop()
    audioEngine?.inputNode.removeTap(onBus: 0)
    audioEngine = nil
    currentRequest = nil
    audioFile = nil
    activeTaskCount = 0
    activeTasks.forEach { $0.cancel() }
    activeTasks.removeAll()
    currentSegmentId = 0
    accumulatedText = ""
    stopRequested = false
    sessionId = nil
    sessionStartedAt = nil
    stopSegmentTimer()
  }

  private func ensureAuthorized(_ completion: @escaping (Bool) -> Void) {
    let status = SFSpeechRecognizer.authorizationStatus()
    switch status {
    case .authorized:
      completion(true)
    case .notDetermined:
      SFSpeechRecognizer.requestAuthorization { auth in
        completion(auth == .authorized)
      }
    default:
      completion(false)
    }
  }

  private func sendPartial(_ text: String) {
    send([
      "type": "partial",
      "sessionId": sessionId ?? "",
      "text": text
    ])
  }

  private func sendError(requestId: String? = nil, message: String) {
    var payload: [String: Any] = [
      "type": "error",
      "message": message
    ]
    if let requestId = requestId {
      payload["requestId"] = requestId
    }
    if let sessionId = sessionId {
      payload["sessionId"] = sessionId
    }
    send(payload)
  }

  private func send(_ payload: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []) else { return }
    guard let line = String(data: data, encoding: .utf8) else { return }
    FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
  }
}

let controller = DictationController()
let input = FileHandle.standardInput
var buffer = ""
input.readabilityHandler = { handle in
  let data = handle.availableData
  if data.isEmpty {
    exit(0)
  }
  if let chunk = String(data: data, encoding: .utf8) {
    buffer += chunk
    while let range = buffer.range(of: "\n") {
      let line = String(buffer[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
      buffer = String(buffer[range.upperBound...])
      if line.isEmpty { continue }
      if let data = line.data(using: .utf8),
         let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
        controller.handleMessage(json)
      }
    }
  }
}

RunLoop.current.run()
