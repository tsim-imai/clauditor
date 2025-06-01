# ファイルシステムアクセス実装方法の技術分析

## 実装方法の詳細比較

### 1. Electron アプリ（推奨案）

#### 技術スペック
- **ベースフレームワーク**: Electron 28+ 
- **Node.js統合**: フルアクセス可能
- **パッケージサイズ**: ~150MB
- **起動時間**: 2-3秒
- **メモリ使用量**: ~100-200MB

#### Mac固有の利点
```bash
# macOSでのパス解決例
const os = require('os');
const path = require('path');
const claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');
```

- **macOSセキュリティ**: アプリケーション署名で信頼性確保
- **ファイルシステム権限**: フルアクセス権限取得可能
- **Spotlight統合**: 検索インデックス対応
- **通知センター**: 処理完了通知可能

#### 実装コード例
```typescript
// main.ts (Electronメインプロセス)
import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

ipcMain.handle('scan-claude-projects', async () => {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  try {
    const projects = await fs.readdir(projectsDir);
    const projectInfo = [];
    
    for (const project of projects) {
      const projectPath = path.join(projectsDir, project);
      const stat = await fs.stat(projectPath);
      if (stat.isDirectory()) {
        const jsonlFiles = await findJsonlFiles(projectPath);
        projectInfo.push({
          name: project,
          path: projectPath,
          logFiles: jsonlFiles,
          lastModified: stat.mtime
        });
      }
    }
    return projectInfo;
  } catch (error) {
    throw new Error(`Failed to scan projects: ${error.message}`);
  }
});
```

### 2. File System Access API

#### 制限事項（Mac）
- **Safari**: 未サポート（2024年現在）
- **Chrome/Edge**: 対応済み
- **Firefox**: 未サポート

#### 実装例
```typescript
// ユーザーがディレクトリを手動選択する必要がある
async function selectClaudeProjectsDir() {
  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await window.showDirectoryPicker();
      return await scanDirectory(dirHandle);
    } catch (error) {
      console.error('Directory selection cancelled or failed:', error);
    }
  } else {
    alert('File System Access API not supported in this browser');
  }
}
```

### 3. Node.js バックエンド API

#### アーキテクチャ
```
Frontend (React) ←→ REST API ←→ Node.js Server ←→ File System
```

#### 実装コスト
- **開発時間**: 2-3週間追加
- **運用コスト**: サーバーホスティング必要
- **複雑度**: 認証・セキュリティ・エラーハンドリング

## 推奨実装パス

### Phase 1: Electron 最小実装 (1週間)
1. **Electron導入**
   ```bash
   npm install --save-dev electron
   npm install --save-dev @electron-forge/cli
   ```

2. **メインプロセス実装**
   - ファイルシステムスキャン機能
   - JSONLファイル読み込み
   - IPC通信設定

3. **既存Reactコードの統合**
   - レンダラープロセスでの表示
   - IPCを使った通信

### Phase 2: 機能拡張 (1-2週間)
1. **自動更新機能**
   - ファイルシステム監視
   - リアルタイム更新

2. **エラーハンドリング**
   - 権限エラー処理
   - ファイル破損対応

3. **パッケージング**
   - macOS .app バンドル
   - 自動更新機能

## セキュリティ考慮事項

### macOS固有のセキュリティ
- **Gatekeeper**: 開発者署名が必要
- **サンドボックス**: ファイルアクセス制限
- **公証**: macOS Catalina以降で必要

### 実装時の注意点
```typescript
// セキュアなパス解決
const sanitizePath = (userPath: string): string => {
  const normalized = path.normalize(userPath);
  const resolved = path.resolve(normalized);
  
  // ~/.claude/projects 配下のみアクセス許可
  const allowedBase = path.join(os.homedir(), '.claude', 'projects');
  if (!resolved.startsWith(allowedBase)) {
    throw new Error('Access denied: Path outside allowed directory');
  }
  return resolved;
};
```

## パフォーマンス分析

### ファイルスキャン性能（Mac）
```typescript
// 大量ファイル対応の非同期処理
async function scanLargeDirectory(dirPath: string): Promise<ProjectInfo[]> {
  const concurrency = 5; // 同時処理数制限
  const semaphore = new Semaphore(concurrency);
  
  const results = await Promise.all(
    projects.map(async (project) => {
      const release = await semaphore.acquire();
      try {
        return await processProject(project);
      } finally {
        release();
      }
    })
  );
  
  return results;
}
```

### メモリ効率化
- **ストリーミング読み込み**: 大容量JSONLファイル対応
- **チャンク処理**: メモリ使用量制限
- **キャッシュ戦略**: 頻繁にアクセスするデータの最適化

## 実装優先度

1. **🔴 最優先**: Electron基本実装
2. **🟡 中優先**: エラーハンドリング・パフォーマンス最適化
3. **🟢 低優先**: 自動更新・パッケージング・配布

---

*分析日: 2024-06-01*
*対象環境: macOS Sonoma 14.5*