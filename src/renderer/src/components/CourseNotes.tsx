import React, { useState, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface CourseNotesProps {
  courseId: string
  activeVideoId: string | null
  onSeek: (vId: string, time: number) => void
}

const CourseNotes: React.FC<CourseNotesProps> = ({ courseId, activeVideoId, onSeek }) => {
  const [notes, setNotes] = useState<any[]>([])

  const loadNotes = async () => {
    setNotes(await window.api.getNotes(courseId))
  }

  useEffect(() => {
    loadNotes()
  }, [courseId, activeVideoId])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-4 gap-4">
      {notes.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm">
          No notes captured yet.<br />
          Press 'N' while watching to capture one!
        </div>
      ) : (
        notes.map((note) => (
          <div
            key={note.id}
            className="p-4 rounded-xl bg-surface-900 border border-white/5 hover:border-brand-500/30 transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => onSeek(note.video_id, note.timestamp_seconds)}
                className="font-mono text-[10px] font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20 hover:bg-brand-500/20 transition-colors"
              >
                {formatTime(note.timestamp_seconds)}
              </button>
              <button
                onClick={async () => {
                  if (await window.api.showConfirm('Delete note?')) {
                    await window.api.deleteNote(note.id)
                    loadNotes()
                  }
                }}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-xs text-slate-300 prose prose-invert max-w-none prose-sm font-sans leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content}</ReactMarkdown>
            </div>
            <div className="mt-3 pt-3 border-t border-white/5 text-[9px] text-slate-500 font-bold uppercase truncate">
              {note.video_title}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export default CourseNotes
