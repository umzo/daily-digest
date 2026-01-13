# Daily Digest

Feedly から記事を収集・要約し、GitHub 経由で Obsidian Vault に公開するサーバーレスシステム。

## 概要

毎日自動で Feedly の記事を取得し、Claude Haiku 4.5 で要約して Markdown ファイルとして GitHub リポジトリにコミットします。ユーザーはローカルで pull して Obsidian で閲覧できます。

### ワークフロー

1. **収集**: 毎日 9:10 JST に Feedly から記事を取得（前日 9:00 JST 〜 当日 9:00 JST の24時間分）
2. **要約**: Claude Haiku 4.5 API で要点を抽出（記事あたり3-5個の箇条書き）
3. **公開**: Markdown を生成し GitHub リポジトリにコミット
4. **同期**: ユーザーがローカルで pull して Obsidian で閲覧

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| 言語 | TypeScript |
| ランタイム | Node.js 22.x |
| テスト | Vitest |
| IaC | Terraform |
| コンピュート | AWS Lambda |
| スケジューラー | AWS EventBridge |
| シークレット | AWS Secrets Manager |
| LLM | Claude Haiku 4.5 (Anthropic API) |
| ストレージ | GitHub Repository |

## セットアップ

### 前提条件

- Node.js >= 22.0.0
- AWS CLI（設定済み）
- Terraform
- 各種 API キー（Anthropic, Feedly, GitHub）

### インストール

```bash
# 依存関係インストール
npm install

# ビルド
npm run build
```

### 環境設定

1. AWS Secrets Manager に以下のシークレットを登録:
   - `ANTHROPIC_API_KEY`
   - `FEEDLY_ACCESS_TOKEN`
   - `GITHUB_TOKEN`

2. Terraform 変数を設定:
   ```bash
   cd terraform
   cp terraform.tfvars.example terraform.tfvars
   # terraform.tfvars を編集
   ```

3. インフラをデプロイ:
   ```bash
   terraform init
   terraform apply
   ```

## 開発

```bash
# テスト実行
npm test

# テスト（ウォッチモード）
npm run test:watch

# カバレッジ付きテスト
npm run test:coverage

# Lint
npm run lint

# フォーマット
npm run format
```

## プロジェクト構成

```
daily-digest/
├── terraform/          # Infrastructure as Code
├── src/
│   ├── index.ts        # Lambda ハンドラー
│   ├── fetchers/       # データソース取得
│   │   ├── types.ts    # 共通型定義
│   │   └── feedly.ts   # Feedly API クライアント
│   ├── summarizer.ts   # Claude API ラッパー
│   ├── formatter.ts    # Markdown 生成
│   ├── publisher.ts    # GitHub API ラッパー
│   └── secrets.ts      # シークレット管理
├── docs/               # ドキュメント
└── vitest.config.ts    # テスト設定
```

## ドキュメント

- [設計書](docs/DESIGN.md) - システム設計ドキュメント
- [実装計画](docs/IMPLEMENTATION_PLAN.md) - 実装計画書
- [セットアップ](docs/SETUP.md) - 詳細なセットアップ手順
- [テスト計画](docs/TEST_PLAN.md) - テスト計画書

## ライセンス

MIT
