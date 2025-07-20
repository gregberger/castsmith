#!/usr/bin/env node

import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import fs from 'fs-extra';
import path from 'path';
import { logger } from './utils/logger.js';
import { DriveWatcher } from './services/driveWatcher.js';
import { ProcessingQueue } from './services/processingQueue.js';
import { regenerateEpisode } from '../debug-tools/regenerate-episode.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const driveWatcher = new DriveWatcher();
const processingQueue = new ProcessingQueue();

// Express middleware
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Status endpoint
app.get('/status', async (req, res) => {
  const status = {
    queue: await processingQueue.getStatus(),
    lastCheck: driveWatcher.getLastCheckTime(),
    uptime: process.uptime()
  };
  res.json(status);
});

// Manual trigger endpoint
app.post('/trigger', async (req, res) => {
  try {
    logger.info('Manual trigger requested');
    await driveWatcher.checkForNewFiles();
    res.json({ message: 'Check initiated' });
  } catch (error) {
    logger.error('Manual trigger failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Episode management endpoints
app.get('/episodes', async (req, res) => {
  try {
    const episodes = await getAvailableEpisodes();
    res.json(episodes);
  } catch (error) {
    logger.error('Failed to get episodes:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/episodes/:number', async (req, res) => {
  try {
    const episodeNumber = parseInt(req.params.number);
    const episodeData = await getEpisodeData(episodeNumber);
    res.json(episodeData);
  } catch (error) {
    logger.error(`Failed to get episode ${req.params.number}:`, error);
    res.status(404).json({ error: error.message });
  }
});

app.post('/episodes/:number/regenerate', async (req, res) => {
  try {
    const episodeNumber = parseInt(req.params.number);
    logger.info(`Regenerating episode ${episodeNumber} markdown`);
    
    const result = await regenerateEpisode(episodeNumber);
    
    logger.info(`Successfully regenerated episode ${episodeNumber}`);
    res.json({
      success: true,
      episode: result
    });
  } catch (error) {
    logger.error(`Failed to regenerate episode ${req.params.number}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Web interface
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>CastSmith - Episode Manager</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-bottom: 30px; }
        .episode-card { border: 1px solid #ddd; padding: 20px; margin: 15px 0; border-radius: 6px; background: #fafafa; }
        .episode-title { font-size: 18px; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
        .episode-meta { color: #666; font-size: 14px; margin-bottom: 15px; }
        .btn { padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; }
        .btn:hover { background: #2980b9; }
        .btn-success { background: #27ae60; }
        .btn-success:hover { background: #229954; }
        .status { margin: 20px 0; padding: 15px; border-radius: 4px; }
        .status.loading { background: #f39c12; color: white; }
        .status.success { background: #27ae60; color: white; }
        .status.error { background: #e74c3c; color: white; }
        .hidden { display: none; }
        pre { background: #2c3e50; color: #ecf0f1; padding: 20px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔨 CastSmith - Episode Manager</h1>
        
        <div id="status" class="status hidden"></div>
        
        <div style="margin-bottom: 30px;">
            <button class="btn" onclick="loadEpisodes()">🔄 Refresh Episodes</button>
            <button class="btn" onclick="checkStatus()">📊 System Status</button>
        </div>
        
        <div id="episodes-container">
            <p>Loading episodes...</p>
        </div>
        
        <div id="markdown-preview" class="hidden">
            <h3>Generated Markdown Preview</h3>
            <pre id="markdown-content"></pre>
        </div>
    </div>

    <script>
        let episodes = [];

        async function loadEpisodes() {
            try {
                showStatus('Loading episodes...', 'loading');
                const response = await fetch('/episodes');
                episodes = await response.json();
                renderEpisodes();
                showStatus(\`Loaded \${episodes.length} episodes\`, 'success');
                setTimeout(hideStatus, 3000);
            } catch (error) {
                showStatus('Failed to load episodes: ' + error.message, 'error');
            }
        }

        function renderEpisodes() {
            const container = document.getElementById('episodes-container');
            
            if (episodes.length === 0) {
                container.innerHTML = '<p>No episodes found in ./generated/ directory</p>';
                return;
            }

            container.innerHTML = episodes.map(episode => \`
                <div class="episode-card">
                    <div class="episode-title">Episode \${episode.number}: \${episode.title || 'Untitled'}</div>
                    <div class="episode-meta">
                        📊 \${episode.stats.tracks} tracks, \${episode.stats.events} events, \${episode.stats.guests} guests | 
                        ⏱️ \${episode.stats.duration} | 
                        📝 \${episode.stats.hasMonologue ? 'Has monologue' : 'No monologue'}
                    </div>
                    <button class="btn btn-success" onclick="regenerateEpisode(\${episode.number})">
                        🔄 Regenerate Markdown
                    </button>
                    <button class="btn" onclick="viewEpisode(\${episode.number})">
                        👁️ View Details
                    </button>
                </div>
            \`).join('');
        }

        async function regenerateEpisode(episodeNumber) {
            try {
                showStatus(\`Regenerating episode \${episodeNumber}...\`, 'loading');
                
                const response = await fetch(\`/episodes/\${episodeNumber}/regenerate\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showStatus(\`✅ Episode \${episodeNumber} regenerated successfully!\`, 'success');
                    
                    // Show markdown preview
                    document.getElementById('markdown-content').textContent = result.episode.markdownContent;
                    document.getElementById('markdown-preview').classList.remove('hidden');
                } else {
                    showStatus('Regeneration failed: ' + result.error, 'error');
                }
            } catch (error) {
                showStatus('Failed to regenerate: ' + error.message, 'error');
            }
        }

        async function viewEpisode(episodeNumber) {
            try {
                const response = await fetch(\`/episodes/\${episodeNumber}\`);
                const episode = await response.json();
                
                alert(\`Episode \${episodeNumber} Details:\\n\\n\` +
                     \`Title: \${episode.title}\\n\` +
                     \`Tracks: \${episode.stats.tracks}\\n\` +
                     \`Events: \${episode.stats.events}\\n\` +
                     \`Guests: \${episode.stats.guests}\\n\` +
                     \`Duration: \${episode.stats.duration}\\n\` +
                     \`Has Monologue: \${episode.stats.hasMonologue}\`);
            } catch (error) {
                showStatus('Failed to load episode details: ' + error.message, 'error');
            }
        }

        async function checkStatus() {
            try {
                const response = await fetch('/status');
                const status = await response.json();
                
                alert(\`System Status:\\n\\n\` +
                     \`Queue Length: \${status.queue.queueLength}\\n\` +
                     \`Processing: \${status.queue.processing}\\n\` +
                     \`Last Check: \${new Date(status.lastCheck).toLocaleString()}\\n\` +
                     \`Uptime: \${Math.round(status.uptime / 60)} minutes\`);
            } catch (error) {
                showStatus('Failed to get status: ' + error.message, 'error');
            }
        }

        function showStatus(message, type) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = \`status \${type}\`;
            status.classList.remove('hidden');
        }

        function hideStatus() {
            document.getElementById('status').classList.add('hidden');
        }

        // Load episodes on page load
        loadEpisodes();
    </script>
</body>
</html>
  `);
});

// Helper functions
async function getAvailableEpisodes() {
  const generatedDir = './generated';
  
  if (!await fs.pathExists(generatedDir)) {
    return [];
  }
  
  const episodes = [];
  const dirs = await fs.readdir(generatedDir);
  
  for (const dir of dirs) {
    if (dir.startsWith('episode-')) {
      const episodeNumber = parseInt(dir.replace('episode-', ''));
      const episodeData = await getEpisodeData(episodeNumber);
      episodes.push(episodeData);
    }
  }
  
  return episodes.sort((a, b) => b.number - a.number);
}

async function getEpisodeData(episodeNumber) {
  const episodeDir = `./generated/episode-${episodeNumber.toString().padStart(2, '0')}`;
  
  if (!await fs.pathExists(episodeDir)) {
    throw new Error(`Episode ${episodeNumber} not found`);
  }
  
  // Load extracted content
  const extractedContentPath = path.join(episodeDir, 'extracted-content.json');
  let extractedContent = { title: 'Unknown', tracks: [], events: [], guests: [] };
  
  if (await fs.pathExists(extractedContentPath)) {
    extractedContent = await fs.readJson(extractedContentPath);
  }
  
  // Load processing metadata
  const metadataPath = path.join(episodeDir, 'processing-metadata.json');
  let metadata = {};
  
  if (await fs.pathExists(metadataPath)) {
    metadata = await fs.readJson(metadataPath);
  }
  
  return {
    number: episodeNumber,
    title: extractedContent.title,
    stats: {
      tracks: extractedContent.tracks?.length || 0,
      events: extractedContent.events?.length || 0,
      guests: extractedContent.guests?.length || 0,
      duration: extractedContent.duration || 'Unknown',
      hasMonologue: !!extractedContent.openingMonologue
    },
    metadata
  };
}

// Schedule automatic checks every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  logger.info('Scheduled check starting...');
  try {
    await driveWatcher.checkForNewFiles();
  } catch (error) {
    logger.error('Scheduled check failed:', error);
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`🔨 CastSmith started on port ${PORT}`);
  logger.info('Scheduled checks every 5 minutes');
  
  // Initial check on startup
  setTimeout(() => {
    driveWatcher.checkForNewFiles();
  }, 5000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});