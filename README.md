# 🔨 CastSmith

Automated podcast workflow from Google Drive to published episodes.

CastSmith watches your Google Drive for new audio files, automatically transcribes them, extracts music metadata using AI, uploads files to Cloudflare R2, and updates your Astropod repository with new episodes.

## Features

- 🎵 **Google Drive Integration** - Watches for new audio files with configurable naming patterns
- 🎤 **Smart Transcription** - Uses AssemblyAI for high-quality French podcast transcription with speaker detection
- 🤖 **AI Content Extraction** - Leverages Anthropic Claude to extract music tracks, events, guests, and generate episode descriptions
- ☁️ **Cloudflare R2 Storage** - Handles large file uploads (>300MB) to your podcast CDN
- 📝 **Repository Automation** - Automatically creates markdown files and commits to your Astropod repository
- 🔄 **Queue Management** - Processes multiple files sequentially with status tracking
- 📊 **Web Dashboard** - Simple API endpoints for monitoring and manual triggers
- 💾 **Episode Data Logging** - Automatically saves all intermediate processing data for each episode

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Google Drive API credentials
- AssemblyAI API key
- Anthropic API key
- Cloudflare R2 credentials

### Setup

1. **Clone and install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. **Start the service:**
   ```bash
   pnpm dev
   ```

## Configuration

### Google Drive Setup

1. **Create a Google Cloud Project:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Click "Select a project" → "New Project"
   - Enter project name and click "Create"

2. **Enable Google Drive API:**
   - In the Cloud Console, go to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click on it and press "Enable"

3. **Create OAuth2 Credentials:**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - If prompted, configure the OAuth consent screen first:
     - Choose "External" user type
     - Fill in required fields (app name, user support email, developer email)
     - Add your email to test users
   - For application type, select **"Desktop application"**
   - Enter a name (e.g., "CastSmith")
   - Click "Create"
   - Note down the **Client ID** and **Client Secret**

4. **Get a Refresh Token:**
   - The application uses OAuth2 "out-of-band" flow for server-side authentication
   - When you first run the app, it will guide you through the authorization process
   - You'll be prompted to visit a URL, grant permissions, and copy back an authorization code
   - The app will then generate and display your refresh token

5. **Find Your Google Drive Folder ID:**
   - Navigate to the Google Drive folder you want CastSmith to watch
   - Copy the folder ID from the URL (the part after `/folders/`)
   - Example: `https://drive.google.com/drive/folders/1ABCDefGhIjKlMnOpQrStUvWxYz` → ID is `1ABCDefGhIjKlMnOpQrStUvWxYz`

6. **Update Environment Variables:**
   - Add the credentials to your `.env` file:
     ```bash
     GOOGLE_CLIENT_ID=your_actual_client_id
     GOOGLE_CLIENT_SECRET=your_actual_client_secret
     GOOGLE_REFRESH_TOKEN=your_refresh_token_from_step_4
     GOOGLE_DRIVE_FOLDER_ID=your_folder_id_from_step_5
     ```

### File Naming Convention

CastSmith looks for transcript audio files matching the pattern: `{PODCAST_NAME}-{NN}-no-mix.{ext}`

The `-no-mix` suffix indicates these are files for transcription (lighter, without guest mixes).

Examples (with `PODCAST_NAME=cosmic`):
- `cosmic-06-no-mix.mp3` ✅ (transcript file)
- `cosmic-07-no-mix.flac` ✅ (transcript file)
- `cosmic-06.mp3` ❌ (missing -no-mix suffix)
- `random-file.mp3` ❌ (wrong naming pattern)

**Uploaded files** use the pattern `{PodcastName}-{NN}.{ext}` (capitalized, without -no-mix):
- Upload: `Cosmic-06.mp3` (from transcript file `cosmic-06-no-mix.mp3`)

### Environment Variables

See `.env.example` for all required configuration options.

## API Endpoints

- `GET /health` - Health check
- `GET /status` - Queue status and last check time
- `POST /trigger` - Manually trigger file check

## Architecture

```
Google Drive → File Detection → Download → Transcription → AI Extraction → Upload → Git Update
```

### Services

- **DriveWatcher** - Monitors Google Drive for new files
- **TranscriptionService** - Handles AssemblyAI transcription
- **ContentExtractor** - Uses Claude for content analysis
- **StorageService** - Manages Cloudflare R2 uploads
- **RepoUpdater** - Git operations for Astropod repository
- **ProcessingQueue** - Orchestrates the workflow
- **EpisodeDataLogger** - Saves all intermediate processing data

## Development

### Using DevContainer

This project includes a devcontainer configuration:

1. Open in VS Code
2. Use "Reopen in Container" when prompted
3. Dependencies will be installed automatically

### Manual Development

```bash
# Install dependencies
pnpm install

# Start development server with hot reload
pnpm dev

# Production start
pnpm start
```

## Workflow Details

1. **File Detection**: Checks Google Drive every 5 minutes for new audio files
2. **Transcription**: Downloads and transcribes using AssemblyAI with French language support
3. **Content Extraction**: Claude analyzes transcript to extract:
   - Music tracks (title, artist, label, year)
   - Events and festivals mentioned
   - Guest information
   - Episode topics and description
4. **File Upload**: Uploads audio to Cloudflare R2 with proper naming
5. **Repository Update**: Creates markdown file and commits to Astropod repo

## Episode Data

CastSmith automatically saves all intermediate processing data for each episode in the `./generated/` directory:

```
generated/
└── episode-06/
    ├── README.md                    # Episode summary and file index
    ├── processing-metadata.json     # Processing status and timing
    ├── raw-transcript.json         # Complete AssemblyAI response
    ├── transcript.txt              # Plain text transcript
    ├── transcript-metadata.json    # Transcript statistics
    ├── extracted-content.json      # Claude-extracted episode data
    ├── extraction-summary.json     # Summary of extracted content
    ├── generated-episode.md        # Generated markdown for Astropod
    ├── upload-results.json         # Cloudflare R2 upload URLs
    └── repository-update.json      # Git repository update info
```

This data persistence allows for:
- **Debugging** processing issues
- **Re-processing** episodes with different parameters
- **Analysis** of transcript quality and content extraction
- **Backup** of all intermediate results

## Monitoring

- Logs are written to `logs/` directory
- Episode data saved to `generated/` directory
- Web interface at `http://localhost:3000/status`
- Console logging with different levels (debug/info/error)

## License

WTFPL

---

🎵 **Built for Cosmic, L'émission** - Prolongement des soirées Cosmic
🤖 **Vibe coded with Claude Code**