import simpleGit from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';

export class RepoUpdater {
  constructor() {
    this.repoPath = process.env.ASTROPOD_REPO_PATH || '../astropod';
    this.repoUrl = process.env.ASTROPOD_REPO_URL;
    this.git = simpleGit(this.repoPath);
  }

  async updateRepo(extractedContent, uploadedUrls) {
    try {
      logger.info(`Updating repository for episode ${extractedContent.episodeNumber}`);
      
      // Ensure repo exists and is up to date
      await this.ensureRepo();
      
      // Create the episode markdown file
      await this.createEpisodeFile(extractedContent, uploadedUrls);
      
      // Commit and push changes
      await this.commitChanges(extractedContent);
      
      logger.info('Repository update completed');
      
    } catch (error) {
      logger.error('Repository update failed:', error);
      throw error;
    }
  }

  async ensureRepo() {
    try {
      // Check if repo directory exists
      if (!await fs.pathExists(this.repoPath)) {
        logger.info(`Cloning repository to ${this.repoPath}`);
        const parentDir = path.dirname(this.repoPath);
        const repoName = path.basename(this.repoPath);
        
        await fs.ensureDir(parentDir);
        await simpleGit(parentDir).clone(this.repoUrl, repoName);
        
      } else {
        // Pull latest changes
        logger.debug('Pulling latest changes from repository');
        await this.git.pull('origin', 'main');
      }
      
    } catch (error) {
      logger.error('Failed to ensure repository is ready:', error);
      throw error;
    }
  }

  async createEpisodeFile(extractedContent, uploadedUrls) {
    try {
      const episodeNumber = extractedContent.episodeNumber;
      const paddedNumber = episodeNumber.toString().padStart(2, '0');
      
      // Generate filename
      const filename = `${paddedNumber}-${this.slugify(extractedContent.title)}.md`;
      const episodePath = path.join(this.repoPath, 'src', 'content', 'episode', filename);
      
      // Update markdown content with actual URLs and file size
      let markdownContent = extractedContent.markdownContent;
      
      // Replace placeholder URL with actual R2 URL
      if (uploadedUrls.audioUrl) {
        markdownContent = markdownContent.replace('TO_BE_REPLACED_WITH_R2_URL', uploadedUrls.audioUrl);
      }
      
      // Calculate and replace file size (we'll need this from the storage service)
      // For now, estimate based on duration (rough estimate: 1MB per minute for MP3)
      const durationInMinutes = this.parseDuration(extractedContent.duration);
      const estimatedSize = Math.round(durationInMinutes * 1.2 * 10) / 10; // 1.2MB per minute
      markdownContent = markdownContent.replace('TO_BE_CALCULATED', estimatedSize.toString());
      
      // Ensure directory exists
      await fs.ensureDir(path.dirname(episodePath));
      
      // Write the file
      await fs.writeFile(episodePath, markdownContent, 'utf8');
      
      logger.info(`Episode file created: ${filename}`);
      return filename;
      
    } catch (error) {
      logger.error('Failed to create episode file:', error);
      throw error;
    }
  }

  async commitChanges(extractedContent) {
    try {
      const episodeNumber = extractedContent.episodeNumber;
      
      // Add all changes
      await this.git.add('.');
      
      // Check if there are changes to commit
      const status = await this.git.status();
      if (status.files.length === 0) {
        logger.info('No changes to commit');
        return;
      }
      
      // Commit with descriptive message
      const commitMessage = `Add episode ${episodeNumber}: ${extractedContent.title}

🔨 Generated with CastSmith automation

Episode details:
- Duration: ${extractedContent.duration}
- Tracks mentioned: ${extractedContent.tracks ? extractedContent.tracks.length : 0}
- Guests: ${extractedContent.guests ? extractedContent.guests.map(g => g.name).join(', ') : 'None'}

Generated automatically from Google Drive upload.`;
      
      await this.git.commit(commitMessage);
      logger.info('Changes committed');
      
      // Push to remote
      await this.git.push('origin', 'main');
      logger.info('Changes pushed to remote repository');
      
    } catch (error) {
      logger.error('Failed to commit changes:', error);
      throw error;
    }
  }

  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[àâäèéêëïîôùûüÿç]/g, (match) => {
        const accents = { à: 'a', â: 'a', ä: 'a', è: 'e', é: 'e', ê: 'e', ë: 'e', ï: 'i', î: 'i', ô: 'o', ù: 'u', û: 'u', ü: 'u', ÿ: 'y', ç: 'c' };
        return accents[match] || match;
      })
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-'); // Remove multiple consecutive hyphens
  }

  parseDuration(duration) {
    // Handle null or undefined duration
    if (!duration) {
      return 0;
    }
    
    // If duration is already a number (seconds), convert to minutes
    if (typeof duration === 'number') {
      return Math.round(duration / 60);
    }
    
    // Parse duration string (HH:MM:SS or MM:SS) to minutes
    const parts = duration.split(':').map(Number);
    
    if (parts.length === 3) {
      // HH:MM:SS
      return parts[0] * 60 + parts[1] + parts[2] / 60;
    } else if (parts.length === 2) {
      // MM:SS
      return parts[0] + parts[1] / 60;
    }
    
    return 60; // Default fallback
  }

  async getRepoStatus() {
    try {
      const status = await this.git.status();
      const branch = await this.git.branch();
      
      return {
        currentBranch: branch.current,
        staged: status.staged,
        modified: status.modified,
        untracked: status.not_added,
        ahead: status.ahead,
        behind: status.behind
      };
    } catch (error) {
      logger.error('Failed to get repo status:', error);
      return null;
    }
  }

  // Helper to check if episode already exists
  async episodeExists(episodeNumber) {
    try {
      const episodesDir = path.join(this.repoPath, 'src', 'content', 'episode');
      const files = await fs.readdir(episodesDir);
      
      const paddedNumber = episodeNumber.toString().padStart(2, '0');
      return files.some(file => file.startsWith(paddedNumber + '-'));
      
    } catch (error) {
      logger.warn('Could not check if episode exists:', error);
      return false;
    }
  }
}