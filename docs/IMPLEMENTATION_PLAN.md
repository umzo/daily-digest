# Daily Digest - 実装計画書

## 実装順序の方針

依存関係に基づき、下流から上流へ（ボトムアップ）で実装する。
各フェーズでテストを実装してから本体を実装する（TDD）。

---

## Phase 1: 基盤

### 1.1 型定義 (`src/fetchers/types.ts`)
**依存**: なし
**被依存**: 全コンポーネント

- [x] Article インターフェース
- [x] Fetcher インターフェース
- [x] Summary インターフェース

### 1.2 シークレット取得 (`src/secrets.ts`)
**依存**: なし
**被依存**: Fetcher, Summarizer, Publisher

- [x] Secrets Manager クライアント
- [x] シークレット取得関数
- [x] キャッシュ機構

### 1.3 共通ユーティリティ (`src/utils/retry.ts`)
**依存**: なし
**被依存**: Fetcher, Summarizer, Publisher

- [x] 指数バックオフリトライ関数
- [x] エラーログ出力ヘルパー

---

## Phase 2: データ取得

### 2.1 Feedly Fetcher (`src/fetchers/feedly.ts`)
**依存**: types.ts, secrets.ts, retry.ts
**被依存**: Lambda Handler

- [x] Feedly API クライアント
- [x] 未読記事取得
- [x] Article 形式への変換
- [x] エラーハンドリング（リトライ、スキップ）

---

## Phase 3: 要約生成

### 3.1 Summarizer (`src/summarizer.ts`)
**依存**: types.ts, secrets.ts, retry.ts
**被依存**: Lambda Handler

- [x] Claude API クライアント
- [x] プロンプト構築
- [x] 要約パース（箇条書き抽出）
- [x] バッチ処理（10件並列）
- [x] エラーハンドリング（リトライ、フォールバック）

---

## Phase 4: 出力

### 4.1 Formatter (`src/formatter.ts`)
**依存**: types.ts
**被依存**: Lambda Handler

- [x] YAML frontmatter 生成
- [x] カテゴリ別グループ化
- [x] Markdown 本文生成
- [x] ファイルパス生成 (`digests/YYYY-MM-DD.md`)

### 4.2 Publisher (`src/publisher.ts`)
**依存**: secrets.ts, retry.ts
**被依存**: Lambda Handler

- [x] GitHub Contents API クライアント
- [x] ファイル作成/更新
- [x] CloudWatch アラーム連携
- [x] エラーハンドリング

---

## Phase 5: 統合

### 5.1 Lambda Handler (`src/index.ts`)
**依存**: 全コンポーネント
**被依存**: EventBridge

- [ ] EventBridge イベント受信
- [ ] パイプライン実行（Fetcher → Summarizer → Formatter → Publisher）
- [ ] エラーハンドリング（部分失敗時の続行）
- [ ] レスポンス返却

---

## Phase 6: インフラ

### 6.1 Terraform (`terraform/`)
**依存**: Lambda Handler 完成後

- [ ] main.tf（プロバイダー設定）
- [ ] variables.tf（変数定義）
- [ ] secrets.tf（Secrets Manager）
- [ ] iam.tf（IAM ロール・ポリシー）
- [ ] lambda.tf（Lambda 関数）
- [ ] eventbridge.tf（スケジューラー）
- [ ] outputs.tf（出力値）

---

## 依存関係図

```
                    ┌─────────────┐
                    │   types.ts  │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ secrets.ts  │   │  retry.ts   │   │ formatter.ts│
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └────────┬────────┘                 │
                │                          │
    ┌───────────┼───────────┐              │
    │           │           │              │
    ▼           ▼           ▼              │
┌────────┐ ┌──────────┐ ┌──────────┐       │
│ feedly │ │summarizer│ │publisher │       │
└────┬───┘ └────┬─────┘ └────┬─────┘       │
     │          │            │             │
     └──────────┴─────┬──────┴─────────────┘
                      │
                      ▼
               ┌─────────────┐
               │  index.ts   │
               │  (Lambda)   │
               └─────────────┘
```

---

## 各フェーズの見積もり

| Phase | 内容 | ファイル数 |
|-------|------|-----------|
| 1 | 基盤（型、シークレット、ユーティリティ） | 3 |
| 2 | データ取得（Feedly） | 1 |
| 3 | 要約生成（Summarizer） | 1 |
| 4 | 出力（Formatter, Publisher） | 2 |
| 5 | 統合（Lambda Handler） | 1 |
| 6 | インフラ（Terraform） | 7 |

---

## 実装時の注意事項

1. **TDD**: 各コンポーネントは `it.todo` のテストを実装してから本体を実装
2. **モック**: 外部 API（Feedly, Claude, GitHub）は必ずモック化
3. **型安全**: `strict: true` で型チェック
4. **エラー分離**: 個別記事の失敗が全体をブロックしない設計
5. **ログ**: 各ステップで処理状況を CloudWatch Logs に出力
