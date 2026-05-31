import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getCourses: () => ipcRenderer.invoke('get-courses'),
  getCourseById: (id: string) => ipcRenderer.invoke('get-course-by-id', id),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  updateVideoProgress: (videoId: string, progress: number, isCompleted: boolean) =>
    ipcRenderer.invoke('update-video-progress', videoId, progress, isCompleted),
  updateVideoDuration: (videoId: string, duration: number) =>
    ipcRenderer.invoke('update-video-duration', videoId, duration),
  renameCourse: (courseId: string, newTitle: string) =>
    ipcRenderer.invoke('rename-course', courseId, newTitle),
  updateCourseIcon: (courseId: string, icon: string) =>
    ipcRenderer.invoke('update-course-icon', courseId, icon),
  updateCourseLastVideo: (courseId: string, videoId: string) =>
    ipcRenderer.invoke('update-course-last-video', courseId, videoId),
  removeCourse: (courseId: string) => ipcRenderer.invoke('remove-course', courseId),
  resetCourse: (courseId: string) => ipcRenderer.invoke('reset-course', courseId),
  getDailyStreak: () => ipcRenderer.invoke('get-daily-streak'),
  getActivityLog: () => ipcRenderer.invoke('get-activity-log'),
  deleteCoursePermanently: (courseId: string) => ipcRenderer.invoke('delete-course-permanently', courseId),
  saveNote: (videoId: string, timestamp: number, content: string) =>
    ipcRenderer.invoke('save-note', videoId, timestamp, content),
  getNotes: (courseId: string) => ipcRenderer.invoke('get-notes', courseId),
  deleteNote: (noteId: string) => ipcRenderer.invoke('delete-note', noteId),
  exportNotes: (courseId: string) => ipcRenderer.invoke('export-notes', courseId),
  refreshCourse: (courseId: string) => ipcRenderer.invoke('refresh-course', courseId),
  cancelDownload: (videoId: string) => ipcRenderer.invoke('cancel-download', videoId),
  cancelAllDownloads: () => ipcRenderer.invoke('cancel-all-downloads'),
  showConfirm: (message: string) => ipcRenderer.invoke('show-confirm', message),
  generateTranscript: (videoId: string, videoPath: string) =>
    ipcRenderer.invoke('generate-transcript', videoId, videoPath),
  getTranscript: (videoId: string) => ipcRenderer.invoke('get-transcript', videoId),
  getYoutubeInfo: (url: string) => ipcRenderer.invoke('get-youtube-info', url),
  downloadYoutubeCourse: (items: any[], targetFolder: string) =>
    ipcRenderer.invoke('download-youtube-course', items, targetFolder),
  
  onCourseUpdated: (callback: (courseId: string) => void) => {
    const subscription = (_event: any, courseId: string) => callback(courseId)
    ipcRenderer.on('course-updated', subscription)
    return () => ipcRenderer.removeListener('course-updated', subscription)
  },
  onYoutubeDownloadProgress: (callback: (progress: any) => void) => {
    const subscription = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('youtube-download-progress', subscription)
    return () => ipcRenderer.removeListener('youtube-download-progress', subscription)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
