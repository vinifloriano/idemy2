import { BrowserWindow } from 'electron'
import * as appleSpeech from './appleSpeechService'
import * as windowsSpeech from './windowsSpeechService'
import { TranscriptSegment } from '../../shared/types'

export async function checkSpeechAvailable(locale?: string): Promise<{ available: boolean; platform: string }> {
  if (process.platform === 'darwin') {
    return appleSpeech.checkAppleSpeechAvailable(locale)
  } else if (process.platform === 'win32') {
    return windowsSpeech.checkWindowsSpeechAvailable(locale)
  }
  return { available: false, platform: process.platform }
}

export async function transcribeVideo(
  videoId: string,
  videoPath: string,
  win?: BrowserWindow | null,
  locale?: string
): Promise<TranscriptSegment[]> {
  if (process.platform === 'darwin') {
    return appleSpeech.transcribeVideoWithAppleSpeech(videoId, videoPath, win, locale)
  } else if (process.platform === 'win32') {
    return windowsSpeech.transcribeVideoWithWindowsSpeech(videoId, videoPath, win, locale)
  }
  throw new Error(`Transcription not supported on ${process.platform}`)
}

export function startMicTranscription(win: BrowserWindow, locale?: string): void {
  if (process.platform === 'darwin') {
    appleSpeech.startMicTranscription(win, locale)
  } else if (process.platform === 'win32') {
    windowsSpeech.startWindowsMicTranscription(win, locale)
  }
}

export function stopMicTranscription(): void {
  if (process.platform === 'darwin') {
    appleSpeech.stopMicTranscription()
  } else if (process.platform === 'win32') {
    windowsSpeech.stopWindowsMicTranscription()
  }
}

export function cancelVideoTranscription(): void {
  if (process.platform === 'darwin') {
    appleSpeech.cancelVideoTranscription()
  } else if (process.platform === 'win32') {
    windowsSpeech.cancelWindowsVideoTranscription()
  }
}

export function saveMicTranscript(videoId: string, segments: any[]): void {
  // Both use the same DB structure
  appleSpeech.saveMicTranscript(videoId, segments)
}
