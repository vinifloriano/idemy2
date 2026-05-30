export interface Video {
  id: string
  section_id: string
  title: string
  file_path: string
  duration: number
  progress: number
  is_completed: boolean
  order_index: number
}

export interface Section {
  id: string
  course_id: string
  title: string
  order_index: number
  videos: Video[]
}

export interface TranscriptSegment {
  id: string
  video_id: string
  text: string
  start_time: number
  end_time: number
}

export interface ActivityLog {
  date: string
  seconds_watched: number
  courses_completed: number
}

export interface Course {
  id: string
  title: string
  root_path: string
  cover_image_path?: string
  icon?: string
  last_video_id?: string
  created_at: string
  last_accessed: string
  sections: Section[]
  progress?: number // Overall progress percentage
}
