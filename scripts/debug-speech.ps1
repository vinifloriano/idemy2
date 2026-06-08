Add-Type -AssemblyName System.Speech
$recs = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
if ($recs.Count -eq 0) {
    Write-Host "No speech recognizers found."
} else {
    foreach ($rec in $recs) {
        Write-Host "ID: $($rec.Id), Culture: $($rec.Culture.Name), Name: $($rec.Name)"
    }
}
