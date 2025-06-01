# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clauditor is an Electron desktop application that analyzes Claude Code API usage logs from `~/.claude/projects/**/*.jsonl` files. The application provides visualization of token usage, costs, and statistics through a modern dashboard and calendar view.

**Key Architecture:**
- **Electron-only architecture** with Vanilla HTML+JS+CSS frontend
- **Time-centric dashboard** with dynamic period filtering and Chart.js integration
- **Calendar view** with daily usage heatmap and detailed analysis
- **Exchange rate integration** with automatic API fetching
- **Native file system access** via Electron IPC with chokidar for real-time monitoring
- **LRU caching system** for performance optimization
- **Streaming JSONL processing** for large files (>10MB)

## Development Commands

### Core Development
```bash
npm run dev            # Start Electron app in development mode
npm run electron:dev   # Start Electron only development mode
npm run build          # Build for production
npm run lint           # Run ESLint
```

### Building & Distribution
```bash
npm run build:mac      # Build macOS DMG/ZIP packages
npm run build:win      # Build Windows NSIS/ZIP packages  
npm run build:linux    # Build Linux AppImage/tar.gz packages
npm run dist           # Build all platforms without publishing
```

## Architecture Details

### Current Implementation (Vanilla Frontend)
- **Frontend**: Pure HTML+JS+CSS in `/public/` directory
  - `index.html` - Main HTML with dashboard and calendar views
  - `app.js` - Application logic with Chart.js integration
  - `styles.css` - Modern CSS with CSS custom properties and dark mode support
- **Backend**: Electron processes in `/electron/` directory
  - `main.ts` - Main process with file operations, caching, and API integration
  - `preload.ts` - Preload script (CommonJS format) exposing APIs via contextBridge

### UI/UX Features

#### Dashboard View
- **Time Filter Bar**: 5 period filters (today, week, month, year, all)
- **Dynamic Statistics Cards**: Period-responsive cards showing usage, cost, hours, and comparison data
- **Chart Grid**: 4 interactive Chart.js charts
  - Usage trends (line chart with tokens/cost/calls switching)
  - Hourly usage patterns (bar chart)
  - Project distribution (doughnut chart)
  - Weekly comparison (grouped bar chart)
- **Insights Section**: Usage insights and compact project list

#### Calendar View
- **Monthly Calendar**: Visual heatmap with 5-level color coding
- **Date Selection**: Click dates for detailed statistics
- **Sidebar Details**: Selected date stats and project breakdown chart
- **Navigation**: Previous/next month and "today" jump functionality

### Electron IPC Architecture
- **Main Process**: `electron/main.ts` - Handles file system operations, caching, chokidar watching, and exchange rate API
- **Preload Script**: `electron/preload.ts` - Uses CommonJS format to expose APIs via contextBridge
- **Renderer**: Vanilla JS app communicates via `window.electronAPI`

### File System Integration
- **Direct Electron IPC**: Simplified file system access through main process
- **Cache implementation**: In-memory LRU with TTL and file modification time validation
- **Streaming processing**: Large JSONL files processed line-by-line to prevent memory issues
- **Real-time monitoring**: chokidar watches for file changes and invalidates cache

### Exchange Rate Integration
- **Primary API**: ExchangeRate-API.com for USD/JPY rates
- **Fallback API**: Open Exchange Rates API
- **Auto-update**: 24-hour automatic refresh cycle
- **Manual refresh**: User-triggered rate updates
- **Status tracking**: Source and timestamp information

### State Management
- **Class-based architecture**: `AppState` class managing all application state
- **View switching**: Dashboard ↔ Calendar view management
- **Period filtering**: Dynamic data filtering with chart updates
- **Settings persistence**: localStorage for user preferences
- **Error handling**: Centralized error state with user-friendly messages

### Data Processing Flow
1. **Project scanning**: Recursively scan `~/.claude/projects/` for directories containing `.jsonl` files
2. **Log parsing**: Stream-parse JSONL files, filter valid entries with usage data
3. **Data aggregation**: 
   - Daily aggregation for calendar view
   - Period-based filtering for dashboard
   - Project-based grouping for charts
4. **Real-time updates**: chokidar watches for file changes and triggers data refresh

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
- Chart.js optimization with responsive settings and theme switching

### Chart.js Integration
- **Responsive design**: All charts adapt to container size
- **Theme switching**: Charts update colors when dark mode toggles
- **Interactive features**: Chart type switching, hover effects, legends
- **Performance**: Efficient chart destruction and recreation on data updates

### Calendar Implementation
- **Heatmap visualization**: 5-level color coding based on usage intensity
- **Date selection**: Click interaction with sidebar detail updates
- **Monthly navigation**: Previous/next month with current date tracking
- **Usage level calculation**: Dynamic scaling based on maximum daily usage

## Key Files to Understand

- `electron/main.ts` - Electron main process with file operations, caching, and exchange rate API
- `public/app.js` - Main application logic with Chart.js integration and view management
- `public/index.html` - Complete UI structure with dashboard and calendar views
- `public/styles.css` - Modern CSS with custom properties and responsive design
- `vite.config.ts` - Build configuration for Electron + Vanilla frontend

## Data Format

The application processes Claude Code JSONL logs with entries containing:
- `timestamp`: ISO date string
- `message.usage`: Token usage data (input/output tokens)
- `costUSD`: API cost in USD
- `projectName`: Added during processing for project identification

Cost calculation supports configurable USD/JPY exchange rate with automatic API updates.

## Development Notes

### No React/TypeScript Frontend
The current implementation uses Vanilla HTML+JS+CSS for the frontend, replacing the previous React implementation. This provides:
- Faster load times
- Simpler debugging
- Direct Chart.js integration
- Better theme control
- Reduced bundle size

### Chart.js Best Practices
- Always destroy previous chart instances before creating new ones
- Use responsive configuration for mobile compatibility
- Implement theme-aware color schemes
- Handle empty data states gracefully

### Calendar Implementation Details
- Use `toISOString().split('T')[0]` for consistent date keys
- Implement 5-level usage intensity calculation
- Handle month boundaries and date selection properly
- Provide visual feedback for today, selected dates, and usage levels