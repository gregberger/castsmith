import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';

export class StorageService {
  constructor() {
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_S3_API || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
    this.bucketName = process.env.R2_BUCKET_NAME;
    this.publicUrl = process.env.R2_PUBLIC_URL;
  }

  async uploadFiles(audioFilePath, episodeNumber) {
    try {
      logger.info(`Starting file upload for episode ${episodeNumber}`);
      
      const results = {};
      
      // Upload main audio file
      const audioKey = `Cosmic-${episodeNumber.toString().padStart(2, '0')}.mp3`;
      results.audioUrl = await this.uploadFile(audioFilePath, audioKey);
      
      // TODO: If we have FLAC version, upload that too
      // const flacKey = `Cosmic-${episodeNumber.toString().padStart(2, '0')}.flac`;
      // results.flacUrl = await this.uploadFile(flacFilePath, flacKey);
      
      logger.info('File upload completed');
      return results;
      
    } catch (error) {
      logger.error('File upload failed:', error);
      throw error;
    }
  }

  async uploadFile(filePath, key) {
    try {
      logger.debug(`Uploading ${filePath} as ${key}`);
      
      // Check if file exists locally
      if (!await fs.pathExists(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Get file stats for metadata
      const stats = await fs.stat(filePath);
      const fileContent = await fs.readFile(filePath);
      
      // Determine content type
      const contentType = this.getContentType(filePath);
      
      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        ContentLength: stats.size,
        Metadata: {
          'uploaded-by': 'castsmith',
          'original-filename': path.basename(filePath),
          'upload-date': new Date().toISOString()
        }
      };

      // Handle large files (>300MB) - R2 supports multipart uploads automatically
      if (stats.size > 300 * 1024 * 1024) {
        logger.warn(`Large file detected (${Math.round(stats.size / 1024 / 1024)}MB). Upload may take some time.`);
      }

      const command = new PutObjectCommand(uploadParams);
      await this.s3Client.send(command);
      
      const publicUrl = `${this.publicUrl}/${key}`;
      logger.info(`File uploaded successfully: ${publicUrl}`);
      
      return publicUrl;
      
    } catch (error) {
      logger.error(`Failed to upload ${filePath}:`, error);
      throw error;
    }
  }

  async fileExists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      
      await this.s3Client.send(command);
      return true;
      
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  // Helper to get file size for the markdown frontmatter
  async getFileSizeInMB(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return Math.round((stats.size / 1024 / 1024) * 10) / 10; // Round to 1 decimal
    } catch (error) {
      logger.warn(`Could not get file size for ${filePath}:`, error);
      return 0;
    }
  }

  // Generate the episode URL format expected by Astropod
  generateEpisodeUrl(episodeNumber) {
    const paddedNumber = episodeNumber.toString().padStart(2, '0');
    return `${this.publicUrl}/Cosmic-${paddedNumber}.mp3`;
  }

  // Check if episode already exists (to avoid re-uploading)
  async episodeExists(episodeNumber) {
    const key = `Cosmic-${episodeNumber.toString().padStart(2, '0')}.mp3`;
    return await this.fileExists(key);
  }

  // Batch upload multiple formats
  async uploadMultipleFormats(files, episodeNumber) {
    const results = {};
    const paddedNumber = episodeNumber.toString().padStart(2, '0');
    
    for (const [format, filePath] of Object.entries(files)) {
      if (filePath && await fs.pathExists(filePath)) {
        const key = `Cosmic-${paddedNumber}.${format}`;
        results[`${format}Url`] = await this.uploadFile(filePath, key);
      }
    }
    
    return results;
  }
}