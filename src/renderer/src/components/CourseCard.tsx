import React from 'react'
import { Course } from '../../../shared/types'
import { PlayCircle, Code2 } from 'lucide-react'

interface CourseCardProps {
  course: Course
  onClick: () => void
}

const CourseCard: React.FC<CourseCardProps> = ({ course, onClick }) => {
  return (
    <div 
      className="bg-surface-800 border border-white/10 rounded-xl overflow-hidden flex flex-col group relative cursor-pointer card-hover-effect"
      onClick={onClick}
    >
      <div className="h-36 bg-gradient-to-br from-brand-900 to-surface-800 relative group-hover:scale-105 transition-transform duration-500 flex items-center justify-center overflow-hidden">
        {course.icon ? (
          <span className="text-6xl group-hover:scale-110 transition-transform duration-500 opacity-60 mix-blend-overlay">{course.icon}</span>
        ) : (
          <Code2 className="w-16 h-16 text-white/20 group-hover:scale-110 transition-transform duration-500" />
        )}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <PlayCircle className="w-12 h-12 text-white/80" />
        </div>
      </div>
      <div className="p-5 flex-1 flex flex-col bg-surface-800 z-10">
        <h3 className="font-bold text-white mb-1 line-clamp-1">{course.title}</h3>
        <p className="text-xs text-slate-400 mb-5 font-mono line-clamp-1">{course.root_path}</p>
        <div className="mt-auto">
          <div className="flex justify-between text-xs mb-2">
            <span className={course.progress > 90 ? 'text-green-400 font-medium' : 'text-brand-400 font-medium'}>
              {course.progress > 0
                ? `${course.progress}% Complete`
                : (course as any).in_progress
                  ? 'In Progress'
                  : 'Not Started'}
            </span>
          </div>
          <div className="h-1.5 w-full bg-surface-900 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ${course.progress > 90 ? 'bg-green-500' : 'bg-brand-500'}`} 
              style={{ width: `${course.progress}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CourseCard
