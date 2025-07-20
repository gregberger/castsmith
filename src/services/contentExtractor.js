import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

export class ContentExtractor {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  async extract(transcript, filename) {
    try {
      logger.info('Starting content extraction from transcript');

      // Extract episode number from filename (cosmic-06.mp3 -> 6)
      const episodeMatch = filename.match(/cosmic-(\d+)/i);
      const episodeNumber = episodeMatch ? parseInt(episodeMatch[1]) : null;

      const prompt = this.buildExtractionPrompt(transcript.text, episodeNumber);

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const extractedText = response.content[0].text;
      const parsedContent = this.parseExtractedContent(extractedText, episodeNumber, transcript);

      logger.info('Content extraction completed');
      return parsedContent;

    } catch (error) {
      logger.error('Content extraction failed:', error);
      throw error;
    }
  }

  buildExtractionPrompt(transcriptText, episodeNumber) {
    return `Tu es un expert en musique électronique et en podcasts. Analyse cette transcription d'un épisode du podcast "Cosmic, L'émission" et extrais les informations suivantes:

TRANSCRIPTION:
${transcriptText}

INSTRUCTIONS:
1. Identifie tous les morceaux de musique mentionnés avec:
   - Titre du morceau
   - Artiste
   - Label (si mentionné)
   - Année (si mentionnée)
   - Genre musical
   - Liens vers plateformes (Spotify, Bandcamp, etc. si mentionnés)

2. Note les festivals, événements ou lieux mentionnés

3. Identifie les invités et leurs projets/collectifs

4. Résume les sujets principaux abordés

5. Crée un titre d'épisode accrocheur en français

6. Écris une description de l'épisode (2-3 phrases)

RÉPONDS EN JSON STRICTEMENT DANS CE FORMAT:
\`\`\`json
{
  "title": "Titre de l'épisode",
  "description": "Description de l'épisode en 2-3 phrases",
  "tracks": [
    {
      "title": "Nom du morceau",
      "artist": "Nom de l'artiste",
      "label": "Nom du label",
      "year": "2024",
      "genre": "House/Techno/etc",
      "links": ["url1", "url2"]
    }
  ],
  "events": [
    {
      "name": "Nom de l'événement",
      "location": "Lieu",
      "type": "festival/soirée/club"
    }
  ],
  "guests": [
    {
      "name": "Nom de l'invité",
      "project": "Nom du projet/collectif"
    }
  ],
  "topics": ["sujet1", "sujet2", "sujet3"],
  "duration": "${this.formatDuration(Math.floor(transcriptText.length / 20))}"
}
\`\`\`

IMPORTANT: 
- Réponds UNIQUEMENT avec le JSON, pas d'autre texte
- Si une info n'est pas disponible, utilise null
- Garde les noms d'artistes et morceaux exacts comme mentionnés`;
  }

  parseExtractedContent(extractedText, episodeNumber, transcript) {
    try {
      // Extract JSON from the response
      const jsonMatch = extractedText.match(/```json\n([\s\S]*?)\n```/);
      const jsonContent = jsonMatch ? jsonMatch[1] : extractedText;
      
      const parsed = JSON.parse(jsonContent);

      // Add metadata
      const result = {
        episodeNumber,
        ...parsed,
        extractedAt: new Date().toISOString(),
        transcriptMetadata: {
          confidence: transcript.confidence,
          duration: transcript.duration,
          speakerCount: transcript.speakers ? transcript.speakers.length : 0
        }
      };

      // Generate markdown content
      result.markdownContent = this.generateMarkdown(result);

      return result;

    } catch (error) {
      logger.error('Failed to parse extracted content:', error);
      
      // Fallback: create basic content
      return this.createFallbackContent(episodeNumber, transcript);
    }
  }

  generateMarkdown(content) {
    const pubDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: '2-digit' 
    });

    let markdown = `---
title: ${content.title}
audioUrl: "TO_BE_REPLACED_WITH_R2_URL"
pubDate: ${pubDate}
duration: ${content.duration}
size: TO_BE_CALCULATED
cover: "/images/ep${content.episodeNumber}.png"
explicit: true
episode: ${content.episodeNumber}
season: 1
episodeType: full
---

# ${content.title}

${content.description}

Animé par [Jerohm](https://jerohm.com/) avec la complicité de [Cosmic Turtle](https://i.seadn.io/gcs/files/a552993aecdcdb0aedd93116bc207e59.png?auto=format&w=1400&fr=1), [George Mood](https://soundcloud.com/george_mood) et [Joe d'Absynth](https://soundcloud.com/gregory-berger-1)

`;

    // Add guest mix section if guests
    if (content.guests && content.guests.length > 0) {
      markdown += `## Guest Mix\n\n`;
      content.guests.forEach(guest => {
        markdown += `[${guest.name}](${guest.project}) Merci encore !!\n\n`;
      });
    }

    // Add tracklist if tracks found
    if (content.tracks && content.tracks.length > 0) {
      markdown += `## Morceaux mentionnés\n\n`;
      content.tracks.forEach(track => {
        markdown += `- **${track.artist}** - ${track.title}`;
        if (track.label) markdown += ` (${track.label})`;
        if (track.year) markdown += ` - ${track.year}`;
        markdown += `\n`;
      });
      markdown += `\n`;
    }

    // Add events if mentioned
    if (content.events && content.events.length > 0) {
      markdown += `## Événements mentionnés\n\n`;
      content.events.forEach(event => {
        markdown += `- **${event.name}**`;
        if (event.location) markdown += ` - ${event.location}`;
        markdown += `\n`;
      });
    }

    return markdown;
  }

  createFallbackContent(episodeNumber, transcript) {
    const pubDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: '2-digit' 
    });

    return {
      episodeNumber,
      title: `Episode ${episodeNumber}, Cosmic, L'émission`,
      description: "Prolongement des soirées Cosmic. Animé par Jerohm avec la complicité de Cosmic Turtle, George Mood et Joe d'Absynth.",
      duration: this.formatDuration(transcript.duration || 0),
      tracks: [],
      events: [],
      guests: [],
      topics: [],
      markdownContent: `---
title: Episode ${episodeNumber}, Cosmic, L'émission
audioUrl: "TO_BE_REPLACED_WITH_R2_URL"
pubDate: ${pubDate}
duration: ${this.formatDuration(transcript.duration || 0)}
size: TO_BE_CALCULATED
cover: "/images/ep${episodeNumber}.png"
explicit: true
episode: ${episodeNumber}
season: 1
episodeType: full
---

# Episode ${episodeNumber}, Cosmic, L'émission

Prolongement des soirées Cosmic. Animé par Jerohm avec la complicité de Cosmic Turtle, George Mood et Joe d'Absynth.

Transcription automatique en cours de traitement...
`
    };
  }

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}