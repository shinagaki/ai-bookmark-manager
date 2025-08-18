# AI Bookmark Manager

An intelligent bookmark management tool powered by AI (Gemini) for Chrome bookmarks. Automatically organize, clean up, and optimize your bookmarks with advanced AI analysis.

## Features

### 🤖 AI-Powered Organization
- **Smart categorization** - AI analyzes bookmark content and suggests optimal folder structure
- **Duplicate detection** - Advanced algorithms identify exact, similar, and normalized URL duplicates
- **Dead link checker** - Batch processing with individual review for problematic links
- **Content-based analysis** - Groups bookmarks by actual content, not just domains

### 🎯 Key Capabilities
- **Interactive CLI** - User-friendly command-line interface with menu navigation
- **Batch processing** - Handle thousands of bookmarks efficiently
- **Smart recommendations** - AI suggests best actions for duplicates and organization
- **Incremental processing** - Process bookmarks in manageable 50-item batches
- **Safe operations** - Preview changes before applying, with backup recommendations

### 🔧 Advanced Features
- **YouTube URL normalization** - Correctly identifies unique videos vs duplicates
- **Bookmarklet detection** - Separate handling for JavaScript bookmarklets
- **Redirect handling** - Update bookmarks to their final destination URLs
- **Multi-profile support** - Works with multiple Chrome profiles
- **Cross-platform** - Supports Windows, macOS, and Linux

## Installation

```bash
# Clone the repository
git clone https://github.com/shinagaki/ai-bookmark-manager.git
cd ai-bookmark-manager

# Install dependencies
npm install

# Build the project
npm run build

# Run the tool
npm run dev
```

## Usage

### Interactive Mode (Recommended)
```bash
node dist/index.js
```
Select from the menu:
1. Analyze bookmarks
2. Find duplicates
3. Check for dead links
4. Organize into categories
5. Clean up old bookmarks

### Complete Organization
```bash
node dist/index.js organize
```
Runs all optimization steps:
- Duplicate removal
- Dead link detection
- Category organization
- Old bookmark cleanup

### Quick Commands
```bash
# Find and clean duplicates
node dist/index.js clean-duplicates

# Test duplicate detection
node dist/index.js test-duplicates

# AI-powered organization with Gemini
node dist/index.js gemini
```

## Configuration

### Environment Variables
```bash
# Optional: Set custom Chrome bookmarks path
export CHROME_BOOKMARKS_PATH="/path/to/Bookmarks"

# For Gemini AI features
export GEMINI_API_KEY="your-api-key"
```

### Supported Bookmark Locations
The tool automatically detects bookmarks in standard Chrome locations:
- **Windows**: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Bookmarks`
- **macOS**: `~/Library/Application Support/Google/Chrome/Default/Bookmarks`
- **Linux**: `~/.config/google-chrome/Default/Bookmarks`

## Workflow

### 1. Backup First
Always backup your bookmarks before making changes:
```bash
cp ~/.config/google-chrome/Default/Bookmarks Bookmarks.backup
```

### 2. Close Chrome
For best results, close Chrome completely before running operations:
```bash
# Windows
taskkill /f /im chrome.exe

# macOS/Linux
pkill -f chrome
```

### 3. Run Organization
```bash
node dist/index.js organize
```

### 4. Review Changes
The tool will:
- Show detailed analysis
- Present recommendations
- Allow individual review of each change
- Apply changes only after confirmation

## Features in Detail

### Duplicate Detection
- **Exact URL matching** - Identifies identical URLs
- **Normalized URL matching** - Ignores tracking parameters
- **Similar URL detection** - Finds similar pages on same domain
- **Smart prioritization** - Keeps HTTPS, clean URLs, and recently used bookmarks

### Dead Link Checker
- **Batch processing** - Checks 50 links at a time
- **Individual review** - Decide action for each dead link
- **Retry mechanism** - Re-check with longer timeout
- **Redirect detection** - Option to update to final URLs

### Category Organization
- **Content-based** - Analyzes titles and URLs for categorization
- **Domain grouping** - Optional grouping by domain
- **Manual selection** - Choose organization method
- **Bookmarklet separation** - JavaScript bookmarklets in dedicated folder

## Development

### Project Structure
```
ai-bookmark-manager/
├── src/
│   ├── commands/       # CLI commands
│   ├── analyzers/      # Bookmark analysis logic
│   ├── parsers/        # Bookmark file parsing
│   ├── organizers/     # Organization logic
│   ├── utils/          # Utility functions
│   └── types/          # TypeScript types
├── dist/               # Compiled JavaScript
└── package.json
```

### Building
```bash
# TypeScript compilation
npm run build

# Development mode (build + run)
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

### Contributing
Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Troubleshooting

### Chrome is running
- Error: "Bookmarks file is locked"
- Solution: Close Chrome completely before running

### Permission denied
- Error: "Cannot read bookmarks file"
- Solution: Run with appropriate permissions or check file path

### No bookmarks found
- Error: "No bookmark file at path"
- Solution: Specify path manually with `-f` option

## License

MIT License - See [LICENSE](LICENSE) file for details

## Author

Created by **Shintaro Inagaki**

## Acknowledgments

- Powered by Google Gemini AI for intelligent analysis
- Built with TypeScript and Node.js
- Uses Chrome bookmark format specification

---

**Note**: This tool modifies your Chrome bookmarks. Always backup before use!