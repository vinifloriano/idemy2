import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Electron window.api
Object.defineProperty(window, 'api', {
  value: {
    getCourses: vi.fn(),
    getCourseById: vi.fn(),
    selectFolder: vi.fn(),
    updateVideoProgress: vi.fn(),
    onCourseUpdated: vi.fn(() => () => {}),
    renameCourse: vi.fn(),
    updateCourseIcon: vi.fn(),
    updateCourseLastVideo: vi.fn(),
    removeCourse: vi.fn(),
    resetCourse: vi.fn(),
    getDailyStreak: vi.fn(),
    getActivityLog: vi.fn(),
    deleteCoursePermanently: vi.fn(),
    saveNote: vi.fn(),
    getNotes: vi.fn(),
    deleteNote: vi.fn(),
    exportNotes: vi.fn(),
    generateTranscript: vi.fn(),
    getTranscript: vi.fn(),
    showConfirm: vi.fn(),
  },
})
