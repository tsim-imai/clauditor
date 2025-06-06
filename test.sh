#!/bin/bash

# Color definitions
BLUE='\033[1;34m'
CYAN='\033[1;36m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
MAGENTA='\033[1;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}                     Claude Code トークン使用状況レポート                  ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

duckdb -c "
SELECT
  日付,
  入力トークン,
  出力トークン,
  合計トークン,
  料金
FROM (
  SELECT
    strftime(DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo'), '%Y年%m月%d日') AS 日付,
    LPAD(FORMAT('{:,}', SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER))), 12, ' ') AS 入力トークン,
    LPAD(FORMAT('{:,}', SUM(CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER))), 12, ' ') AS 出力トークン,
    LPAD(FORMAT('{:,}', SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER) + CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER))), 12, ' ') AS 合計トークン,
    LPAD(FORMAT('¥{:,}', CAST(ROUND(SUM(costUSD) * 150, 0) AS INTEGER)), 10, ' ') AS 料金,
    DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') as sort_date
  FROM read_json('~/.claude/projects/**/*.jsonl', ignore_errors=true)
  WHERE timestamp IS NOT NULL
  GROUP BY DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')

  UNION ALL

  SELECT
    '────────────────' AS 日付,
    '────────────' AS 入力トークン,
    '────────────' AS 出力トークン,
    '────────────' AS 合計トークン,
    '──────────' AS 料金,
    '9999-12-30' as sort_date

  UNION ALL

  SELECT
    '【合計】' AS 日付,
    LPAD(FORMAT('{:,}', SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER))), 12, ' ') AS 入力トークン,
    LPAD(FORMAT('{:,}', SUM(CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER))), 12, ' ') AS 出力トークン,
    LPAD(FORMAT('{:,}', SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER) + CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER))), 12, ' ') AS 合計トークン,
    LPAD(FORMAT('¥{:,}', CAST(ROUND(SUM(costUSD) * 150, 0) AS INTEGER)), 10, ' ') AS 料金,
    '9999-12-31' as sort_date
  FROM read_json('~/.claude/projects/**/*.jsonl', ignore_errors=true)
  WHERE timestamp IS NOT NULL
)
ORDER BY sort_date DESC NULLS LAST;
"

echo
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

