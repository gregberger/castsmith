import { google } from 'googleapis';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { ProcessingQueue } from './processingQueue.js';

export class DriveWatcher {
  constructor() {
    this.drive = null;
    // Set lastCheckTime to 1 hour ago to process existing files on startup
    this.lastCheckTime = new Date(Date.now() - 60 * 60 * 1000);
    this.processingQueue = new ProcessingQueue(this);
    this.initializeAuth();
  }

  async initializeAuth() {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'urn:ietf:wg:oauth:2.0:oob'
      );

      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });

      this.drive = google.drive({ version: 'v3', auth: oauth2Client });
      logger.info('Google Drive API initialized');
    } catch (error) {
      logger.error('Failed to initialize Google Drive API:', error);
      throw error;
    }
  }

  async checkForNewFiles() {
    if (!this.drive) {
      logger.error('Google Drive API not initialized');
      return;
    }

    try {
      logger.debug('Checking for new files in Google Drive...');
      
      const response = await this.drive.files.list({
        q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType contains 'audio' and trashed=false`,
        orderBy: 'modifiedTime desc',
        fields: 'files(id,name,size,modifiedTime,mimeType)',
        pageSize: 10
      });

      const files = response.data.files;
      
      if (!files || files.length === 0) {
        logger.debug('No audio files found in watched folder');
        return;
      }

      logger.info(`Found ${files.length} audio files`);

      for (const file of files) {
        const fileModified = new Date(file.modifiedTime);
        
        logger.debug(`File: ${file.name}, Modified: ${fileModified}, LastCheck: ${this.lastCheckTime}`);
        
        // Only process files modified after our last check
        if (fileModified > this.lastCheckTime) {
          logger.info(`New file detected: ${file.name}`);
          
          // Check if filename matches our pattern (cosmic-XX format)
          if (this.matchesNamingPattern(file.name)) {
            await this.processingQueue.addToQueue(file);
          } else {
            logger.warn(`File ${file.name} doesn't match naming pattern, skipping`);
          }
        } else {
          logger.debug(`File ${file.name} skipped - not newer than last check`);
        }
      }

      this.lastCheckTime = new Date();
      
    } catch (error) {
      logger.error('Error checking for new files:', error);
    }
  }

  matchesNamingPattern(filename) {
    // Pattern: cosmic-XX.ext (e.g., cosmic-06.mp3, cosmic-07.flac)
    const pattern = /^cosmic-\d{2}\.(mp3|flac|wav|m4a)$/i;
    return pattern.test(filename);
  }

  async downloadFile(fileId, outputPath) {
    try {
      const response = await this.drive.files.get({
        fileId: fileId,
        alt: 'media'
      }, { responseType: 'stream' });

      return new Promise((resolve, reject) => {
        const dest = fs.createWriteStream(outputPath);
        response.data
          .on('end', () => {
            logger.info(`File downloaded: ${outputPath}`);
            resolve(outputPath);
          })
          .on('error', err => {
            logger.error(`Download error: ${err}`);
            reject(err);
          })
          .pipe(dest);
      });
    } catch (error) {
      logger.error(`Failed to download file ${fileId}:`, error);
      throw error;
    }
  }

  getLastCheckTime() {
    return this.lastCheckTime;
  }
}