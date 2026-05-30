import { getDatabase, uuidv4 } from '../db/database'
import { Course } from '../../shared/types'

export function saveCourse(course: Course): void {
  const db = getDatabase()
  
  const existingCourse = db.prepare('SELECT id FROM courses WHERE root_path = ?').get(course.root_path) as any

  if (existingCourse) {
    db.prepare('UPDATE courses SET is_hidden = 0, last_accessed = ? WHERE id = ?')
      .run(course.last_accessed, existingCourse.id)
    return
  }
  
  const insertCourse = db.prepare(`
    INSERT OR IGNORE INTO courses (id, title, root_path, created_at, last_accessed, is_hidden)
    VALUES (?, ?, ?, ?, ?, 0)
  `)

  const insertSection = db.prepare(`
    INSERT INTO sections (id, course_id, title, order_index)
    VALUES (?, ?, ?, ?)
  `)

  const insertVideo = db.prepare(`
    INSERT INTO videos (id, section_id, title, file_path, order_index)
    VALUES (?, ?, ?, ?, ?)
  `)

  const transaction = db.transaction((course: Course) => {
    insertCourse.run(course.id, course.title, course.root_path, course.created_at, course.last_accessed)
    
    course.sections.forEach((section) => {
      insertSection.run(section.id, course.id, section.title, section.order_index)
      
      section.videos.forEach((video) => {
        insertVideo.run(video.id, section.id, video.title, video.file_path, video.order_index)
      })
    })
  })

  transaction(course)
}

export function getAllCourses(): Course[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM videos v JOIN sections s ON v.section_id = s.id WHERE s.course_id = c.id AND v.is_completed = 1) * 100.0 / 
      NULLIF((SELECT COUNT(*) FROM videos v JOIN sections s ON v.section_id = s.id WHERE s.course_id = c.id), 0) as progress,
      (SELECT COUNT(*) FROM videos v JOIN sections s ON v.section_id = s.id WHERE s.course_id = c.id AND v.progress > 0 AND v.is_completed = 0) as in_progress_count
    FROM courses c
    WHERE c.is_hidden = 0
    ORDER BY last_accessed DESC
  `).all() as any[]

  return rows.map((row) => ({
    ...row,
    sections: [],
    progress: Math.round(row.progress || 0),
    in_progress: (row.in_progress_count || 0) > 0
  }))
}

export function getCourseById(id: string): Course | null {
  const db = getDatabase()
  const courseRow = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as any
  if (!courseRow) return null

  const sections = db.prepare('SELECT * FROM sections WHERE course_id = ? ORDER BY order_index').all(id) as any[]
  
  const course: Course = {
    ...courseRow,
    sections: sections.map((s) => {
      const videos = db.prepare('SELECT * FROM videos WHERE section_id = ? ORDER BY order_index').all(s.id) as any[]
      return {
        ...s,
        videos: videos.map(v => ({
          ...v,
          is_completed: Boolean(v.is_completed)
        }))
      }
    })
  }

  return course
}

export function updateVideoProgress(videoId: string, progress: number, isCompleted: boolean): string | null {
  const db = getDatabase()
  
  const oldVideo = db.prepare('SELECT progress FROM videos WHERE id = ?').get(videoId) as any
  const oldProgress = oldVideo?.progress || 0
  const diff = progress - oldProgress

  db.prepare('UPDATE videos SET progress = ?, is_completed = ? WHERE id = ?')
    .run(progress, isCompleted ? 1 : 0, videoId)
  
  db.prepare(`
    UPDATE courses SET last_accessed = CURRENT_TIMESTAMP, last_video_id = ? 
    WHERE id = (SELECT s.course_id FROM sections s JOIN videos v ON v.section_id = s.id WHERE v.id = ?)
  `).run(videoId, videoId)

  const courseRow = db.prepare('SELECT s.course_id as course_id FROM sections s JOIN videos v ON v.section_id = s.id WHERE v.id = ?').get(videoId) as any
  const courseId = courseRow ? courseRow.course_id : null

  if (diff > 0) {
    logActivity(diff)
  }

  // Check if course is newly completed
  if (courseId && isCompleted) {
    const course = getCourseById(courseId) as any
    if (course && !course.is_completed) {
      const allVideos = course.sections.flatMap(s => s.videos)
      const finishedCount = allVideos.filter(v => v.is_completed).length
      if (finishedCount === allVideos.length) {
         db.prepare('UPDATE courses SET is_completed = 1 WHERE id = ?').run(courseId)
         logCourseCompletion()
      }
    }
  }

  return courseId
}

export function renameCourse(courseId: string, newTitle: string): void {
  const db = getDatabase()
  db.prepare('UPDATE courses SET title = ? WHERE id = ?').run(newTitle, courseId)
}

export function updateCourseIcon(courseId: string, icon: string): void {
  const db = getDatabase()
  db.prepare('UPDATE courses SET icon = ? WHERE id = ?').run(icon, courseId)
}

export function updateCourseLastVideo(courseId: string, videoId: string): void {
  const db = getDatabase()
  db.prepare('UPDATE courses SET last_video_id = ?, last_accessed = CURRENT_TIMESTAMP WHERE id = ?').run(videoId, courseId)
}

export function removeCourse(courseId: string): void {
  const db = getDatabase()
  db.prepare('UPDATE courses SET is_hidden = 1 WHERE id = ?').run(courseId)
}

export function resetCourseProgress(courseId: string): void {
  const db = getDatabase()
  db.prepare(`
    UPDATE videos 
    SET progress = 0, is_completed = 0 
    WHERE section_id IN (SELECT id FROM sections WHERE course_id = ?)
  `).run(courseId)
}

export function logActivity(seconds: number): void {
  const db = getDatabase()
  const today = new Date().toISOString().split('T')[0]
  
  db.prepare(`
    INSERT INTO activity_log (date, seconds_watched) 
    VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET seconds_watched = seconds_watched + ?
  `).run(today, seconds, seconds)
}

function logCourseCompletion(): void {
  const db = getDatabase()
  const today = new Date().toISOString().split('T')[0]
  
  db.prepare(`
    INSERT INTO activity_log (date, courses_completed) 
    VALUES (?, 1)
    ON CONFLICT(date) DO UPDATE SET courses_completed = courses_completed + 1
  `).run(today)
}

export function getActivityLog(): any[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM activity_log ORDER BY date ASC').all()
}

export function getDailyStreak(): { streak: number, secondsToday: number } {
  const db = getDatabase()
  const rows = db.prepare('SELECT date, seconds_watched FROM activity_log ORDER BY date DESC').all() as any[]
  
  const todayStr = new Date().toISOString().split('T')[0]
  const todayRow = rows.find(r => r.date === todayStr)
  const secondsToday = todayRow ? todayRow.seconds_watched : 0

  if (rows.length === 0) return { streak: 0, secondsToday: 0 }

  let streak = 0
  const checkDate = new Date()
  const THRESHOLD = 60 
  let active = true

  while (active) {
    const currentDateStr = checkDate.toISOString().split('T')[0]
    const row = rows.find(r => r.date === currentDateStr)
    
    if (row && row.seconds_watched >= THRESHOLD) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      if (currentDateStr === todayStr) {
        checkDate.setDate(checkDate.getDate() - 1)
      } else {
        active = false
      }
    }
  }

  return { streak, secondsToday }
}

export function deleteCoursePermanently(courseId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM courses WHERE id = ?').run(courseId)
}

// Note Logic
export function saveNote(videoId: string, timestamp: number, content: string): void {
  const db = getDatabase()
  const id = uuidv4()
  db.prepare(`
    INSERT INTO notes (id, video_id, timestamp_seconds, content)
    VALUES (?, ?, ?, ?)
  `).run(id, videoId, timestamp, content)
}

export function getNotesForCourse(courseId: string): any[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT n.*, v.title as video_title, v.file_path, s.title as section_title
    FROM notes n
    JOIN videos v ON n.video_id = v.id
    JOIN sections s ON v.section_id = s.id
    WHERE s.course_id = ?
    ORDER BY s.order_index ASC, v.order_index ASC, n.timestamp_seconds ASC
  `).all(courseId)
}

export function deleteNote(noteId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId)
}

export function exportNotesMarkdown(courseId: string): string {
  const course = getCourseById(courseId)
  if (!course) return ''

  const notes = getNotesForCourse(courseId)
  let md = `# Learning Notes: ${course.title}\n\n`
  md += `Exported on: ${new Date().toLocaleString()}\n\n`

  let currentSection = ''
  let currentVideo = ''

  notes.forEach(note => {
    if (note.section_title !== currentSection) {
      currentSection = note.section_title
      md += `## Section: ${currentSection}\n\n`
    }
    if (note.video_title !== currentVideo) {
      currentVideo = note.video_title
      md += `### Video: ${currentVideo}\n\n`
    }

    const m = Math.floor(note.timestamp_seconds / 60)
    const s = Math.floor(note.timestamp_seconds % 60)
    const timestamp = `${m}:${s.toString().padStart(2, '0')}`

    md += `**[${timestamp}]**\n${note.content}\n\n---\n\n`
  })

  return md
}
