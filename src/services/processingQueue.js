import { logger } from '../utils/logger.js';
import { TranscriptionService } from './transcriptionService.js';
import { ContentExtractor } from './contentExtractor.js';
import { StorageService } from './storageService.js';
import { RepoUpdater } from './repoUpdater.js';
import { EpisodeDataLogger } from './episodeDataLogger.js';

export class ProcessingQueue {
  constructor(driveWatcher) {
    this.queue = [];
    this.processing = false;
    this.driveWatcher = driveWatcher;
    this.transcriptionService = new TranscriptionService();
    this.contentExtractor = new ContentExtractor();
    this.storageService = new StorageService();
    this.repoUpdater = new RepoUpdater();
    this.dataLogger = new EpisodeDataLogger();
  }

  async addToQueue(file) {
    logger.info(`Adding file to processing queue: ${file.name}`);
    
    const queueItem = {
      id: Date.now(),
      file,
      status: 'queued',
      addedAt: new Date(),
      steps: {
        download: 'pending',
        transcription: 'pending',
        extraction: 'pending',
        upload: 'pending',
        repoUpdate: 'pending'
      }
    };

    this.queue.push(queueItem);
    
    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    return queueItem.id;
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    logger.info('Starting queue processing...');

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      await this.processItem(item);
    }

    this.processing = false;
    logger.info('Queue processing completed');
  }

  async processItem(item) {
    let episodeNumber = null;
    
    try {
      logger.info(`Processing item: ${item.file.name}`);
      item.status = 'processing';

      // Initialize episode data logging
      episodeNumber = this.driveWatcher.extractEpisodeNumber(item.file.name);
      
      if (episodeNumber) {
        await this.dataLogger.initializeEpisode(episodeNumber, {
          filename: item.file.name,
          fileId: item.file.id,
          fileSize: item.file.size
        });
      }

      // Step 1: Download file
      item.steps.download = 'in_progress';
      const localPath = await this.downloadFile(item.file);
      item.steps.download = 'completed';
      logger.info(`Downloaded: ${localPath}`);
      
      if (episodeNumber) {
        await this.dataLogger.updateStep(episodeNumber, 'download', true);
      }

      // Step 2: Transcription
      item.steps.transcription = 'in_progress';
      const transcript = await this.transcriptionService.transcribe(localPath);
      item.steps.transcription = 'completed';
      logger.info('Transcription completed');
      
      if (episodeNumber) {
        await this.dataLogger.logRawTranscript(episodeNumber, transcript);
      }

      // Step 3: Content extraction
      item.steps.extraction = 'in_progress';
      const extractedContent = await this.contentExtractor.extract(transcript, item.file.name);
      item.steps.extraction = 'completed';
      logger.info('Content extraction completed');
      
      if (episodeNumber) {
        await this.dataLogger.logExtractedContent(episodeNumber, extractedContent);
      }

      // Step 4: Upload files to R2
      item.steps.upload = 'in_progress';
      const uploadedUrls = await this.storageService.uploadFiles(localPath, extractedContent.episodeNumber);
      item.steps.upload = 'completed';
      logger.info('Files uploaded to R2');
      
      if (episodeNumber) {
        await this.dataLogger.logUploadResults(episodeNumber, uploadedUrls);
      }

      // Step 5: Update repository
      item.steps.repoUpdate = 'in_progress';
      await this.repoUpdater.updateRepo(extractedContent, uploadedUrls);
      item.steps.repoUpdate = 'completed';
      logger.info('Repository updated');
      
      if (episodeNumber) {
        await this.dataLogger.logRepositoryUpdate(episodeNumber, {
          episodeFile: `${extractedContent.episodeNumber.toString().padStart(2, '0')}-${extractedContent.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`,
          uploadedUrls
        });
      }

      item.status = 'completed';
      logger.info(`✅ Successfully processed: ${item.file.name}`);
      
      if (episodeNumber) {
        await this.dataLogger.finalizeEpisode(episodeNumber, 'completed');
      }

      // Clean up local file
      await this.cleanup(localPath);

    } catch (error) {
      logger.error(`❌ Failed to process ${item.file.name}:`, error);
      item.status = 'failed';
      item.error = error.message;
      
      if (episodeNumber) {
        await this.dataLogger.finalizeEpisode(episodeNumber, 'failed', error.message);
      }
    }
  }

  async downloadFile(file) {
    const tempDir = './temp';
    const fs = await import('fs-extra');
    
    // Ensure temp directory exists
    await fs.ensureDir(tempDir);
    
    const tempPath = `${tempDir}/castsmith-${file.id}-${file.name}`;
    logger.debug(`Downloading ${file.name} to: ${tempPath}`);
    
    await this.driveWatcher.downloadFile(file.id, tempPath);
    return tempPath;
  }

  async cleanup(filePath) {
    try {
      // Clean up temporary files
      logger.debug(`Cleaning up: ${filePath}`);
      // fs.unlinkSync(filePath);
    } catch (error) {
      logger.warn(`Cleanup failed for ${filePath}:`, error);
    }
  }

  async getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      items: this.queue.map(item => ({
        id: item.id,
        filename: item.file.name,
        status: item.status,
        steps: item.steps,
        addedAt: item.addedAt
      }))
    };
  }
}