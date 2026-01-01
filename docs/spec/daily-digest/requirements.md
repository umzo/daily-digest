# Daily Digest - 要件定義書

## 概要

- **目的**: Feedly から記事を収集し、Claude 3.5 Haiku で要約、Obsidian Vault に出力
- **利用者**: 個人（シングルユーザー）
- **実行環境**: AWS Lambda（サーバーレス）

### 信頼性レベル

- 🔵 設計書に根拠あり
- 🟡 合理的推測
- 🔴 推測のみ（要確認）

---

## 機能要件

### 記事収集（Fetcher）

- 🔵 **[Event-driven]** EventBridge から起動イベントを受信したとき、システムは Feedly API で未読記事を取得しなければならない
- 🔵 **[Ubiquitous]** システムは取得した記事を統一 Article 形式に変換しなければならない
- 🔵 **[Ubiquitous]** システムは記事取得後、Feedly 上で既読マークを付けなければならない
- 🔵 **[Optional]** 将来データソースを追加する場合、共通 Fetcher インターフェースで統合できなければならない

### 要約（Summarizer）

- 🔵 **[Event-driven]** 記事取得完了時、システムは Claude 3.5 Haiku API で各記事の要点を抽出しなければならない
- 🔵 **[Ubiquitous]** システムは各記事につき 3-5 個の箇条書き要点を生成しなければならない
- 🔵 **[Ubiquitous]** システムは記事を 10 件ずつ並列処理しなければならない
- 🟡 **[Optional]** システムは LLM 出力に基づき記事を自動カテゴリ分類してもよい

### フォーマット（Formatter）

- 🔵 **[Event-driven]** 要約生成完了時、システムは Obsidian 互換 Markdown を生成しなければならない
- 🔵 **[Ubiquitous]** システムは YAML frontmatter（date, sources, article_count, tags）を含めなければならない
- 🔵 **[Ubiquitous]** システムは記事をカテゴリ別にグループ化して表示しなければならない

### 公開（Publisher）

- 🔵 **[Event-driven]** Markdown 生成完了時、システムは GitHub Contents API でリポジトリにコミットしなければならない
- 🔵 **[Ubiquitous]** システムは `digests/YYYY-MM-DD.md` パスに出力しなければならない

### スケジュール

- 🔵 **[Event-driven]** 毎日 06:00 JST に EventBridge がシステムを起動しなければならない

---

## 非機能要件

### パフォーマンス

- 🔵 **[Ubiquitous]** システムは 1 日あたり 10-100 件の記事を処理できなければならない
- 🟡 **[Ubiquitous]** システムは Lambda タイムアウト（10-15 分）内で処理を完了しなければならない

### コスト

- 🔵 **[Ubiquitous]** 月額運用コストは 500 円以下を目標としなければならない
  - Lambda / EventBridge / CloudWatch: 無料枠内
  - Secrets Manager: ~$0.40
  - Claude 3.5 Haiku: ~$2
  - 合計: ~$2.50（約 400 円）

### 信頼性

- 🔵 **[Unwanted]** API レート制限エラー時、システムは指数バックオフで最大 3 回リトライしなければならない
- 🔵 **[Unwanted]** 個別記事の処理失敗時、システムはログ出力し他の記事処理を続行しなければならない
- 🔵 **[Unwanted]** LLM API がリトライ後も失敗時、システムはフォールバックメッセージを使用しなければならない
- 🔵 **[Unwanted]** GitHub コミット失敗時、システムは CloudWatch アラームをトリガーしなければならない

### セキュリティ

- 🔵 **[Ubiquitous]** システムは API 認証情報を AWS Secrets Manager に保存しなければならない
- 🔵 **[Ubiquitous]** システムは認証情報を環境変数に直接埋め込んではならない
  - 管理対象: `ANTHROPIC_API_KEY`, `FEEDLY_ACCESS_TOKEN`, `GITHUB_TOKEN`

### 保守性

- 🟡 **[Ubiquitous]** システムは処理状況・エラー情報を CloudWatch Logs に出力しなければならない
- 🔵 **[Ubiquitous]** すべての AWS リソースは Terraform で管理されなければならない
- 🔵 **[Ubiquitous]** システムは tsdown の tree-shaking で Lambda バンドルサイズを最小化しなければならない

---

## 制約事項

### 技術的制約

- ランタイム: Node.js 24.x
- コンピュート: AWS Lambda
- ビルド: tsdown (Rolldown ベース)
- テスト: Vitest
- IaC: Terraform

### 運用上の制約

- 実行頻度: 1 日 1 回（06:00 JST）
- 利用者: 個人
- 出力先: GitHub → Obsidian Vault

---

## 将来の拡張要件

- 🔵 追加データソース: X, RSS, Hacker News, Reddit
- 🔵 通知機能: Slack, Discord, メール
- 🔵 Web UI: S3 + CloudFront
- 🔵 自動タグ付け: LLM ベースのカテゴリ・タグ生成

---

## 開発フェーズ

### Phase 1: MVP

- Terraform インフラ構築
- Feedly Fetcher 実装
- Summarizer 実装
- Formatter 実装
- Publisher 実装

### Phase 2: 改善

- エラーハンドリング強化
- CloudWatch アラーム設定
- プロンプトチューニング

### Phase 3: ソース拡張（任意）

- 追加 Fetcher 実装（X, RSS, HN 等）

---

## 信頼性サマリー

| レベル | 件数 |
|--------|------|
| 🔵 根拠あり | 25 (89%) |
| 🟡 推測 | 3 (11%) |
| 🔴 要確認 | 0 (0%) |
