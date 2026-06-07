import React, { useState, useEffect, useRef } from 'react'
import { TranscriptSegment } from '../../../shared/types'
import { Loader2, Mic, MicOff, Play, Video, Square, RefreshCw, Save, AlertCircle, CheckCircle2 } from 'lucide-react'

interface TranscribeTabProps {
  videoId: string | null
  videoPath: string | null
  onSeek: (time: number) => void
}

type Mode = 'video' | 'mic'

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const TranscribeTab: React.FC<TranscribeTabProps> = ({ videoId, videoPath, onSeek }) => {
  const [mode, setMode] = useState<Mode>('video')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [platformInfo, setPlatformInfo] = useState<string>('')

  // Mic state
  const [isMicActive, setIsMicActive] = useState(false)
  const [micText, setMicText] = useState('')
  const [micSegments, setMicSegments] = useState<Array<{ text: string; time: number }>>([])
  const [savedMic, setSavedMic] = useState(false)
  const micStartTimeRef = useRef<number>(0)

  const scrollRef = useRef<HTMLDivElement>(null)

  // Check availability on mount
  useEffect(() => {
    checkAvailability()
  }, [])

  // Load existing transcript when videoId changes
  useEffect(() => {
    if (videoId) {
      loadTranscript()
    }
  }, [videoId])

  // Listen for progress events
  useEffect(() => {
    if (!videoId) return
    const cleanup = window.api.onAppleSpeechProgress((data: any) => {
      if (data.videoId === videoId) {
        if (data.done) {
          setProgressMessage(null)
        } else {
          setProgressMessage(data.message)
        }
      }
    })
    return cleanup
  }, [videoId])

  // Listen for mic results
  useEffect(() => {
    if (!isMicActive) return
    const cleanup = window.api.onAppleSpeechMicResult((data: any) => {
      if (data.error) {
        setError(data.error)
        setIsMicActive(false)
        return
      }
      if (data.done) {
        setIsMicActive(false)
        return
      }
      if (data.text) {
        setMicText(data.text)
        if (data.isFinal) {
          setMicSegments(prev => [...prev, {
            text: data.text,
            time: Date.now() - micStartTimeRef.current
          }])
        }
        // Auto-scroll
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }
    })
    return cleanup
  }, [isMicActive])

  const [isRequestingPermission, setIsRequestingPermission] = useState(false)

  const checkAvailability = async () => {
    try {
      const result = await window.api.appleSpeechCheckAvailable()
      setIsAvailable(result.available)
      setPlatformInfo(result.platform)
    } catch {
      setIsAvailable(false)
      setPlatformInfo('unknown')
    }
  }

  const handleRequestPermissions = async () => {
    setIsRequestingPermission(true)
    setError(null)
    try {
      const result = await window.api.appleSpeechRequestPermissions()
      if (result.speechGranted) {
        setIsAvailable(true)
      } else {
        setError('Speech Recognition permission was not granted. Please allow it when prompted, or enable it in System Settings → Privacy & Security → Speech Recognition.')
      }
      setPlatformInfo(result.platform)
    } catch (err: any) {
      setError(err.message || 'Failed to request permissions.')
    } finally {
      setIsRequestingPermission(false)
    }
  }

  const loadTranscript = async () => {
    if (!videoId) return
    try {
      const data = await window.api.getTranscript(videoId)
      setSegments(data)
    } catch (err) {
      console.error('Failed to load transcript:', err)
    }
  }

  const handleTranscribeVideo = async () => {
    if (!videoId || !videoPath) return
    setIsTranscribing(true)
    setError(null)
    setProgressMessage('Starting...')
    try {
      const data = await window.api.appleSpeechTranscribeVideo(videoId, videoPath)
      setSegments(data)
    } catch (err: any) {
      console.error('Apple Speech transcription failed:', err)
      setError(err.message || 'Failed to transcribe with Apple Speech.')
    } finally {
      setIsTranscribing(false)
      setProgressMessage(null)
    }
  }

  const handleStartMic = async () => {
    setError(null)
    setMicText('')
    setMicSegments([])
    setSavedMic(false)
    micStartTimeRef.current = Date.now()
    try {
      setIsMicActive(true)
      await window.api.appleSpeechStartMic()
    } catch (err: any) {
      setError(err.message || 'Failed to start microphone.')
      setIsMicActive(false)
    }
  }

  const handleStopMic = async () => {
    try {
      await window.api.appleSpeechStopMic()
    } catch {
      // ignore
    }
    setIsMicActive(false)
  }

  const handleSaveMicTranscript = async () => {
    if (!videoId || !micText.trim()) return
    try {
      await window.api.appleSpeechSaveMicTranscript(videoId, micText.trim(), 0, (Date.now() - micStartTimeRef.current) / 1000)
      setSavedMic(true)
      // Reload to show in segments
      await loadTranscript()
    } catch (err: any) {
      setError(err.message || 'Failed to save transcript.')
    }
  }

  // Not available on this platform
  if (isAvailable === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-10 px-4">
        <div className="w-16 h-16 rounded-2xl bg-surface-900 border border-white/5 flex items-center justify-center mb-4">
          {isRequestingPermission ? (
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          ) : (
            <Mic className="w-8 h-8 text-slate-500" />
          )}
        </div>
        <h3 className="text-white font-bold mb-2">
          {platformInfo !== 'macOS' ? 'Apple Speech Not Available' : 'Permission Required'}
        </h3>
        <p className="text-slate-400 text-sm max-w-[220px] leading-relaxed mb-5">
          {platformInfo !== 'macOS'
            ? 'This feature requires macOS with Speech Recognition support.'
            : 'Idemy needs permission to use Speech Recognition and Microphone for transcription.'}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 max-w-[260px]">
            <p className="text-red-400 text-xs leading-relaxed">{error}</p>
          </div>
        )}

        {platformInfo === 'macOS' && (
          <button
            onClick={handleRequestPermissions}
            disabled={isRequestingPermission}
            className="bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-400 hover:to-purple-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-brand-500/20 disabled:opacity-50 flex items-center gap-2"
          >
            {isRequestingPermission ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Requesting...
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" /> Grant Permission
              </>
            )}
          </button>
        )}

        <button
          onClick={checkAvailability}
          className="mt-3 text-[10px] text-slate-500 hover:text-brand-400 font-bold flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Check Again
        </button>
      </div>
    )
  }

  // Still checking
  if (isAvailable === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-10">
        <Loader2 className="w-6 h-6 text-brand-500 animate-spin mb-3" />
        <p className="text-slate-500 text-xs">Checking Apple Speech availability...</p>
      </div>
    )
  }

  if (!videoId) {
    return <div className="text-center py-10 text-slate-500 text-sm">Select a video to transcribe.</div>
  }

  return (
    <div ref={scrollRef} className="flex flex-col h-full overflow-y-auto custom-scrollbar bg-surface-800">
      {/* Mode Switcher */}
      <div className="sticky top-0 z-10 bg-surface-800 border-b border-white/5 px-4 py-3">
        <div className="flex gap-1 bg-surface-900 rounded-lg p-0.5 border border-white/5">
          <button
            onClick={() => setMode('video')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
              mode === 'video'
                ? 'bg-brand-500/15 text-brand-400 shadow-sm border border-brand-500/20'
                : 'text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
          >
            <Video className="w-3.5 h-3.5" /> Video
          </button>
          <button
            onClick={() => setMode('mic')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
              mode === 'mic'
                ? 'bg-brand-500/15 text-brand-400 shadow-sm border border-brand-500/20'
                : 'text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
          >
            <Mic className="w-3.5 h-3.5" /> Mic
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-red-400 text-xs leading-relaxed">{error}</p>
          <button onClick={() => setError(null)} className="mt-2 text-[10px] font-bold text-slate-500 hover:text-white transition-colors">Dismiss</button>
        </div>
      )}

      {/* Video Mode */}
      {mode === 'video' && (
        <div className="flex-1 flex flex-col p-4 gap-4">
          {/* No transcript yet */}
          {segments.length === 0 && !isTranscribing && (
            <div className="flex flex-col items-center justify-center flex-1 text-center py-10">
              <div className="relative mb-5">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-600/20 flex items-center justify-center border border-brand-500/10">
                  <Video className="w-10 h-10 text-brand-400" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-surface-800 border border-white/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 18.5C15.5899 18.5 18.5 15.5899 18.5 12C18.5 8.41015 15.5899 5.5 12 5.5C8.41015 5.5 5.5 8.41015 5.5 12C5.5 15.5899 8.41015 18.5 12 18.5Z" />
                    <path d="M12 2V4M12 20V22M2 12H4M20 12H22" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
              <h3 className="text-white font-bold mb-2 text-sm">Transcribe Video</h3>
              <p className="text-slate-400 text-xs mb-5 max-w-[200px] leading-relaxed">
                Use Apple Speech Recognition to transcribe this video's audio.
              </p>
              <button
                onClick={handleTranscribeVideo}
                disabled={!videoPath}
                className="bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-400 hover:to-purple-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-brand-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 18.5C15.5899 18.5 18.5 15.5899 18.5 12C18.5 8.41015 15.5899 5.5 12 5.5C8.41015 5.5 5.5 8.41015 5.5 12C5.5 15.5899 8.41015 18.5 12 18.5Z" />
                  <path d="M12 2V4M12 20V22M2 12H4M20 12H22" strokeLinecap="round" />
                </svg>
                Transcribe with Apple Speech
              </button>
            </div>
          )}

          {/* Transcribing in progress */}
          {isTranscribing && (
            <div className="flex flex-col items-center justify-center flex-1 text-center py-10">
              <div className="relative mb-5">
                <div className="w-16 h-16 rounded-full border-2 border-brand-500/30 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                </div>
                {/* Pulsing rings */}
                <div className="absolute inset-0 w-16 h-16 rounded-full border border-brand-500/20 animate-ping" style={{ animationDuration: '2s' }} />
              </div>
              <h3 className="text-white font-bold mb-2 text-sm">Processing Audio...</h3>
              {progressMessage && (
                <p className="text-brand-400 text-[10px] font-mono bg-brand-500/10 px-3 py-1 rounded-lg border border-brand-500/10">
                  {progressMessage}
                </p>
              )}
              <p className="text-slate-500 text-[10px] mt-3 max-w-[200px] leading-relaxed">
                Using Apple's native Speech Recognition for high-quality transcription.
              </p>
            </div>
          )}

          {/* Display segments */}
          {segments.length > 0 && !isTranscribing && (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {segments.length} Segments
                </span>
                <button
                  onClick={handleTranscribeVideo}
                  className="text-[10px] font-bold text-slate-500 hover:text-brand-400 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Re-transcribe
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {segments.map((segment) => (
                  <div
                    key={segment.id}
                    className="group p-3 rounded-xl hover:bg-surface-900 border border-transparent hover:border-white/5 transition-all cursor-pointer flex gap-3"
                    onClick={() => onSeek(segment.start_time)}
                  >
                    <div className="shrink-0 mt-0.5">
                      <span className="font-mono text-[10px] font-bold text-brand-400 bg-brand-500/10 group-hover:bg-brand-500/20 px-1.5 py-0.5 rounded border border-brand-500/20 transition-colors flex items-center gap-1">
                        <Play className="w-2 h-2" /> {formatTime(segment.start_time)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 group-hover:text-white transition-colors leading-relaxed">
                      {segment.text}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Mic Mode */}
      {mode === 'mic' && (
        <div className="flex-1 flex flex-col p-4 gap-4">
          {/* Mic Control */}
          <div className="flex flex-col items-center py-6">
            <button
              onClick={isMicActive ? handleStopMic : handleStartMic}
              className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-xl ${
                isMicActive
                  ? 'bg-red-500 hover:bg-red-400 shadow-red-500/30'
                  : 'bg-gradient-to-br from-brand-500 to-purple-600 hover:from-brand-400 hover:to-purple-500 shadow-brand-500/30'
              }`}
            >
              {isMicActive && (
                <>
                  <div className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" style={{ animationDuration: '1.5s' }} />
                  <div className="absolute -inset-2 rounded-full border-2 border-red-500/20 animate-pulse" />
                </>
              )}
              {isMicActive ? (
                <Square className="w-7 h-7 text-white relative z-10 fill-white" />
              ) : (
                <Mic className="w-8 h-8 text-white relative z-10" />
              )}
            </button>
            <p className="text-xs text-slate-400 mt-3 font-medium">
              {isMicActive ? (
                <span className="text-red-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Recording... tap to stop
                </span>
              ) : (
                'Tap to start live transcription'
              )}
            </p>
          </div>

          {/* Live text display */}
          {(micText || micSegments.length > 0) && (
            <div className="flex-1 flex flex-col gap-3">
              {/* Current / accumulated text */}
              <div className="bg-surface-900 rounded-xl border border-white/5 p-4 min-h-[120px]">
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {micText || <span className="text-slate-600 italic">Waiting for speech...</span>}
                </p>
                {isMicActive && (
                  <div className="flex gap-1 mt-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>

              {/* Save button */}
              {!isMicActive && micText.trim() && (
                <button
                  onClick={handleSaveMicTranscript}
                  disabled={savedMic}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    savedMic
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-500/20'
                  }`}
                >
                  {savedMic ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Saved to Transcript
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Save as Transcript
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Empty state for mic */}
          {!isMicActive && !micText && micSegments.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
              <MicOff className="w-8 h-8 text-slate-700 mb-3" />
              <p className="text-slate-500 text-xs leading-relaxed max-w-[200px]">
                Start recording to capture live audio. Great for transcribing lectures or taking voice notes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TranscribeTab
