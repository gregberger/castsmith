#!/usr/bin/env node

import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { logger } from './utils/logger.js';
import { DriveWatcher } from './services/driveWatcher.js';
import { ProcessingQueue } from './services/processingQueue.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const driveWatcher = new DriveWatcher();
const processingQueue = new ProcessingQueue();

// Express middleware
app.use(express.json());

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