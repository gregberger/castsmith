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

      // Extract episode number from filename using podcast name
      const podcastName = process.env.PODCAST_NAME || 'podcast';
      const episodeMatch = filename.match(new RegExp(`${podcastName}-(\\d+)`, 'i'));
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
Analyse cette transcription et extrais le contenu pour créer un épisode de podcast structuré. 

1. TITRE DE L'ÉPISODE: Crée un titre accrocheur (SANS ":" car cela casse le YAML)

2. MONOLOGUE D'OUVERTURE DE JEROHM: Extrais le texte du début jusqu'à "Bienvenue dans l'émission" ou "numéro x de radio" ou "bonjour à tous" (tout ce qui marque le début officiel de l'émission)

3. MORCEAUX MENTIONNÉS: Pour chaque track, inclus:
   - Artiste
   - Titre du morceau
   - Année/Label si mentionné  
   - Genre musical
   - Lien YouTube/SoundCloud FONCTIONNEL (obligatoire - cherche le vrai titre sur ces plateformes)

4. ÉVÉNEMENTS/FESTIVALS mentionnés avec lieux

5. INVITÉS/DJS mentionnés avec leurs liens

6. DESCRIPTION de l'épisode (2-3 phrases sur le contenu musical)

IMPORTANT pour les liens:
- Trouve les VRAIS liens YouTube qui fonctionnent
- Format: https://www.youtube.com/watch?v=VIDEO_ID  
- Si incertain, écris "Lien à vérifier"
- Privilégie les liens officiels des artistes

RÉPONDS EN JSON STRICTEMENT DANS CE FORMAT:
\`\`\`json
{
  "title": "Titre de l'épisode (sans deux-points)",
  "description": "Description de l'épisode en 2-3 phrases",
  "openingMonologue": "Texte du monologue d'ouverture de Jerohm",
  "tracks": [
    {
      "title": "Nom du morceau",
      "artist": "Nom de l'artiste", 
      "label": "Nom du label ou null",
      "year": "2024 ou null",
      "genre": "Genre musical",
      "youtubeLink": "https://www.youtube.com/watch?v=VIDEO_ID ou null"
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
      "project": "Nom du projet/collectif",
      "links": ["url1", "url2"]
    }
  ]
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
title: "${content.title}"
audioUrl: "TO_BE_REPLACED_WITH_R2_URL"  
pubDate: "${pubDate}"
duration: "${content.duration || '0:00:00'}"
size: TO_BE_CALCULATED
cover: "/images/ep${content.episodeNumber}.png"
explicit: true
episode: ${content.episodeNumber}
season: 1
episodeType: full
---

# ${content.title}

Animé par [Jerohm](https://jerohm.com/) avec la complicité de [Antoine aka Cosmic Turtle](https://i.seadn.io/gcs/files/a552993aecdcdb0aedd93116bc207e59.png?auto=format&w=1400&fr=1), [Greg aka Joe d'Absynth](https://soundcloud.com/gregory-berger-1) et [Kevin aka George Mood](https://soundcloud.com/george_mood)

---

`;

    // Add opening monologue if available
    if (content.openingMonologue) {
      markdown += `## Le monologue de Jérôme

> ${content.openingMonologue.replace(/\n/g, '  \n> ')}

---

`;
    }

    markdown += `${content.description}

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
      markdown += `## Morceaux mentionnés

| Artiste | Morceau | Info | Lien YouTube |
|---------|---------|------|--------------|
`;
      content.tracks.forEach(track => {
        const info = [track.label, track.year].filter(Boolean).join(' - ') || 'Original';
        const link = track.youtubeLink ? `[écouter](${track.youtubeLink})` : 'Lien à vérifier';
        markdown += `| ${track.artist} | ${track.title} | ${info} | ${link} |\n`;
      });
      markdown += `\n---\n\n`;
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