# Clauditor Backend Service

Clauditor のバックエンドサービスです。`~/.claude/projects/**/*.jsonl` ファイルへのアクセスをHTTP API経由で提供します。

## 機能

- Claude プロジェクトディレクトリのスキャン
- JSONL ファイルの読み込み・解析
- ファイルシステム変更の監視
- パス検証とセキュリティ制御
- CORS とレート制限

## 起動方法

### 開発環境

```bash
cd server
npm install
npm run dev
```

### 本番環境

```bash
cd server
npm install
npm run build
npm start
```

## 環境変数

`.env.example` をコピーして `.env` ファイルを作成してください。

```bash
cp .env.example .env
```

主要な設定項目：

- `PORT`: サーバーポート（デフォルト: 3001）
- `CLAUDE_PROJECTS_PATH`: Claude プロジェクトディレクトリ（デフォルト: ~/.claude/projects）
- `CORS_ORIGINS`: 許可するオリジン
- `MAX_FILE_SIZE`: 最大ファイルサイズ（バイト）

## API エンドポイント

### GET /health
ヘルスチェック

### GET /api/filesystem/scan-projects
プロジェクトスキャン

クエリパラメータ：
- `projectPath`: カスタムプロジェクトパス
- `includeStats`: 統計情報を含める（true/false）

### GET /api/filesystem/project/:id/entries
プロジェクトエントリ取得

### POST /api/filesystem/validate-path
パス検証

### POST /api/filesystem/watch
ファイルシステム監視開始

### DELETE /api/filesystem/watch
ファイルシステム監視停止

## セキュリティ

- レート制限（デフォルト: 15分間に100リクエスト）
- パストラバーサル攻撃の防止
- セキュリティヘッダーの設定
- CORS制御

## ログ

リクエストログは標準出力に出力されます。本番環境では適切なログ収集システムを使用してください。