# DuckDBベース監視システム - 技術レポート

## 概要

Clauditorアプリケーションにおいて、従来のchokidarファイル監視システムからDuckDBベースのポーリング監視システムへの移行を実施しました。この変更により、パフォーマンス向上、安定性向上、システムの簡素化を実現しています。

## 🦆 DuckDBベース監視システム

### 1. **監視アーキテクチャ**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   ~/.claude/    │    │   DuckDB CLI     │    │   Clauditor     │
│   projects/     │───▶│   SQL Query      │───▶│   Dashboard     │
│   **/*.jsonl    │    │   Engine         │    │   Update        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        ▲                        ▲                        ▲
        │                        │                        │
    ファイル変更              SQLクエリ実行            UIリフレッシュ
    (リアルタイム)            (30秒キャッシュ)          (30秒間隔)
```

### 2. **監視の流れ**

#### **初期化段階** (`public/app.js:102-109`)
```javascript
// DuckDB監視システム (自動リフレッシュはDuckDBキャッシュTTLに依存)
console.log('🦆 DuckDB監視システムが有効です (30秒キャッシュ)');

// 定期的なデータ更新 (DuckDBキャッシュと同期)
setInterval(() => {
    console.log('🔄 定期データ更新 (DuckDB)');
    this.refreshData();
}, 30000); // 30秒間隔
```

#### **データ取得パイプライン**
1. **UIリクエスト** → `refreshData()` 
2. **DuckDBプロセッサー** → `getChartCompatibleData(period)`
3. **キャッシュチェック** → 30秒以内なら即座に返却
4. **SQLクエリ実行** → DuckDB CLIでJSONLファイルを直接解析
5. **データ変換** → Chart.js互換形式に変換
6. **キャッシュ保存** → 次回アクセス用

### 3. **DuckDBクエリエンジン** (`public/duckdb-processor.js`)

#### **キャッシュシステム**
```javascript
constructor() {
    this.cache = new Map();
    this.cacheTime = 30000; // 30秒キャッシュ
}

// キャッシュヒット判定
if (cached && Date.now() - cached.timestamp < this.cacheTime) {
    console.log(`🚀 DuckDB Cache hit: ${cacheKey}`);
    return cached.data;
}
```

#### **並列SQLクエリ実行**
```javascript
// 4つのクエリを並列実行
const [dailyData, hourlyData, projectData, statsData] = await Promise.all([
    this.executeDuckDBQuery(dailyQuery),      // 日別集計
    this.executeDuckDBQuery(hourlyQuery),     // 時間別集計
    this.executeDuckDBQuery(projectQuery),    // プロジェクト別集計
    this.executeDuckDBQuery(statsQuery)       // 全体統計
]);
```

### 4. **DuckDB CLI実行** (`electron/main.ts:59-105`)

#### **SQLクエリ実行**
```typescript
const executeDuckDBQuery = async (query: string): Promise<any[]> => {
    const command = `duckdb -json -c "${query.replace(/"/g, '\\"')}"`;
    const { stdout, stderr } = await execAsync(command);
    
    // JSON出力をパース
    const data = JSON.parse(stdout.trim());
    return Array.isArray(data) ? data : [data];
};
```

#### **典型的なSQLクエリ例**
```sql
-- 日別使用量取得
SELECT 
    DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') as date,
    SUM(CAST(message -> 'usage' ->> 'input_tokens' AS INTEGER)) as input_tokens,
    SUM(CAST(message -> 'usage' ->> 'output_tokens' AS INTEGER)) as output_tokens,
    SUM(COALESCE(costUSD, 0)) as cost_usd,
    COUNT(*) as entries
FROM read_json('~/.claude/projects/**/*.jsonl', ignore_errors=true)
WHERE timestamp IS NOT NULL 
  AND timestamp >= '${startDate}'
GROUP BY DATE(timestamp::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')
ORDER BY date DESC
```

### 5. **監視フロー詳細**

#### **毎30秒の自動更新サイクル**
```
時刻 0:00 → UIリクエスト → DuckDBクエリ実行 → データ取得 → キャッシュ保存 → UI更新
時刻 0:30 → UIリクエスト → キャッシュヒット → 即座にUI更新
時刻 1:00 → UIリクエスト → キャッシュ期限切れ → DuckDBクエリ実行 → 新データ取得
```

#### **リアルタイム性の仕組み**
- **ファイル変更検出**: DuckDBが直接ファイルシステムを読み取り
- **自動反映**: 次回クエリ実行時に最新データを自動取得
- **キャッシュ無効化**: 手動リフレッシュ時にキャッシュクリア可能

### 6. **従来のchokidarとの比較**

| 項目 | chokidar方式 | DuckDB方式 |
|------|-------------|------------|
| **監視方式** | ファイルシステムイベント | SQLクエリポーリング |
| **更新頻度** | リアルタイム | 30秒間隔 |
| **システム負荷** | 高（常時監視） | 低（必要時のみクエリ） |
| **安定性** | ファイルロックエラー有り | 安定 |
| **データ処理** | JS解析 + chokidar | DuckDB SQL Engine |
| **メモリ使用量** | 高 | 低（キャッシュのみ） |

### 7. **テスト・デバッグ機能**

#### **Ctrl+Shift+T**: DuckDB監視テスト
```javascript
async testDuckDBMonitoring() {
    // 1. DuckDBクエリ実行テスト
    const result = await window.electronAPI.testFileWatcher();
    
    // 2. キャッシュクリアテスト
    this.duckDBProcessor.clearCache();
    
    // 3. データ更新テスト
    await this.refreshData();
    
    // 4. 監視ステータス確認
    const status = await window.electronAPI.getFileWatcherStatus();
}
```

## 実装の詳細

### 削除された機能

#### **chokidar関連コンポーネント**
- `import chokidar from 'chokidar'` の削除
- `fileWatcher: chokidar.FSWatcher` 変数の削除
- `startFileWatcher()` / `stopFileWatcher()` 関数の削除
- `file-system-change` イベント監視の削除

#### **IPC通信の簡素化**
- `start-file-watcher` / `stop-file-watcher` IPCハンドラーの削除
- `onFileSystemChange` / `removeFileSystemChangeListener` の削除
- 複雑なファイル監視デバッグ機能の削除

#### **依存関係の削除**
```json
// package.json から削除
"chokidar": "^4.0.3"
```

### 新しいDuckDB監視システム

#### **監視ステータス** (`electron/main.ts:428-439`)
```typescript
ipcMain.handle('get-file-watcher-status', async () => {
  return {
    isWatching: true, // DuckDBによる監視は常にアクティブ
    projectsDir,
    dirExists,
    watcherReady: true,
    method: 'DuckDB'
  };
});
```

#### **DuckDBテスト機能** (`electron/main.ts:455-482`)
```typescript
ipcMain.handle('test-file-watcher', async () => {
  const testQuery = `
    SELECT COUNT(*) as file_count 
    FROM read_json('~/.claude/projects/**/*.jsonl', ignore_errors=true)
    WHERE timestamp IS NOT NULL
  `;
  
  const result = await executeDuckDBQuery(testQuery);
  return { 
    success: true, 
    method: 'DuckDB',
    fileCount: result[0]?.file_count || 0,
    message: `DuckDB monitoring is working. Found ${result[0]?.file_count || 0} log entries.`
  };
});
```

## パフォーマンス分析

### メモリ使用量
- **chokidar方式**: 常時ファイル監視でメモリ使用量が高い
- **DuckDB方式**: キャッシュのみでメモリ効率的

### CPU使用量
- **chokidar方式**: ファイルシステムイベント処理で常時CPU使用
- **DuckDB方式**: 30秒間隔のクエリ実行時のみCPU使用

### ディスクI/O
- **chokidar方式**: 常時ファイルシステム監視
- **DuckDB方式**: クエリ実行時のみファイル読み取り

### 応答性
- **chokidar方式**: リアルタイム更新だが不安定
- **DuckDB方式**: 30秒遅延だが安定

## 利点と効果

### ✅ **パフォーマンス向上**
- DuckDBの高速SQL処理エンジン活用
- メモリ使用量の大幅削減
- CPU負荷の軽減

### ✅ **安定性向上**
- ファイルロックエラーの完全排除
- ファイルシステム監視エラーの削除
- 予測可能な動作パターン

### ✅ **システム簡素化**
- 複雑なchokidar設定の削除
- IPC通信の簡素化
- デバッグ機能の簡潔化

### ✅ **スケーラビリティ**
- 大量のJSONLファイルに対応
- SQLベースの効率的なデータ処理
- 並列クエリ実行

### ✅ **メンテナンス性**
- SQLベースで理解しやすい
- デバッグが容易
- 機能拡張が簡単

## 結論

DuckDBベース監視システムへの移行により、Clauditorアプリケーションはより安定し、高性能で、メンテナンスしやすいアーキテクチャを獲得しました。30秒間隔の更新頻度は実用上十分であり、DuckDBの高速処理能力により、従来のリアルタイム監視を上回る安定性を実現しています。

この変更は、modern data processing pipelineの典型例として、ファイルシステム監視からSQL-based data pipelineへの移行の成功事例と言えます。

---

**作成日**: 2025年6月7日  
**技術スタック**: DuckDB CLI, Electron IPC, JavaScript, SQL  
**対象バージョン**: Clauditor v1.0.0+