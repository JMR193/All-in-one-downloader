import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Download, 
  Music, 
  Video, 
  Trash2, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Search,
  History,
  Info
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface DownloadTask {
  id: string;
  url: string;
  status: 'pending' | 'downloading' | 'converting' | 'completed' | 'failed';
  progress: number;
  title: string;
  thumbnail: string;
  format: 'mp3' | 'mp4';
  fileName?: string;
  error?: string;
  createdAt: number;
}

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  author: string;
}

export default function App() {
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [format, setFormat] = useState<'mp3' | 'mp4'>('mp4');

  useEffect(() => {
    const s = io();
    setSocket(s);

    s.on('taskUpdate', (updatedTask: DownloadTask) => {
      setTasks(prev => {
        const index = prev.findIndex(t => t.id === updatedTask.id);
        if (index === -1) return [updatedTask, ...prev];
        const newTasks = [...prev];
        newTasks[index] = updatedTask;
        return newTasks;
      });
    });

    fetchTasks();

    return () => {
      s.disconnect();
    };
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data.reverse());
    } catch (err) {
      console.error('Failed to fetch tasks');
    }
  };

  const handleInfo = async () => {
    if (!url) return;
    setLoadingInfo(true);
    setVideoInfo(null);
    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setVideoInfo(data);
    } catch (err) {
      console.error(err);
      alert('Failed to get video info. Make sure it is a valid YouTube URL.');
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleDownload = async () => {
    if (!url) return;
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUrl('');
      setVideoInfo(null);
      // Task will be added via socket event
    } catch (err) {
      console.error(err);
      alert('Failed to start download.');
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleConvert = async (taskId: string, targetFormat: string) => {
    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, targetFormat })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (err) {
      console.error(err);
      alert('Failed to start conversion.');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] selection:bg-blue-100 font-sans">
      <header className="max-w-4xl mx-auto pt-12 pb-8 px-6">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-2"
        >
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center shadow-lg">
            <Download className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">OmniDL</h1>
            <p className="text-sm font-medium text-gray-400 uppercase tracking-widest">Media Converter & Downloader</p>
          </div>
        </motion.div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pb-20">
        {/* Input Section */}
        <section className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 mb-10 transition-shadow hover:shadow-md">
          <div className="flex flex-col gap-6">
            <div className="relative group">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste YouTube video link here..."
                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl py-4 pl-14 pr-4 transition-all outline-none text-lg font-medium"
                onKeyDown={(e) => e.key === 'Enter' && handleInfo()}
              />
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors" />
              {loadingInfo && (
                <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex bg-gray-100 p-1.5 rounded-xl">
                <button
                  onClick={() => setFormat('mp4')}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${format === 'mp4' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}
                >
                  <Video className="w-4 h-4" /> MP4 Video
                </button>
                <button
                  onClick={() => setFormat('mp3')}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${format === 'mp3' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}
                >
                  <Music className="w-4 h-4" /> MP3 Audio
                </button>
              </div>

              {!videoInfo ? (
                <button
                  onClick={handleInfo}
                  disabled={!url || loadingInfo}
                  className="bg-black text-white px-10 py-3.5 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors shadow-lg shadow-black/10 active:scale-95"
                >
                  Analyze Link
                </button>
              ) : (
                <button
                  onClick={handleDownload}
                  className="bg-blue-600 text-white px-10 py-3.5 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 active:scale-95"
                >
                  Download {format.toUpperCase()}
                </button>
              )}
            </div>
          </div>

          <AnimatePresence>
            {videoInfo && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden bg-gray-50 rounded-2xl p-5 flex gap-6"
              >
                <div className="relative flex-shrink-0">
                  <img src={videoInfo.thumbnail} alt="" className="w-48 h-28 object-cover rounded-xl shadow-md" />
                  <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                    {formatDuration(videoInfo.duration)}
                  </span>
                </div>
                <div className="flex flex-col justify-center gap-1">
                  <h3 className="font-bold text-lg leading-tight line-clamp-2">{videoInfo.title}</h3>
                  <p className="text-gray-500 font-medium flex items-center gap-1 text-sm">
                    {videoInfo.author}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Tasks Section */}
        <div className="flex items-center gap-2 mb-6 ml-2">
          <History className="w-5 h-5 text-gray-400" />
          <h2 className="text-xl font-bold tracking-tight">Recent Activity</h2>
        </div>

        <div className="grid gap-4">
          <AnimatePresence mode="popLayout">
            {tasks.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white/50 border-2 border-dashed border-gray-200 rounded-[32px] p-20 flex flex-col items-center justify-center text-gray-400"
              >
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Info className="w-8 h-8" />
                </div>
                <p className="font-medium">No active or recent downloads</p>
                <p className="text-sm">Paste a link above to get started</p>
              </motion.div>
            ) : (
              tasks.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-white rounded-[24px] p-4 shadow-sm border border-gray-100 flex items-center gap-4 group hover:shadow-md transition-shadow"
                >
                  <div className="relative w-24 h-14 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                    <img src={task.thumbnail} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {task.format === 'mp3' ? <Music className="text-white w-4 h-4" /> : <Video className="text-white w-4 h-4" />}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4 mb-1">
                      <h4 className="font-bold text-sm truncate pr-10">{task.title}</h4>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                          title="Remove record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${task.progress}%` }}
                          className={`h-full transition-all duration-500 ${
                            task.status === 'failed' ? 'bg-red-500' : 
                            task.status === 'completed' ? 'bg-green-500' : 'bg-blue-600'
                          }`}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 w-8 text-right">
                        {task.progress}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-2">
                        {task.status === 'downloading' && (
                          <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-blue-600 animate-pulse">
                            <Download className="w-3 h-3" /> Downloading...
                          </span>
                        )}
                        {task.status === 'converting' && (
                          <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-purple-600 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" /> Converting...
                          </span>
                        )}
                        {task.status === 'completed' && (
                          <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-green-600">
                            <CheckCircle2 className="w-3 h-3" /> Ready
                          </span>
                        )}
                        {task.status === 'failed' && (
                          <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-red-600">
                            <AlertCircle className="w-3 h-3" /> Failed
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 font-bold uppercase">{task.format}</span>
                      </div>
                      
                      {task.status === 'completed' && (
                        <div className="flex items-center gap-4">
                          <div className="relative group/convert">
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleConvert(task.id, e.target.value);
                                  e.target.value = "";
                                }
                              }}
                              className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded cursor-pointer outline-none hover:bg-gray-200"
                            >
                              <option value="">Convert To...</option>
                              <option value="mp3">MP3 Audio</option>
                              <option value="mp4">MP4 Video</option>
                              <option value="mkv">MKV Video</option>
                              <option value="avi">AVI Video</option>
                              <option value="mov">MOV Video</option>
                            </select>
                          </div>
                          <a
                            href={`/api/download/${task.id}`}
                            download
                            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                          >
                            Save File <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
