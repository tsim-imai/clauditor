# Clauditor - Claude Code 使用状況ダッシュボード

Claude Code の API 使用ログを自動的に解析し、トークン使用量とコストを可視化する Electron デスクトップアプリケーションです。

![Clauditor Dashboard](https://via.placeholder.com/800x400?text=Clauditor+Dashboard+Preview)

## 🎯 機能

- **自動プロジェクトスキャン**: `~/.claude/projects/` 内のプロジェクトを自動検出
- **JSONL ログ解析**: Claude Code の使用ログファイルを自動読み込み・解析
- **使用状況可視化**: 日別のトークン使用量とコストをグラフとテーブルで表示
- **ネイティブファイルアクセス**: Electron によるネイティブファイルシステムアクセス
- **リアルタイム監視**: ファイルシステム変更の自動検出・更新
- **高性能キャッシュ**: メモリ効率的なLRUキャッシュシステム
- **日本語対応**: 完全な日本語ローカライゼーション
- **ダークモード**: ライト/ダークテーマの切り替え
- **為替レート設定**: USD から円への換算レート調整
- **配布パッケージ**: macOS DMG/ZIP形式で配布可能

## 🚀 クイックスタート

### 前提条件

- Node.js 18.0.0 以上
- npm または yarn

### インストールと起動

#### Electron アプリ（推奨）

```bash
# リポジトリをクローン
git clone https://github.com/tsim-imai/clauditor.git
cd clauditor

# 依存関係をインストール
npm install

# Electron アプリを起動
npm run electron:dev

# または、配布版DMGを作成
npm run build:mac
```


## 🛠 開発コマンド

```bash
# Electron 関連
npm run electron:dev     # Electron 開発モード
npm run electron:build   # Electron ビルド
npm run build:mac        # macOS 配布パッケージ作成

# Web アプリ関連
npm run dev              # Web 開発サーバー起動
npm run build            # プロダクションビルド
npm run preview          # プロダクションプレビュー

# その他
npm run lint             # ESLint チェック
npm run test             # テスト実行
```

## 📊 現在の実装状況

### ✅ 完了済み（プロダクション版）
- **フル機能の React ダッシュボード UI**: 完全なダッシュボード機能
- **Electron デスクトップアプリ**: ネイティブファイルアクセス対応
- **実際のファイルシステムアクセス**: `~/.claude/projects/` 自動スキャン
- **リアルタイムファイル監視**: chokidar による変更検出
- **高性能キャッシュシステム**: メモリ効率的なLRUキャッシュ
- **配布パッケージ**: macOS DMG/ZIP 形式
- **包括的テスト環境**: Vitest + React Testing Library

### 🔄 継続的改善
- Windows/Linux 配布パッケージ
- データエクスポート機能（CSV/PDF）
- より詳細な使用統計分析
- Web版でのFile System Access API対応

詳細は [TODO.md](./TODO.md) を参照してください。

## 🏗 技術スタック

### フロントエンド
- **React 19** + TypeScript + Vite
- **Tailwind CSS** - スタイリング
- **Zustand** - 状態管理
- **Recharts** - データ可視化
- **Lucide React** - アイコン

### デスクトップアプリ
- **Electron** - ネイティブデスクトップアプリ
- **electron-builder** - アプリケーションパッケージング
- **chokidar** - ファイルシステム監視

### ファイル処理
- **JSONL** パーサー - カスタム実装
- **ストリーミング処理** - 大容量ファイル対応
- **LRU キャッシュ** - メモリ効率化

### 開発・テスト
- **Vitest** - テストフレームワーク
- **React Testing Library** - コンポーネントテスト
- **ESLint** - コード品質管理

## 📁 プロジェクト構造

```
clauditor/
├── src/                    # フロントエンド React アプリ
│   ├── components/         # React コンポーネント
│   │   ├── Header.tsx           # ヘッダー（設定・ダークモード）
│   │   ├── Sidebar.tsx          # プロジェクト一覧
│   │   ├── DataTable.tsx        # 統計テーブル
│   │   ├── UsageChart.tsx       # 使用量グラフ
│   │   ├── SettingsModal.tsx    # 設定モーダル
│   │   └── ErrorBoundary.tsx    # エラーハンドリング
│   ├── stores/             # Zustand 状態管理
│   ├── types/              # TypeScript 型定義
│   ├── utils/              # ユーティリティ関数
│   │   ├── hybridFileSystem.ts  # ファイルアクセス（Electron専用）
│   │   ├── cache.ts             # LRU キャッシュ
│   │   └── dataAggregator.ts    # データ集計
│   └── App.tsx             # メインアプリケーション
├── electron/               # Electron メインプロセス
│   ├── main.ts                  # メインプロセス
│   └── preload.ts               # プリロードスクリプト
├── release/                # 配布パッケージ（macOS DMG/ZIP）
└── package.json
```

## 🔧 設定とカスタマイズ

### プロジェクトパス設定
- デフォルト: `~/.claude/projects/`
- カスタムパス: 設定画面で任意のディレクトリを指定可能
- パス検証: リアルタイムでアクセス可能性を確認

### 為替レート設定
ヘッダーの設定ボタンから USD/JPY の換算レートを変更できます（デフォルト: 150円/USD）。

### ダークモード
ヘッダーの月/太陽アイコンでライト/ダークテーマを切り替えできます。

## 🔒 パフォーマンス最適化

- **LRU キャッシュ**: メモリ効率的なデータキャッシュ
- **ストリーミング処理**: 大容量ファイル（>10MB）対応
- **リアルタイム監視**: chokidar による効率的な変更検出
- **増分更新**: 変更されたファイルのみ再読み込み

## 🤝 貢献

プルリクエストや Issue の報告を歓迎します。

## 📄 ライセンス

MIT License

## 🔗 関連リンク

- [Claude Code](https://claude.ai/code) - Claude の公式 CLI ツール
- [TODO.md](./TODO.md) - 開発ロードマップ
- [CLAUDE.md](./CLAUDE.md) - 開発者向けガイド
