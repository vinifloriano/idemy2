import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { getFfmpegPath } from './ffmpegHelper'

let ffmpegInitialized = false

// Initialize FFmpeg path
try {
  const ffmpegPath = getFfmpegPath()

  if (fs.existsSync(ffmpegPath)) {
    ffmpeg.setFfmpegPath(ffmpegPath)
    ffmpegInitialized = true
    console.log(`[Converter] FFmpeg initialized with path: ${ffmpegPath}`)
  } else {
    console.error(`[Converter] FFmpeg binary not found at ${ffmpegPath}`)
  }
} catch (error) {
  console.error(`[Converter] Failed to initialize FFmpeg:`, error)
}

export async function convertMpegToMp4(inputPath: string, outputPath: string): Promise<void> {
  if (!ffmpegInitialized) {
    throw new Error('[Converter] FFmpeg not initialized')
  }

  return new Promise((resolve, reject) => {
    // Check if input file exists
    if (!fs.existsSync(inputPath)) {
      reject(new Error(`Input file not found: ${inputPath}`))
      return
    }

    const command = ffmpeg(inputPath)
      .output(outputPath)
      .on('end', () => {
        console.log(`[Converter] Conversion complete: ${inputPath} -> ${outputPath}`)
        resolve()
      })
      .on('error', (err: Error) => {
        console.error(`[Converter] Conversion error for ${inputPath}:`, err.message)
        reject(err)
      })

    try {
      command.run()
    } catch (error) {
      reject(error)
    }
  })
}

type ConversionTask = {
  inputPath: string
  outputPath: string
}

const conversionQueue: ConversionTask[] = []
let isConverting = false

async function processNextConversion() {
  if (isConverting || conversionQueue.length === 0) return
  isConverting = true

  const task = conversionQueue.shift()!
  console.log(`[Converter] Starting background conversion: ${task.inputPath} -> ${task.outputPath}`)

  try {
    await convertMpegToMp4(task.inputPath, task.outputPath)
  } catch (error) {
    console.error(`[Converter] Background conversion failed: ${task.inputPath}`, error)
  } finally {
    isConverting = false
    processNextConversion()
  }
}

export function queueMpegConversion(mpegPath: string): string {
  if (!ffmpegInitialized) {
    console.warn(`[Converter] FFmpeg not available, skipping MPEG conversion: ${mpegPath}`)
    return mpegPath
  }

  // Generate output path by replacing extension
  const dir = path.dirname(mpegPath)
  const name = path.basename(mpegPath, path.extname(mpegPath))
  const outputPath = path.join(dir, `${name}.mp4`)

  // If already converted, skip
  if (fs.existsSync(outputPath)) {
    console.log(`[Converter] MP4 already exists, skipping: ${outputPath}`)
    return outputPath
  }

  console.log(`[Converter] Queuing conversion: ${mpegPath} -> ${outputPath}`)
  conversionQueue.push({ inputPath: mpegPath, outputPath })
  
  // Start queue if not already running
  processNextConversion()
  
  return outputPath
}
