# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Bookmark Manager** is a Node.js CLI tool for managing Chrome bookmarks. It provides analysis, cleanup, organization, and import/export capabilities for browser bookmarks.

## Commands

### Development Commands
```bash
npm run dev              # Build and run the application
npm run build            # Compile TypeScript
npm run start            # Run compiled application
npm run test             # Run test suite
npm run lint             # ESLint checks
npm run format           # Format code with Prettier
```

### CLI Commands (after building)
```bash
node dist/index.js analyze    # Analyze bookmark structure
node dist/index.js cleanup    # Clean up bookmarks  
node dist/index.js export     # Export bookmarks
node dist/index.js import     # Import bookmarks
```

## Architecture

### Core Components
This is a TypeScript CLI application that processes Chrome bookmark files:

**Main Components:**
1. **BookmarkParser** - Parses Chrome bookmarks JSON format
2. **BookmarkAnalyzer** - Analyzes duplicates, dead links, structure
3. **BookmarkCleaner** - Performs cleanup operations
4. **BookmarkExporter** - Exports to various formats
5. **CLI Commands** - User interface for operations

### Data Flow
1. **Import** - Read Chrome bookmarks file or JSON export
2. **Parse** - Convert to internal bookmark structure
3. **Analyze** - Detect issues, calculate statistics
4. **Process** - Clean up, organize, or transform
5. **Export** - Save results in desired format

### Bookmark Structure
Chrome bookmarks are stored in JSON format with this structure:
- **Folders** - Container objects with children array
- **Bookmarks** - Individual bookmark objects with URL and metadata
- **Hierarchy** - Nested folder structure with bookmark bar, other bookmarks

## Key Features Implementation

### Duplicate Detection
- **Exact Duplicates** - Same URL and title
- **Similar Bookmarks** - Fuzzy matching on title/URL
- **Smart Grouping** - Group related duplicates for review
- **Configurable Threshold** - Adjustable similarity sensitivity

### Dead Link Detection
- **HTTP Status Checking** - Verify URL accessibility
- **Timeout Handling** - Handle slow or unresponsive sites
- **Batch Processing** - Process multiple URLs efficiently
- **Error Categorization** - Classify different types of failures

### Organization Features
- **Auto-Categorization** - Suggest folders based on content
- **Tag-Based Organization** - Use URL patterns and keywords
- **Bulk Operations** - Move multiple bookmarks efficiently
- **Folder Optimization** - Suggest folder structure improvements

## Development Guidelines

### Chrome Bookmarks File Location
- **Windows**: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Bookmarks`
- **macOS**: `~/Library/Application Support/Google/Chrome/Default/Bookmarks`
- **Linux**: `~/.config/google-chrome/Default/Bookmarks`

### Data Processing Patterns
- **Stream Processing** - Handle large bookmark collections
- **Async Operations** - Non-blocking URL verification
- **Error Recovery** - Graceful handling of corrupt data
- **Progress Reporting** - User feedback for long operations

### Security Considerations
- **Read-Only Operations** - Never modify original bookmarks file
- **Data Validation** - Validate input data structure
- **URL Safety** - Sanitize URLs before processing
- **Backup Creation** - Always create backups before modifications

## Testing Strategy

### Unit Testing Focus Areas
- BookmarkParser JSON parsing and validation
- Duplicate detection algorithms
- URL validation and dead link detection
- Export format generation

### Integration Testing
- End-to-end CLI command execution
- File I/O operations with sample bookmark files
- Network requests for dead link detection

### Test Data
- Sample Chrome bookmarks JSON files
- Edge cases: empty folders, malformed URLs
- Large datasets for performance testing

## File Format Support

### Input Formats
- **Chrome JSON** - Native Chrome bookmarks format
- **HTML Netscape** - Standard bookmark export format
- **CSV** - Custom CSV format for bulk import

### Output Formats
- **JSON** - Structured data export
- **HTML** - Browser-compatible format
- **CSV** - Spreadsheet-compatible format
- **Markdown** - Human-readable documentation

## Performance Considerations

### Large Dataset Handling
- **Streaming** - Process bookmarks in chunks
- **Indexing** - Create lookup tables for fast searches
- **Caching** - Cache URL validation results
- **Memory Management** - Avoid loading entire dataset in memory

### Network Operations
- **Rate Limiting** - Respect server limits when checking URLs
- **Concurrent Processing** - Parallel URL verification with limits
- **Retry Logic** - Handle temporary network failures
- **User-Agent** - Proper identification for web requests

## CLI Design Patterns

### Command Structure
- **Subcommands** - Separate analyze, cleanup, export operations
- **Options** - Configurable behavior with sensible defaults
- **Interactive Mode** - Prompts for dangerous operations
- **Dry Run** - Preview changes before execution

### Output Design
- **Progress Indicators** - Show progress for long operations
- **Structured Output** - Tables and formatted results
- **Verbose Mode** - Detailed logging for debugging
- **Summary Reports** - High-level statistics and results

## Integration Points

### Browser Integration
- **Direct File Access** - Read Chrome bookmarks file
- **Extension Compatibility** - Work with browser extension exports
- **Cross-Browser Support** - Support multiple browser formats
- **Live Sync** - Potential future Chrome extension integration

### External Tools
- **URL Validators** - Integration with link checking services
- **Web APIs** - Metadata enrichment from web services
- **Automation** - Scriptable operations for power users
- **Backup Services** - Integration with cloud storage