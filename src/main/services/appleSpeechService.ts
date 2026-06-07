import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import { getFfmpegPath } from './ffmpegHelper'
import { getDatabase, uuidv4 } from '../db/database'
import { TranscriptSegment } from '../../shared/types'

ffmpeg.setFfmpegPath(getFfmpegPath())

// Path to the compiled Swift helper binary
function getHelperPath(): string {
  // In development, use the source-adjacent compiled binary
  // In production, it should be bundled in resources
  const devPath = join(__dirname, '../../src/main/native/apple-speech-helper')
  const prodPath = join(process.resourcesPath || '', 'apple-speech-helper')

  if (fs.existsSync(prodPath)) return prodPath
  if (fs.existsSync(devPath)) return devPath

  // Fallback: try relative to this file
  const fallback = join(__dirname, '../native/apple-speech-helper')
  if (fs.existsSync(fallback)) return fallback

  throw new Error('Apple Speech helper binary not found. This feature requires macOS.')
}

// Active mic transcription process
let activeMicProcess: ChildProcess | null = null
// Active file transcription process
let activeFileProcess: ChildProcess | null = null

function extractAudioForAppleSpeech(videoPath: string, outputPath: string): Promise<void> {
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

export function checkAppleSpeechAvailable(locale?: string): Promise<{ available: boolean; platform: string }> {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      resolve({ available: false, platform: process.platform })
      return
    }

    try {
      const helperPath = getHelperPath()
      const args = ['check']
      if (locale) {
        args.push(locale)
      }
      const child = spawn(helperPath, args)
      let output = ''

      child.stdout.on('data', (data) => {
        output += data.toString()
      })

      child.stderr.on('data', (data) => {
        console.error('[Apple Speech check stderr]:', data.toString())
      })

      child.on('close', (code) => {
        try {
          const lines = output.trim().split('\n').filter(Boolean)
          for (const line of lines) {
            const parsed = JSON.parse(line)
            if ('available' in parsed) {
              resolve({ available: parsed.available, platform: 'macOS' })
              return
            }
          }
        } catch (e) {
          console.error('Failed to parse Apple Speech check output:', e)
        }
        resolve({ available: false, platform: 'macOS' })
      })

      child.on('error', () => {
        resolve({ available: false, platform: process.platform })
      })

      // Timeout after 10s
      setTimeout(() => {
        child.kill()
        resolve({ available: false, platform: process.platform })
      }, 10000)
    } catch {
      resolve({ available: false, platform: process.platform })
    }
  })
}

export async function transcribeVideoWithAppleSpeech(
  videoId: string,
  videoPath: string,
  win?: BrowserWindow | null,
  locale?: string
): Promise<TranscriptSegment[]> {
  const tempAudioPath = join(app.getPath('temp'), `idemy_apple_audio_${videoId}.wav`)

  try {
    // Step 1: Extract audio
    if (win && !win.isDestroyed()) {
      win.webContents.send('apple-speech-progress', { videoId, message: 'Extracting audio...' })
    }

    await extractAudioForAppleSpeech(videoPath, tempAudioPath)

    // Step 2: Run Apple Speech transcription
    if (win && !win.isDestroyed()) {
      win.webContents.send('apple-speech-progress', { videoId, message: 'Transcribing with Apple Speech...' })
    }

    const helperPath = getHelperPath()
    const segments = await runFileTranscription(helperPath, tempAudioPath, videoId, win, locale)

    // Step 3: Save to DB
    saveSegmentsToDb(videoId, segments)

    // Cleanup temp file
    if (fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath)
    }

    if (win && !win.isDestroyed()) {
      win.webContents.send('apple-speech-progress', { videoId, message: 'Done', done: true })
    }

    return segments
  } catch (error) {
    // Cleanup on error
    if (fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath)
    }
    throw error
  }
}

function runFileTranscription(
  helperPath: string,
  audioPath: string,
  videoId: string,
  win?: BrowserWindow | null,
  locale?: string
): Promise<TranscriptSegment[]> {
  return new Promise((resolve, reject) => {
    const args = ['transcribe-file', audioPath]
    if (locale) {
      args.push(locale)
    }
    const child = spawn(helperPath, args)
    activeFileProcess = child
    const segments: TranscriptSegment[] = []
    let buffer = ''
    // Track unique segments by start time to avoid duplicates from partial results
    const seenSegments = new Map<string, TranscriptSegment>()

    child.stdout.on('data', (data) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)

          if (parsed.error) {
            reject(new Error(parsed.error))
            child.kill()
            return
          }

          if (parsed.progress) {
            if (win && !win.isDestroyed()) {
              win.webContents.send('apple-speech-progress', { videoId, message: parsed.progress })
            }
            continue
          }

          if (parsed.done) {
            // Collect final segments
            const finalSegments = Array.from(seenSegments.values())
              .sort((a, b) => a.start_time - b.start_time)
            resolve(finalSegments)
            return
          }

          if (parsed.text && parsed.isFinal) {
            const key = `${parsed.start.toFixed(1)}`
            const seg: TranscriptSegment = {
              id: uuidv4(),
              video_id: videoId,
              text: parsed.text.trim(),
              start_time: parsed.start,
              end_time: parsed.end
            }
            seenSegments.set(key, seg)
          }
        } catch (e) {
          // Skip malformed JSON lines
        }
      }
    })

    child.stderr.on('data', (data) => {
      console.error('[Apple Speech stderr]:', data.toString())
    })

    child.on('close', (code) => {
      activeFileProcess = null
      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim())
          if (parsed.done || parsed.text) {
            const finalSegments = Array.from(seenSegments.values())
              .sort((a, b) => a.start_time - b.start_time)
            resolve(finalSegments)
            return
          }
        } catch (e) {
          // ignore
        }
      }

      if (code !== 0 && seenSegments.size === 0) {
        reject(new Error(`Apple Speech helper exited with code ${code}`))
      } else {
        const finalSegments = Array.from(seenSegments.values())
          .sort((a, b) => a.start_time - b.start_time)
        resolve(finalSegments)
      }
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to start Apple Speech helper: ${err.message}`))
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
    // Clear existing transcripts for this video
    db.prepare('DELETE FROM transcripts WHERE video_id = ?').run(videoId)

    for (const seg of segments) {
      insertStmt.run(seg.id, seg.video_id, seg.text, seg.start_time, seg.end_time)
    }
  })

  transaction()
}

export function startMicTranscription(win: BrowserWindow, locale?: string): void {
  if (activeMicProcess) {
    // Kill existing mic process
    stopMicTranscription()
  }

  try {
    const helperPath = getHelperPath()
    const args = ['transcribe-mic']
    if (locale) {
      args.push(locale)
    }
    activeMicProcess = spawn(helperPath, args)
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

          if (parsed.progress) {
            if (!win.isDestroyed()) {
              win.webContents.send('apple-speech-mic-result', { progress: parsed.progress })
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
        } catch (e) {
          // Skip malformed JSON
        }
      }
    })

    activeMicProcess.stderr?.on('data', (data) => {
      console.error('[Apple Speech Mic stderr]:', data.toString())
      if (!win.isDestroyed()) {
        win.webContents.send('apple-speech-mic-result', { error: data.toString() })
      }
    })

    activeMicProcess.on('close', (code) => {
      activeMicProcess = null
      if (!win.isDestroyed()) {
        if (code !== null && code !== 0) {
          win.webContents.send('apple-speech-mic-result', { error: `Speech helper exited with code ${code}`, done: true })
        } else {
          win.webContents.send('apple-speech-mic-result', { done: true })
        }
      }
    })

    activeMicProcess.on('error', (err) => {
      if (!win.isDestroyed()) {
        win.webContents.send('apple-speech-mic-result', { error: err.message })
      }
      activeMicProcess = null
    })
  } catch (error: any) {
    if (!win.isDestroyed()) {
      win.webContents.send('apple-speech-mic-result', { error: error.message })
    }
  }
}

export function stopMicTranscription(): void {
  if (activeMicProcess) {
    try {
      // Send STOP command via stdin
      activeMicProcess.stdin?.write('STOP\n')
      // Give it a moment, then force kill
      setTimeout(() => {
        if (activeMicProcess) {
          activeMicProcess.kill('SIGTERM')
          activeMicProcess = null
        }
      }, 1000)
    } catch {
      activeMicProcess?.kill('SIGTERM')
      activeMicProcess = null
    }
  }
}

export function cancelVideoTranscription(): void {
  if (activeFileProcess) {
    try {
      activeFileProcess.kill('SIGTERM')
      activeFileProcess = null
    } catch {
      activeFileProcess = null
    }
  }
}

export function saveMicTranscript(
  videoId: string,
  segments: Array<{ text: string; start: number; end: number }>
): void {
  const db = getDatabase()
  const insertStmt = db.prepare(`
    INSERT INTO transcripts (id, video_id, text, start_time, end_time)
    VALUES (?, ?, ?, ?, ?)
  `)

  const transaction = db.transaction(() => {
    // Clear existing transcripts for this video
    db.prepare('DELETE FROM transcripts WHERE video_id = ?').run(videoId)

    for (const seg of segments) {
      insertStmt.run(uuidv4(), videoId, seg.text.trim(), seg.start, seg.end)
    }
  })

  transaction()
}
