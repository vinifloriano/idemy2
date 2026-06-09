import { app } from 'electron'
import { join } from 'path'
import sqlite3 from 'sqlite3'
import { v4 as uuidv4 } from 'uuid'

export interface AsyncDatabase {
  run(sql: string, ...params: any[]): Promise<{ lastID: number; changes: number }>;
  get<T>(sql: string, ...params: any[]): Promise<T | undefined>;
  all<T>(sql: string, ...params: any[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

let db: AsyncDatabase | null = null

export async function initDatabase(customPath?: string): Promise<AsyncDatabase> {
  if (db) return db

  const dbPath = customPath || join(app.getPath('userData'), 'idemy.db')

  const sqliteDb = new sqlite3.Database(dbPath)

  db = {
    run(sql: string, ...params: any[]) {
      return new Promise((resolve, reject) => {
        sqliteDb.run(sql, params, function(err) {
          if (err) reject(err)
          else resolve({ lastID: this.lastID, changes: this.changes })
        })
      })
    },
    get<T>(sql: string, ...params: any[]) {
      return new Promise((resolve, reject) => {
        sqliteDb.get(sql, params, (err, row) => {
          if (err) reject(err)
          else resolve(row as T)
        })
      })
    },
    all<T>(sql: string, ...params: any[]) {
      return new Promise((resolve, reject) => {
        sqliteDb.all(sql, params, (err, rows) => {
          if (err) reject(err)
          else resolve(rows as T[])
        })
      })
    },
    exec(sql: string) {
      return new Promise((resolve, reject) => {
        sqliteDb.exec(sql, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    },
    close() {
      return new Promise((resolve, reject) => {
        sqliteDb.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }
  }

  await db.run('PRAGMA foreign_keys = ON')

  await db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE,
      cover_image_path TEXT,
      icon TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_hidden BOOLEAN DEFAULT 0,
      is_completed BOOLEAN DEFAULT 0,
      last_video_id TEXT
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

  // Migration: Add columns if they don't exist
  try {
    const tableInfo = await db.all<any>('PRAGMA table_info(courses)')
    const columnNames = tableInfo.map((col) => col.name)

    if (!columnNames.includes('is_hidden')) {
      await db.exec('ALTER TABLE courses ADD COLUMN is_hidden BOOLEAN DEFAULT 0;')
    }
    if (!columnNames.includes('icon')) {
      await db.exec('ALTER TABLE courses ADD COLUMN icon TEXT;')
    }
    if (!columnNames.includes('is_completed')) {
      await db.exec('ALTER TABLE courses ADD COLUMN is_completed BOOLEAN DEFAULT 0;')
    }
    if (!columnNames.includes('last_video_id')) {
      await db.exec('ALTER TABLE courses ADD COLUMN last_video_id TEXT;')
    }

    const activityTableInfo = await db.all<any>('PRAGMA table_info(activity_log)')
    const activityColumnNames = activityTableInfo.map((col) => col.name)
    if (!activityColumnNames.includes('courses_completed')) {
      await db.exec('ALTER TABLE activity_log ADD COLUMN courses_completed INTEGER DEFAULT 0;')
    }
  } catch (e) {
    console.error('Migration failed:', e)
  }

  return db
}

export async function getDatabase(): Promise<AsyncDatabase> {
  if (!db) {
    await initDatabase()
  }
  return db!
}

export { uuidv4 }
