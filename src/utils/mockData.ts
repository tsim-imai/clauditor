import type { LogEntry } from '../types';

export const generateMockLogEntries = (_projectName: string): LogEntry[] => {
  const entries: LogEntry[] = [];
  const today = new Date();
  
  // Generate mock data for the last 14 days
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // Generate 1-5 entries per day
    const entriesPerDay = Math.floor(Math.random() * 5) + 1;
    
    for (let j = 0; j < entriesPerDay; j++) {
      const timestamp = new Date(date);
      timestamp.setHours(Math.floor(Math.random() * 24));
      timestamp.setMinutes(Math.floor(Math.random() * 60));
      
      const inputTokens = Math.floor(Math.random() * 2000) + 500;
      const outputTokens = Math.floor(Math.random() * 1500) + 300;
      const costUSD = (inputTokens * 0.000015) + (outputTokens * 0.00006); // Approximated pricing
      
      entries.push({
        timestamp: timestamp.toISOString(),
        message: {
          usage: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          },
        },
        costUSD: Math.round(costUSD * 1000) / 1000, // Round to 3 decimal places
      });
    }
  }
  
  return entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
};