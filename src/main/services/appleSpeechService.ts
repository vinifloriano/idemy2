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
let isFileTranscriptionCancelled = false

function cleanupTempFiles(videoId: string): void {
  const tempDir = app.getPath('temp')
  try {
    const files = fs.readdirSync(tempDir)
    const prefix = `idemy_apple_audio_${videoId}`
    for (const f of files) {
      if (f.startsWith(prefix) && f.endsWith('.wav')) {
        try {
          fs.unlinkSync(join(tempDir, f))
        } catch (err) {
          console.error(`[Apple Speech cleanup] Failed to delete temp file ${f}:`, err)
        }
      }
    }
  } catch (err) {
    console.error('[Apple Speech cleanup] Failed to read temp directory:', err)
  }
}

function segmentAudio(audioPath: string, outputPattern: string, segmentTimeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath()
    const args = [
      '-i', audioPath,
      '-f', 'segment',
      '-segment_time', String(segmentTimeSec),
      '-c', 'copy',
      outputPattern
    ]
    const child = spawn(ffmpegPath, args)
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`ffmpeg segmenting failed with code ${code}`))
      }
    })
    
    child.on('error', (err) => {
      reject(err)
    })
  })
}

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

async function getExistingSegments(videoId: string): Promise<TranscriptSegment[]> {
  try {
    const db = await getDatabase()
    return await db.all('SELECT id, video_id, text, start_time, end_time FROM transcripts WHERE video_id = ? ORDER BY start_time ASC', videoId) as TranscriptSegment[]
  } catch (err) {
    console.error('Failed to get existing segments:', err)
    return []
  }
}

export async function transcribeVideoWithAppleSpeech(
  videoId: string,
  videoPath: string,
  win?: BrowserWindow | null,
  locale?: string
): Promise<TranscriptSegment[]> {
  const tempAudioPath = join(app.getPath('temp'), `idemy_apple_audio_${videoId}.wav`)

  try {
    // Clean up any potential stale files first
    cleanupTempFiles(videoId)
    isFileTranscriptionCancelled = false

    // Step 1: Extract audio
    if (win && !win.isDestroyed()) {
      win.webContents.send('apple-speech-progress', { videoId, message: 'Extracting audio...' })
    }

    await extractAudioForAppleSpeech(videoPath, tempAudioPath)

    if (isFileTranscriptionCancelled) {
      cleanupTempFiles(videoId)
      return await getExistingSegments(videoId)
    }

    // Step 2: Segment the extracted wav file into chunks
    if (win && !win.isDestroyed()) {
      win.webContents.send('apple-speech-progress', { videoId, message: 'Segmenting audio...' })
    }

    const tempDir = app.getPath('temp')
    const segmentTimeSec = 120
    const chunkPattern = join(tempDir, `idemy_apple_audio_${videoId}_%03d.wav`)
    await segmentAudio(tempAudioPath, chunkPattern, segmentTimeSec)

    if (isFileTranscriptionCancelled) {
      cleanupTempFiles(videoId)
      return await getExistingSegments(videoId)
    }

    // Find and sort all segment files
    const files = fs.readdirSync(tempDir)
    const chunkPrefix = `idemy_apple_audio_${videoId}_`
    const chunkFiles = files
      .filter(f => f.startsWith(chunkPrefix) && f.endsWith('.wav'))
      .sort()
      .map(f => join(tempDir, f))

    if (chunkFiles.length === 0) {
      throw new Error('No audio segments were generated')
    }

    const helperPath = getHelperPath()
    const allSegments: TranscriptSegment[] = []
    const totalChunks = chunkFiles.length

    for (let i = 0; i < chunkFiles.length; i++) {
      if (isFileTranscriptionCancelled) {
        cleanupTempFiles(videoId)
        return await getExistingSegments(videoId)
      }

      const chunkFile = chunkFiles[i]
      const chunkOffset = i * segmentTimeSec

      if (win && !win.isDestroyed()) {
        win.webContents.send('apple-speech-progress', {
          videoId,
          message: `Transcribing chunk ${i + 1} of ${totalChunks}...`
        })
      }

      try {
        const chunkSegments = await runFileTranscription(
          helperPath,
          chunkFile,
          videoId,
          win,
          locale,
          chunkOffset,
          i,
          totalChunks
        )
        allSegments.push(...chunkSegments)
      } catch (err) {
        if (isFileTranscriptionCancelled) {
          cleanupTempFiles(videoId)
          return await getExistingSegments(videoId)
        }
        throw err
      }
    }

    // Step 3: Save to DB
    await saveSegmentsToDb(videoId, allSegments)

    // Cleanup temp files
    cleanupTempFiles(videoId)

    if (win && !win.isDestroyed()) {
      win.webContents.send('apple-speech-progress', { videoId, message: 'Done', done: true })
    }

    return allSegments
  } catch (error: any) {
    // Cleanup on error
    cleanupTempFiles(videoId)
    if (isFileTranscriptionCancelled || error.message === 'Transcription cancelled') {
      return await getExistingSegments(videoId)
    }
    throw error
  }
}

function runFileTranscription(
  helperPath: string,
  audioPath: string,
  videoId: string,
  win?: BrowserWindow | null,
  locale?: string,
  chunkOffset = 0,
  chunkIndex = 0,
  totalChunks = 1
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
              let displayProgress = parsed.progress
              const match = parsed.progress.match(/Transcribing:\s*(\d+)%/)
              if (match) {
                const chunkPercent = parseInt(match[1], 10)
                const overallPercent = Math.round(((chunkIndex + chunkPercent / 100) / totalChunks) * 100)
                displayProgress = `Transcribing: ${overallPercent}%`
              } else if (parsed.progress.includes('Transcribing')) {
                const basePercent = Math.round((chunkIndex / totalChunks) * 100)
                displayProgress = `Transcribing: ${basePercent}%`
              } else {
                displayProgress = `Chunk ${chunkIndex + 1}/${totalChunks} - ${parsed.progress}`
              }
              win.webContents.send('apple-speech-progress', { videoId, message: displayProgress })
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
            const adjustedStart = parsed.start + chunkOffset
            const adjustedEnd = parsed.end + chunkOffset
            const key = `${adjustedStart.toFixed(1)}`
            const seg: TranscriptSegment = {
              id: uuidv4(),
              video_id: videoId,
              text: parsed.text.trim(),
              start_time: adjustedStart,
              end_time: adjustedEnd
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
          if (parsed.text) {
            const adjustedStart = parsed.start + chunkOffset
            const adjustedEnd = parsed.end + chunkOffset
            const key = `${adjustedStart.toFixed(1)}`
            const seg: TranscriptSegment = {
              id: uuidv4(),
              video_id: videoId,
              text: parsed.text.trim(),
              start_time: adjustedStart,
              end_time: adjustedEnd
            }
            seenSegments.set(key, seg)
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

async function saveSegmentsToDb(videoId: string, segments: TranscriptSegment[]): Promise<void> {
  const db = await getDatabase()

  try {
    await db.run('BEGIN TRANSACTION')
    // Clear existing transcripts for this video
    await db.run('DELETE FROM transcripts WHERE video_id = ?', videoId)

    for (const seg of segments) {
      await db.run(`
        INSERT INTO transcripts (id, video_id, text, start_time, end_time)
        VALUES (?, ?, ?, ?, ?)
      `, seg.id, seg.video_id, seg.text, seg.start_time, seg.end_time)
    }
    await db.run('COMMIT')
  } catch (e) {
    await db.run('ROLLBACK')
    throw e
  }
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
  isFileTranscriptionCancelled = true
  if (activeFileProcess) {
    try {
      activeFileProcess.kill('SIGTERM')
      activeFileProcess = null
    } catch {
      activeFileProcess = null
    }
  }
}

export async function saveMicTranscript(
  videoId: string,
  segments: Array<{ text: string; start: number; end: number }>
): Promise<void> {
  const db = await getDatabase()

  try {
    await db.run('BEGIN TRANSACTION')
    // Clear existing transcripts for this video
    await db.run('DELETE FROM transcripts WHERE video_id = ?', videoId)

    for (const seg of segments) {
      await db.run(`
        INSERT INTO transcripts (id, video_id, text, start_time, end_time)
        VALUES (?, ?, ?, ?, ?)
      `, uuidv4(), videoId, seg.text.trim(), seg.start, seg.end)
    }
    await db.run('COMMIT')
  } catch (e) {
    await db.run('ROLLBACK')
    throw e
  }
}
