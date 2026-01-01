# Daily Digest System 設計書

## 概要

X (Twitter) と Feedly から記事・投稿を収集し、Claude 3.5 Haiku で要点を抽出、Obsidian Vault に Markdown として出力するシステム。

## 要件

| 項目 | 内容 |
|------|------|
| 実行頻度 | 1日1回（朝6時 JST） |
| 処理件数 | 数十〜100件程度/日 |
| 利用者 | 個人 |
| 月額コスト | 数千円以内（目標: 500円以下） |
| 出力先 | Obsidian Vault（GitHub経由） |

## システム構成

```
┌─────────────────────────────────────────────┐
│           EventBridge Scheduler             │
│              cron(0 21 * * ? *)             │
│              = 毎日 6:00 JST                │
└─────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│                  Lambda                     │
│              daily-digest                   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │           Fetchers                   │   │
│  │  ┌───────────┐   ┌───────────────┐  │   │
│  │  │  X API    │   │  Feedly API   │  │   │
│  │  └───────────┘   └───────────────┘  │   │
│  └─────────────────────────────────────┘   │
│                      │                      │
│                      ▼                      │
│  ┌─────────────────────────────────────┐   │
│  │           Summarizer                 │   │
│  │       Claude 3.5 Haiku API          │   │
│  └─────────────────────────────────────┘   │
│                      │                      │
│                      ▼                      │
│  ┌─────────────────────────────────────┐   │
│  │           Publisher                  │   │
│  │    Markdown生成 → GitHub commit     │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│           GitHub Repository                 │
│           (Obsidian Vault)                  │
│                                             │
│   obsidian-vault/                           │
│   └── digests/                              │
│       ├── 2025-01-01.md                     │
│       ├── 2025-01-02.md                     │
│       └── ...                               │
└─────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│           Obsidian (ローカル)               │
│              git pull で同期               │
└─────────────────────────────────────────────┘
```

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| IaC | Terraform |
| Scheduler | Amazon EventBridge |
| Compute | AWS Lambda (Node.js 20.x) |
| LLM | Claude 3.5 Haiku (Anthropic API) |
| Storage | GitHub Repository |
| Local | Obsidian + Git |

## ディレクトリ構成

```
daily-digest/
├── terraform/
│   ├── main.tf              # プロバイダー設定
│   ├── variables.tf         # 変数定義
│   ├── secrets.tf           # Secrets Manager
│   ├── lambda.tf            # Lambda関連リソース
│   ├── eventbridge.tf       # スケジューラー
│   ├── iam.tf               # IAMロール・ポリシー
│   └── outputs.tf           # 出力値
├── src/
│   ├── index.ts             # Lambda handler (エントリーポイント)
│   ├── fetchers/
│   │   ├── types.ts         # 共通型定義
│   │   ├── x.ts             # X API クライアント
│   │   └── feedly.ts        # Feedly API クライアント
│   ├── summarizer.ts        # Claude API 呼び出し
│   ├── formatter.ts         # Markdown 生成
│   └── publisher.ts         # GitHub API 呼び出し
├── package.json
├── tsconfig.json
├── esbuild.config.js        # Lambda用バンドル設定
└── README.md
```

## コンポーネント詳細

### Fetchers

ソースごとに記事を取得し、統一フォーマットに変換する。

```typescript
// src/fetchers/types.ts
export interface Article {
  id: string;
  source: 'x' | 'feedly';
  title: string;
  content: string;
  url: string;
  author?: string;
  publishedAt: Date;
  tags?: string[];
}
```

#### X Fetcher

- 使用API: X API v2 (Bearer Token認証)
- 取得対象: 指定リストのツイート or ブックマーク
- 取得期間: 過去24時間

#### Feedly Fetcher

- 使用API: Feedly API (OAuth)
- 取得対象: 指定カテゴリの未読記事
- 取得後: 既読マーク

### Summarizer

Claude 3.5 Haiku を使って記事の要点を抽出する。

```typescript
// src/summarizer.ts
export interface Summary {
  article: Article;
  bullets: string[];      // 要点（箇条書き）
  category?: string;      // 自動分類
}
```

#### プロンプト設計

```
あなたは情報整理のエキスパートです。
以下の記事の要点を3-5個の箇条書きで簡潔にまとめてください。

# ルール
- 各項目は1行で完結させる
- 重要な数値や固有名詞は必ず含める
- 主観的な評価は避け、事実のみを抽出する

# 記事
タイトル: {title}
本文: {content}

# 出力形式
- 要点1
- 要点2
- 要点3
```

#### バッチ処理戦略

- 100件を一度に処理するとタイムアウトのリスク
- 10件ずつ並列処理 × 10バッチ
- エラー時は個別にスキップしてログ出力

### Formatter

Summary配列を受け取り、Obsidian用Markdownを生成する。

```typescript
// src/formatter.ts
export interface DigestOptions {
  date: Date;
  groupBy: 'category' | 'source';
}

export function formatDigest(
  summaries: Summary[],
  options: DigestOptions
): string;
```

### Publisher

生成したMarkdownをGitHub経由でObsidian Vaultにコミットする。

```typescript
// src/publisher.ts
export interface PublishOptions {
  owner: string;
  repo: string;
  branch: string;
  path: string;  // e.g., "digests/2025-01-01.md"
}

export async function publish(
  content: string,
  options: PublishOptions
): Promise<void>;
```

- GitHub API: Contents API を使用
- 認証: Personal Access Token (Fine-grained)
- 必要な権限: Contents (Read and Write)

## データフロー

```
1. EventBridge が Lambda を起動
   └─ Input: なし（時刻トリガー）

2. Fetchers が各ソースから記事取得
   └─ Output: Article[]

3. Summarizer が要約生成
   └─ Input: Article[]
   └─ Output: Summary[]

4. Formatter が Markdown 生成
   └─ Input: Summary[]
   └─ Output: string (Markdown)

5. Publisher が GitHub にコミット
   └─ Input: Markdown string
   └─ Output: commit SHA
```

## Obsidian 出力フォーマット

```markdown
---
date: 2025-01-01
sources:
  - x
  - feedly
article_count: 42
tags:
  - digest
  - daily
---

# Daily Digest - 2025-01-01

## Tech

### OpenAI が GPT-5 を発表
- マルチモーダル性能が従来比2倍に向上
- コンテキストウィンドウが100万トークンに拡大
- API価格は据え置き、来月から利用可能

> [Source](https://example.com/article1) via X (@OpenAI)

### Rust 2.0 正式リリース
- async/await の人間工学的改善
- コンパイル時間が30%短縮
- 後方互換性を維持

> [Source](https://blog.rust-lang.org/) via Feedly

---

## Business

### ...

---

## Other

### ...

---

*Generated at 2025-01-01T06:00:00+09:00*
```

## Terraform リソース一覧

| リソース | 名前 | 用途 |
|----------|------|------|
| aws_lambda_function | daily-digest | メイン処理 |
| aws_lambda_function_url | - | (オプション) 手動実行用 |
| aws_iam_role | daily-digest-lambda-role | Lambda実行ロール |
| aws_iam_policy | daily-digest-lambda-policy | 必要な権限 |
| aws_cloudwatch_event_rule | daily-digest-schedule | Cronスケジュール |
| aws_cloudwatch_event_target | daily-digest-target | Lambda起動設定 |
| aws_cloudwatch_log_group | /aws/lambda/daily-digest | ログ出力先 |
| aws_secretsmanager_secret | daily-digest-secrets | APIキー保管 |

## シークレット管理

AWS Secrets Manager に以下を保存:

```json
{
  "ANTHROPIC_API_KEY": "sk-ant-...",
  "X_BEARER_TOKEN": "AAAA...",
  "FEEDLY_ACCESS_TOKEN": "...",
  "GITHUB_TOKEN": "ghp_..."
}
```

## コスト試算

| サービス | 月額 | 備考 |
|----------|------|------|
| Lambda | $0 | 無料枠内 (月100万リクエスト) |
| EventBridge | $0 | 無料枠内 |
| CloudWatch Logs | $0 | 無料枠内 |
| Secrets Manager | ~$0.40 | 1シークレット × $0.40 |
| Claude 3.5 Haiku | ~$2 | 100件 × 30日 |
| **合計** | **~$2.50 (約400円)** | |

## エラーハンドリング

| エラー種別 | 対応 |
|------------|------|
| API レート制限 | 指数バックオフでリトライ (最大3回) |
| 記事取得失敗 | スキップしてログ出力、他の記事は処理続行 |
| LLM API エラー | リトライ後も失敗なら「要約取得失敗」と記載 |
| GitHub コミット失敗 | CloudWatch アラーム → 通知 |

## 拡張ポイント

将来的に追加可能な機能:

1. **ソース追加**: RSS, Hacker News, Reddit など
2. **通知**: Slack, Discord, メール で要約を送信
3. **Web UI**: S3 + CloudFront で静的サイトホスティング
4. **検索**: Obsidian の検索機能で対応（追加実装不要）
5. **タグ自動付与**: LLM でカテゴリ・タグを自動生成

## 開発フェーズ

### Phase 1: MVP

- [ ] Terraform でインフラ構築
- [ ] Feedly Fetcher 実装
- [ ] Summarizer 実装
- [ ] Formatter 実装
- [ ] Publisher 実装
- [ ] 動作確認

### Phase 2: X 対応

- [ ] X Fetcher 実装
- [ ] ソース統合テスト

### Phase 3: 改善

- [ ] エラーハンドリング強化
- [ ] CloudWatch アラーム設定
- [ ] プロンプトチューニング

## 参考リンク

- [X API v2 Documentation](https://developer.x.com/en/docs/twitter-api)
- [Feedly API Documentation](https://developer.feedly.com/)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
