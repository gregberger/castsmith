import { AssemblyAI } from 'assemblyai';
import { logger } from '../utils/logger.js';

export class TranscriptionService {
  constructor() {
    this.client = new AssemblyAI({
      apiKey: process.env.ASSEMBLYAI_API_KEY
    });
  }

  async transcribe(audioFilePath) {
    try {
      logger.info(`Starting transcription for: ${audioFilePath}`);

      const config = {
        audio_url: audioFilePath, // For local files, need to upload first
        speaker_labels: true,
        speakers_expected: 4, // Jerohm + 3 guests typical
        punctuate: true,
        format_text: true,
        language_code: 'fr', // French podcast
        boost_param: 'high', // Better for music discussions
        filter_profanity: false // Keep authentic content
      };

      // If it's a local file, upload it first
      if (!audioFilePath.startsWith('http')) {
        logger.debug('Uploading local file to AssemblyAI...');
        const uploadUrl = await this.client.files.upload(audioFilePath);
        config.audio_url = uploadUrl;
      }

      // Submit transcription job
      const transcript = await this.client.transcripts.submit(config);
      logger.info(`Transcription job submitted: ${transcript.id}`);

      // Poll for completion
      const completedTranscript = await this.client.transcripts.waitUntilReady(transcript.id, {
        pollingInterval: 5000, // Check every 5 seconds
        pollingTimeout: 300000 // 5 minute timeout
      });

      if (completedTranscript.status === 'error') {
        throw new Error(`Transcription failed: ${completedTranscript.error}`);
      }

      logger.info('Transcription completed successfully');

      // Structure the result
      const result = {
        text: completedTranscript.text,
        confidence: completedTranscript.confidence,
        speakers: this.extractSpeakers(completedTranscript.utterances),
        duration: completedTranscript.audio_duration,
        timestamps: completedTranscript.utterances || [],
        raw: completedTranscript
      };

      return result;

    } catch (error) {
      logger.error('Transcription failed:', error);
      throw error;
    }
  }

  extractSpeakers(utterances) {
    if (!utterances) return [];

    const speakers = new Map();
    
    utterances.forEach(utterance => {
      const speaker = utterance.speaker;
      if (!speakers.has(speaker)) {
        speakers.set(speaker, {
          id: speaker,
          totalTime: 0,
          segments: []
        });
      }

      const speakerData = speakers.get(speaker);
      speakerData.totalTime += utterance.end - utterance.start;
      speakerData.segments.push({
        start: utterance.start,
        end: utterance.end,
        text: utterance.text,
        confidence: utterance.confidence
      });
    });

    return Array.from(speakers.values()).sort((a, b) => b.totalTime - a.totalTime);
  }

  async getTranscriptById(transcriptId) {
    try {
      const transcript = await this.client.transcripts.get(transcriptId);
      return transcript;
    } catch (error) {
      logger.error(`Failed to get transcript ${transcriptId}:`, error);
      throw error;
    }
  }

  // For testing with shorter files
  async quickTranscribe(audioUrl) {
    try {
      const config = {
        audio_url: audioUrl,
        punctuate: true,
        format_text: true,
        language_code: 'fr'
      };

      const transcript = await this.client.transcripts.submit(config);
      const result = await this.client.transcripts.waitUntilReady(transcript.id);
      
      return {
        text: result.text,
        confidence: result.confidence
      };
    } catch (error) {
      logger.error('Quick transcription failed:', error);
      throw error;
    }
  }
}