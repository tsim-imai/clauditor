import type { LogEntry, DailyStats } from '../types';

export const aggregateByDate = (entries: LogEntry[], exchangeRate: number): DailyStats[] => {
  const dailyMap = new Map<string, {
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
  }>();

  entries.forEach(entry => {
    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    const existing = dailyMap.get(date) || { inputTokens: 0, outputTokens: 0, costUSD: 0 };
    
    dailyMap.set(date, {
      inputTokens: existing.inputTokens + entry.message.usage.input_tokens,
      outputTokens: existing.outputTokens + entry.message.usage.output_tokens,
      costUSD: existing.costUSD + entry.costUSD,
    });
  });

  return Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.inputTokens + data.outputTokens,
      costJPY: Math.round(data.costUSD * exchangeRate),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

export const calculateTotals = (dailyStats: DailyStats[]): DailyStats => {
  return dailyStats.reduce(
    (totals, day) => ({
      date: '合計',
      inputTokens: totals.inputTokens + day.inputTokens,
      outputTokens: totals.outputTokens + day.outputTokens,
      totalTokens: totals.totalTokens + day.totalTokens,
      costJPY: totals.costJPY + day.costJPY,
    }),
    { date: '合計', inputTokens: 0, outputTokens: 0, totalTokens: 0, costJPY: 0 }
  );
};