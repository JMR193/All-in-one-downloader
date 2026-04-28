import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { createServer as createViteServer } from 'vite';
import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from 'ffmpeg-static';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (ffmpegInstaller) {
  ffmpeg.setFfmpegPath(ffmpegInstaller);
}

const PORT = 3000;
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const TASKS_FILE = path.join(__dirname, 'tasks.json');

// Ensure downloads directory exists
await fs.ensureDir(DOWNLOADS_DIR);
if (!await fs.pathExists(TASKS_FILE)) {
  await fs.writeJson(TASKS_FILE, []);
}

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

let tasks: DownloadTask[] = await fs.readJson(TASKS_FILE);

async function saveTasks() {
  await fs.writeJson(TASKS_FILE, tasks);
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    }
  });

  app.use(express.json());

  // API Routes
  app.get('/api/tasks', (req, res) => {
    res.json(tasks);
  });

  app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    try {
      if (!ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }
      const info = await ytdl.getBasicInfo(url);
      res.json({
        title: info.videoDetails.title,
        thumbnail: info.videoDetails.thumbnails[0]?.url,
        duration: info.videoDetails.lengthSeconds,
        author: info.videoDetails.author.name
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch video info' });
    }
  });

  app.post('/api/download', async (req, res) => {
    const { url, format } = req.body;
    
    try {
      if (!ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }

      const info = await ytdl.getBasicInfo(url);
      const taskId = uuidv4();
      
      const newTask: DownloadTask = {
        id: taskId,
        url,
        status: 'pending',
        progress: 0,
        title: info.videoDetails.title,
        thumbnail: info.videoDetails.thumbnails[0]?.url,
        format: format === 'mp3' ? 'mp3' : 'mp4',
        createdAt: Date.now(),
      };

      tasks.push(newTask);
      await saveTasks();
      
      res.json({ taskId });
      
      // Start background process
      startDownload(taskId);
      
    } catch (error) {
      res.status(500).json({ error: 'Failed to start download' });
    }
  });

  app.get('/api/download/:id', async (req, res) => {
    const task = tasks.find(t => t.id === req.params.id);
    if (!task || task.status !== 'completed' || !task.fileName) {
      return res.status(404).send('File not found');
    }
    
    const filePath = path.join(DOWNLOADS_DIR, task.fileName);
    if (await fs.pathExists(filePath)) {
      res.download(filePath, task.fileName);
    } else {
      res.status(404).send('File missing from disk');
    }
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    const index = tasks.findIndex(t => t.id === req.params.id);
    if (index !== -1) {
      const task = tasks[index];
      if (task.fileName) {
        await fs.remove(path.join(DOWNLOADS_DIR, task.fileName)).catch(() => {});
      }
      tasks.splice(index, 1);
      await saveTasks();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Task not found' });
    }
  });

  app.post('/api/convert', async (req, res) => {
    const { taskId, targetFormat } = req.body;
    const task = tasks.find(t => t.id === taskId);

    if (!task || task.status !== 'completed' || !task.fileName) {
      return res.status(404).json({ error: 'Task not found or not ready' });
    }

    try {
      const inputPath = path.join(DOWNLOADS_DIR, task.fileName);
      const newId = uuidv4();
      const newFileName = `${newId}.${targetFormat}`;
      const outputPath = path.join(DOWNLOADS_DIR, newFileName);

      const newTask: DownloadTask = {
        id: newId,
        url: task.url,
        status: 'converting',
        progress: 0,
        title: `${task.title} (Converted to ${targetFormat.toUpperCase()})`,
        thumbnail: task.thumbnail,
        format: targetFormat as any,
        createdAt: Date.now(),
        fileName: newFileName
      };

      tasks.push(newTask);
      await saveTasks();
      res.json({ taskId: newId });

      ffmpeg(inputPath)
        .toFormat(targetFormat)
        .on('progress', (p) => {
          const t = tasks.find(it => it.id === newId);
          if (t) {
            t.progress = Math.round(p.percent || 0);
            io.emit('taskUpdate', t);
          }
        })
        .on('error', async (err) => {
          const t = tasks.find(it => it.id === newId);
          if (t) {
            t.status = 'failed';
            t.error = err.message;
            io.emit('taskUpdate', t);
            await saveTasks();
          }
        })
        .on('end', async () => {
          const t = tasks.find(it => it.id === newId);
          if (t) {
            t.status = 'completed';
            t.progress = 100;
            io.emit('taskUpdate', t);
            await saveTasks();
          }
        })
        .save(outputPath);

    } catch (error) {
      res.status(500).json({ error: 'Conversion failed' });
    }
  });

  async function startDownload(taskId: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    try {
      task.status = 'downloading';
      io.emit('taskUpdate', task);

      const fileName = `${task.id}.${task.format === 'mp3' ? 'mp3' : 'mp4'}`;
      const outputFilePath = path.join(DOWNLOADS_DIR, fileName);
      task.fileName = fileName;

      if (task.format === 'mp4') {
        const stream = ytdl(task.url, { quality: 'highestvideo' });
        stream.on('progress', (_, downloaded, total) => {
          task.progress = Math.round((downloaded / total) * 100);
          io.emit('taskUpdate', task);
        });

        const writeStream = fs.createWriteStream(outputFilePath);
        stream.pipe(writeStream);

        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });

      } else {
        // MP3 - download audio and convert
        const stream = ytdl(task.url, { quality: 'highestaudio' });
        
        await new Promise((resolve, reject) => {
          ffmpeg(stream)
            .audioBitrate(192)
            .toFormat('mp3')
            .on('progress', (p) => {
              task.progress = Math.round(p.percent || 0);
              io.emit('taskUpdate', task);
            })
            .on('error', (err) => {
              reject(err);
            })
            .on('end', () => {
              resolve(true);
            })
            .save(outputFilePath);
        });
      }

      task.status = 'completed';
      task.progress = 100;
      io.emit('taskUpdate', task);
      await saveTasks();

    } catch (error) {
      console.error('Download error:', error);
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      io.emit('taskUpdate', task);
      await saveTasks();
    }
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
