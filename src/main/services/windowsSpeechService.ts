import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import { getFfmpegPath } from './ffmpegHelper'
import { getDatabase, uuidv4 } from '../db/database'
import { TranscriptSegment } from '../../shared/types'

ffmpeg.setFfmpegPath(getFfmpegPath())

function getScriptPath(): string {
  const devPath = join(__dirname, '../../src/main/native/windows-speech-helper.ps1')
  const prodPath = join(process.resourcesPath || '', 'windows-speech-helper.ps1')

  if (fs.existsSync(prodPath)) return prodPath
  if (fs.existsSync(devPath)) return devPath

  const fallback = join(__dirname, '../native/windows-speech-helper.ps1')
  if (fs.existsSync(fallback)) return fallback

  throw new Error('Windows Speech helper script not found.')
}

let activeMicProcess: ChildProcess | null = null
let activeFileProcess: ChildProcess | null = null
let isFileTranscriptionCancelled = false

function cleanupTempFiles(videoId: string): void {
  const tempDir = app.getPath('temp')
  try {
    const files = fs.readdirSync(tempDir)
    const prefix = `idemy_win_audio_${videoId}`
    for (const f of files) {
      if (f.startsWith(prefix) && f.endsWith('.wav')) {
        try {
          fs.unlinkSync(join(tempDir, f))
        } catch (err) {
          console.error(`[Windows Speech cleanup] Failed to delete temp file ${f}:`, err)
        }
      }
    }
  } catch (err) {
    console.error('[Windows Speech cleanup] Failed to read temp directory:', err)
  }
}

function extractAudioForWindowsSpeech(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        '-ac 1',     // mono
        '-ar 16000', // 16kHz sample rate
        '-f wav',
      ])
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(outputPath)
  })
}

export function checkWindowsSpeechAvailable(locale?: string): Promise<{ available: boolean; platform: string }> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ available: false, platform: process.platform })
      return
    }

    try {
      const scriptPath = getScriptPath()
      const args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Command', 'check']
      if (locale) {
        args.push('-Locale', locale)
      }
      const child = spawn('powershell.exe', args)
      let output = ''

      child.stdout.on('data', (data) => {
        output += data.toString()
      })

      child.on('close', (code) => {
        try {
          const lines = output.trim().split('\n').filter(Boolean)
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line)
              if ('available' in parsed) {
                resolve({ available: parsed.available, platform: 'Windows' })
                return
              }
            } catch { /* ignore non-json lines */ }
          }
        } catch (e) {
          console.error('Failed to parse Windows Speech check output:', e)
        }
        resolve({ available: false, platform: 'Windows' })
      })

      child.on('error', () => {
        resolve({ available: false, platform: process.platform })
      })

      setTimeout(() => {
        child.kill()
        resolve({ available: false, platform: process.platform })
      }, 10000)
    } catch {
      resolve({ available: false, platform: process.platform })
    }
  })
}

export async function transcribeVideoWithWindowsSpeech(
  videoId: string,
  videoPath: string,
  win?: BrowserWindow | null,
  locale?: string
): Promise<TranscriptSegment[]> {
  const tempAudioPath = join(app.getPath('temp'), `idemy_win_audio_${videoId}.wav`)

  try {
    cleanupTempFiles(videoId)
    isFileTranscriptionCancelled = false

    if (win && !win.isDestroyed()) {
      win.webContents.send('apple-speech-progress', { videoId, message: 'Extracting audio...' })
    }

    await extractAudioForWindowsSpeech(videoPath, tempAudioPath)

    if (isFileTranscriptionCancelled) {
      cleanupTempFiles(videoId)
      return []
    }

    if (win && !win.isDestroyed()) {
      win.webContents.send('apple-speech-progress', { videoId, message: 'Starting transcription...' })
    }

    const segments = await runFileTranscription(tempAudioPath, videoId, win, locale)
    
    saveSegmentsToDb(videoId, segments)
    cleanupTempFiles(videoId)

    if (win && !win.isDestroyed()) {
      win.webContents.send('apple-speech-progress', { videoId, message: 'Done', done: true })
    }

    return segments
  } catch (error: any) {
    cleanupTempFiles(videoId)
    throw error
  }
}

function runFileTranscription(
  audioPath: string,
  videoId: string,
  win?: BrowserWindow | null,
  locale?: string
): Promise<TranscriptSegment[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = getScriptPath()
    const args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Command', 'transcribe-file', '-Arg1', audioPath]
    if (locale) {
      args.push('-Locale', locale)
    }
    const child = spawn('powershell.exe', args)
    activeFileProcess = child
    const segments: TranscriptSegment[] = []
    let buffer = ''

    child.stdout.on('data', (data) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)

          if (parsed.error) {
            reject(new Error(parsed.error))
            child.kill()
            return
          }

          if (parsed.done) {
            resolve(segments)
            return
          }

          if (parsed.text && parsed.isFinal) {
            segments.push({
              id: uuidv4(),
              video_id: videoId,
              text: parsed.text.trim(),
              start_time: parsed.start,
              end_time: parsed.end
            })
            // Update progress in UI
            if (win && !win.isDestroyed()) {
               win.webContents.send('apple-speech-progress', { 
                 videoId, 
                 message: `Transcribing: ${segments.length} segments...` 
               })
            }
          }
        } catch (e) { /* ignore */ }
      }
    })

    child.on('close', (code) => {
      activeFileProcess = null
      if (code !== 0 && segments.length === 0) {
        reject(new Error(`Windows Speech helper exited with code ${code}`))
      } else {
        resolve(segments)
      }
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to start Windows Speech helper: ${err.message}`))
    })
  })
}

function saveSegmentsToDb(videoId: string, segments: TranscriptSegment[]): void {
  const db = getDatabase()
  const insertStmt = db.prepare(`
    INSERT INTO transcripts (id, video_id, text, start_time, end_time)
    VALUES (?, ?, ?, ?, ?)
  `)

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM transcripts WHERE video_id = ?').run(videoId)
    for (const seg of segments) {
      insertStmt.run(seg.id, seg.video_id, seg.text, seg.start_time, seg.end_time)
    }
  })
  transaction()
}

export function startWindowsMicTranscription(win: BrowserWindow, locale?: string): void {
  if (activeMicProcess) stopWindowsMicTranscription()

  try {
    const scriptPath = getScriptPath()
    const args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Command', 'transcribe-mic']
    if (locale) {
      args.push('-Locale', locale)
    }
    activeMicProcess = spawn('powershell.exe', args)
    let buffer = ''

    activeMicProcess.stdout?.on('data', (data) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)

          if (parsed.error) {
            if (!win.isDestroyed()) {
              win.webContents.send('apple-speech-mic-result', { error: parsed.error })
            }
            continue
          }

          if (parsed.done) {
            if (!win.isDestroyed()) {
              win.webContents.send('apple-speech-mic-result', { done: true })
            }
            activeMicProcess = null
            return
          }

          if (parsed.segments) {
            if (!win.isDestroyed()) {
              win.webContents.send('apple-speech-mic-result', {
                segments: parsed.segments,
                isFinal: parsed.isFinal
              })
            }
          }
        } catch (e) { /* ignore */ }
      }
    })

    activeMicProcess.on('close', (code) => {
      activeMicProcess = null
      if (!win.isDestroyed() && code !== 0 && code !== null) {
        win.webContents.send('apple-speech-mic-result', { error: `Speech helper exited with code ${code}`, done: true })
      }
    })
  } catch (error: any) {
    if (!win.isDestroyed()) {
      win.webContents.send('apple-speech-mic-result', { error: error.message })
    }
  }
}

export function stopWindowsMicTranscription(): void {
  if (activeMicProcess) {
    try {
      activeMicProcess.stdin?.write('STOP\r\n')
      setTimeout(() => {
        if (activeMicProcess) {
          activeMicProcess.kill()
          activeMicProcess = null
        }
      }, 1000)
    } catch {
      activeMicProcess?.kill()
      activeMicProcess = null
    }
  }
}

export function cancelWindowsVideoTranscription(): void {
  isFileTranscriptionCancelled = true
  if (activeFileProcess) {
    activeFileProcess.kill()
    activeFileProcess = null
  }
}
