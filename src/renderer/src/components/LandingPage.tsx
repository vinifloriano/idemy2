import React, { useEffect, useState } from 'react'
import { Course } from '../../../shared/types'
import CourseCard from './CourseCard'
import { Library, Clock, CheckCircle, Flame, Search, FolderPlus, Play, SquarePlay } from 'lucide-react'
import YoutubeImportModal from './YoutubeImportModal'

interface LandingPageProps {
  onSelectCourse: (course: Course) => void
  onShowStreak: () => void
}

const LandingPage: React.FC<LandingPageProps> = ({ onSelectCourse, onShowStreak }) => {
  const [courses, setCourses] = useState<Course[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'inProgress' | 'completed'>('all')
  const [streakData, setStreakData] = useState({ streak: 0, secondsToday: 0 })
  const [showYoutubeModal, setShowYoutubeModal] = useState(false)

  const loadData = async () => {
    const [courseData, streak] = await Promise.all([
      window.api.getCourses(),
      window.api.getDailyStreak()
    ])
    setCourses(courseData)
    setStreakData(streak)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    // refresh list when backend notifies about course updates (progress changes)
    let cleanup: (() => void) | undefined
    try {
      cleanup = window.api.onCourseUpdated(() => {
        loadData()
      })
    } catch (e) {
      // noop
    }
    return () => {
      if (cleanup) cleanup()
    }
  }, [])

  const handleAddCourse = async () => {
    const newCourse = await window.api.selectFolder()
    if (newCourse) {
      loadData()
    }
  }

  const filteredCourses = courses.filter((c) => {
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase())
    const isCompleted = c.progress === 100
    const isInProgress = (c as any).in_progress === true || ((c.progress || 0) > 0 && (c.progress || 0) < 100)

    if (selectedFilter === 'completed') {
      return matchesSearch && isCompleted
    }
    if (selectedFilter === 'inProgress') {
      return matchesSearch && isInProgress
    }
    return matchesSearch
  })

  const STREAK_GOAL = 60 * 30 // 30 minutes goal for progress bar
  const progressPercent = Math.min(100, (streakData.secondsToday / STREAK_GOAL) * 100)

  return (
    <div className="flex flex-1 h-full w-full overflow-hidden text-slate-200">
      
      {/* Sidebar */}
      <div className="w-64 glass-panel border-r border-white/5 p-4 flex flex-col gap-6 shrink-0 z-20">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">Idemy</span>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-2">Library</div>
            <button
              onClick={() => setSelectedFilter('all')}
              className={`flex items-center gap-3 w-full px-2 py-2 rounded text-sm transition-colors ${selectedFilter === 'all' ? 'bg-brand-500/20 text-brand-300 font-medium' : 'text-slate-400 hover:bg-white/5'}`}
            >
              <Library className="w-4 h-4" /> All Courses
            </button>
            <button
              onClick={() => setSelectedFilter('inProgress')}
              className={`flex items-center gap-3 w-full px-2 py-2 rounded text-sm transition-colors ${selectedFilter === 'inProgress' ? 'bg-brand-500/20 text-brand-300 font-medium' : 'text-slate-400 hover:bg-white/5'}`}
            >
              <Clock className="w-4 h-4" /> In Progress
            </button>
            <button
              onClick={() => setSelectedFilter('completed')}
              className={`flex items-center gap-3 w-full px-2 py-2 rounded text-sm transition-colors ${selectedFilter === 'completed' ? 'bg-brand-500/20 text-brand-300 font-medium' : 'text-slate-400 hover:bg-white/5'}`}
            >
              <CheckCircle className="w-4 h-4" /> Completed
            </button>
        </div>
        
        <div className="space-y-3 mt-auto">
          <div 
            onClick={onShowStreak}
            className="p-4 rounded-xl bg-surface-900 border border-white/5 relative overflow-hidden group hover:border-brand-500/30 transition-colors cursor-pointer"
          >
            <div className="text-xs text-slate-400 mb-1 font-medium group-hover:text-slate-300 transition-colors">Daily Streak</div>
            <div className="text-xl font-bold text-white flex items-center gap-2">
              {streakData.streak} Days <Flame className={`w-5 h-5 ${streakData.streak > 0 ? 'text-orange-500 fill-orange-500 animate-pulse' : 'text-slate-600'}`} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
               <span className="text-slate-500">Daily Goal</span>
               <span className="text-brand-400">{Math.round(progressPercent)}%</span>
            </div>
            <div className="mt-1 h-1 w-full bg-white/5 rounded-full overflow-hidden">
               <div 
                className="h-full bg-gradient-to-r from-orange-500 to-brand-500 transition-all duration-1000" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full z-10 relative overflow-hidden">
        
        {/* Header */}
        <header className="h-20 px-8 flex items-center justify-between shrink-0 border-b border-white/5">
          
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-brand-400 transition-colors" />
              <input 
                type="text" 
                placeholder="Search (Cmd+K)" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-surface-800 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 w-56 text-slate-200 transition-all placeholder:text-slate-500 shadow-inner"
              />
            </div>
            <button 
              onClick={handleAddCourse}
              className="bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 border border-white/5"
            >
              <FolderPlus className="w-4 h-4" />
              Add Local
            </button>
            <button 
              onClick={() => setShowYoutubeModal(true)}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 border border-red-500/20 shadow-lg shadow-red-500/10"
            >
              <SquarePlay className="w-4 h-4" />
              Import YouTube
            </button>
          </div>
        </header>

        {showYoutubeModal && (
          <YoutubeImportModal 
            onClose={() => setShowYoutubeModal(false)} 
            onImportComplete={loadData}
          />
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          {courses.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-20 h-20 bg-brand-500/10 rounded-2xl flex items-center justify-center mb-6 shadow-glow border border-brand-500/20">
                <FolderPlus className="w-10 h-10 text-brand-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">No courses found</h3>
              <p className="text-slate-400 mb-8 leading-relaxed">
                Your library is empty. Click the button above to scan a folder on your hard drive and instantly organize your video tutorials into a beautiful curriculum.
              </p>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-20">
              <div className="w-20 h-20 bg-brand-500/10 rounded-2xl flex items-center justify-center mb-6 border border-brand-500/20">
                {searchQuery ? <Search className="w-10 h-10 text-brand-400" /> : <Library className="w-10 h-10 text-brand-400" />}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {searchQuery ? 'No matches found' : 
                 selectedFilter === 'completed' ? 'No completed courses' : 
                 selectedFilter === 'inProgress' ? 'No courses in progress' : 'No courses found'}
              </h3>
              <p className="text-slate-400 leading-relaxed">
                {searchQuery ? `We couldn't find any courses matching "${searchQuery}".` : 
                 selectedFilter === 'completed' ? "You haven't finished any courses yet. Keep learning!" : 
                 selectedFilter === 'inProgress' ? "You don't have any courses in progress. Start a new one!" : 
                 "No courses match your current view."}
              </p>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="mt-6 text-sm font-bold text-brand-400 hover:text-brand-300 transition-colors">Clear Search</button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
              {filteredCourses.map((course) => (
                <CourseCard key={course.id} course={course} onClick={() => onSelectCourse(course)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LandingPage
