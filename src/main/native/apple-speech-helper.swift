import Foundation
import Speech
import AVFoundation

// MARK: - JSON Output Helpers

func outputJSON(_ dict: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: dict),
       let str = String(data: data, encoding: .utf8) {
        print(str)
        fflush(stdout)
    }
}

func outputError(_ message: String) {
    outputJSON(["error": message])
}

func outputSegment(text: String, start: Double, end: Double, isFinal: Bool) {
    outputJSON([
        "text": text,
        "start": start,
        "end": end,
        "isFinal": isFinal
    ])
}

func outputDone() {
    outputJSON(["done": true])
}

func outputProgress(_ message: String) {
    outputJSON(["progress": message])
}

// MARK: - Grouping Helper

struct GroupedSegment {
    let text: String
    let start: Double
    let end: Double
}

func groupSegments(_ segments: [SFTranscriptionSegment], pauseThreshold: TimeInterval = 0.8, maxDuration: TimeInterval = 12.0) -> [GroupedSegment] {
    guard !segments.isEmpty else { return [] }
    
    var groups: [GroupedSegment] = []
    var currentWords: [String] = []
    var groupStart: Double = segments[0].timestamp
    var groupEnd: Double = segments[0].timestamp + segments[0].duration
    
    for i in 0..<segments.count {
        let segment = segments[i]
        let word = segment.substring
        
        if i > 0 {
            let previousSegment = segments[i - 1]
            let gap = segment.timestamp - (previousSegment.timestamp + previousSegment.duration)
            let duration = segment.timestamp - groupStart
            
            let endsWithSentencePunctuation = previousSegment.substring.hasSuffix(".") || 
                                              previousSegment.substring.hasSuffix("?") || 
                                              previousSegment.substring.hasSuffix("!")
            
            if gap > pauseThreshold || duration > maxDuration || endsWithSentencePunctuation {
                if !currentWords.isEmpty {
                    groups.append(GroupedSegment(
                        text: currentWords.joined(separator: " "),
                        start: groupStart,
                        end: groupEnd
                    ))
                }
                currentWords = []
                groupStart = segment.timestamp
            }
        }
        
        currentWords.append(word)
        groupEnd = segment.timestamp + max(segment.duration, 0.5)
    }
    
    if !currentWords.isEmpty {
        groups.append(GroupedSegment(
            text: currentWords.joined(separator: " "),
            start: groupStart,
            end: groupEnd
        ))
    }
    
    return groups
}

// MARK: - Speech Recognition

class SpeechTranscriber {
    private let recognizer: SFSpeechRecognizer
    private var recognitionTask: SFSpeechRecognitionTask?
    private var audioEngine: AVAudioEngine?

    init?(localeIdentifier: String?) {
        let localeId = localeIdentifier ?? Locale.current.identifier
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: localeId)) else {
            outputError("Speech recognizer not available for locale \(localeId)")
            return nil
        }
        guard rec.isAvailable else {
            outputError("Speech recognizer is not available on this device for locale \(localeId)")
            return nil
        }
        self.recognizer = rec
        // Allow on-device recognition if available (macOS 13+)
        if #available(macOS 13, *) {
            self.recognizer.supportsOnDeviceRecognition = true
        }
    }

    // MARK: - Transcribe Audio File

    func transcribeFile(at path: String) {
        let url = URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: path) else {
            outputError("Audio file not found: \(path)")
            exit(1)
        }

        // Get total duration of the audio file
        var duration: Double = 0
        if let file = try? AVAudioFile(forReading: url) {
            duration = Double(file.length) / file.fileFormat.sampleRate
        }

        outputProgress("Requesting speech recognition authorization...")

        SFSpeechRecognizer.requestAuthorization { status in
            switch status {
            case .authorized:
                self.performFileTranscription(url: url, duration: duration)
            case .denied:
                outputError("Speech recognition permission denied. Please enable in System Settings > Privacy & Security > Speech Recognition.")
                exit(1)
            case .restricted:
                outputError("Speech recognition is restricted on this device.")
                exit(1)
            case .notDetermined:
                outputError("Speech recognition authorization not determined.")
                exit(1)
            @unknown default:
                outputError("Unknown speech recognition authorization status.")
                exit(1)
            }
        }
    }

    private func performFileTranscription(url: URL, duration: Double) {
        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = true
        request.taskHint = .dictation

        // Prefer on-device if available
        if #available(macOS 13, *) {
            request.requiresOnDeviceRecognition = false // Allow cloud fallback
        }

        outputProgress("Starting transcription...")
        var lastPrintedPercent = -1
        var lastProgressTime = Date()
        var latestResult: SFSpeechRecognitionResult?

        recognitionTask = recognizer.recognitionTask(with: request) { result, error in
            if let result = result {
                latestResult = result
                let now = Date()
                let segments = result.bestTranscription.segments
                let grouped = groupSegments(segments)
                
                for group in grouped {
                    outputSegment(
                        text: group.text,
                        start: group.start,
                        end: group.end,
                        isFinal: result.isFinal
                    )
                }

                // Output progress updates
                if duration > 0 {
                    if let lastSegment = segments.last {
                        let lastWordTime = lastSegment.timestamp
                        let percent = min(99, Int((lastWordTime / duration) * 100))
                        if percent > lastPrintedPercent || now.timeIntervalSince(lastProgressTime) >= 2.0 {
                            lastPrintedPercent = percent
                            lastProgressTime = now
                            outputProgress("Transcribing: \(percent)% (\(Int(lastWordTime))s / \(Int(duration))s)")
                        }
                    } else if now.timeIntervalSince(lastProgressTime) >= 2.0 {
                        lastProgressTime = now
                        outputProgress("Transcribing...")
                    }
                } else if now.timeIntervalSince(lastProgressTime) >= 2.0 {
                    lastProgressTime = now
                    outputProgress("Transcribing...")
                }

                if result.isFinal {
                    outputDone()
                    exit(0)
                }
            }

            if let error = error {
                // Error code 1101 = "no speech detected", which is OK at end of file
                let nsError = error as NSError
                if nsError.code == 1101 || nsError.code == 1110 {
                    if let result = latestResult {
                        let segments = result.bestTranscription.segments
                        let grouped = groupSegments(segments)
                        for group in grouped {
                            outputSegment(
                                text: group.text,
                                start: group.start,
                                end: group.end,
                                isFinal: true
                            )
                        }
                    }
                    outputDone()
                    exit(0)
                }
                outputError("Transcription error: \(error.localizedDescription)")
                exit(1)
            }
        }
    }

    // MARK: - Transcribe from Microphone

    func transcribeMic() {
        SFSpeechRecognizer.requestAuthorization { status in
            switch status {
            case .authorized:
                // Check and request microphone permission explicitly on macOS
                switch AVCaptureDevice.authorizationStatus(for: .audio) {
                case .authorized:
                    self.startMicTranscription()
                case .notDetermined:
                    AVCaptureDevice.requestAccess(for: .audio) { granted in
                        if granted {
                            self.startMicTranscription()
                        } else {
                            outputError("Microphone permission denied. Please enable in System Settings > Privacy & Security > Microphone.")
                            exit(1)
                        }
                    }
                case .denied, .restricted:
                    outputError("Microphone permission denied. Please enable in System Settings > Privacy & Security > Microphone.")
                    exit(1)
                @unknown default:
                    outputError("Unknown microphone permission status.")
                    exit(1)
                }
            case .denied:
                outputError("Speech recognition permission denied. Please enable in System Settings > Privacy & Security > Speech Recognition.")
                exit(1)
            case .restricted:
                outputError("Speech recognition is restricted on this device.")
                exit(1)
            case .notDetermined:
                outputError("Speech recognition authorization not determined.")
                exit(1)
            @unknown default:
                outputError("Unknown authorization status.")
                exit(1)
            }
        }
    }

    private func startMicTranscription() {
        audioEngine = AVAudioEngine()
        guard let audioEngine = audioEngine else {
            outputError("Failed to create audio engine")
            exit(1)
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation

        if #available(macOS 13, *) {
            request.requiresOnDeviceRecognition = false
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            request.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            outputError("Failed to start audio engine: \(error.localizedDescription)")
            exit(1)
        }

        outputProgress("Microphone transcription started. Listening...")

        recognitionTask = recognizer.recognitionTask(with: request) { result, error in
            if let result = result {
                let segments = result.bestTranscription.segments
                let grouped = groupSegments(segments)
                
                var jsonSegments: [[String: Any]] = []
                for group in grouped {
                    jsonSegments.append([
                        "text": group.text,
                        "start": group.start,
                        "end": group.end
                    ])
                }
                
                outputJSON([
                    "segments": jsonSegments,
                    "isFinal": result.isFinal
                ])
            }

            if let error = error {
                let nsError = error as NSError
                // 1110 = recognition cancelled (normal when we stop)
                if nsError.code == 1110 {
                    outputDone()
                    exit(0)
                }
                outputError("Mic transcription error: \(error.localizedDescription)")
                outputDone()
                exit(1)
            }
        }

        // Listen for stdin close (parent process termination signal)
        DispatchQueue.global().async {
            while let line = readLine() {
                if line == "STOP" {
                    self.stopMicTranscription()
                    break
                }
            }
            // stdin closed = parent died
            self.stopMicTranscription()
        }
    }

    func stopMicTranscription() {
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionTask?.cancel()
        outputDone()
        exit(0)
    }

    // MARK: - Check Availability

    static func checkAvailability(localeIdentifier: String?) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                outputJSON([
                    "available": false,
                    "platform": "macOS",
                    "status": "\(status.rawValue)"
                ])
                exit(0)
            }
            
            let localeId = localeIdentifier ?? Locale.current.identifier
            if let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)) {
                outputJSON([
                    "available": recognizer.isAvailable,
                    "platform": "macOS",
                    "status": "\(status.rawValue)",
                    "locale": localeId
                ])
            } else {
                outputJSON([
                    "available": false,
                    "platform": "macOS",
                    "status": "\(status.rawValue)",
                    "error": "Locale \(localeId) not supported"
                ])
            }
            exit(0)
        }
    }
}

// MARK: - Main

let args = CommandLine.arguments

guard args.count >= 2 else {
    outputError("Usage: apple-speech-helper <command> [args]\nCommands: transcribe-file <path> [locale], transcribe-mic [locale], check [locale]")
    exit(1)
}

let command = args[1]

switch command {
case "transcribe-file":
    guard args.count >= 3 else {
        outputError("Usage: apple-speech-helper transcribe-file <audio-file-path> [locale]")
        exit(1)
    }
    let filePath = args[2]
    let locale = args.count >= 4 ? args[3] : nil
    guard let transcriber = SpeechTranscriber(localeIdentifier: locale) else { exit(1) }
    transcriber.transcribeFile(at: filePath)

case "transcribe-mic":
    let locale = args.count >= 3 ? args[2] : nil
    guard let transcriber = SpeechTranscriber(localeIdentifier: locale) else { exit(1) }
    transcriber.transcribeMic()

case "check":
    let locale = args.count >= 3 ? args[2] : nil
    SpeechTranscriber.checkAvailability(localeIdentifier: locale)

default:
    outputError("Unknown command: \(command). Use: transcribe-file, transcribe-mic, or check")
    exit(1)
}

// Keep the run loop alive for async operations
RunLoop.main.run()
