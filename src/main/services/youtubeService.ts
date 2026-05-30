import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import ytdl from '@distube/ytdl-core'
import ytpl from 'ytpl'
import ffmpeg from 'fluent-ffmpeg'
// @ts-ignore
import ffmpegPath from 'ffmpeg-static'

// Set ffmpeg path
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath)
}

export async function getPlaylistInfo(url: string) {
  try {
    if (ytpl.validateID(url)) {
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
    } else if (ytdl.validateURL(url)) {
      const info = await ytdl.getInfo(url)
      return {
        type: 'video',
        title: info.videoDetails.title,
        items: [{
          id: info.videoDetails.videoId,
          title: info.videoDetails.title,
          url: url,
          duration: info.videoDetails.lengthSeconds
        }]
      }
    }
    throw new Error('Invalid YouTube URL')
  } catch (error: any) {
    console.error('Error fetching YouTube info:', error)
    throw new Error(error.message || 'Failed to fetch YouTube info')
  }
}

export async function downloadYouTubeCourse(
  window: BrowserWindow,
  items: { id: string, title: string, url: string }[],
  targetFolder: string
) {
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true })
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const safeTitle = item.title.replace(/[\\/:"*?<>|]/g, '_')
    const outputPath = path.join(targetFolder, `${(i + 1).toString().padStart(2, '0')} - ${safeTitle}.mp4`)

    try {
      await downloadAndMerge(window, item.url, item.id, item.title, outputPath)
    } catch (error: any) {
      console.error(`Failed to download ${item.title}:`, error)
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

async function downloadAndMerge(
  window: BrowserWindow,
  url: string,
  videoId: string,
  title: string,
  outputPath: string
): Promise<void> {
  // Use a timeout to prevent hanging infinitely if something goes wrong with ytdl
  const info = await Promise.race([
    ytdl.getInfo(url),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout fetching video info')), 30000))
  ])

  const videoFormat = ytdl.chooseFormat(info.formats, { quality: 'highestvideo', filter: 'videoonly' })
  const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })

  if (!videoFormat || !audioFormat) {
    throw new Error('Failed to find suitable video or audio formats')
  }

  return new Promise((resolve, reject) => {
    let progressSent = false

    const command = ffmpeg()
      .input(videoFormat.url)
      .input(audioFormat.url)
      .videoCodec('copy')
      .audioCodec('aac')
      .format('mp4')
      .outputOptions('-map 0:v:0')
      .outputOptions('-map 1:a:0')
      .outputOptions('-shortest') // Ensure it ends when the shortest stream ends
      .on('progress', (progress) => {
        if (!window.isDestroyed()) {
          // ffmpeg progress object has a 'percent' property
          const percent = progress.percent || 0
          window.webContents.send('youtube-download-progress', {
            videoId,
            title,
            percent: Math.min(99, Math.round(percent)),
            status: 'downloading'
          })
          progressSent = true
        }
      })
      .on('error', (err) => {
        console.error('FFmpeg merging error:', err)
        reject(err)
      })
      .on('end', () => {
        if (!window.isDestroyed()) {
          window.webContents.send('youtube-download-progress', {
            videoId,
            title,
            percent: 100,
            status: 'completed'
          })
        }
        resolve()
      })

    command.save(outputPath)
  })
}
