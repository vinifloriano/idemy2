import { app } from 'electron'
import path from 'path'
import os from 'os'

let cachedPath = ''

export function getFfmpegPath(): string {
  if (cachedPath) return cachedPath

  try {
    const platform = os.platform()
    const execName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

    if (app.isPackaged) {
      cachedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', execName)
    } else {
      cachedPath = path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', execName)
    }
  } catch (error) {
    console.error('[FFmpeg Helper] Failed to resolve FFmpeg path:', error)
  }

  return cachedPath
}
