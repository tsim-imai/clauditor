# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`clauditor` is a web dashboard for analyzing Claude Code usage logs. It parses JSONL files containing API usage data and provides visualization of token usage and costs with Japanese localization.

## Technology Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS with dark mode support
- **State Management**: Zustand
- **Charts**: Recharts
- **Icons**: Lucide React
- **File Parsing**: Native JavaScript (no PapaParse dependency used)

## Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Architecture

### Core Components
- `Header` - App header with settings and dark mode toggle
- `Sidebar` - File upload and settings display
- `DataTable` - Tabular display of daily usage statistics
- `UsageChart` - Bar charts for token usage and costs using Recharts

### Data Flow
1. User uploads JSONL files via `Sidebar`
2. `jsonlParser.ts` processes files and extracts log entries
3. `dataAggregator.ts` groups data by date and calculates totals
4. Zustand store manages global state
5. Components consume data from store and render visualizations

### Key Data Types
- `LogEntry` - Raw log entry from JSONL file
- `DailyStats` - Aggregated daily statistics
- `AppSettings` - User preferences (exchange rate, dark mode)

## File Structure

```
src/
├── components/     # React components
├── stores/        # Zustand state management
├── types/         # TypeScript type definitions
├── utils/         # Utility functions for parsing and aggregation
└── App.tsx        # Main application component
```