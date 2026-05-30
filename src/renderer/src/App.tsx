import { useState } from 'react'
import LandingPage from './components/LandingPage'
import CourseView from './components/CourseView'
import DailyStreak from './components/DailyStreak'
import { Course } from '../../shared/types'

function App(): JSX.Element {
  const [view, setView] = useState<'dashboard' | 'course' | 'streak'>('dashboard')
  const [currentCourseId, setCurrentCourseId] = useState<string | null>(null)

  const handleSelectCourse = (course: Course) => {
    setCurrentCourseId(course.id)
    setView('course')
  }

  const handleBack = () => {
    setView('dashboard')
    setCurrentCourseId(null)
  }

  return (
    <div className="min-h-screen flex flex-col relative z-0">
      {/* Abstract Background Blobs */}
      <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-brand-600/30 rounded-full mix-blend-screen filter blur-[100px] animate-blob"></div>
        <div className="absolute top-[20%] right-[-10%] w-96 h-96 bg-purple-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-[-20%] left-[20%] w-[500px] h-[500px] bg-brand-900/40 rounded-full mix-blend-screen filter blur-[120px] animate-blob" style={{ animationDelay: '4s' }}></div>
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none z-0"></div>
      </div>

      <div className="flex-1 flex flex-col relative z-10 w-full h-full max-h-screen overflow-hidden">
        {view === 'dashboard' && (
          <LandingPage onSelectCourse={handleSelectCourse} onShowStreak={() => setView('streak')} />
        )}
        
        {view === 'course' && currentCourseId && (
          <CourseView courseId={currentCourseId} onBack={handleBack} />
        )}

        {view === 'streak' && (
          <DailyStreak onBack={handleBack} />
        )}
      </div>
    </div>
  )
}

export default App
