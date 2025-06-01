import type { LogEntry } from '../types';

export const parseJsonlFiles = async (files: FileList): Promise<LogEntry[]> => {
  const allEntries: LogEntry[] = [];

  for (const file of Array.from(files)) {
    if (!file.name.endsWith('.jsonl')) {
      continue;
    }

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as LogEntry;
        if (entry.timestamp && entry.message?.usage && entry.costUSD !== undefined) {
          allEntries.push(entry);
        }
      } catch (error) {
        console.warn(`Failed to parse line: ${line}`, error);
      }
    }
  }

  return allEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
};