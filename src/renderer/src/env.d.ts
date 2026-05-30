import { ElectronAPI } from '@electron-toolkit/preload'
import { Course } from '../../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getCourses: () => Promise<Course[]>
      getCourseById: (id: string) => Promise<Course | null>
      selectFolder: () => Promise<Course | null>
      updateVideoProgress: (videoId: string, progress: number, isCompleted: boolean) => Promise<string | null>
      onCourseUpdated: (cb: (courseId: string) => void) => void
      renameCourse: (courseId: string, newTitle: string) => Promise<void>
      updateCourseIcon: (courseId: string, icon: string) => Promise<void>
      updateCourseLastVideo: (courseId: string, videoId: string) => Promise<void>
      removeCourse: (courseId: string) => Promise<void>
      resetCourse: (courseId: string) => Promise<void>
      getDailyStreak: () => Promise<{ streak: number, secondsToday: number }>
      getActivityLog: () => Promise<import('../../../shared/types').ActivityLog[]>
      deleteCoursePermanently: (courseId: string) => Promise<void>
      saveNote: (videoId: string, timestamp: number, content: string) => Promise<void>
      getNotes: (courseId: string) => Promise<any[]>
      deleteNote: (noteId: string) => Promise<void>
      exportNotes: (courseId: string) => Promise<boolean>
      generateTranscript: (videoId: string, videoPath: string) => Promise<import('../../../shared/types').TranscriptSegment[]>
      getTranscript: (videoId: string) => Promise<import('../../../shared/types').TranscriptSegment[]>
      showConfirm: (message: string) => Promise<boolean>
      getYoutubeInfo: (url: string) => Promise<any>
      downloadYoutubeCourse: (items: any[], targetFolder: string) => Promise<void>
      onYoutubeDownloadProgress: (cb: (progress: any) => void) => () => void
    }
  }
}
