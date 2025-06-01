# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clauditor is an Electron desktop application that analyzes Claude Code API usage logs from `~/.claude/projects/**/*.jsonl` files. The application provides visualization of token usage, costs, and statistics through a React-based dashboard.

**Key Architecture:**
- **Electron-only architecture** (simplified from previous hybrid backend/Electron setup)
- **React 19** frontend with TypeScript and Tailwind CSS
- **Zustand** for state management
- **Native file system access** via Electron IPC with chokidar for real-time monitoring
- **LRU caching system** for performance optimization
- **Streaming JSONL processing** for large files (>10MB)

## Development Commands

### Core Development
```bash
npm run electron:dev    # Start Electron app in development mode
npm run dev            # Start web version (limited functionality)
npm run build          # Build for production
npm run lint           # Run ESLint
```

### Testing
```bash
npm run test           # Run tests in watch mode
npm run test:run       # Run tests once
npm run test:ui        # Run tests with UI
```

### Building & Distribution
```bash
npm run build:mac      # Build macOS DMG/ZIP packages
npm run build:win      # Build Windows NSIS/ZIP packages  
npm run build:linux    # Build Linux AppImage/tar.gz packages
npm run dist           # Build all platforms without publishing
```

## Architecture Details

### Electron IPC Architecture
- **Main Process**: `electron/main.ts` - Handles file system operations, caching, and chokidar watching
- **Preload Script**: `electron/preload.ts` - Uses CommonJS format (not ES6) to expose APIs via contextBridge
- **Renderer**: React app communicates via `window.electronAPI`

### File System Integration
- **hybridFileSystem.ts**: Simplified to Electron-only (no backend service)
- **electronFileSystem.ts**: Direct Electron IPC calls
- **Cache implementation**: In-memory LRU with TTL and file modification time validation
- **Streaming processing**: Large JSONL files processed line-by-line to prevent memory issues

### State Management
- **Zustand store**: `src/stores/useAppStore.ts` - Central state for projects, logs, settings, and UI state
- **Settings**: Exchange rate, dark mode, custom project paths
- **Error handling**: Centralized error state with typed error objects

### Data Processing Flow
1. **Project scanning**: Recursively scan `~/.claude/projects/` for directories containing `.jsonl` files
2. **Log parsing**: Stream-parse JSONL files, filter valid entries with usage data
3. **Data aggregation**: Group entries by date, calculate token usage and costs
4. **Real-time updates**: chokidar watches for file changes and invalidates cache

## Important Implementation Notes

### Preload Script Format
The preload script MUST use CommonJS format (`require()`) not ES6 imports. The vite.config.ts is configured to build preload scripts as CJS format.

### File Path Handling
- Default project path: `~/.claude/projects/`
- Custom paths supported via settings
- Path validation happens in main process for security

### Performance Considerations
- Files >10MB use streaming processing
- LRU cache with 5-minute TTL and file modification time checks
- Throttled file system events to prevent UI flooding
- Lazy loading of project data

### Testing Setup
- **vitest** with jsdom environment
- **@testing-library/react** for component testing
- **Mock electronAPI** in test setup for non-Electron environments
- Test files in `src/test/` directory

## Key Files to Understand

- `electron/main.ts` - Electron main process with file operations and caching
- `src/utils/hybridFileSystem.ts` - Simplified file system interface (Electron-only)
- `src/stores/useAppStore.ts` - Central Zustand state management
- `src/utils/dataAggregator.ts` - JSONL parsing and data transformation logic
- `vite.config.ts` - Build configuration for Electron + React with CJS preload script

## Data Format

The application processes Claude Code JSONL logs with entries containing:
- `timestamp`: ISO date string
- `message.usage`: Token usage data (input/output tokens)
- `costUSD`: API cost in USD
- Other metadata fields

Cost calculation supports configurable USD/JPY exchange rate in settings.