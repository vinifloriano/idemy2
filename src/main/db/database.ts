import type DatabaseType from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'

let db: DatabaseType.Database

export function initDatabase(customPath?: string): void {
  const Database = typeof require !== 'undefined' ? require('better-sqlite3') : null;
  const dbPath = customPath || join(app.getPath('userData'), 'idemy.db')
  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE,
      cover_image_path TEXT,
      icon TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_hidden BOOLEAN DEFAULT 0,
      is_completed BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      section_id TEXT NOT NULL,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL UNIQUE,
      duration INTEGER DEFAULT 0,
      progress INTEGER DEFAULT 0,
      is_completed BOOLEAN DEFAULT 0,
      order_index INTEGER NOT NULL,
      FOREIGN KEY (section_id) REFERENCES sections (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      date TEXT PRIMARY KEY, -- format: YYYY-MM-DD
      seconds_watched INTEGER DEFAULT 0,
      courses_completed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      timestamp_seconds REAL NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      text TEXT NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
    );
  `)

  // Migration: Add is_hidden and icon if they don't exist in courses
  try {
    const tableInfo = db.pragma('table_info(courses)') as any[]
    const hasIsHidden = tableInfo.some((col) => col.name === 'is_hidden')
    if (!hasIsHidden) {
      db.exec('ALTER TABLE courses ADD COLUMN is_hidden BOOLEAN DEFAULT 0;')
    }
    const hasIcon = tableInfo.some((col) => col.name === 'icon')
    if (!hasIcon) {
      db.exec('ALTER TABLE courses ADD COLUMN icon TEXT;')
    }
    const hasIsCompleted = tableInfo.some((col) => col.name === 'is_completed')
    if (!hasIsCompleted) {
      db.exec('ALTER TABLE courses ADD COLUMN is_completed BOOLEAN DEFAULT 0;')
    }
    const hasLastVideoId = tableInfo.some((col) => col.name === 'last_video_id')
    if (!hasLastVideoId) {
      db.exec('ALTER TABLE courses ADD COLUMN last_video_id TEXT;')
    }

    const activityTableInfo = db.pragma('table_info(activity_log)') as any[]
    const hasCoursesCompleted = activityTableInfo.some((col) => col.name === 'courses_completed')
    if (!hasCoursesCompleted) {
      db.exec('ALTER TABLE activity_log ADD COLUMN courses_completed INTEGER DEFAULT 0;')
    }
  } catch (e) {
    console.error('Migration failed:', e)
  }
}

export function getDatabase(): DatabaseType.Database {
  if (!db) {
    initDatabase()
  }
  return db
}

export { uuidv4 }
