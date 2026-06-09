import { getDatabase, uuidv4 } from '../db/database'
import { Course } from '../../shared/types'

export async function saveCourse(course: Course): Promise<void> {
  const db = await getDatabase()
  
  // 1. Identify course ID (preserve existing or use new)
  const existingCourse = await db.get('SELECT id FROM courses WHERE root_path = ?', course.root_path) as any
  const courseId = existingCourse ? existingCourse.id : course.id

  // Manual transaction
  try {
    await db.run('BEGIN TRANSACTION')

    // 2. Upsert Course
    await db.run(`
      INSERT INTO courses (id, title, root_path, created_at, last_accessed, is_hidden)
      VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET 
        title = excluded.title,
        is_hidden = 0
    `, courseId, course.title, course.root_path, course.created_at, course.last_accessed)

    // Collect all scanned paths and section titles to handle deletions later
    const scannedFilePaths = new Set<string>()
    const scannedSectionTitles = new Set<string>()

    for (const section of course.sections) {
      scannedSectionTitles.add(section.title)
      
      // 3. Upsert Section
      const existingSection = await db.get('SELECT id FROM sections WHERE course_id = ? AND title = ?', courseId, section.title) as any
      const sectionId = existingSection ? existingSection.id : section.id

      await db.run(`
        INSERT INTO sections (id, course_id, title, order_index)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          title = excluded.title,
          order_index = excluded.order_index
      `, sectionId, courseId, section.title, section.order_index)

      for (const video of section.videos) {
        scannedFilePaths.add(video.file_path)

        // 4. Upsert Video
        const existingVideo = await db.get('SELECT id FROM videos WHERE file_path = ?', video.file_path) as any
        const videoId = existingVideo ? existingVideo.id : video.id

        await db.run(`
          INSERT INTO videos (id, section_id, title, file_path, order_index)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET 
            title = excluded.title,
            section_id = excluded.section_id,
            order_index = excluded.order_index
          ON CONFLICT(file_path) DO UPDATE SET
            title = excluded.title,
            section_id = excluded.section_id,
            order_index = excluded.order_index
        `, videoId, sectionId, video.title, video.file_path, video.order_index)
      }
    }

    // 5. Cleanup: Remove videos that no longer exist on disk
    const allDbVideos = await db.all(`
      SELECT v.id, v.file_path FROM videos v 
      JOIN sections s ON v.section_id = s.id 
      WHERE s.course_id = ?
    `, courseId) as any[]

    for (const v of allDbVideos) {
      if (!scannedFilePaths.has(v.file_path)) {
        await db.run('DELETE FROM videos WHERE id = ?', v.id)
      }
    }

    // 6. Cleanup: Remove sections that are now empty (due to video deletion) or were removed
    const allDbSections = await db.all('SELECT id, title FROM sections WHERE course_id = ?', courseId) as any[]
    
    for (const s of allDbSections) {
      const videoCount = await db.get('SELECT COUNT(*) as count FROM videos WHERE section_id = ?', s.id) as any
      if (!scannedSectionTitles.has(s.title) || videoCount.count === 0) {
        await db.run('DELETE FROM sections WHERE id = ?', s.id)
      }
    }

    await db.run('COMMIT')
  } catch (error) {
    await db.run('ROLLBACK')
    throw error
  }
}

export async function getAllCourses(): Promise<Course[]> {
  const db = await getDatabase()
  const rows = await db.all(`
    SELECT c.*, 
        (SELECT COUNT(*) FROM videos v JOIN sections s ON v.section_id = s.id WHERE s.course_id = c.id AND v.is_completed = 1) * 100.0 / 
      NULLIF((SELECT COUNT(*) FROM videos v JOIN sections s ON v.section_id = s.id WHERE s.course_id = c.id), 0) as progress,
      (SELECT COUNT(*) FROM videos v JOIN sections s ON v.section_id = s.id WHERE s.course_id = c.id AND v.progress > 0 AND v.is_completed = 0) as in_progress_count
    FROM courses c
    WHERE c.is_hidden = 0
    ORDER BY last_accessed DESC
  `) as any[]

  return rows.map((row) => ({
    ...row,
    sections: [],
    progress: Math.round(row.progress || 0),
    in_progress: (row.in_progress_count || 0) > 0
  }))
}

export async function getCourseById(id: string): Promise<Course | null> {
  const db = await getDatabase()
  const courseRow = await db.get('SELECT * FROM courses WHERE id = ?', id) as any
  if (!courseRow) return null

  const sections = await db.all('SELECT * FROM sections WHERE course_id = ? ORDER BY order_index', id) as any[]
  
  const course: Course = {
    ...courseRow,
    sections: await Promise.all(sections.map(async (s) => {
      const videos = await db.all('SELECT * FROM videos WHERE section_id = ? ORDER BY order_index', s.id) as any[]
      return {
        ...s,
        videos: videos.map(v => ({
          ...v,
          is_completed: Boolean(v.is_completed)
        }))
      }
    }))
  }

  return course
}

export async function updateVideoProgress(videoId: string, progress: number, isCompleted: boolean): Promise<string | null> {
  const db = await getDatabase()
  
  const oldVideo = await db.get('SELECT progress FROM videos WHERE id = ?', videoId) as any
  const oldProgress = oldVideo?.progress || 0
  const diff = progress - oldProgress

  await db.run('UPDATE videos SET progress = ?, is_completed = ? WHERE id = ?', progress, isCompleted ? 1 : 0, videoId)
  
  await db.run(`
    UPDATE courses SET last_accessed = CURRENT_TIMESTAMP, last_video_id = ? 
    WHERE id = (SELECT s.course_id FROM sections s JOIN videos v ON v.section_id = s.id WHERE v.id = ?)
  `, videoId, videoId)

  const courseRow = await db.get('SELECT s.course_id as course_id FROM sections s JOIN videos v ON v.section_id = s.id WHERE v.id = ?', videoId) as any
  const courseId = courseRow ? courseRow.course_id : null

  if (diff > 0) {
    await logActivity(diff)
  }

  if (courseId && isCompleted) {
    const courseData = await getCourseById(courseId) as any
    if (courseData && !courseData.is_completed) {
      const allVideos = courseData.sections.flatMap(s => s.videos)
      const finishedCount = allVideos.filter(v => v.is_completed).length
      if (finishedCount === allVideos.length) {
         await db.run('UPDATE courses SET is_completed = 1 WHERE id = ?', courseId)
         await logCourseCompletion()
      }
    }
  }

  return courseId
}

export async function updateVideoDuration(videoId: string, duration: number): Promise<void> {
  const db = await getDatabase()
  await db.run('UPDATE videos SET duration = ? WHERE id = ?', duration, videoId)
}

export async function renameCourse(courseId: string, newTitle: string): Promise<void> {
  const db = await getDatabase()
  await db.run('UPDATE courses SET title = ? WHERE id = ?', newTitle, courseId)
}

export async function updateCourseIcon(courseId: string, icon: string): Promise<void> {
  const db = await getDatabase()
  await db.run('UPDATE courses SET icon = ? WHERE id = ?', icon, courseId)
}

export async function updateCourseLastVideo(courseId: string, videoId: string): Promise<void> {
  const db = await getDatabase()
  await db.run('UPDATE courses SET last_video_id = ?, last_accessed = CURRENT_TIMESTAMP WHERE id = ?', videoId, courseId)
}

export async function removeCourse(courseId: string): Promise<void> {
  const db = await getDatabase()
  await db.run('UPDATE courses SET is_hidden = 1 WHERE id = ?', courseId)
}

export async function resetCourseProgress(courseId: string): Promise<void> {
  const db = await getDatabase()
  await db.run(`
    UPDATE videos 
    SET progress = 0, is_completed = 0 
    WHERE section_id IN (SELECT id FROM sections WHERE course_id = ?)
  `, courseId)
}

export async function logActivity(seconds: number): Promise<void> {
  const db = await getDatabase()
  const today = new Date().toISOString().split('T')[0]
  
  await db.run(`
    INSERT INTO activity_log (date, seconds_watched) 
    VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET seconds_watched = seconds_watched + ?
  `, today, seconds, seconds)
}

async function logCourseCompletion(): Promise<void> {
  const db = await getDatabase()
  const today = new Date().toISOString().split('T')[0]
  
  await db.run(`
    INSERT INTO activity_log (date, courses_completed) 
    VALUES (?, 1)
    ON CONFLICT(date) DO UPDATE SET courses_completed = courses_completed + 1
  `, today)
}

export async function getActivityLog(): Promise<any[]> {
  const db = await getDatabase()
  return db.all('SELECT * FROM activity_log ORDER BY date ASC')
}

export async function getDailyStreak(): Promise<{ streak: number, secondsToday: number }> {
  const db = await getDatabase()
  const rows = await db.all('SELECT date, seconds_watched FROM activity_log ORDER BY date DESC') as any[]
  
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

export async function deleteCoursePermanently(courseId: string): Promise<void> {
  const db = await getDatabase()
  await db.run('DELETE FROM courses WHERE id = ?', courseId)
}

export async function saveNote(videoId: string, timestamp: number, content: string): Promise<void> {
  const db = await getDatabase()
  const id = uuidv4()
  await db.run(`
    INSERT INTO notes (id, video_id, timestamp_seconds, content)
    VALUES (?, ?, ?, ?)
  `, id, videoId, timestamp, content)
}

export async function getNotesForCourse(courseId: string): Promise<any[]> {
  const db = await getDatabase()
  return db.all(`
    SELECT n.*, v.title as video_title, v.file_path, s.title as section_title
    FROM notes n
    JOIN videos v ON n.video_id = v.id
    JOIN sections s ON v.section_id = s.id
    WHERE s.course_id = ?
    ORDER BY s.order_index ASC, v.order_index ASC, n.timestamp_seconds ASC
  `, courseId)
}

export async function deleteNote(noteId: string): Promise<void> {
  const db = await getDatabase()
  await db.run('DELETE FROM notes WHERE id = ?', noteId)
}

export async function exportNotesMarkdown(courseId: string): Promise<string> {
  const courseData = await getCourseById(courseId)
  if (!courseData) return ''

  const notes = await getNotesForCourse(courseId)
  let md = `# Learning Notes: ${courseData.title}\n\n`
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
