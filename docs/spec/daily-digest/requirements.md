# Daily Digest - 要件定義書

## 概要

本ドキュメントは、Daily Digest システムの機能要件・非機能要件を EARS（Easy Approach to Requirements Syntax）記法で整理したものです。

### 信頼性レベル指標

| レベル | 意味 |
|--------|------|
| 🔵 | 設計書・仕様に明示的に記載 |
| 🟡 | 設計書からの合理的推測 |
| 🔴 | 推測のみ（要確認） |

### 参照ドキュメント

- [設計書](../../DESIGN.md)
- [CLAUDE.md](../../../CLAUDE.md)

---

## 1. システム概要

**目的**: Feedly から記事を収集し、Claude 3.5 Haiku で要点を抽出、Obsidian Vault に Markdown として出力するシステム。

**利用者**: 個人（シングルユーザー）

**実行環境**: AWS Lambda（サーバーレス）

---

## 2. 機能要件

### 2.1 記事収集機能（Fetcher）

#### FR-001: Feedly からの記事取得 🔵

> **Event-driven**: EventBridge から起動イベントを受信したとき、システムは Feedly API を使用して指定カテゴリの未読記事を取得しなければならない（shall）。

**詳細**:
- 認証: OAuth Token を使用
- 取得対象: 指定カテゴリの未読記事
- 取得後: 記事を既読マークに更新

#### FR-002: 記事の統一フォーマット変換 🔵

> **Ubiquitous**: システムは取得した記事を統一された Article インターフェースに変換しなければならない（shall）。

**Article 型定義**:
```typescript
interface Article {
  id: string;
  source: string;         // 'feedly', 'rss', 'x' など
  title: string;
  content: string;
  url: string;
  author?: string;
  publishedAt: Date;
  tags?: string[];
}
```

#### FR-003: 拡張可能な Fetcher インターフェース 🔵

> **Optional**: 将来的に追加のデータソース（RSS、X、Hacker News 等）を追加する場合、システムは共通 Fetcher インターフェースを通じて統合できなければならない（shall）。

**Fetcher インターフェース**:
```typescript
interface Fetcher {
  readonly name: string;
  fetch(): Promise<Article[]>;
}
```

---

### 2.2 要約機能（Summarizer）

#### FR-004: Claude API による要約生成 🔵

> **Event-driven**: 記事取得が完了したとき、システムは Claude 3.5 Haiku API を使用して各記事の要点を抽出しなければならない（shall）。

**詳細**:
- 出力: 3-5個の箇条書き要点
- 各項目: 1行で完結
- 内容: 重要な数値・固有名詞を含む、主観を排除

#### FR-005: 要約のバッチ処理 🔵

> **Ubiquitous**: システムは記事を10件ずつ並列処理し、最大10バッチ（約100件/日）を処理できなければならない（shall）。

**Summary 型定義**:
```typescript
interface Summary {
  article: Article;
  bullets: string[];      // 3-5個の要点
  category?: string;      // 自動分類カテゴリ
}
```

#### FR-006: 自動カテゴリ分類 🟡

> **Optional**: システムは LLM の出力に基づいて記事を自動的にカテゴリ分類してもよい（may）。

---

### 2.3 フォーマット機能（Formatter）

#### FR-007: Obsidian 向け Markdown 生成 🔵

> **Event-driven**: 要約生成が完了したとき、システムは Obsidian 互換の Markdown ファイルを生成しなければならない（shall）。

**出力フォーマット**:
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

#### FR-008: カテゴリ別グループ化 🔵

> **Ubiquitous**: システムは要約済み記事をカテゴリまたはソース別にグループ化して表示しなければならない（shall）。

---

### 2.4 公開機能（Publisher）

#### FR-009: GitHub へのコミット 🔵

> **Event-driven**: Markdown 生成が完了したとき、システムは GitHub Contents API を使用して Obsidian Vault リポジトリにファイルをコミットしなければならない（shall）。

**詳細**:
- 認証: Personal Access Token (Fine-grained)
- 必要な権限: Contents (Read and Write)
- 出力パス: `digests/YYYY-MM-DD.md`

---

### 2.5 スケジュール機能

#### FR-010: 定時自動実行 🔵

> **Event-driven**: 毎日 06:00 JST (UTC 21:00) になったとき、EventBridge Scheduler がシステムを起動しなければならない（shall）。

---

## 3. 非機能要件

### 3.1 パフォーマンス

#### NFR-001: 処理件数 🔵

> **Ubiquitous**: システムは1日あたり10-100件の記事を処理できなければならない（shall）。

#### NFR-002: 実行時間 🟡

> **Ubiquitous**: システムは Lambda タイムアウト時間（10-15分）内で全処理を完了しなければならない（shall）。

---

### 3.2 コスト

#### NFR-003: 月額コスト目標 🔵

> **Ubiquitous**: システムの月額運用コストは500円以下を目標としなければならない（shall）。

**コスト内訳**:
| サービス | 月額目安 |
|----------|----------|
| Lambda | $0 (無料枠内) |
| EventBridge | $0 (無料枠内) |
| CloudWatch Logs | $0 (無料枠内) |
| Secrets Manager | ~$0.40 |
| Claude 3.5 Haiku | ~$2 |
| **合計** | **~$2.50 (約400円)** |

---

### 3.3 信頼性

#### NFR-004: API レート制限対応 🔵

> **Unwanted behavior**: 外部 API がレート制限エラーを返した場合、システムは指数バックオフで最大3回リトライしなければならない（shall）。

#### NFR-005: 個別記事エラー耐性 🔵

> **Unwanted behavior**: 個別記事の処理（取得/要約）が失敗した場合、システムはエラーをログ出力し、他の記事の処理を続行しなければならない（shall）。

#### NFR-006: LLM フォールバック 🔵

> **Unwanted behavior**: LLM API がリトライ後も失敗した場合、システムは「要約取得失敗」のフォールバックメッセージを使用しなければならない（shall）。

#### NFR-007: GitHub コミット失敗通知 🔵

> **Unwanted behavior**: GitHub へのコミットが失敗した場合、システムは CloudWatch アラームをトリガーしなければならない（shall）。

---

### 3.4 セキュリティ

#### NFR-008: シークレット管理 🔵

> **Ubiquitous**: システムは API 認証情報を AWS Secrets Manager に保存し、環境変数に直接埋め込んではならない（shall not）。

**管理対象シークレット**:
- `ANTHROPIC_API_KEY`
- `FEEDLY_ACCESS_TOKEN`
- `GITHUB_TOKEN`

---

### 3.5 保守性

#### NFR-009: ログ出力 🟡

> **Ubiquitous**: システムは処理状況・エラー情報を CloudWatch Logs に出力しなければならない（shall）。

#### NFR-010: インフラのコード管理 🔵

> **Ubiquitous**: すべての AWS リソースは Terraform でコード管理されなければならない（shall）。

---

### 3.6 バンドルサイズ

#### NFR-011: Lambda バンドル最適化 🔵

> **Ubiquitous**: システムは tsdown/Rolldown の tree-shaking を活用し、Lambda バンドルサイズを最小限に抑えなければならない（shall）。

---

## 4. 制約事項

### 4.1 技術的制約

| 項目 | 制約 |
|------|------|
| ランタイム | Node.js 24.x |
| コンピュート | AWS Lambda |
| ビルドツール | tsdown (Rolldown ベース) |
| テストフレームワーク | Vitest |
| IaC | Terraform |

### 4.2 運用上の制約

| 項目 | 制約 |
|------|------|
| 実行頻度 | 1日1回 (06:00 JST) |
| 利用者 | 個人（シングルユーザー） |
| 出力先 | GitHub → Obsidian Vault |

---

## 5. 将来の拡張要件

以下は現時点では実装対象外だが、設計上考慮すべき拡張ポイント:

### 5.1 追加データソース 🔵

- X (Twitter)
- RSS フィード
- Hacker News
- Reddit

### 5.2 通知機能 🔵

- Slack
- Discord
- メール

### 5.3 Web UI 🔵

- S3 + CloudFront での静的サイトホスティング

### 5.4 自動タグ付け 🔵

- LLM ベースのカテゴリ・タグ自動生成

---

## 6. 開発フェーズ

### Phase 1: MVP 🔵

- [ ] Terraform でインフラ構築
- [ ] Feedly Fetcher 実装
- [ ] Summarizer 実装
- [ ] Formatter 実装
- [ ] Publisher 実装
- [ ] 動作確認

### Phase 2: 改善 🔵

- [ ] エラーハンドリング強化
- [ ] CloudWatch アラーム設定
- [ ] プロンプトチューニング

### Phase 3: ソース拡張（任意） 🔵

- [ ] 追加 Fetcher 実装（X, RSS, HN 等）
- [ ] ソース統合テスト

---

## 7. 信頼性サマリー

| レベル | 件数 | 割合 |
|--------|------|------|
| 🔵 設計書に根拠あり | 25 | 89% |
| 🟡 合理的推測 | 3 | 11% |
| 🔴 推測のみ | 0 | 0% |

---

## 改訂履歴

| 日付 | バージョン | 変更内容 |
|------|------------|----------|
| 2026-01-01 | 1.0.0 | 初版作成（DESIGN.md より抽出） |
