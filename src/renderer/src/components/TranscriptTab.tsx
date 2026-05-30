import React, { useState, useEffect } from 'react'
import { TranscriptSegment } from '../../../shared/types'
import { Loader2, Mic, Play } from 'lucide-react'

interface TranscriptTabProps {
  videoId: string | null
  videoPath: string | null
  onSeek: (time: number) => void
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const TranscriptTab: React.FC<TranscriptTabProps> = ({ videoId, videoPath, onSeek }) => {
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (videoId) {
      loadTranscript()
    }
  }, [videoId])

  const loadTranscript = async () => {
    if (!videoId) return
    try {
      const data = await window.api.getTranscript(videoId)
      setSegments(data)
    } catch (err) {
      console.error('Failed to load transcript:', err)
    }
  }

  const handleGenerate = async () => {
    if (!videoId || !videoPath) return
    setIsGenerating(true)
    setError(null)
    try {
      const data = await window.api.generateTranscript(videoId, videoPath)
      setSegments(data)
    } catch (err: any) {
      console.error('Generation failed:', err)
      setError(err.message || 'Failed to generate transcript.')
    } finally {
      setIsGenerating(false)
    }
  }

  if (!videoId) {
    return <div className="text-center py-10 text-slate-500 text-sm">Select a video to view transcript.</div>
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-4 gap-4 bg-surface-800">
      {segments.length === 0 && !isGenerating && !error && (
        <div className="flex flex-col items-center justify-center h-full text-center py-10">
          <Mic className="w-12 h-12 text-slate-600 mb-4" />
          <h3 className="text-white font-bold mb-2">No Transcript Available</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-[200px]">Use AI to generate an offline transcript for this video.</p>
          <button 
            onClick={handleGenerate}
            className="bg-brand-500 hover:bg-brand-400 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-all shadow-lg shadow-brand-500/20"
          >
            Generate Transcript
          </button>
        </div>
      )}

      {isGenerating && (
        <div className="flex flex-col items-center justify-center h-full text-center py-10">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin mb-4" />
          <h3 className="text-white font-bold mb-2">Processing Audio...</h3>
          <p className="text-brand-400 text-xs font-mono bg-brand-500/10 px-3 py-1 rounded">Offline Whisper Model</p>
          <p className="text-slate-500 text-xs mt-4 max-w-[200px]">This uses your CPU and may take a moment depending on video length.</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="mt-3 text-xs font-bold text-slate-400 hover:text-white">Dismiss</button>
        </div>
      )}

      {segments.length > 0 && (
        <div className="flex flex-col gap-2">
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
      )}
    </div>
  )
}

export default TranscriptTab