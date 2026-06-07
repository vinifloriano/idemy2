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

// MARK: - Speech Recognition

class SpeechTranscriber {
    private let recognizer: SFSpeechRecognizer
    private var recognitionTask: SFSpeechRecognitionTask?
    private var audioEngine: AVAudioEngine?

    init?() {
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: "en-US")) else {
            outputError("Speech recognizer not available for en-US locale")
            return nil
        }
        guard rec.isAvailable else {
            outputError("Speech recognizer is not available on this device")
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

        outputProgress("Requesting speech recognition authorization...")

        SFSpeechRecognizer.requestAuthorization { status in
            switch status {
            case .authorized:
                self.performFileTranscription(url: url)
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

    private func performFileTranscription(url: URL) {
        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = true
        request.taskHint = .dictation

        // Prefer on-device if available
        if #available(macOS 13, *) {
            request.requiresOnDeviceRecognition = false // Allow cloud fallback
        }

        outputProgress("Starting transcription...")

        var lastSegmentEnd: Double = 0

        recognitionTask = recognizer.recognitionTask(with: request) { result, error in
            if let result = result {
                let segments = result.bestTranscription.segments
                for segment in segments {
                    let start = segment.timestamp
                    let duration = segment.duration
                    let end = start + max(duration, 0.5)
                    outputSegment(
                        text: segment.substring,
                        start: start,
                        end: end,
                        isFinal: result.isFinal
                    )
                    lastSegmentEnd = end
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
                self.startMicTranscription()
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

        var sessionStart = Date()
        
        recognitionTask = recognizer.recognitionTask(with: request) { result, error in
            if let result = result {
                let elapsed = Date().timeIntervalSince(sessionStart)
                let text = result.bestTranscription.formattedString
                outputSegment(
                    text: text,
                    start: max(0, elapsed - 2),
                    end: elapsed,
                    isFinal: result.isFinal
                )
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

    static func checkAvailability() {
        SFSpeechRecognizer.requestAuthorization { status in
            let available = (status == .authorized)
            outputJSON([
                "available": available,
                "platform": "macOS",
                "status": "\(status.rawValue)"
            ])
            exit(0)
        }
    }
}

// MARK: - Main

let args = CommandLine.arguments

guard args.count >= 2 else {
    outputError("Usage: apple-speech-helper <command> [args]\nCommands: transcribe-file <path>, transcribe-mic, check")
    exit(1)
}

let command = args[1]

switch command {
case "transcribe-file":
    guard args.count >= 3 else {
        outputError("Usage: apple-speech-helper transcribe-file <audio-file-path>")
        exit(1)
    }
    let filePath = args[2]
    guard let transcriber = SpeechTranscriber() else { exit(1) }
    transcriber.transcribeFile(at: filePath)

case "transcribe-mic":
    guard let transcriber = SpeechTranscriber() else { exit(1) }
    transcriber.transcribeMic()

case "check":
    SpeechTranscriber.checkAvailability()

default:
    outputError("Unknown command: \(command). Use: transcribe-file, transcribe-mic, or check")
    exit(1)
}

// Keep the run loop alive for async operations
RunLoop.main.run()
