import React, { useState, useEffect } from 'react'
import { X, SquarePlay, Folder, Loader2, Download, CheckCircle2, AlertCircle } from 'lucide-react'

interface YoutubeImportModalProps {
  onClose: () => void
  onImportComplete: () => void
}

const YoutubeImportModal: React.FC<YoutubeImportModalProps> = ({ onClose, onImportComplete }) => {
  const [url, setUrl] = useState('')
  const [targetFolder, setTargetFolder] = useState('')
  const [isLoadingInfo, setIsLoadingInfo] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [info, setInfo] = useState<any>(null)
  const [progressMap, setProgressMap] = useState<Record<string, any>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cleanup = window.api.onYoutubeDownloadProgress((progress) => {
      setProgressMap(prev => ({
        ...prev,
        [progress.videoId]: progress
      }))
    })
    return () => cleanup()
  }, [])

  const fetchInfo = async () => {
    if (!url.trim()) return
    setIsLoadingInfo(true)
    setError(null)
    try {
      const data = await window.api.getYoutubeInfo(url)
      setInfo(data)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch YouTube info')
    } finally {
      setIsLoadingInfo(false)
    }
  }

  const selectFolder = async () => {
    const folder = await window.api.selectFolder()
    if (folder) {
      // In this app, selectFolder returns a full course object if scanned, 
      // but we just need the path. Let's assume selectFolder might need a path-only version
      // or we just use the root_path from the result.
      setTargetFolder((folder as any).root_path)
    }
  }

  const handleStartDownload = async () => {
    if (!info || !targetFolder) return
    setIsDownloading(true)
    setError(null)
    try {
      await window.api.downloadYoutubeCourse(info.items, targetFolder)
      // Once all done, we could wait a bit or auto-close
      setTimeout(() => {
        onImportComplete()
        onClose()
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Download failed')
      setIsDownloading(false)
    }
  }

  const totalItems = info?.items.length || 0
  const completedItems = Object.values(progressMap).filter(p => p.status === 'completed').length
  const overallPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="bg-surface-800 border border-white/10 rounded-3xl w-full max-w-2xl shadow-modal overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
              <SquarePlay className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white leading-tight">YouTube Importer</h2>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Experimental Feature</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400 font-medium">{error}</p>
            </div>
          )}

          {!info ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-300 mb-2">YouTube URL</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="https://www.youtube.com/playlist?list=..." 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 bg-surface-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-500 transition-all text-white shadow-inner"
                  />
                  <button 
                    onClick={fetchInfo}
                    disabled={isLoadingInfo || !url.trim()}
                    className="bg-white/5 hover:bg-white/10 text-white px-6 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  >
                    {isLoadingInfo ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Analyze'}
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-500">Supports single videos and full playlists. Higher quality streams will be automatically merged.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-8 animate-fade-in">
              <div className="p-6 rounded-2xl bg-surface-900 border border-white/5">
                <div className="text-xs font-bold text-brand-400 uppercase tracking-widest mb-2">{info.type}</div>
                <h3 className="text-lg font-bold text-white mb-4 leading-snug">{info.title}</h3>
                <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
                  <span>{info.items.length} Videos</span>
                  <div className="w-1 h-1 rounded-full bg-slate-700"></div>
                  <span className="flex items-center gap-1.5"><Download className="w-3 h-3" /> Highest Quality</span>
                </div>
              </div>

              {!isDownloading ? (
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2">Save Location</label>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-surface-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-400 truncate flex items-center gap-2">
                      <Folder className="w-4 h-4 shrink-0" />
                      {targetFolder || 'Select a folder to save your course...'}
                    </div>
                    <button 
                      onClick={selectFolder}
                      className="bg-white/5 hover:bg-white/10 text-white px-6 rounded-xl text-sm font-bold transition-all"
                    >
                      Browse
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-sm font-bold text-white">Overall Progress</span>
                      <span className="text-sm font-mono font-bold text-brand-400">{overallPercent}%</span>
                    </div>
                    <div className="h-2 w-full bg-surface-900 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="h-full bg-brand-500 transition-all duration-500 shadow-glow" 
                        style={{ width: `${overallPercent}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Download Queue</span>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                      {info.items.map((item: any) => {
                        const progress = progressMap[item.id]
                        return (
                          <div key={item.id} className="p-3 rounded-xl bg-surface-900/50 border border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              {progress?.status === 'completed' ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                              ) : progress?.status === 'downloading' ? (
                                <Loader2 className="w-4 h-4 text-brand-400 animate-spin shrink-0" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                              )}
                              <span className="text-xs text-slate-300 truncate font-medium">{item.title}</span>
                            </div>
                            <span className="text-[10px] font-bold font-mono text-slate-500 ml-4">
                              {progress?.status === 'completed' ? 'DONE' : progress ? `${Math.round(progress.percent)}%` : 'WAITING'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-surface-900/50 border-t border-white/5 flex justify-end gap-4">
          <button 
            onClick={onClose}
            disabled={isDownloading}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white transition-all disabled:opacity-0"
          >
            Cancel
          </button>
          
          {info && !isDownloading && (
            <button 
              onClick={handleStartDownload}
              disabled={!targetFolder}
              className="bg-brand-500 hover:bg-brand-400 text-white px-8 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-brand-500/20 disabled:opacity-50 disabled:grayscale"
            >
              Start Import
            </button>
          )}

          {!info && (
            <button 
               onClick={onClose}
               className="bg-white/5 hover:bg-white/10 text-white px-8 py-2.5 rounded-xl text-sm font-bold transition-all"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default YoutubeImportModal
