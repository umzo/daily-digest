# CLAUDE.md - AI アシスタント向けガイド

このドキュメントは、daily-digest コードベースで作業する AI アシスタント向けの必須コンテキストを提供します。

## プロジェクト概要

**Daily Digest** は、Feedly から記事を収集・要約し、GitHub 経由で Obsidian Vault に公開するサーバーレスシステムです。
データソースは拡張可能な設計となっており、将来的に他のソース（X、RSS、Hacker News 等）を追加可能です。

### コアワークフロー
1. **収集**: 毎日 9:10 JST に Feedly から記事を取得（前日 9:00 JST 〜 当日 9:00 JST の24時間分）
2. **要約**: Claude Haiku 4.5 API で要点を抽出（記事あたり3-5個の箇条書き）
3. **公開**: Markdown を生成し GitHub リポジトリにコミット
4. **同期**: ユーザーがローカルで pull して Obsidian で閲覧

### 主な制約
- 個人利用（シングルユーザー）
- 月額コスト目標: 約500円以下
- 1日あたり10-100件の記事を処理
- Lambda タイムアウト内で完了必須

## プロジェクト状況

**現在のフェーズ**: 設計ドキュメント完了、実装前

詳細は `docs/DESIGN.md` を参照（システム設計書）。

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| 言語 | TypeScript |
| ランタイム | Node.js 24.x |
| ビルド | tsdown (Rolldown ベース) |
| テスト | Vitest |
| IaC | Terraform |
| コンピュート | AWS Lambda |
| スケジューラー | AWS EventBridge |
| シークレット | AWS Secrets Manager |
| LLM | Claude Haiku 4.5 (Anthropic API) |
| ストレージ | GitHub Repository |
| ローカル | Obsidian + Git |

## ディレクトリ構成（計画）

```
daily-digest/
├── terraform/                 # Infrastructure as Code
│   ├── main.tf               # プロバイダー設定
│   ├── variables.tf          # 変数定義
│   ├── secrets.tf            # Secrets Manager リソース
│   ├── lambda.tf             # Lambda 設定
│   ├── eventbridge.tf        # スケジューラールール
│   ├── iam.tf                # IAM ロール・ポリシー
│   └── outputs.tf            # 出力値
├── src/                       # TypeScript ソースコード
│   ├── index.ts              # Lambda ハンドラー（エントリーポイント）
│   ├── fetchers/
│   │   ├── types.ts          # 共通型定義・Fetcher インターフェース
│   │   ├── feedly.ts         # Feedly API クライアント
│   │   └── ...               # 将来: 他ソース用 Fetcher を追加
│   ├── summarizer.ts         # Claude API ラッパー
│   ├── formatter.ts          # Markdown 生成
│   └── publisher.ts          # GitHub API ラッパー
├── docs/
│   └── DESIGN.md             # システム設計書
├── package.json
├── tsconfig.json
├── tsdown.config.ts          # Lambda バンドル設定
├── vitest.config.ts          # テスト設定
├── CLAUDE.md                 # このファイル
└── README.md
```

## 主要コマンド

```bash
# 依存関係インストール
npm install

# ビルド
make build

# デプロイ
make deploy

# 強制再デプロイ（Lambda を置き換え）
make deploy-force

# Terraform 初期化（初回のみ）
make tf-init

# テスト実行
npm test

# Lint & フォーマット
npm run lint
npm run format
```

## Lambda 手動実行

```bash
# 特定の日付のダイジェストを生成（日本時間）
aws lambda invoke \
  --function-name daily-digest \
  --payload '{"targetDate": "2026-02-05"}' \
  --cli-binary-format raw-in-base64-out \
  /dev/stdout

# 日付未指定（現在日時を基準に処理）
aws lambda invoke \
  --function-name daily-digest \
  --payload '{}' \
  --cli-binary-format raw-in-base64-out \
  /dev/stdout
```

`targetDate` は日本時間の日付（YYYY-MM-DD 形式）を指定。
例: `"2026-02-05"` → 2026-02-04 9:00 JST 〜 2026-02-05 9:00 JST の記事を取得。

## 主要な型定義

### FetchOptions（取得オプション）
```typescript
interface FetchOptions {
  /** 取得対象の日付（この日付の 9:00 JST から過去24時間分を取得） */
  targetDate?: Date;
}
```

### Fetcher インターフェース（拡張用）
```typescript
interface Fetcher {
  readonly name: string;
  fetch(options?: FetchOptions): Promise<Article[]>;
}
```

### Article（統一入力フォーマット）
```typescript
interface Article {
  id: string;
  source: string;           // 'feedly', 'rss', 'x' など（拡張可能）
  title: string;
  content: string;
  url: string;
  author?: string;
  publishedAt: Date;
  tags?: string[];
}
```

### Summary（要約出力）
```typescript
interface Summary {
  article: Article;
  bullets: string[];      // 3-5個の要点
  category?: string;      // 自動分類カテゴリ
}
```

## アーキテクチャパターン

1. **モジュラー Fetcher**: 共通インターフェースを実装し、新ソースを容易に追加可能
2. **バッチ処理**: 10件並列 × 10バッチで約100件/日を処理
3. **エラー耐性**: 個別記事の失敗がパイプライン全体をブロックしない
4. **関心の分離**: Fetchers → Summarizer → Formatter → Publisher

## コーディング規約

### 命名規則
- ファイル名: `snake_case` または `kebab-case`（例: `types.ts`, `feedly.ts`）
- 関数・変数: `camelCase`
- インターフェース・型: `PascalCase`
- 定数: 環境変数は `UPPER_SNAKE_CASE`

### エラーハンドリング
- API レート制限には指数バックオフ（最大3回リトライ）
- 個別記事の失敗はスキップ（エラーログ出力、処理続行）
- LLM 失敗時はフォールバックメッセージで対応
- 重大な失敗（GitHub コミット）は CloudWatch アラームをトリガー

### Markdown 出力フォーマット
```markdown
---
date: 2025-01-01
sources:
  - feedly
article_count: 42
tags:
  - digest
  - daily
---

# Daily Digest - 2025-01-01

## Tech

### 記事タイトル
- 要点1
- 要点2
- 要点3

> [Source](URL) via Feedly
```

## 外部 API

| API | 認証方式 | シークレット名 |
|-----|----------|----------------|
| Anthropic | API Key | `ANTHROPIC_API_KEY` |
| Feedly | OAuth Token | `FEEDLY_ACCESS_TOKEN` |
| GitHub | PAT (Fine-grained) | `GITHUB_TOKEN` |

シークレットは AWS Secrets Manager の `daily-digest-secrets` に保存。
※ 将来データソースを追加する際は、必要な認証情報を追加。

## AWS リソース

| リソース | 名前 | 用途 |
|----------|------|------|
| Lambda | `daily-digest` | メイン処理関数 |
| EventBridge | `daily-digest-schedule` | Cron: `10 0 * * ? *` (9:10 JST) |
| CloudWatch Logs | `/aws/lambda/daily-digest` | ログ出力 |
| Secrets Manager | `daily-digest-secrets` | API 認証情報 |
| IAM Role | `daily-digest-lambda-role` | Lambda 実行ロール |

## 開発ガイドライン

### AI アシスタント向け

> **重要**: 実装作業を開始する前に、必ず以下のドキュメントを参照すること
> - `.rulesync/rules/docs-structure.md` - ドキュメント構成ルール
> - `docs/DESIGN.md` - システム設計書
> - `docs/IMPLEMENTATION_PLAN.md` - 実装計画書

1. **コスト意識**: すべての設計判断で AWS 無料枠と Anthropic API コストを考慮

2. **Lambda 制約**:
   - バンドルサイズを最小限に（tsdown/Rolldown tree-shaking 活用）
   - タイムアウトを考慮した設計（最大10-15分）
   - 記事はバッチ処理

3. **テスト**:
   - 各コンポーネントを独立してユニットテスト
   - 外部 API はモック化
   - エラーハンドリングパスもテスト

4. **コミット**: Conventional Commits 形式を使用
   - `feat:` 新機能
   - `fix:` バグ修正
   - `docs:` ドキュメント変更
   - `refactor:` リファクタリング
   - `test:` テスト追加・変更
   - `chore:` メンテナンスタスク

### 実装優先度

1. **Phase 1 (MVP)**: Terraform 構築、Feedly Fetcher、Summarizer、Formatter、Publisher
2. **Phase 2**: エラーハンドリング強化、CloudWatch アラーム、プロンプトチューニング
3. **Phase 3 (任意)**: 追加 Fetcher 実装（X, RSS, HN 等）

## 将来の拡張ポイント

- 追加ソース: X (Twitter), RSS, Hacker News, Reddit（共通 Fetcher インターフェース実装）
- 通知: Slack, Discord, メール
- Web UI: S3 + CloudFront 静的サイト
- 自動タグ付け: LLM ベースのカテゴリ・タグ生成

## 参考リンク

- [設計書](docs/DESIGN.md) - システム設計ドキュメント
- [ドキュメント構成ルール](.rulesync/rules/docs-structure.md) - docs ディレクトリ構成と作成ルール
- [Feedly API Documentation](https://developer.feedly.com/)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
