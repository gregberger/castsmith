# CastSmith Development Notes

## Project Status: ✅ PRODUCTION READY

CastSmith is a fully automated podcast workflow system that handles the complete pipeline from Google Drive file detection to episode publication.

## Recent Development Progress

### Completed Features
- ✅ **Google Drive Integration**: OAuth2 authentication with automatic file monitoring
- ✅ **Transcription Pipeline**: AssemblyAI integration with error handling
- ✅ **AI Content Extraction**: Claude AI analysis for music tracks, events, guests
- ✅ **Cloud Storage**: Cloudflare R2 upload with large file support (>300MB)
- ✅ **Repository Automation**: Automatic Git commits to Astropod repository
- ✅ **Episode Management**: Web interface and CLI tools for episode regeneration
- ✅ **Generic Design**: Environment-based configuration (no hardcoded podcast names)
- ✅ **Data Persistence**: Comprehensive logging of all processing steps

### Key Bug Fixes Resolved
1. **Authentication Issues**: Fixed Google Drive OAuth2 refresh token flow
2. **File Naming Conflicts**: Separated transcript files (`-no-mix`) from upload files
3. **Hardcoded References**: Removed all "cosmic" hardcoded strings, now uses `PODCAST_NAME`
4. **YAML Parsing**: Fixed episode title quoting to prevent Astro build failures
5. **Claude Model**: Updated to correct model name `claude-4-sonnet-20250514`
6. **SSL Handshake**: Fixed Cloudflare R2 connectivity with `forcePathStyle: true`

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌──────────────┐
│   Google Drive  │───▶│    CastSmith     │───▶│  Cloudflare R2  │───▶│   Astropod   │
│  File Detection │    │   Processing     │    │  Audio Hosting  │    │ Static Site  │
└─────────────────┘    └──────────────────┘    └─────────────────┘    └──────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │ Episode Data     │
                       │ Persistence      │
                       │ ./generated/     │
                       └──────────────────┘
```

## Current Services

### Core Services
- **DriveWatcher**: Monitors Google Drive for new audio files
- **ProcessingQueue**: Manages workflow orchestration with retry logic
- **TranscriptionService**: AssemblyAI integration for speech-to-text
- **ContentExtractor**: Claude AI for music/event/guest extraction
- **StorageService**: Cloudflare R2 file upload and management
- **RepositoryService**: Git automation for Astropod updates
- **EpisodeDataLogger**: Comprehensive data persistence and logging

### Management Tools
- **Web Interface**: http://localhost:3000 - Episode management dashboard
- **CLI Tool**: `debug-tools/regenerate-episode.js` - Regenerate episode markdown
- **API Endpoints**: REST API for episode data and system status

## Configuration

### Required Environment Variables
```bash
# Google Drive API
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REFRESH_TOKEN=xxx
DRIVE_FOLDER_ID=xxx

# AssemblyAI
ASSEMBLYAI_API_KEY=xxx

# Anthropic Claude
ANTHROPIC_API_KEY=xxx

# Cloudflare R2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=xxx
R2_PUBLIC_URL=xxx

# GitHub (for repository updates)
GITHUB_TOKEN=xxx
GITHUB_REPO=xxx

# Podcast Configuration
PODCAST_NAME=cosmic  # Used for file naming patterns
```

## File Processing Flow

1. **Detection**: File matching pattern `{PODCAST_NAME}-{NUMBER}-no-mix.{ext}`
2. **Download**: Creates local copy in `/tmp/` for processing
3. **Transcription**: Uploads to AssemblyAI, polls for completion
4. **Extraction**: Claude AI analyzes transcript for structured content
5. **Upload**: Finds full episode file (without `-no-mix`) and uploads to R2
6. **Markdown**: Generates episode markdown with frontmatter
7. **Repository**: Commits new episode file to Astropod repository
8. **Cleanup**: Archives all data to `./generated/episode-XX/`

## Planned Frontend Enhancement

### Next Development Phase: SvelteKit UI

**Separate Repository Approach**:
- Create new `castsmith-ui` repository for frontend
- Keep current Express API as backend service
- Deploy frontend and backend independently

**Proposed Technology Stack**:
- **Frontend**: SvelteKit + TypeScript + shadcn/ui components
- **Styling**: Tailwind CSS (consistent with existing projects)
- **State Management**: Svelte stores + SWR-style data fetching
- **Build**: Vite (built into SvelteKit)

**Hosting Strategy**:
- **Frontend**: Cloudflare Pages (static SvelteKit build)
- **Backend**: Cloudflare Workers or Railway (Express API)
- **Benefits**: Independent scaling, separate deployment pipelines

**Planned Features**:
1. **File Upload Interface**: Drag & drop with progress tracking
2. **Google Drive Browser**: Visual file selection from Drive API
3. **Workflow Control**: Manual step-by-step processing triggers
4. **Real-time Monitoring**: WebSocket/SSE for live progress updates
5. **Episode Management**: Enhanced version of current web interface
6. **Settings Panel**: Environment configuration and API key management

**Development Approach**:
1. Set up SvelteKit project with shadcn/ui
2. Create API client for existing Express endpoints
3. Build file upload and Drive integration components
4. Add real-time progress tracking
5. Enhance episode management interface

## Testing & Development

### Local Development
```bash
# Start CastSmith backend
cd /apps/castsmith
pnpm install
pnpm run dev

# Future: Start SvelteKit frontend (when created)
cd /castsmith-ui
pnpm install
pnpm run dev
```

### Manual Testing Workflow
1. Place test file in Google Drive folder
2. Monitor logs at http://localhost:3000
3. Verify transcription completion
4. Check content extraction quality
5. Confirm R2 upload success
6. Validate Git repository update

## Known Technical Constraints

### File Size Limitations
- **Transcription**: AssemblyAI handles files up to ~500MB efficiently
- **Storage**: R2 supports files >300MB with automatic multipart uploads
- **Processing**: Local temp storage requires sufficient disk space

### API Rate Limits
- **Google Drive**: 1000 requests per 100 seconds per user
- **AssemblyAI**: Concurrent transcription limits based on plan
- **Claude API**: Token limits and rate limiting per API key
- **GitHub**: 5000 requests per hour for authenticated requests

### Processing Time Estimates
- **File Detection**: ~30 seconds (cron job interval)
- **Transcription**: ~10-20% of audio duration (e.g., 60min audio = 6-12min)
- **Content Extraction**: ~30-60 seconds (depends on transcript length)
- **File Upload**: ~2-5 minutes per 100MB
- **Repository Update**: ~10-30 seconds

## Maintenance & Monitoring

### Health Checks
- **Status Endpoint**: GET `/status` - Queue length, processing state, uptime
- **Health Endpoint**: GET `/health` - Basic service health
- **Episode List**: GET `/episodes` - Available processed episodes

### Log Monitoring
- All services use structured logging via Winston
- Processing steps logged to both console and episode directories
- Error tracking with full stack traces

### Data Backup
- All episode data persisted in `./generated/episode-XX/` directories
- Raw transcripts, extracted content, and processing metadata saved
- Git history serves as episode markdown backup

## Security Considerations

### API Key Management
- All sensitive credentials in environment variables
- No secrets committed to repository
- Separate API keys for different environments

### File Handling
- Temporary files cleaned up after processing
- No persistent storage of audio files on processing server
- Secure token-based authentication for all external APIs

### Access Control
- Google Drive access limited to specific folder
- GitHub token scoped to repository access only
- R2 bucket configured with minimal required permissions

## Future Considerations

### Scalability Improvements
- **Queue System**: Redis-based queue for horizontal scaling
- **File Processing**: Containerized workers for parallel processing
- **Database**: PostgreSQL for episode metadata and processing history
- **Monitoring**: OpenTelemetry integration for distributed tracing

### Feature Enhancements
- **Multi-podcast Support**: Configuration-based podcast management
- **Content Validation**: AI-powered quality checks before publication
- **Social Integration**: Automatic social media post generation
- **Analytics**: Episode performance tracking and insights