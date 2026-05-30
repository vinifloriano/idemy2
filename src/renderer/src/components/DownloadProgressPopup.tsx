import React, { useState, useEffect } from 'react'
import { X, Loader2, Download, CheckCircle2, AlertCircle, Trash2, Clock } from 'lucide-react'

interface DownloadTask {
  videoId: string
  title: string
  percent: number
  status: 'queued' | 'downloading' | 'completed' | 'error' | 'cancelled'
  error?: string
}

const DownloadProgressPopup: React.FC = () => {
  const [tasks, setTasks] = useState<Record<string, DownloadTask>>({})
  const [isOpen, setIsOpen] = useState(true)

  useEffect(() => {
    const cleanup = window.api.onYoutubeDownloadProgress((progress: any) => {
      setTasks(prev => ({
        ...prev,
        [progress.videoId]: {
          ...prev[progress.videoId],
          ...progress
        }
      }))
    })
    return () => cleanup()
  }, [])

  const taskList = Object.values(tasks)
  if (taskList.length === 0) return null

  const activeTasks = taskList.filter(t => t.status === 'downloading' || t.status === 'queued')
  const downloadingCount = taskList.filter(t => t.status === 'downloading').length

  const handleCancelTask = (videoId: string) => {
    window.api.cancelDownload(videoId)
    setTasks(prev => {
      const next = { ...prev }
      delete next[videoId]
      return next
    })
  }

  const handleCancelAll = () => {
    window.api.cancelAllDownloads()
    setTasks(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => {
        if (next[id].status !== 'completed') delete next[id]
      })
      return next
    })
  }

  const clearFinished = () => {
    setTasks(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => {
        if (next[id].status !== 'downloading' && next[id].status !== 'queued') delete next[id]
      })
      return next
    })
  }

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-brand-500 text-white p-4 rounded-full shadow-2xl z-[150] flex items-center gap-2 hover:bg-brand-400 transition-all animate-bounce"
      >
        <Download className="w-5 h-5" />
        <span className="text-sm font-bold">{activeTasks.length} Downloads</span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 w-80 bg-surface-800 border border-white/10 rounded-2xl shadow-modal z-[150] overflow-hidden flex flex-col animate-slide-up">
      <div className="px-4 py-3 bg-surface-900/50 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-brand-400" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Downloads</span>
          {activeTasks.length > 0 && (
            <span className="bg-brand-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-pulse">
              {activeTasks.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clearFinished} title="Clear Finished" className="p-1.5 hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {taskList.length === 0 && (
          <div className="py-8 text-center text-slate-500 text-xs font-medium">No active downloads</div>
        )}
        
        {taskList.map(task => (
          <div key={task.videoId} className="p-3 rounded-xl bg-surface-900/50 border border-white/5 space-y-2 group">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {task.status === 'completed' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                ) : task.status === 'downloading' ? (
                  <Loader2 className="w-3.5 h-3.5 text-brand-400 animate-spin shrink-0" />
                ) : task.status === 'queued' ? (
                  <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                )}
                <span className="text-[11px] text-slate-200 font-medium truncate" title={task.title}>{task.title}</span>
              </div>
              
              {(task.status === 'downloading' || task.status === 'queued') && (
                <button 
                  onClick={() => handleCancelTask(task.videoId)}
                  className="p-1 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-all opacity-0 group-hover:opacity-100"
                  title="Cancel"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {task.status === 'downloading' && (
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-mono text-slate-500">
                  <span>Downloading...</span>
                  <span>{Math.round(task.percent)}%</span>
                </div>
                <div className="h-1 w-full bg-surface-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-brand-500 transition-all duration-300" 
                    style={{ width: `${task.percent}%` }}
                  />
                </div>
              </div>
            )}

            {task.status === 'queued' && (
              <div className="text-[9px] text-slate-500 font-medium italic italic">In queue...</div>
            )}

            {task.status === 'error' && (
              <div className="text-[9px] text-red-400 font-medium leading-tight">{task.error}</div>
            )}
            
            {task.status === 'cancelled' && (
              <div className="text-[9px] text-slate-500 font-medium">Download cancelled</div>
            )}
          </div>
        ))}
      </div>

      {activeTasks.length > 0 && (
        <div className="p-3 bg-surface-900/30 border-t border-white/5">
          <button 
            onClick={handleCancelAll}
            className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all border border-red-500/20"
          >
            Cancel All Downloads
          </button>
        </div>
      )}
    </div>
  )
}

export default DownloadProgressPopup
