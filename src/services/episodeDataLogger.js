import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';

export class EpisodeDataLogger {
  constructor() {
    this.baseDir = './generated';
  }

  async initializeEpisode(episodeNumber, metadata = {}) {
    try {
      const episodeDir = this.getEpisodeDir(episodeNumber);
      await fs.ensureDir(episodeDir);
      
      const initData = {
        episodeNumber,
        startedAt: new Date().toISOString(),
        status: 'processing',
        steps: {
          download: false,
          transcription: false,
          extraction: false,
          upload: false,
          repository: false
        },
        ...metadata
      };
      
      await this.saveMetadata(episodeNumber, initData);
      logger.debug(`Initialized episode ${episodeNumber} data logging`);
      
      return episodeDir;
    } catch (error) {
      logger.warn(`Failed to initialize episode ${episodeNumber} logging:`, error);
    }
  }

  async logRawTranscript(episodeNumber, transcript) {
    try {
      const episodeDir = this.getEpisodeDir(episodeNumber);
      
      // Save complete transcript object
      await fs.writeFile(
        path.join(episodeDir, 'raw-transcript.json'),
        JSON.stringify(transcript, null, 2)
      );
      
      // Save plain text transcript
      await fs.writeFile(
        path.join(episodeDir, 'transcript.txt'),
        transcript.text || 'No text found'
      );
      
      // Save transcript metadata
      const transcriptMeta = {
        confidence: transcript.confidence,
        duration: transcript.duration,
        speakerCount: transcript.speakers?.length || 0,
        textLength: transcript.text?.length || 0,
        timestampedAt: new Date().toISOString()
      };
      
      await fs.writeFile(
        path.join(episodeDir, 'transcript-metadata.json'),
        JSON.stringify(transcriptMeta, null, 2)
      );
      
      await this.updateStep(episodeNumber, 'transcription', true);
      logger.debug(`Logged transcript for episode ${episodeNumber}`);
      
    } catch (error) {
      logger.warn(`Failed to log transcript for episode ${episodeNumber}:`, error);
    }
  }

  async logExtractedContent(episodeNumber, extractedContent) {
    try {
      const episodeDir = this.getEpisodeDir(episodeNumber);
      
      // Save complete extracted content
      await fs.writeFile(
        path.join(episodeDir, 'extracted-content.json'),
        JSON.stringify(extractedContent, null, 2)
      );
      
      // Save generated markdown if present
      if (extractedContent.markdownContent) {
        await fs.writeFile(
          path.join(episodeDir, 'generated-episode.md'),
          extractedContent.markdownContent
        );
      }
      
      // Save extraction summary
      const extractionSummary = {
        title: extractedContent.title,
        description: extractedContent.description,
        trackCount: extractedContent.tracks?.length || 0,
        eventCount: extractedContent.events?.length || 0,
        hasMarkdown: !!extractedContent.markdownContent,
        extractedAt: new Date().toISOString()
      };
      
      await fs.writeFile(
        path.join(episodeDir, 'extraction-summary.json'),
        JSON.stringify(extractionSummary, null, 2)
      );
      
      await this.updateStep(episodeNumber, 'extraction', true);
      logger.debug(`Logged extracted content for episode ${episodeNumber}`);
      
    } catch (error) {
      logger.warn(`Failed to log extracted content for episode ${episodeNumber}:`, error);
    }
  }

  async logUploadResults(episodeNumber, uploadedUrls) {
    try {
      const episodeDir = this.getEpisodeDir(episodeNumber);
      
      const uploadData = {
        ...uploadedUrls,
        uploadedAt: new Date().toISOString()
      };
      
      await fs.writeFile(
        path.join(episodeDir, 'upload-results.json'),
        JSON.stringify(uploadData, null, 2)
      );
      
      await this.updateStep(episodeNumber, 'upload', true);
      logger.debug(`Logged upload results for episode ${episodeNumber}`);
      
    } catch (error) {
      logger.warn(`Failed to log upload results for episode ${episodeNumber}:`, error);
    }
  }

  async logRepositoryUpdate(episodeNumber, repoData) {
    try {
      const episodeDir = this.getEpisodeDir(episodeNumber);
      
      const repoUpdateData = {
        ...repoData,
        updatedAt: new Date().toISOString()
      };
      
      await fs.writeFile(
        path.join(episodeDir, 'repository-update.json'),
        JSON.stringify(repoUpdateData, null, 2)
      );
      
      await this.updateStep(episodeNumber, 'repository', true);
      logger.debug(`Logged repository update for episode ${episodeNumber}`);
      
    } catch (error) {
      logger.warn(`Failed to log repository update for episode ${episodeNumber}:`, error);
    }
  }

  async finalizeEpisode(episodeNumber, status = 'completed', error = null) {
    try {
      const metadata = await this.getMetadata(episodeNumber);
      
      metadata.status = status;
      metadata.completedAt = new Date().toISOString();
      metadata.processingTime = new Date(metadata.completedAt) - new Date(metadata.startedAt);
      
      if (error) {
        metadata.error = error;
      }
      
      await this.saveMetadata(episodeNumber, metadata);
      
      // Create a final summary README
      await this.createReadme(episodeNumber, metadata);
      
      logger.info(`Finalized episode ${episodeNumber} data logging (${status})`);
      
    } catch (error) {
      logger.warn(`Failed to finalize episode ${episodeNumber} logging:`, error);
    }
  }

  async updateStep(episodeNumber, stepName, completed) {
    try {
      const metadata = await this.getMetadata(episodeNumber);
      if (metadata && metadata.steps) {
        metadata.steps[stepName] = completed;
        await this.saveMetadata(episodeNumber, metadata);
      }
    } catch (error) {
      logger.warn(`Failed to update step ${stepName} for episode ${episodeNumber}:`, error);
    }
  }

  async createReadme(episodeNumber, metadata) {
    try {
      const episodeDir = this.getEpisodeDir(episodeNumber);
      
      const readmeContent = `# Episode ${episodeNumber} - Processing Data

## Status: ${metadata.status}

**Started:** ${metadata.startedAt}  
**Completed:** ${metadata.completedAt || 'In progress'}  
**Processing Time:** ${metadata.processingTime ? Math.round(metadata.processingTime / 1000) + 's' : 'N/A'}

## Processing Steps:
${Object.entries(metadata.steps).map(([step, completed]) => 
  `- ${completed ? '✅' : '❌'} ${step}`
).join('\n')}

## Files Generated:

### Raw Data:
- **raw-transcript.json** - Complete AssemblyAI response
- **transcript.txt** - Plain text transcript
- **transcript-metadata.json** - Transcript stats and metadata

### Processed Content:
- **extracted-content.json** - Claude-extracted episode information
- **extraction-summary.json** - Summary of extracted data
- **generated-episode.md** - Generated markdown for Astropod

### Upload & Deployment:
- **upload-results.json** - Cloudflare R2 upload URLs
- **repository-update.json** - Git repository update information

### Metadata:
- **processing-metadata.json** - Complete processing metadata
- **README.md** - This file

---
Generated by CastSmith automated podcast workflow
`;
      
      await fs.writeFile(path.join(episodeDir, 'README.md'), readmeContent);
      
    } catch (error) {
      logger.warn(`Failed to create README for episode ${episodeNumber}:`, error);
    }
  }

  getEpisodeDir(episodeNumber) {
    return path.join(this.baseDir, `episode-${episodeNumber.toString().padStart(2, '0')}`);
  }

  async getMetadata(episodeNumber) {
    try {
      const metadataPath = path.join(this.getEpisodeDir(episodeNumber), 'processing-metadata.json');
      if (await fs.pathExists(metadataPath)) {
        return await fs.readJson(metadataPath);
      }
    } catch (error) {
      logger.debug(`No metadata found for episode ${episodeNumber}`);
    }
    return null;
  }

  async saveMetadata(episodeNumber, metadata) {
    try {
      const metadataPath = path.join(this.getEpisodeDir(episodeNumber), 'processing-metadata.json');
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      logger.warn(`Failed to save metadata for episode ${episodeNumber}:`, error);
    }
  }
}