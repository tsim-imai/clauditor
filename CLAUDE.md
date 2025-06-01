# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`clauditor` is a web dashboard for analyzing Claude Code usage logs. It automatically scans `~/.claude/projects/` directories for JSONL files and provides visualization of token usage and costs with Japanese localization. Currently uses mock data due to browser file system limitations.

## Technology Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS with dark mode support
- **State Management**: Zustand
- **Charts**: Recharts
- **Icons**: Lucide React
- **File Parsing**: PapaParse + native JavaScript

## Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Architecture

### Implementation Status
- ✅ **Complete**: UI components, data visualization, mock data system
- 🔄 **In Progress**: File system access (currently mock implementation)
- ❌ **TODO**: Real `~/.claude/projects/` scanning (see TODO.md)

### Core Components
- `Header` - App header with settings modal and dark mode toggle
- `Sidebar` - Project browser with selection and metadata display
- `DataTable` - Daily usage statistics table with totals
- `UsageChart` - Dual bar charts for token usage and costs

### Data Flow (Current Mock Implementation)
1. `getMockProjects()` provides sample project list
2. User selects project from `Sidebar`
3. `generateMockLogEntries()` creates realistic usage data
4. `dataAggregator.ts` processes and groups data by date
5. Zustand store manages all application state
6. Components render data with real-time exchange rate conversion

### Key Data Types
- `LogEntry` - Raw log entry from JSONL file
- `DailyStats` - Aggregated daily statistics
- `ProjectInfo` - Project metadata (name, path, files, lastModified)
- `AppSettings` - User preferences (exchange rate, dark mode)

### Mock Data System
**Location**: `src/utils/mockData.ts` and `src/utils/claudeProjectScanner.ts`

The mock system generates realistic data for 3 sample projects over 14 days:
- Random daily usage patterns (1-5 API calls per day)
- Realistic token counts and cost calculations
- Proper timestamp and metadata formatting

**Browser Limitations**: Real file system access requires Electron, backend service, or File System Access API due to browser security restrictions.

### Critical Implementation Notes
- **File Upload Removed**: Originally designed for manual file upload, now uses automatic project scanning
- **State Management**: Extended Zustand store includes `projects[]` and `selectedProject`
- **Real Implementation Path**: TODO.md prioritizes Electron app for native file system access
- **Japanese Localization**: All UI text and date formatting uses Japanese locale

## File Structure

```
src/
├── components/     # React components (Header, Sidebar, DataTable, UsageChart)
├── stores/        # Zustand state management (useAppStore.ts)
├── types/         # TypeScript interfaces (LogEntry, DailyStats, ProjectInfo, AppSettings)
├── utils/         # Utilities (mockData, claudeProjectScanner, dataAggregator, jsonlParser)
└── App.tsx        # Main application with dark mode management
```

## Next Steps

Refer to `TODO.md` for detailed implementation roadmap. Priority: implement real file system access via Electron or backend service to replace mock data system.