param (
    [string]$Command,
    [string]$Arg1,
    [string]$Locale = "en-US"
)

# Suppress error messages from showing up in stderr unless we want them
$ErrorActionPreference = "Stop"

try {
    Add-Type -AssemblyName System.Speech
} catch {
    Write-Output '{"error": "System.Speech not found. Please ensure Windows Speech Recognition is available."}'
    exit 1
}

function Output-JSON($obj) {
    $json = $obj | ConvertTo-Json -Compress
    Write-Output $json
    # Flush output
    [Console]::Out.Flush()
}

if ($Command -eq "check") {
    try {
        $installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
        $match = $installed | Where-Object { $_.Culture.Name -eq $Locale -or $_.Id -eq $Locale } | Select-Object -First 1
        
        if ($match) {
            Output-JSON @{ available = $true; platform = "Windows"; locale = $match.Culture.Name; id = $match.Id }
        } else {
            # Try default
            $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
            Output-JSON @{ available = $true; platform = "Windows"; locale = $recognizer.RecognizerInfo.Culture.Name; note = "Requested locale not found, using default" }
        }
    } catch {
        Output-JSON @{ available = $false; platform = "Windows"; error = $_.Exception.Message }
    }
    exit 0
}

if ($Command -eq "transcribe-mic") {
    try {
        $recognizer = $null
        try {
            $installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
            $match = $installed | Where-Object { $_.Culture.Name -eq $Locale -or $_.Id -eq $Locale } | Select-Object -First 1
            if ($match) {
                $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine -ArgumentList $match.Id
            } else {
                $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
            }
        } catch {
            $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
        }

        $recognizer.SetInputToDefaultAudioDevice()
        
        $grammar = New-Object System.Speech.Recognition.DictationGrammar
        $recognizer.LoadGrammar($grammar)
        
        # Track segments for "same UI" behavior
        $script:segments = New-Object System.Collections.Generic.List[Object]
        $script:startTime = [DateTime]::Now

        $onHypothesis = {
            param($sender, $e)
            $text = $e.Result.Text
            $now = [DateTime]::Now
            $elapsed = ($now - $script:startTime).TotalSeconds
            
            # For real-time, we just send current segments
            # The UI expects an array of segments
            $currentSegment = @{ text = $text; start = $elapsed; end = $elapsed + 1 }
            # For simplicity in mic mode, we send a single segment in a list or the whole history
            # Actually, the Mac helper sends the full list of segments so far
            # Let's just send the current hypothesized text as a single segment for now
            Output-JSON @{ segments = @($currentSegment); isFinal = $false }
        }

        $onRecognized = {
            param($sender, $e)
            $text = $e.Result.Text
            if (-not [string]::IsNullOrWhiteSpace($text)) {
                $now = [DateTime]::Now
                $elapsed = ($now - $script:startTime).TotalSeconds
                $script:segments.Add(@{ text = $text; start = $elapsed - ($e.Result.Audio.Duration.TotalSeconds); end = $elapsed })
                Output-JSON @{ segments = $script:segments.ToArray(); isFinal = $false }
            }
        }

        Register-ObjectEvent -InputObject $recognizer -EventName "SpeechHypothesized" -Action $onHypothesis | Out-Null
        Register-ObjectEvent -InputObject $recognizer -EventName "SpeechRecognized" -Action $onRecognized | Out-Null

        $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
        
        Output-JSON @{ progress = "Listening..." }

        # Listen for STOP on stdin
        while ($true) {
            $line = [Console]::In.ReadLine()
            if ($line -eq "STOP") {
                $recognizer.RecognizeAsyncStop()
                Output-JSON @{ done = $true }
                break
            }
            if ($null -eq $line) { break } # Parent process closed
        }
    } catch {
        Output-JSON @{ error = $_.Exception.Message }
    }
    exit 0
}

if ($Command -eq "transcribe-file") {
    try {
        $path = $Arg1
        if (-not (Test-Path $path)) {
            Output-JSON @{ error = "File not found: $path" }
            exit 1
        }

        $recognizer = $null
        try {
            $installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
            $match = $installed | Where-Object { $_.Culture.Name -eq $Locale -or $_.Id -eq $Locale } | Select-Object -First 1
            if ($match) {
                $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine -ArgumentList $match.Id
            } else {
                $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
            }
        } catch {
            $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
        }

        $recognizer.SetInputToWaveFile($path)
        
        $grammar = New-Object System.Speech.Recognition.DictationGrammar
        $recognizer.LoadGrammar($grammar)

        $script:fileSegments = New-Object System.Collections.Generic.List[Object]
        $script:isDone = $false

        Register-ObjectEvent -InputObject $recognizer -EventName "SpeechRecognized" -Action {
            param($sender, $e)
            $text = $e.Result.Text
            if (-not [string]::IsNullOrWhiteSpace($text)) {
                $start = $e.Result.Audio.AudioPosition.TotalSeconds
                $end = $start + $e.Result.Audio.Duration.TotalSeconds
                $seg = @{ text = $text; start = $start; end = $end; isFinal = $true }
                Output-JSON $seg
                $script:fileSegments.Add($seg)
            }
        } | Out-Null

        Register-ObjectEvent -InputObject $recognizer -EventName "RecognizeCompleted" -Action {
            $script:isDone = $true
        } | Out-Null

        $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)

        while (-not $script:isDone) {
            Start-Sleep -Milliseconds 100
        }

        Output-JSON @{ done = $true }
    } catch {
        Output-JSON @{ error = $_.Exception.Message }
    }
    exit 0
}
