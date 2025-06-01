# Clauditor - Claude Code 使用状況ダッシュボード

Claude Code の API 使用ログを自動的に解析し、トークン使用量とコストを可視化する Web ダッシュボードアプリケーションです。

![Clauditor Dashboard](https://via.placeholder.com/800x400?text=Clauditor+Dashboard+Preview)

## 🎯 機能

- **自動プロジェクトスキャン**: `~/.claude/projects/` 内のプロジェクトを自動検出
- **JSONL ログ解析**: Claude Code の使用ログファイルを自動読み込み・解析
- **使用状況可視化**: 日別のトークン使用量とコストをグラフとテーブルで表示
- **日本語対応**: 完全な日本語ローカライゼーション
- **ダークモード**: ライト/ダークテーマの切り替え
- **為替レート設定**: USD から円への換算レート調整
- **レスポンシブデザイン**: PC・タブレット・スマホ対応

## 🚀 クイックスタート

### 前提条件

- Node.js 18.0.0 以上
- npm または yarn

### インストールと起動

```bash
# リポジトリをクローン
git clone https://github.com/tsim-imai/clauditor.git
cd clauditor

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

ブラウザで `http://localhost:5173` を開いてアクセスしてください。

## 🛠 開発コマンド

```bash
npm run dev      # 開発サーバー起動
npm run build    # プロダクションビルド
npm run lint     # ESLint チェック
npm run preview  # プロダクションプレビュー
```

## 📊 現在の実装状況

### ✅ 完了済み
- フル機能の React ダッシュボード UI
- データ集計・可視化機能（Recharts）
- ダークモード・多言語対応
- モックデータシステム

### 🔄 開発中
- 実際のファイルシステムアクセス機能
- `~/.claude/projects/` の自動スキャン

### ❌ 今後の予定
- Electron デスクトップアプリ化
- リアルタイムファイル監視
- 大容量ファイル最適化

詳細は [TODO.md](./TODO.md) を参照してください。

## 🏗 技術スタック

- **フロントエンド**: React 19 + TypeScript + Vite
- **スタイリング**: Tailwind CSS
- **状態管理**: Zustand
- **チャート**: Recharts
- **アイコン**: Lucide React
- **ファイル解析**: PapaParse

## 📁 プロジェクト構造

```
src/
├── components/     # React コンポーネント
│   ├── Header.tsx      # ヘッダー（設定・ダークモード）
│   ├── Sidebar.tsx     # プロジェクト一覧
│   ├── DataTable.tsx   # 統計テーブル
│   └── UsageChart.tsx  # 使用量グラフ
├── stores/         # Zustand 状態管理
├── types/          # TypeScript 型定義
├── utils/          # ユーティリティ関数
│   ├── mockData.ts         # モックデータ生成
│   ├── claudeProjectScanner.ts # プロジェクトスキャン
│   └── dataAggregator.ts   # データ集計
└── App.tsx         # メインアプリケーション
```

## 🔧 設定とカスタマイズ

### 為替レート設定
ヘッダーの設定ボタンから USD/JPY の換算レートを変更できます（デフォルト: 150円/USD）。

### ダークモード
ヘッダーの月/太陽アイコンでライト/ダークテーマを切り替えできます。

## 🚧 制限事項

現在はブラウザのセキュリティ制限により、モックデータを使用しています。実際の `~/.claude/projects/` へのアクセスには以下の実装が必要です：

1. **Electron アプリ化** （推奨）
2. **バックエンドサービス** 経由でのファイルアクセス
3. **File System Access API** の利用

## 🤝 貢献

プルリクエストや Issue の報告を歓迎します。

## 📄 ライセンス

MIT License

## 🔗 関連リンク

- [Claude Code](https://claude.ai/code) - Claude の公式 CLI ツール
- [TODO.md](./TODO.md) - 開発ロードマップ
- [CLAUDE.md](./CLAUDE.md) - 開発者向けガイド
