import fs from 'fs'
import path from 'path'
import { uuidv4 } from '../db/database'
import { Course, Video } from '../../shared/types'
import { queueMpegConversion } from './videoConverter'

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.mpeg', '.mpg']
const MPEG_EXTENSIONS = ['.mpeg', '.mpg']

export async function scanCourseFolder(rootPath: string): Promise<Course> {
  const courseTitle = path.basename(rootPath)
  const courseId = uuidv4()
  const now = new Date().toISOString()

  const course: Course = {
    id: courseId,
    title: courseTitle,
    root_path: rootPath,
    created_at: now,
    last_accessed: now,
    sections: []
  }

  const sectionsMap = new Map<string, Video[]>()

  async function walk(currentPath: string): Promise<void> {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    
    const videosByPath = new Map<string, Video>()
    
    // Sort entries to maintain order
    const sortedEntries = entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

    for (const entry of sortedEntries) {
      const fullPath = path.join(currentPath, entry.name)
      
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (VIDEO_EXTENSIONS.includes(ext)) {
          let finalPath = fullPath
          
          // Queue MPEG files for background conversion
          if (MPEG_EXTENSIONS.includes(ext)) {
            try {
              finalPath = queueMpegConversion(fullPath)
            } catch (error) {
              console.error(`[Scanner] Failed to queue MPEG file ${fullPath}:`, error)
              continue
            }
          }
          
          if (!videosByPath.has(finalPath)) {
            videosByPath.set(finalPath, {
              id: uuidv4(),
              section_id: '', // Will be filled later
              title: path.parse(entry.name).name,
              file_path: finalPath,
              duration: 0,
              progress: 0,
              is_completed: false,
              order_index: 0 // Will be filled later
            })
          }
        }
      }
    }

    const videosInThisFolder = Array.from(videosByPath.values())
    if (videosInThisFolder.length > 0) {
      // Use relative path from root as the section key/title
      let relativePath = path.relative(rootPath, currentPath)
      if (relativePath === '') relativePath = 'General'
      
      sectionsMap.set(relativePath, videosInThisFolder)
    }
  }

  await walk(rootPath)

  // Convert map to sections
  const sectionPaths = Array.from(sectionsMap.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  sectionPaths.forEach((relPath, index) => {
    const sectionId = uuidv4()
    const videos = sectionsMap.get(relPath)!
    
    course.sections.push({
      id: sectionId,
      course_id: courseId,
      title: relPath,
      order_index: index,
      videos: videos.map((v, vIndex) => ({
        ...v,
        section_id: sectionId,
        order_index: vIndex
      }))
    })
  })

  return course
}
