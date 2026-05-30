import React, { useState } from 'react'
import { Course, Video } from '../../../shared/types'
import { PlayCircle, CheckCircle, ChevronDown, Clock } from 'lucide-react'

const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || seconds <= 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)
  return `${minutes}:${remaining.toString().padStart(2, '0')}`
}

interface CourseSidebarProps {
  course: Course
  activeVideoId: string | null
  onSelectVideo: (video: Video) => void
}

const CourseSidebar: React.FC<CourseSidebarProps> = ({ course, activeVideoId, onSelectVideo }) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleSection = (sectionId: string) => {
    setCollapsed(prev => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }
  return (
    <aside className="bg-surface-800/80 backdrop-blur border-l border-white/5 flex flex-col h-full max-h-full min-h-0 shrink-0 z-10 overflow-hidden">
      <div className="p-5 border-b border-white/5 bg-surface-900/50 shrink-0">
        <h3 className="font-bold text-white text-xs uppercase tracking-[0.2em]">Course Content</h3>
        <div className="text-[10px] font-bold text-brand-400 mt-1 uppercase opacity-80">{course.sections.length} Sections</div>
      </div>
      
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {course.sections.map((section) => {
          const isCollapsed = !!collapsed[section.id]
          return (
            <div key={section.id} className="border-b border-white/5">
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full text-left p-4 bg-surface-900/30 flex items-center justify-between hover:bg-surface-900/50 transition-colors group"
                aria-expanded={!isCollapsed}
              >
                <span className="font-bold text-slate-200 text-xs line-clamp-1 group-hover:text-white transition-colors">{section.title}</span>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-all duration-300 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
              </button>

              <div className={`flex flex-col py-1 ${isCollapsed ? 'hidden' : ''}`}>
                {section.videos.map((video) => {
                  const isActive = activeVideoId === video.id
                  return (
                    <div
                      key={video.id}
                      className={`px-4 py-3 flex items-start gap-3 cursor-pointer transition-all border-l-2 ${
                        isActive 
                          ? 'bg-brand-500/10 border-brand-500' 
                          : 'border-transparent hover:bg-white/5'
                      }`}
                      onClick={() => onSelectVideo(video)}
                    >
                      <div className="mt-0.5 shrink-0">
                        {video.is_completed ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <PlayCircle className={`w-4 h-4 ${isActive ? 'text-brand-400' : 'text-slate-500'}`} />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-sm leading-snug ${isActive ? 'text-white font-bold' : 'text-slate-300'} line-clamp-2`}>
                          {video.title}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 font-mono mt-1.5 flex items-center gap-2">
                           <Clock className="w-3 h-3" />
                           {video.is_completed
                            ? 'Completed'
                            : video.progress > 0
                              ? `In progress · ${formatTime(video.progress)} / ${formatTime(video.duration)}`
                              : `${formatTime(video.progress)} / ${formatTime(video.duration)}`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

export default CourseSidebar
