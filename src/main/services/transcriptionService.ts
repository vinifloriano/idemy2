import { app } from 'electron'
import { join } from 'path'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
// @ts-ignore
import ffmpegPath from 'ffmpeg-static'
import { WaveFile } from 'wavefile'
import { getDatabase, uuidv4 } from '../db/database'
import { TranscriptSegment } from '../../shared/types'

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath)

let transcriber: any = null

async function loadTranscriber() {
  if (!transcriber) {
    console.log('Loading Whisper model (this may take a while on first run)...')
    
    // Use require to ensure it's treated as a runtime dependency
    const { pipeline: transformersPipeline, env } = require('@xenova/transformers')

    // Configure transformers cache path
    env.localModelPath = join(app.getPath('userData'), 'models')
    env.allowRemoteModels = true
    env.cacheDir = join(app.getPath('userData'), 'models')

    // CRITICAL for Electron: Prevent native onnxruntime-node from crashing the app due to ABI mismatch
    // Force it to use the WASM backend instead, which works universally.
    env.backends.onnx.wasm.numThreads = 1
    env.backends.onnx.wasm.simd = true
    env.backends.onnx.node = false // Disable native C++ bindings

    transcriber = await transformersPipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en')
    console.log('Whisper model loaded.')
  }
  return transcriber
}

function extractAudio(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        '-ac 1', // mono
        '-ar 16000', // 16kHz
        '-f wav',
      ])
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(outputPath)
  })
}

export async function generateTranscript(videoId: string, videoPath: string): Promise<TranscriptSegment[]> {
  try {
    const tempAudioPath = join(app.getPath('temp'), `idemy_audio_${videoId}.wav`)
    console.log('Extracting audio to:', tempAudioPath)
    await extractAudio(videoPath, tempAudioPath)

    // Read the WAV file and extract audio data
    const wavBuffer = fs.readFileSync(tempAudioPath)
    const wav = new WaveFile(wavBuffer)
    wav.toBitDepth('32f')
    wav.toSampleRate(16000)
    let audioData = wav.getSamples()
    
    // Ensure it's Float32Array and flat (mono)
    if (Array.isArray(audioData)) {
      if (audioData.length > 1) {
        // Average channels if somehow not mono
        const SC = audioData[0].length
        const merged = new Float32Array(SC)
        for (let i = 0; i < SC; ++i) {
          merged[i] = (audioData[0][i] + audioData[1][i]) / 2
        }
        audioData = merged
      } else {
        audioData = audioData[0] as unknown as Float32Array
      }
    }

    const transcribe = await loadTranscriber()
    console.log('Starting transcription...')
    
    const output = await transcribe(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    })

    console.log('Transcription complete.')

    // Clean up temp file
    if (fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath)
    }

    // Save to DB
    const db = getDatabase()
    const insertStmt = db.prepare(`
      INSERT INTO transcripts (id, video_id, text, start_time, end_time)
      VALUES (?, ?, ?, ?, ?)
    `)

    const segments: TranscriptSegment[] = []
    
    const transaction = db.transaction(() => {
      // Clear existing for this video
      db.prepare('DELETE FROM transcripts WHERE video_id = ?').run(videoId)
      
      for (const chunk of output.chunks) {
        const seg = {
          id: uuidv4(),
          video_id: videoId,
          text: chunk.text.trim(),
          start_time: chunk.timestamp[0],
          end_time: chunk.timestamp[1] !== null ? chunk.timestamp[1] : chunk.timestamp[0] + 5
        }
        insertStmt.run(seg.id, seg.video_id, seg.text, seg.start_time, seg.end_time)
        segments.push(seg)
      }
    })

    transaction()
    return segments

  } catch (error) {
    console.error('Transcription error:', error)
    throw error
  }
}

export function getTranscript(videoId: string): TranscriptSegment[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM transcripts WHERE video_id = ? ORDER BY start_time ASC').all(videoId) as TranscriptSegment[]
}
