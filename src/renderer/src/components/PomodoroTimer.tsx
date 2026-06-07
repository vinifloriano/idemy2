import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Timer, Coffee, SkipForward, X, Play, Pause, RotateCcw } from 'lucide-react'

// Default Pomodoro settings (in minutes)
const DEFAULT_SETTINGS = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4, // long break every N pomodoros
}

type PomodoroPhase = 'idle' | 'work' | 'shortBreak' | 'longBreak'

interface PomodoroSettings {
  workDuration: number
  shortBreakDuration: number
  longBreakDuration: number
  longBreakInterval: number
}

interface PomodoroTimerProps {
  onBreakStart?: () => void    // called when break starts (pause video)
  onBreakEnd?: () => void      // called when break ends/skipped (resume video)
}

export interface PomodoroTimerRef {
  reloadSettings: () => void
}

const STORAGE_KEY = 'idemy-pomodoro-settings'

function loadSettings(): PomodoroSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(settings: PomodoroSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const PomodoroTimer = forwardRef<PomodoroTimerRef, PomodoroTimerProps>(({ onBreakStart, onBreakEnd }, ref) => {
  const [settings, setSettings] = useState<PomodoroSettings>(loadSettings)
  const [phase, setPhase] = useState<PomodoroPhase>('idle')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [pomodoroCount, setPomodoroCount] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [showBreakOverlay, setShowBreakOverlay] = useState(false)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useImperativeHandle(ref, () => ({
    reloadSettings: () => {
      const loaded = loadSettings()
      setSettings(loaded)
      if (phase === 'work' && secondsLeft > 0) {
        const ratio = secondsLeft / (settings.workDuration * 60)
        setSecondsLeft(Math.round(ratio * loaded.workDuration * 60))
      } else if (phase === 'shortBreak' && secondsLeft > 0) {
        const ratio = secondsLeft / (settings.shortBreakDuration * 60)
        setSecondsLeft(Math.round(ratio * loaded.shortBreakDuration * 60))
      } else if (phase === 'longBreak' && secondsLeft > 0) {
        const ratio = secondsLeft / (settings.longBreakDuration * 60)
        setSecondsLeft(Math.round(ratio * loaded.longBreakDuration * 60))
      }
    }
  }))

  // Timer tick
  useEffect(() => {
    if (phase === 'idle' || isPaused) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [phase, isPaused])

  const handlePhaseEnd = useCallback(() => {
    if (phase === 'work') {
      const newCount = pomodoroCount + 1
      setPomodoroCount(newCount)

      // Determine break type
      const isLongBreak = newCount % settings.longBreakInterval === 0
      const breakPhase: PomodoroPhase = isLongBreak ? 'longBreak' : 'shortBreak'
      const breakDuration = isLongBreak ? settings.longBreakDuration : settings.shortBreakDuration

      setPhase(breakPhase)
      setSecondsLeft(breakDuration * 60)
      setShowBreakOverlay(true)
      onBreakStart?.()
    } else if (phase === 'shortBreak' || phase === 'longBreak') {
      // Break ended, start new work session
      setPhase('work')
      setSecondsLeft(settings.workDuration * 60)
      setShowBreakOverlay(false)
      onBreakEnd?.()
    }
  }, [phase, pomodoroCount, settings, onBreakStart, onBreakEnd])

  // Handle phase transitions when timer reaches 0
  useEffect(() => {
    if (secondsLeft === 0 && phase !== 'idle') {
      handlePhaseEnd()
    }
  }, [secondsLeft, phase, handlePhaseEnd])

  const startPomodoro = () => {
    setPhase('work')
    setSecondsLeft(settings.workDuration * 60)
    setPomodoroCount(0)
    setIsPaused(false)
    setShowBreakOverlay(false)
  }

  const stopPomodoro = () => {
    setPhase('idle')
    setSecondsLeft(0)
    setIsPaused(false)
    setShowBreakOverlay(false)
    if (phase === 'shortBreak' || phase === 'longBreak') {
      onBreakEnd?.()
    }
  }

  const skipBreak = () => {
    setPhase('work')
    setSecondsLeft(settings.workDuration * 60)
    setShowBreakOverlay(false)
    setIsPaused(false)
    onBreakEnd?.()
  }

  const togglePause = () => {
    setIsPaused(prev => !prev)
  }



  // Calculate progress for the ring
  const totalDuration =
    phase === 'work' ? settings.workDuration * 60
    : phase === 'shortBreak' ? settings.shortBreakDuration * 60
    : phase === 'longBreak' ? settings.longBreakDuration * 60
    : 0

  const progress = totalDuration > 0 ? ((totalDuration - secondsLeft) / totalDuration) : 0
  const circumference = 2 * Math.PI * 18 // radius = 18
  const strokeDashoffset = circumference * (1 - progress)

  const phaseColor = phase === 'work' ? 'brand' : phase === 'shortBreak' ? 'emerald' : phase === 'longBreak' ? 'violet' : 'slate'
  const phaseLabel = phase === 'work' ? 'Focus' : phase === 'shortBreak' ? 'Short Break' : phase === 'longBreak' ? 'Long Break' : ''

  return (
    <>
      {/* Compact Timer Widget in Nav */}
      <div className="relative flex items-center gap-2">
        {phase === 'idle' ? (
          /* Start button */
          <button
            onClick={startPomodoro}
            className="group flex items-center gap-1.5 bg-surface-900 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            title="Start Pomodoro Timer"
          >
            <Timer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pomodoro</span>
          </button>
        ) : (
          /* Active timer display */
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center w-9 h-9">
              {/* Progress ring */}
              <svg className="absolute inset-0 w-9 h-9 -rotate-90" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2"
                  className="text-white/5" />
                <circle cx="20" cy="20" r="18" fill="none" strokeWidth="2.5"
                  strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className={`transition-all duration-1000 ${
                    phase === 'work' ? 'text-brand-400' : phase === 'shortBreak' ? 'text-emerald-400' : 'text-violet-400'
                  }`}
                  stroke="currentColor" />
              </svg>
              {/* Phase icon */}
              {phase === 'work' ? (
                <Timer className="w-3.5 h-3.5 text-brand-400 relative z-10" />
              ) : (
                <Coffee className={`w-3.5 h-3.5 relative z-10 ${phase === 'shortBreak' ? 'text-emerald-400' : 'text-violet-400'}`} />
              )}
            </div>

            <div className="flex flex-col items-start">
              <span className={`font-mono text-xs font-bold leading-none ${
                phase === 'work' ? 'text-brand-400' : phase === 'shortBreak' ? 'text-emerald-400' : 'text-violet-400'
              }`}>
                {formatTimer(secondsLeft)}
              </span>
              <span className="text-[9px] text-slate-500 font-medium leading-none mt-0.5">
                {phaseLabel} · #{pomodoroCount + (phase === 'work' ? 1 : 0)}
              </span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-0.5 ml-1">
              <button onClick={togglePause} className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/5 transition-colors" title={isPaused ? 'Resume' : 'Pause'}>
                {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              </button>
              <button onClick={stopPomodoro} className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Stop">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}


      </div>

      {/* Break Overlay */}
      {showBreakOverlay && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center animate-fade-in backdrop-blur-md">
          <div className="flex flex-col items-center text-center max-w-md px-6">
            {/* Animated break icon */}
            <div className="relative mb-8">
              <div className={`w-32 h-32 rounded-full flex items-center justify-center ${
                phase === 'shortBreak'
                  ? 'bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border-2 border-emerald-500/30'
                  : 'bg-gradient-to-br from-violet-500/20 to-purple-600/20 border-2 border-violet-500/30'
              }`}>
                {/* Progress ring */}
                <svg className="absolute inset-0 w-32 h-32 -rotate-90" viewBox="0 0 128 128">
                  <circle cx="64" cy="64" r="60" fill="none" stroke="currentColor" strokeWidth="3"
                    className="text-white/5" />
                  <circle cx="64" cy="64" r="60" fill="none" strokeWidth="4"
                    strokeDasharray={2 * Math.PI * 60}
                    strokeDashoffset={2 * Math.PI * 60 * (1 - progress)}
                    strokeLinecap="round"
                    className={`transition-all duration-1000 ${
                      phase === 'shortBreak' ? 'text-emerald-400' : 'text-violet-400'
                    }`}
                    stroke="currentColor" />
                </svg>
                <Coffee className={`w-14 h-14 relative z-10 ${
                  phase === 'shortBreak' ? 'text-emerald-400' : 'text-violet-400'
                }`} />
              </div>
              {/* Pulsing glow */}
              <div className={`absolute inset-0 w-32 h-32 rounded-full animate-pulse ${
                phase === 'shortBreak' ? 'bg-emerald-500/10' : 'bg-violet-500/10'
              }`} />
            </div>

            <h2 className="text-3xl font-bold text-white mb-2">
              {phase === 'shortBreak' ? 'Short Break' : 'Long Break'}
            </h2>
            <p className="text-slate-400 text-sm mb-2">
              {phase === 'shortBreak'
                ? 'Take a moment to rest your eyes and stretch.'
                : `Great work! You've completed ${pomodoroCount} focus sessions. Take a longer break.`}
            </p>
            <p className="text-slate-500 text-xs mb-8">
              Pomodoro #{pomodoroCount} complete
            </p>

            {/* Timer display */}
            <div className={`text-6xl font-mono font-bold mb-8 ${
              phase === 'shortBreak' ? 'text-emerald-400' : 'text-violet-400'
            }`}>
              {formatTimer(secondsLeft)}
            </div>

            {/* Controls */}
            <div className="flex gap-4">
              <button
                onClick={skipBreak}
                className="px-6 py-3 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 transition-all font-semibold text-sm flex items-center gap-2"
              >
                <SkipForward className="w-4 h-4" /> Skip Break
              </button>
              <button
                onClick={togglePause}
                className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                  phase === 'shortBreak'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/25'
                    : 'bg-violet-500 hover:bg-violet-400 text-white shadow-lg shadow-violet-500/25'
                }`}
              >
                {isPaused ? <><Play className="w-4 h-4" /> Resume</> : <><Pause className="w-4 h-4" /> Pause</>}
              </button>
            </div>

            {/* Stop session */}
            <button
              onClick={stopPomodoro}
              className="mt-4 text-xs text-slate-600 hover:text-slate-400 font-bold transition-colors"
            >
              End Pomodoro Session
            </button>
          </div>
        </div>
      )}
    </>
  )
})

export default PomodoroTimer
