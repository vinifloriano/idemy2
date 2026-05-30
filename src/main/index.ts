import { app, shell, BrowserWindow, ipcMain, dialog, protocol, nativeImage } from 'electron'
import fs from 'fs'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './db/database'
import { scanCourseFolder } from './services/scanner'
import { getAllCourses, getCourseById, saveCourse, updateVideoProgress, renameCourse, updateCourseIcon, updateCourseLastVideo, removeCourse, resetCourseProgress, getDailyStreak, deleteCoursePermanently, saveNote, getNotesForCourse, deleteNote, exportNotesMarkdown, getActivityLog } from './services/courseService'
import { generateTranscript, getTranscript } from './services/transcriptionService'
import { getPlaylistInfo, downloadYouTubeCourse, cancelDownload, cancelAllDownloads } from './services/youtubeService'

// Suppress Chromium log noise and DevTools Autofill errors
app.commandLine.appendSwitch('log-level', '3')
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication')

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

// Register protocol before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { bypassCSP: true, stream: true, secure: true, supportFetchAPI: true } }
])

function createWindow(): void {
  // Determine icon: prefer repo `resources/icon.ico` or `resources/icon.png`, else use SVG data URL
  let windowIcon: any = undefined
  try {
    const icoPath = join(__dirname, '../../resources/icon.ico')
    const pngPath = join(__dirname, '../../resources/icon.png')
    const svgPath = join(__dirname, '../renderer/favicon.svg')
    if (fs.existsSync(icoPath)) {
      windowIcon = nativeImage.createFromPath(icoPath)
    } else if (fs.existsSync(pngPath)) {
      windowIcon = nativeImage.createFromPath(pngPath)
    } else if (fs.existsSync(svgPath)) {
      const svg = fs.readFileSync(svgPath, 'utf8')
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      windowIcon = nativeImage.createFromDataURL(dataUrl)
    }
  } catch (e) {
    console.warn('Failed to load app icon:', e)
  }

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon: windowIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Register media protocol handler as a stream so we can set correct MIME types
  protocol.registerStreamProtocol('media', (request, callback) => {
    try {
      const requestUrl = request.url
      const url = new URL(requestUrl)
      let filePath = decodeURI(url.pathname)
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.slice(1)
      }
      const normalizedPath = path.normalize(filePath)

      if (!fs.existsSync(normalizedPath)) {
        console.error('[media protocol] missing file', normalizedPath, requestUrl)
        callback({ statusCode: 404 })
        return
      }

      const ext = path.extname(normalizedPath).toLowerCase()
      let mime = 'application/octet-stream'
      switch (ext) {
        case '.mp4': mime = 'video/mp4'; break
        case '.webm': mime = 'video/webm'; break
        case '.mkv': mime = 'video/x-matroska'; break
        case '.avi': mime = 'video/x-msvideo'; break
        case '.mov': mime = 'video/quicktime'; break
        case '.mpeg': mime = 'video/mpeg'; break
        case '.mpg': mime = 'video/mpeg'; break
        case '.ts': mime = 'video/mp2t'; break
      }

      const stat = fs.statSync(normalizedPath)
      const total = stat.size
      const rangeHeader = request.headers['Range'] || request.headers['range']

      if (rangeHeader && typeof rangeHeader === 'string') {
        const matches = rangeHeader.match(/bytes=(\d+)-(\d+)?/)
        if (matches) {
          const start = Number(matches[1])
          const end = matches[2] ? Number(matches[2]) : total - 1
          const chunkSize = end - start + 1
          const stream = fs.createReadStream(normalizedPath, { start, end })
          callback({
            statusCode: 206,
            headers: {
              'Content-Type': mime,
              'Content-Range': `bytes ${start}-${end}/${total}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(chunkSize)
            },
            data: stream
          })
          return
        }
      }

      callback({
        statusCode: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(total),
          'Accept-Ranges': 'bytes'
        },
        data: fs.createReadStream(normalizedPath)
      })
    } catch (err) {
      console.error('media protocol error', err)
      callback({ statusCode: 404 })
    }
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  initDatabase()
  // Ensure macOS dock icon uses the same icon if available
  if (process.platform === 'darwin') {
    try {
      const icoPath = join(__dirname, '../../resources/icon.ico')
      const pngPath = join(__dirname, '../../resources/icon.png')
      const svgPath = join(__dirname, '../renderer/favicon.svg')
      let dockImg: any = undefined
      if (fs.existsSync(icoPath)) dockImg = nativeImage.createFromPath(icoPath)
      else if (fs.existsSync(pngPath)) dockImg = nativeImage.createFromPath(pngPath)
      else if (fs.existsSync(svgPath)) {
        const svg = fs.readFileSync(svgPath, 'utf8')
        dockImg = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      }
      if (dockImg && !dockImg.isEmpty()) app.dock.setIcon(dockImg)
    } catch (e) {
      console.warn('Failed to set dock icon', e)
    }
  }

  // IPC Handlers
  ipcMain.handle('get-courses', async () => {
    return getAllCourses()
  })

  ipcMain.handle('get-course-by-id', async (_, id: string) => {
    return getCourseById(id)
  })

  ipcMain.handle('select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (canceled) {
      return null
    } else {
      const rootPath = filePaths[0]
      const course = await scanCourseFolder(rootPath)
      saveCourse(course)
      return course
    }
  })

  ipcMain.handle('update-video-progress', async (_, videoId: string, progress: number, isCompleted: boolean) => {
    const courseId = updateVideoProgress(videoId, progress, isCompleted)
    try {
      if (courseId) {
        BrowserWindow.getAllWindows().forEach(w => w.webContents.send('course-updated', courseId))
      }
    } catch (e) {
      console.error('Failed to broadcast course-updated', e)
    }
    return courseId
  })

  ipcMain.handle('rename-course', async (_, courseId: string, newTitle: string) => {
    renameCourse(courseId, newTitle)
  })

  ipcMain.handle('update-course-icon', async (_, courseId: string, icon: string) => {
    updateCourseIcon(courseId, icon)
  })

  ipcMain.handle('update-course-last-video', async (_, courseId: string, videoId: string) => {
    updateCourseLastVideo(courseId, videoId)
  })

  ipcMain.handle('remove-course', async (_, courseId: string) => {
    removeCourse(courseId)
  })

  ipcMain.handle('reset-course', async (_, courseId: string) => {
    resetCourseProgress(courseId)
  })

  ipcMain.handle('get-daily-streak', async () => {
    return getDailyStreak()
  })

  ipcMain.handle('get-activity-log', async () => {
    return getActivityLog()
  })

  ipcMain.handle('delete-course-permanently', async (_, courseId: string) => {
    deleteCoursePermanently(courseId)
  })

  ipcMain.handle('refresh-course', async (_, courseId: string) => {
    const course = getCourseById(courseId)
    if (course && course.root_path) {
      const updatedCourse = await scanCourseFolder(course.root_path)
      // Merge with existing ID to avoid duplicate course
      updatedCourse.id = courseId
      saveCourse(updatedCourse)
      
      // Broadcast the update to all windows so the UI refreshes
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('course-updated', courseId)
        }
      })
      
      return updatedCourse
    }
    return null
  })

  // Notes IPC
  ipcMain.handle('save-note', async (_, videoId: string, timestamp: number, content: string) => {
    saveNote(videoId, timestamp, content)
  })

  ipcMain.handle('get-notes', async (_, courseId: string) => {
    return getNotesForCourse(courseId)
  })

  ipcMain.handle('delete-note', async (_, noteId: string) => {
    deleteNote(noteId)
  })

  ipcMain.handle('export-notes', async (event, courseId: string) => {
    const markdown = exportNotesMarkdown(courseId)
    const win = BrowserWindow.fromWebContents(event.sender)
    
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Export Notes',
      defaultPath: 'learning-notes.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })

    if (!canceled && filePath) {
      fs.writeFileSync(filePath, markdown)
      return true
    }
    return false
  })

  ipcMain.handle('show-confirm', async (event, message: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Cancel', 'OK'],
      defaultId: 1,
      title: 'Confirm',
      message: message,
    })
    return response === 1
  })

  // Transcription IPC
  ipcMain.handle('generate-transcript', async (_, videoId: string, videoPath: string) => {
    return generateTranscript(videoId, videoPath)
  })

  ipcMain.handle('get-transcript', async (_, videoId: string) => {
    return getTranscript(videoId)
  })

  // YouTube IPC
  ipcMain.handle('get-youtube-info', async (_, url: string) => {
    return getPlaylistInfo(url)
  })

  ipcMain.handle('cancel-download', async (_, videoId: string) => {
    cancelDownload(videoId)
  })

  ipcMain.handle('cancel-all-downloads', async () => {
    cancelAllDownloads()
  })

  ipcMain.handle('download-youtube-course', async (event, items: any[], targetFolder: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    await downloadYouTubeCourse(win, items, targetFolder)
    
    // After download is complete, rescan the folder and update/save the course
    try {
      const course = await scanCourseFolder(targetFolder)
      saveCourse(course)
      
      // Broadcast the update to all windows so the UI refreshes
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('course-updated', course.id)
        }
      })
      return course
    } catch (e) {
      console.error('Failed to rescan folder after download:', e)
      return null
    }
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
