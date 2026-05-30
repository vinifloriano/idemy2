import React, { useState, useEffect, useRef } from 'react'
import { Course, Video } from '../../../shared/types'
import VideoPlayer from './VideoPlayer'
import CourseSidebar from './CourseSidebar'
import TranscriptTab from './TranscriptTab'
import CourseNotes from './CourseNotes'
import { ArrowLeft, LayoutGrid, Pencil, Check, RotateCcw, Trash2, Settings, X, AlertTriangle, Download, Play, PartyPopper, Trophy } from 'lucide-react'
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react'

interface CourseViewProps {
  courseId: string
  onBack: () => void
}

const CourseView: React.FC<CourseViewProps> = ({ courseId, onBack }) => {
  const [course, setCourse] = useState<Course | null>(null)
  const [activeVideo, setActiveVideo] = useState<Video | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [editIconValue, setEditIconValue] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [activeTab, setActiveTab] = useState<'content' | 'notes' | 'transcript'>('content')
  const settingsRef = useRef<HTMLDivElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)

  const [completionState, setCompletionState] = useState<'timer' | 'final' | null>(null)
  const [timerSeconds, setTimerSeconds] = useState(5)
  // const [transcriptionEnabled, setTranscriptionEnabled] = useState(localStorage.getItem('IDEMY_TRANSCRIPTION_ENABLED') === 'true')

  /* const toggleTranscription = () => {
    const newVal = !transcriptionEnabled
    setTranscriptionEnabled(newVal)
    localStorage.setItem('IDEMY_TRANSCRIPTION_ENABLED', newVal.toString())
    if (!newVal && activeTab === 'transcript') setActiveTab('content')
  } */

  const loadCourse = async () => {
    const data = await window.api.getCourseById(courseId)
    if (data) {
      setCourse(data)
      setEditTitleValue(data.title)
      setEditIconValue(data.icon || '')
      if (!activeVideo) {
        let resumeVideo: Video | null = null
        
        // 1. Try to find the specific last video watched
        if (data.last_video_id) {
          for (const section of data.sections) {
            const found = section.videos.find(v => v.id === data.last_video_id)
            if (found) { resumeVideo = found; break }
          }
        }

        // 2. If no resume video, find first incomplete
        if (!resumeVideo) {
          for (const section of data.sections) {
            const incomplete = section.videos.find((v) => !v.is_completed)
            if (incomplete) { resumeVideo = incomplete; break }
          }
        }

        // 3. Fallback to first video
        if (!resumeVideo && data.sections.length > 0 && data.sections[0].videos.length > 0) {
          resumeVideo = data.sections[0].videos[0]
        }
        
        setActiveVideo(resumeVideo)
      }
    }
  }

  useEffect(() => { loadCourse() }, [courseId])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setShowSettings(false)
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) setShowEmojiPicker(false)
    }
    if (showSettings || showEmojiPicker) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSettings, showEmojiPicker])

  const getNextVideo = () => {
    if (!course || !activeVideo) return null
    const allVideos = course.sections.flatMap(s => s.videos)
    const currentIndex = allVideos.findIndex(v => v.id === activeVideo.id)
    if (currentIndex >= 0 && currentIndex < allVideos.length - 1) {
      return allVideos[currentIndex + 1]
    }
    return null
  }

  useEffect(() => {
    let interval: any
    if (completionState === 'timer' && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds(s => s - 1)
      }, 1000)
    } else if (completionState === 'timer' && timerSeconds === 0) {
      const nextVid = getNextVideo()
      if (nextVid) {
         setActiveVideo(nextVid)
         setCompletionState(null)
      } else {
         setCompletionState('final')
      }
    }
    return () => clearInterval(interval)
  }, [completionState, timerSeconds, course, activeVideo])

  const handleVideoEnded = () => {
    const nextVid = getNextVideo()
    if (nextVid) {
      setCompletionState('timer')
      setTimerSeconds(5)
    } else {
      setCompletionState('final')
    }
  }

  const handleProgress = async (progress: number, isCompleted: boolean) => {
    if (activeVideo && course) {
      await window.api.updateVideoProgress(activeVideo.id, progress, isCompleted)
      const updatedVideo = { ...activeVideo, progress, is_completed: isCompleted }
      setActiveVideo(updatedVideo)
      const updatedSections = course.sections.map(section => ({
        ...section,
        videos: section.videos.map(video => (video.id === activeVideo.id ? updatedVideo : video))
      }))
      const allVideos = updatedSections.flatMap(s => s.videos)
      const progressPercent = Math.round((allVideos.filter(v => v.is_completed).length / allVideos.length) * 100)
      setCourse({ ...course, sections: updatedSections, progress: progressPercent })
      if (isCompleted && !activeVideo.is_completed) loadCourse()
    }
  }

  const handleSaveTitle = async () => {
    if (!course) return
    let updated = false
    const newTitle = editTitleValue.trim()
    const newIcon = editIconValue.trim()

    if (newTitle && newTitle !== course.title) {
      await window.api.renameCourse(course.id, newTitle)
      updated = true
    }
    if (newIcon !== (course.icon || '')) {
      await window.api.updateCourseIcon(course.id, newIcon)
      updated = true
    }

    if (updated) {
      setCourse({ ...course, title: newTitle || course.title, icon: newIcon })
    }
    setIsEditingTitle(false)
  }

  const handleExportNotes = async () => {
    const success = await window.api.exportNotes(courseId)
    if (success) {
      alert('Notes exported successfully!')
      setShowSettings(false)
    }
  }

  if (!course) return <div className="flex-1 flex items-center justify-center text-slate-400 bg-surface-900/60 backdrop-blur-sm z-10">Loading...</div>

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden text-slate-200 z-10 relative">
      <nav className="h-16 px-6 glass-panel border-b border-white/5 flex items-center justify-between shrink-0 z-20 sticky top-0 bg-surface-800/80">
        <div className="flex items-center w-full justify-between">
          <div className="flex items-center">
            <button className="group bg-surface-900 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 mr-6 active:scale-95 shadow-sm shrink-0" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Dashboard
            </button>
            <div className="h-6 w-px bg-white/10 mx-2 shrink-0"></div>
            <div className="flex items-center gap-3 ml-4">
              <div className="w-7 h-7 rounded bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/20 shrink-0">
                 {course.icon ? (
                    <span className="text-xs">{course.icon}</span>
                 ) : (
                    <LayoutGrid className="w-3.5 h-3.5 text-white" />
                 )}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 group relative">
                  {isEditingTitle ? (
                    <div className="flex items-center gap-2">
                      <div className="relative" ref={emojiPickerRef}>
                        <button 
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
                          className="bg-surface-900 border border-brand-500 rounded px-2 py-0.5 text-xs font-bold text-white focus:outline-none min-w-[32px] h-7 flex items-center justify-center hover:bg-surface-800 transition-colors"
                        >
                          {editIconValue || '✨'}
                        </button>
                        {showEmojiPicker && (
                          <div className="absolute top-full mt-2 left-0 z-50 shadow-2xl">
                            <EmojiPicker 
                              theme={'dark' as any}
                              emojiStyle={EmojiStyle.NATIVE}
                              onEmojiClick={(emojiData) => {
                                setEditIconValue(emojiData.emoji)
                                setShowEmojiPicker(false)
                              }} 
                            />
                          </div>
                        )}
                      </div>
                      <input type="text" value={editTitleValue} onChange={(e) => setEditTitleValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' ? handleSaveTitle() : e.key === 'Escape' ? setIsEditingTitle(false) : null} autoFocus className="bg-surface-900 border border-brand-500 rounded px-2 py-0.5 text-sm font-bold text-white focus:outline-none w-64 h-7" />
                      <button onClick={handleSaveTitle} className="text-green-400 hover:text-green-300"><Check className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-sm font-bold text-white leading-tight line-clamp-1 max-w-md">{course.title}</h2>
                      <button onClick={() => setIsEditingTitle(true)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
                <span className="text-xs text-brand-400 font-medium">{course.progress}% Complete</span>
              </div>
            </div>
          </div>
          <div className="relative" ref={settingsRef}>
            <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-lg transition-all ${showSettings ? 'bg-brand-500/20 text-brand-400 rotate-90' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Settings className="w-5 h-5" /></button>
            {showSettings && (
              <div className="absolute right-0 mt-3 w-64 bg-surface-800 border border-white/10 rounded-xl shadow-modal overflow-hidden z-30 animate-fade-in origin-top-right">
                <div className="px-4 py-3 border-b border-white/5 bg-surface-900/50 flex items-center justify-between"><span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Course Options</span><button onClick={() => setShowSettings(false)}><X className="w-3.5 h-3.5 text-slate-500 hover:text-white" /></button></div>
                <div className="p-1">
                  <button onClick={handleExportNotes} className="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-brand-500/10 hover:text-brand-300 flex items-center gap-3 rounded-lg"><Download className="w-4 h-4" /> Export All Notes</button>
                  <button onClick={async () => { if (await window.api.showConfirm('Reset progress?')) { await window.api.resetCourse(courseId); loadCourse() } }} className="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-brand-500/10 hover:text-brand-300 flex items-center gap-3 rounded-lg"><RotateCcw className="w-4 h-4" /> Reset Progress</button>
                  <button onClick={async () => { if (await window.api.showConfirm('Archive course?')) { await window.api.removeCourse(courseId); onBack() } }} className="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5 flex items-center gap-3 rounded-lg"><Trash2 className="w-4 h-4" /> Archive Course</button>
                  
                  {/* <div className="my-1 border-t border-white/5"></div>
                  <div className="px-4 py-2">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <span className="text-sm text-slate-300 group-hover:text-white">Enable Transcription (Exp)</span>
                      <input type="checkbox" className="sr-only" checked={transcriptionEnabled} onChange={toggleTranscription} />
                      <div className={`w-8 h-4 rounded-full transition-colors ${transcriptionEnabled ? 'bg-brand-500' : 'bg-surface-900 border border-white/20'} relative`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${transcriptionEnabled ? 'left-4' : 'left-0.5'}`}></div>
                      </div>
                    </label>
                  </div> */}
                  
                  <div className="my-1 border-t border-white/5"></div>
                  <button onClick={async () => { if (await window.api.showConfirm('DANGER: Permanent Delete?')) { await window.api.deleteCoursePermanently(courseId); onBack() } }} className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-3 rounded-lg"><AlertTriangle className="w-4 h-4" /> Delete Permanently</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
      <div className="flex-1 flex overflow-hidden relative bg-[#050505] min-h-0 h-[calc(100vh-64px)]">
        <main className="flex-1 overflow-hidden relative z-0 flex flex-col min-h-0">
          {activeVideo ? <VideoPlayer video={activeVideo} onProgress={handleProgress} onEnded={handleVideoEnded} /> : <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-surface-900/40 backdrop-blur-sm"><Play className="w-8 h-8 text-slate-600 mb-4" /><p className="text-lg font-medium text-slate-400">Select a video to start learning</p></div>}
          
          {completionState === 'timer' && (
            <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center animate-fade-in backdrop-blur-sm">
              <PartyPopper className="w-24 h-24 text-yellow-400 animate-bounce mb-6" />
              <h2 className="text-4xl font-bold text-white mb-2">Great job!</h2>
              <p className="text-slate-300 text-lg mb-8">You've completed this lesson.</p>
              
              <div className="flex flex-col items-center bg-surface-800/80 p-8 rounded-3xl border border-white/10 shadow-2xl">
                <div className="text-slate-400 mb-2 font-medium">Next video starting in</div>
                <div className="text-6xl font-mono font-bold text-brand-400 mb-8">{timerSeconds}s</div>
                
                <div className="flex gap-4">
                  <button onClick={() => setCompletionState(null)} className="px-6 py-3 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 transition-colors font-semibold">Cancel</button>
                  <button onClick={() => {
                    const nextVid = getNextVideo()
                    if (nextVid) { setActiveVideo(nextVid); setCompletionState(null) }
                  }} className="px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold transition-colors flex items-center gap-2">Play Next <Play className="w-4 h-4 fill-current" /></button>
                </div>
              </div>
            </div>
          )}

          {completionState === 'final' && (
            <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center animate-fade-in backdrop-blur-sm">
              <Trophy className="w-32 h-32 text-yellow-400 animate-bounce mb-6 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
              <h2 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-200 mb-4 text-center px-4">Course Completed!</h2>
              <p className="text-slate-300 text-xl mb-8 max-w-lg text-center leading-relaxed">You've reached the end of this course. Take a moment to reflect and write down your key takeaways.</p>
              
              <div className="w-full max-w-2xl bg-surface-800/80 p-6 rounded-3xl border border-white/10 shadow-2xl">
                <textarea
                   id="final-note"
                   placeholder="Write your final review or key takeaways here..."
                   className="w-full bg-surface-900 border border-white/5 rounded-2xl p-5 text-base text-slate-200 focus:outline-none focus:border-brand-500 min-h-[160px] mb-6 resize-none shadow-inner"
                />
                <div className="flex justify-end gap-4">
                   <button onClick={() => setCompletionState(null)} className="px-6 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white transition-colors">Close</button>
                   <button onClick={async () => {
                     const noteContent = (document.getElementById('final-note') as HTMLTextAreaElement).value
                     if (noteContent.trim() && activeVideo) {
                        await window.api.saveNote(activeVideo.id, 0, "**Course Review:**\n\n" + noteContent.trim())
                        setActiveTab('notes')
                     }
                     setCompletionState(null)
                   }} className="bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-400 hover:to-purple-500 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-brand-500/25">Save Review Note</button>
                </div>
              </div>
            </div>
          )}
        </main>
        <div className="w-80 border-l border-white/5 flex flex-col min-h-0 bg-surface-800 shrink-0">
          <div className="flex border-b border-white/5 shrink-0">
            <button onClick={() => setActiveTab('content')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'content' ? 'text-brand-400 bg-brand-500/5' : 'text-slate-500 hover:text-slate-300'}`}>Content</button>
            <button onClick={() => setActiveTab('notes')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'notes' ? 'text-brand-400 bg-brand-500/5' : 'text-slate-500 hover:text-slate-300'}`}>Notes</button>
            {/* {transcriptionEnabled && (
              <button onClick={() => setActiveTab('transcript')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'transcript' ? 'text-brand-400 bg-brand-500/5' : 'text-slate-500 hover:text-slate-300'}`}>Script</button>
            )} */}
          </div>
          <div className="flex-1 min-h-0 relative">
            {activeTab === 'content' ? (
              <CourseSidebar course={course} activeVideoId={activeVideo?.id || null} onSelectVideo={(v) => { 
                setActiveVideo(v)
                window.api.updateCourseLastVideo(courseId, v.id)
                setActiveTab('content')
                setCompletionState(null) 
              }} />
            ) : activeTab === 'notes' ? (
              <CourseNotes courseId={courseId} activeVideoId={activeVideo?.id || null} onSeek={(vId, time) => {
                const vid = course.sections.flatMap(s => s.videos).find(v => v.id === vId)
                if (vid) {
                  setActiveVideo({...vid, progress: time})
                  window.api.updateCourseLastVideo(courseId, vid.id)
                  setActiveTab('content')
                  setCompletionState(null)
                }
              }} />
            ) : (
              <TranscriptTab 
                videoId={activeVideo?.id || null} 
                videoPath={activeVideo?.file_path || null} 
                onSeek={(time) => {
                  if (activeVideo) {
                    setActiveVideo({...activeVideo, progress: time})
                  }
                }} 
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CourseView
