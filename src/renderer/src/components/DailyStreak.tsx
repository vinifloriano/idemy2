import React, { useState, useEffect } from 'react'
import { ArrowLeft, Flame, Trophy, Clock, Calendar as CalendarIcon, TrendingUp } from 'lucide-react'
import { ActivityLog } from '../../../shared/types'

interface DailyStreakProps {
  onBack: () => void
}

const DailyStreak: React.FC<DailyStreakProps> = ({ onBack }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [streakData, setStreakData] = useState({ streak: 0, secondsToday: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      const activityLogs = await window.api.getActivityLog()
      const streakInfo = await window.api.getDailyStreak()
      setLogs(activityLogs)
      setStreakData(streakInfo)
      setLoading(false)
    }
    loadData()
  }, [])

  const formatDate = (date: Date) => date.toISOString().split('T')[0]

  const getIntensity = (seconds: number) => {
    if (seconds === 0) return 'bg-white/5'
    if (seconds < 600) return 'bg-brand-500/20' // < 10m
    if (seconds < 1800) return 'bg-brand-500/40' // < 30m
    if (seconds < 3600) return 'bg-brand-500/70' // < 1h
    return 'bg-brand-500' // > 1h
  }

  // Generate last 105 days (15 weeks) for the heatmap
  const generateHeatmapDays = () => {
    const days: { date: string, seconds: number, completed: number }[] = []
    const now = new Date()
    for (let i = 104; i >= 0; i--) {
      const d = new Date()
      d.setDate(now.getDate() - i)
      const dateStr = formatDate(d)
      const log = logs.find(l => l.date === dateStr)
      days.push({
        date: dateStr,
        seconds: log?.seconds_watched || 0,
        completed: log?.courses_completed || 0
      })
    }
    return days
  }

  const heatmapDays = generateHeatmapDays()
  
  const totalMinutes = Math.round(logs.reduce((acc, curr) => acc + curr.seconds_watched, 0) / 60)
  const totalCompleted = logs.reduce((acc, curr) => acc + curr.courses_completed, 0)
  const avgMinutes = logs.length > 0 ? Math.round(totalMinutes / logs.length) : 0

  if (loading) return <div className="flex-1 flex items-center justify-center text-slate-400">Loading metrics...</div>

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar p-6 lg:p-10 animate-fade-in">
      <div className="max-w-6xl mx-auto w-full">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
          <span className="font-bold text-sm">Back to Dashboard</span>
        </button>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl lg:text-5xl font-black text-white mb-3">Your Journey</h1>
            <p className="text-slate-400 text-lg">Consistency is the key to mastering new skills.</p>
          </div>

          <div className="flex items-center gap-4 bg-surface-800 border border-white/5 p-2 rounded-2xl">
             <div className="flex items-center gap-3 px-6 py-3 bg-brand-500/10 rounded-xl border border-brand-500/20">
                <Flame className={`w-8 h-8 ${streakData.streak > 0 ? 'text-orange-500 animate-pulse' : 'text-slate-600'}`} />
                <div>
                   <div className="text-2xl font-black text-white leading-none">{streakData.streak}</div>
                   <div className="text-[10px] font-bold text-brand-400 uppercase tracking-wider">Day Streak</div>
                </div>
             </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-surface-800 border border-white/5 rounded-3xl p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Clock className="w-24 h-24 text-white" />
            </div>
            <div className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-4">Learning Time</div>
            <div className="text-4xl font-black text-white mb-2">{totalMinutes} <span className="text-lg font-bold text-slate-500">min</span></div>
            <div className="text-sm text-slate-400">Total time spent watching courses</div>
          </div>

          <div className="bg-surface-800 border border-white/5 rounded-3xl p-8 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Trophy className="w-24 h-24 text-white" />
            </div>
            <div className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-4">Courses Finished</div>
            <div className="text-4xl font-black text-white mb-2">{totalCompleted} <span className="text-lg font-bold text-slate-500">courses</span></div>
            <div className="text-sm text-slate-400">Knowledge expansion milestone</div>
          </div>

          <div className="bg-surface-800 border border-white/5 rounded-3xl p-8 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingUp className="w-24 h-24 text-white" />
            </div>
            <div className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-4">Daily Average</div>
            <div className="text-4xl font-black text-white mb-2">{avgMinutes} <span className="text-lg font-bold text-slate-500">min</span></div>
            <div className="text-sm text-slate-400">Consistent daily learning pace</div>
          </div>
        </div>

        {/* Heatmap Section */}
        <div className="bg-surface-800 border border-white/5 rounded-3xl p-8 mb-12">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <CalendarIcon className="w-5 h-5 text-brand-400" />
              <h2 className="text-xl font-bold text-white">Activity Heatmap</h2>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
              <span>Less</span>
              <div className="w-3 h-3 rounded-sm bg-white/5"></div>
              <div className="w-3 h-3 rounded-sm bg-brand-500/20"></div>
              <div className="w-3 h-3 rounded-sm bg-brand-500/40"></div>
              <div className="w-3 h-3 rounded-sm bg-brand-500/70"></div>
              <div className="w-3 h-3 rounded-sm bg-brand-500"></div>
              <span>More</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 justify-center">
            {heatmapDays.map((day) => (
              <div 
                key={day.date}
                title={`${day.date}: ${Math.round(day.seconds / 60)}m watched, ${day.completed} completed`}
                className={`w-4 h-4 md:w-5 md:h-5 rounded-[4px] ${getIntensity(day.seconds)} transition-all hover:scale-125 cursor-help relative group`}
              >
                {day.completed > 0 && (
                   <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full border border-surface-800"></div>
                )}
              </div>
            ))}
          </div>
          
          <div className="mt-8 flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest px-4">
             <span>~4 Months Ago</span>
             <span>Today</span>
          </div>
        </div>

        {/* Detailed Daily Breakdown (Last 7 Days) */}
        <div className="bg-surface-800 border border-white/5 rounded-3xl overflow-hidden">
           <div className="px-8 py-6 border-b border-white/5 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-brand-400" />
              <h2 className="text-xl font-bold text-white">Recent Activity</h2>
           </div>
           <div className="divide-y divide-white/5">
              {heatmapDays.slice(-7).reverse().map(day => (
                 <div key={day.date} className="px-8 py-5 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div className="flex flex-col">
                       <span className="text-sm font-bold text-white">{new Date(day.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                       <span className="text-xs text-slate-500 font-mono">{day.date}</span>
                    </div>
                    <div className="flex items-center gap-12">
                       <div className="flex flex-col items-end">
                          <span className="text-sm font-black text-brand-400">{Math.round(day.seconds / 60)} min</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Watched</span>
                       </div>
                       <div className="flex flex-col items-end min-w-[80px]">
                          <span className="text-sm font-black text-yellow-500">{day.completed}</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Finished</span>
                       </div>
                    </div>
                 </div>
              ))}
           </div>
        </div>
      </div>
      
      <div className="h-20 shrink-0"></div>
    </div>
  )
}

export default DailyStreak
