import { BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { YtDlp, helpers } from 'ytdlp-nodejs'
import ytpl from 'ytpl' 
// @ts-ignore
import ffmpegPath from 'ffmpeg-static'

// Setup paths
const binPath = path.join(app.getPath('userData'), 'bin')
if (!fs.existsSync(binPath)) fs.mkdirSync(binPath, { recursive: true })

const targetBinaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
const binaryFilePath = path.join(binPath, targetBinaryName)

let ytdlpInstance: YtDlp | null = null

// Tracking active downloads
const activeProcesses = new Map<string, any>()
const cancelledDownloads = new Set<string>()
let cancelAllRequested = false

// Function to ensure binary is present and get instance
async function getYtdlpInstance(): Promise<YtDlp> {
  if (ytdlpInstance) return ytdlpInstance

  try {
    let finalBinaryPath = binaryFilePath

    if (!fs.existsSync(binaryFilePath)) {
      console.log('[YouTube Service] Binary missing, downloading to:', binPath)
      // downloadYtDlp returns the ACTUAL path of the downloaded binary
      const downloadedPath = await helpers.downloadYtDlp(binPath)
      finalBinaryPath = downloadedPath
      
      console.log('[YouTube Service] yt-dlp binary downloaded to:', finalBinaryPath)
    }

    // Always ensure it's executable if on Unix
    if (process.platform !== 'win32' && fs.existsSync(finalBinaryPath)) {
      fs.chmodSync(finalBinaryPath, 0o755)
    }

    ytdlpInstance = new YtDlp({
      binaryPath: finalBinaryPath,
      ffmpegPath: ffmpegPath
    })
    
    return ytdlpInstance
  } catch (error) {
    console.error('[YouTube Service] Failed to initialize yt-dlp:', error)
    throw error
  }
}

export function cancelDownload(videoId: string) {
  const process = activeProcesses.get(videoId)
  if (process) {
    console.log(`[YouTube Service] Killing process for ${videoId}`)
    process.kill()
    activeProcesses.delete(videoId)
  }
  cancelledDownloads.add(videoId)
}

export function cancelAllDownloads() {
  cancelAllRequested = true
  activeProcesses.forEach((proc, id) => {
    console.log(`[YouTube Service] Killing process for ${id}`)
    proc.kill()
  })
  activeProcesses.clear()
}

export async function getPlaylistInfo(url: string) {
  const ytdlp = await getYtdlpInstance()
  try {
    console.log('[YouTube Service] Fetching info for:', url)
    
    // getInfoAsync is the correct method in ytdlp-nodejs
    const info: any = await ytdlp.getInfoAsync(url)
    
    // Check if it's a playlist or single video
    if (info._type === 'playlist' || Array.isArray(info.entries)) {
      return {
        type: 'playlist',
        title: info.title || 'YouTube Playlist',
        items: (info.entries || []).map((item: any) => ({
          id: item.id,
          title: item.title,
          url: `https://www.youtube.com/watch?v=${item.id}`,
          duration: item.duration
        }))
      }
    } else {
      return {
        type: 'video',
        title: info.title,
        items: [{
          id: info.id,
          title: info.title,
          url: url,
          duration: info.duration
        }]
      }
    }
  } catch (error: any) {
    console.error('[YouTube Service] Error fetching YouTube info:', error)
    // Fallback to ytpl if yt-dlp fails for metadata
    if (ytpl.validateID(url)) {
      try {
        const playlist = await ytpl(url, { limit: Infinity })
        return {
          type: 'playlist',
          title: playlist.title,
          items: playlist.items.map(item => ({
            id: item.id,
            title: item.title,
            url: item.shortUrl,
            duration: item.duration
          }))
        }
      } catch (ytplError) {
        console.error('[YouTube Service] Fallback ytpl also failed:', ytplError)
      }
    }
    throw new Error(error.message || 'Failed to fetch YouTube info')
  }
}

export async function downloadYouTubeCourse(
  window: BrowserWindow,
  items: { id: string, title: string, url: string }[],
  targetFolder: string
) {
  const ytdlp = await getYtdlpInstance()
  cancelAllRequested = false
  cancelledDownloads.clear()
  
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true })
  }

  // Initial broadcast to show all items as queued
  for (const item of items) {
    if (!window.isDestroyed()) {
      window.webContents.send('youtube-download-progress', {
        videoId: item.id,
        title: item.title,
        percent: 0,
        status: 'queued'
      })
    }
  }

  for (let i = 0; i < items.length; i++) {
    if (cancelAllRequested) break
    
    const item = items[i]
    if (cancelledDownloads.has(item.id)) continue

    const safeTitle = item.title.replace(/[\\/:"*?<>|]/g, '_')
    const outputPath = path.join(targetFolder, `${(i + 1).toString().padStart(2, '0')} - ${safeTitle}.mp4`)

    try {
      if (fs.existsSync(outputPath)) {
        console.log(`[YouTube Service] Skipping existing file: ${item.title}`)
        window.webContents.send('youtube-download-progress', {
          videoId: item.id,
          title: item.title,
          percent: 100,
          status: 'completed'
        })
        continue
      }

      console.log(`[YouTube Service] Downloading: ${item.title}`)
      
      const builder = ytdlp.exec(item.url)
        .addOption('format', 'bv+ba/b')
        .addOption('remuxVideo', 'mp4')
        .addOption('output', outputPath)
        .addOption('noCheckCertificates', true) // Corrected plural name
        .on('progress', (progress) => {
          if (!window.isDestroyed()) {
            window.webContents.send('youtube-download-progress', {
              videoId: item.id,
              title: item.title,
              percent: progress.percentage || 0,
              status: 'downloading'
            })
          }
        })
      
      activeProcesses.set(item.id, builder)

      await builder.exec()
      activeProcesses.delete(item.id)

      if (!window.isDestroyed() && !cancelledDownloads.has(item.id)) {
        window.webContents.send('youtube-download-progress', {
          videoId: item.id,
          title: item.title,
          percent: 100,
          status: 'completed'
        })
      }
    } catch (error: any) {
      activeProcesses.delete(item.id)
      if (cancelledDownloads.has(item.id) || cancelAllRequested) {
        window.webContents.send('youtube-download-progress', {
          videoId: item.id,
          title: item.title,
          percent: 0,
          status: 'cancelled'
        })
      } else {
        console.error(`[YouTube Service] Failed to download ${item.title}:`, error)
        if (!window.isDestroyed()) {
          window.webContents.send('youtube-download-progress', {
            videoId: item.id,
            title: item.title,
            percent: 0,
            status: 'error',
            error: error.message || 'Download failed'
          })
        }
      }
    }
  }
}
