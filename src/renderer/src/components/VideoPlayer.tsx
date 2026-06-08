import React, { useEffect, useRef, useState } from 'react'
import { Video, TranscriptSegment } from '../../../shared/types'
import { BookMarked, Subtitles } from 'lucide-react'

interface VideoPlayerProps {
  video: Video
  onProgress: (progress: number, isCompleted: boolean) => void
  onDuration?: (duration: number) => void
  onEnded?: () => void
  externalPause?: boolean
}

const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, onProgress, onDuration, onEnded, externalPause }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [showNoteEditor, setShowNoteEditor] = useState(false)
  const [noteContent, setNoteContent] = useState('')
  const [currentPauseTime, setCurrentPauseTime] = useState(0)

  // Closed Captions state
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [captionsEnabled, setCaptionsEnabled] = useState(() => {
    return localStorage.getItem('captions_enabled') === 'true'
  })
  const [currentCaption, setCurrentCaption] = useState<string | null>(null)

  const lastSavedRef = useRef<number>(-1)
  const onProgressRef = useRef(onProgress)
  const onEndedRef = useRef(onEnded)
  const videoRefLatest = useRef(video)
  
  const captionsEnabledRef = useRef(captionsEnabled)
  const segmentsRef = useRef(segments)

  const updateCaptionText = (currentTime: number) => {
    if (captionsEnabledRef.current) {
      const match = segmentsRef.current.find(
        (seg) => currentTime >= seg.start_time && currentTime <= seg.end_time
      )
      setCurrentCaption(match ? match.text : null)
    } else {
      setCurrentCaption(null)
    }
  }

  useEffect(() => {
    onProgressRef.current = onProgress
    onEndedRef.current = onEnded
    videoRefLatest.current = video
  }, [onProgress, onEnded, video])

  useEffect(() => {
    captionsEnabledRef.current = captionsEnabled
    localStorage.setItem('captions_enabled', String(captionsEnabled))
    if (videoRef.current) {
      updateCaptionText(videoRef.current.currentTime || 0)
    }
  }, [captionsEnabled])

  useEffect(() => {
    segmentsRef.current = segments
    if (videoRef.current) {
      updateCaptionText(videoRef.current.currentTime || 0)
    }
  }, [segments])

  // Load transcript segments for captions on video.id change
  useEffect(() => {
    const loadTranscript = async () => {
      try {
        const data = await window.api.getTranscript(video.id)
        setSegments(data)
      } catch (err) {
        console.error('Failed to load transcript for captions:', err)
        setSegments([])
      }
    }
    loadTranscript()
    setCurrentCaption(null)
  }, [video.id])

  const mediaUrl = `media://${encodeURI(video.file_path)}`

  useEffect(() => {
    if (externalPause && videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause()
    }
  }, [externalPause])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    let isInitialized = false

    const onLoadedMetadata = () => {
      const saved = Number(videoRefLatest.current.progress) || 0
      const totalDur = (el.duration && !isNaN(el.duration)) ? el.duration : Infinity
      
      if (videoRefLatest.current.is_completed) {
        el.currentTime = totalDur
      } else if (saved > 0 && saved < totalDur - 2) {
        el.currentTime = saved
      }
      
      if (onDuration && el.duration && !isNaN(el.duration) && el.duration > 0) {
        onDuration(Math.floor(el.duration))
      }

      isInitialized = true
    }

    const onTimeUpdate = () => {
      updateCaptionText(el.currentTime || 0)
      
      if (showNoteEditor || !isInitialized) return
      
      const floored = Math.floor(el.currentTime || 0)
      const durationValue = (el.duration && !isNaN(el.duration)) ? Math.floor(el.duration) : 0
      const isCompleted = durationValue > 0 && floored >= durationValue - 1
      
      if (floored !== lastSavedRef.current) {
        onProgressRef.current(floored, isCompleted)
        lastSavedRef.current = floored
      }
    }

    const handleManualSeek = () => {
      updateCaptionText(el.currentTime || 0)
      if (!isInitialized) return
      const t = Math.floor(el.currentTime || 0)
      if (t !== lastSavedRef.current) {
        onProgressRef.current(t, false)
        lastSavedRef.current = t
      }
    }

    const handleEnded = () => {
      if (onEndedRef.current) onEndedRef.current()
    }

    el.addEventListener('loadedmetadata', onLoadedMetadata)
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('seeked', handleManualSeek)
    el.addEventListener('pause', handleManualSeek)
    el.addEventListener('ended', handleEnded)

    lastSavedRef.current = -1
    
    // Only reload if the source actually changed to prevent auto-restart on re-renders
    const currentSrc = el.getAttribute('src')
    if (currentSrc !== mediaUrl) {
      el.src = mediaUrl
      el.load()
    }

    return () => {
      el.removeEventListener('loadedmetadata', onLoadedMetadata)
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('seeked', handleManualSeek)
      el.removeEventListener('pause', handleManualSeek)
      el.removeEventListener('ended', handleEnded)
    }
  }, [video.id, mediaUrl])

  const handleNoteOpen = () => {
    const el = videoRef.current
    if (!el) return
    el.pause()
    setCurrentPauseTime(el.currentTime || 0)
    setShowNoteEditor(true)
  }

  const saveNote = async () => {
    if (!noteContent.trim()) return
    await window.api.saveNote(video.id, currentPauseTime, noteContent.trim())
    setShowNoteEditor(false)
    setNoteContent('')
    videoRef.current?.play().catch(() => {})
  }

  return (
    <div className="flex flex-col h-full bg-surface-900 relative z-10 outline-none" tabIndex={0} onKeyDown={(e) => {
      if ((e.key === 'n' || e.key === 'N') && !showNoteEditor) handleNoteOpen()
      if ((e.key === 'c' || e.key === 'C') && !showNoteEditor) {
        setCaptionsEnabled(prev => !prev)
      }
    }}>
      <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between shrink-0 glass-panel z-20 bg-surface-800/50 video-header">
        <h2 className="text-sm font-bold text-white line-clamp-1">{video.title}</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCaptionsEnabled(!captionsEnabled)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              captionsEnabled
                ? 'bg-brand-500 text-white border-brand-500 hover:bg-brand-400'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
            }`}
            title="Toggle Captions (C)"
          >
            <Subtitles className="w-3.5 h-3.5" /> CC
          </button>
          <button onClick={handleNoteOpen} className="flex items-center gap-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-brand-500/20">
            <BookMarked className="w-3.5 h-3.5" /> Note (N)
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 lg:p-6 bg-black flex flex-col items-center justify-center overflow-hidden relative video-body">
        <div className="w-full h-full shadow-2xl rounded-xl overflow-hidden border border-white/5 bg-[#050505] video-wrapper relative">
          <video ref={videoRef} className="w-full h-full object-contain" controls autoPlay />
          {captionsEnabled && currentCaption && (
            <div className="absolute bottom-16 inset-x-0 flex justify-center px-4 pointer-events-none z-10 select-none">
              <span className="bg-black/80 text-white text-sm md:text-base lg:text-lg font-medium px-4 py-2 rounded-xl text-center max-w-[85%] leading-relaxed shadow-lg backdrop-blur-[2px] border border-white/10 transition-all duration-200">
                {currentCaption}
              </span>
            </div>
          )}
        </div>

        {showNoteEditor && (
          <div className="absolute inset-x-0 bottom-24 mx-auto w-full max-w-4xl px-6 z-30 animate-fade-in">
             <div className="p-1 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 shadow-modal">
                <div className="bg-surface-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-xs font-bold text-brand-400 bg-brand-500/10 px-2 py-1 rounded">{formatTime(currentPauseTime)}</span>
                  </div>
                  <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder="Capture your thoughts (Markdown supported)..." className="w-full bg-surface-900 border border-white/5 rounded-xl p-4 text-sm text-slate-200 font-mono focus:outline-none focus:border-brand-500 min-h-[120px] mb-4 resize-none" autoFocus />
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowNoteEditor(false)} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-white">Discard</button>
                    <button onClick={saveNote} className="bg-brand-500 hover:bg-brand-400 text-white px-5 py-2 rounded-lg text-xs font-bold">Save Note</button>
                  </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default VideoPlayer
