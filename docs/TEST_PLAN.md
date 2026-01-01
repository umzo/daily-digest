# Daily Digest - テスト計画書

本ドキュメントは、要件定義書と設計書に基づくテストコードの計画を記載する。

## テストファイル構成

```
src/
├── __tests__/
│   ├── index.test.ts          # Lambda Handler 統合テスト
│   ├── summarizer.test.ts     # Summarizer テスト
│   ├── formatter.test.ts      # Formatter テスト
│   ├── publisher.test.ts      # Publisher テスト
│   └── secrets.test.ts        # シークレット取得テスト
├── fetchers/
│   └── __tests__/
│       ├── types.test.ts      # 型定義テスト
│       └── feedly.test.ts     # Feedly Fetcher テスト
```

---

## 1. Fetcher テスト

### 1.1 型定義テスト (`src/fetchers/__tests__/types.test.ts`)

| テストケース | 説明 |
|-------------|------|
| Article 型の必須フィールド検証 | id, source, title, content, url, publishedAt が必須 |
| Fetcher インターフェース実装確認 | name プロパティと fetch() メソッドが存在 |

### 1.2 Feedly Fetcher テスト (`src/fetchers/__tests__/feedly.test.ts`)

#### 正常系

| テストケース | 説明 | 関連要件 |
|-------------|------|----------|
| 未読記事を取得できる | Feedly API から未読記事を取得 | [Event-driven] 記事収集 |
| Article 形式に変換できる | Feedly レスポンスを統一 Article 形式に変換 | [Ubiquitous] 記事収集 |
| 空の記事リストを処理できる | 未読記事がない場合に空配列を返す | - |

#### 異常系

| テストケース | 説明 | 関連要件 |
|-------------|------|----------|
| レート制限時にリトライする | 指数バックオフで最大3回リトライ | [Unwanted] 信頼性 |
| 取得失敗時はスキップする | 個別記事の失敗はログ出力して続行 | [Unwanted] 信頼性 |

---

## 2. Summarizer テスト (`src/__tests__/summarizer.test.ts`)

#### 正常系

| テストケース | 説明 | 関連要件 |
|-------------|------|----------|
| 要約を取得できる | Claude API を呼び出して要約を生成 | [Event-driven] 要約 |
| 3-5個の要点を生成する | 各記事につき箇条書き要点を生成 | [Ubiquitous] 要約 |
| 10件並列処理できる | バッチ処理で10件ずつ並列実行 | [Ubiquitous] 要約 |
| 100件をバッチ処理できる | 10件×10バッチで処理 | パフォーマンス要件 |
| カテゴリ分類できる | LLM 出力に基づき自動分類（オプション） | [Optional] 要約 |

#### 異常系

| テストケース | 説明 | 関連要件 |
|-------------|------|----------|
| API エラー時にリトライする | 指数バックオフで最大3回リトライ | [Unwanted] 信頼性 |
| フォールバックメッセージを返す | リトライ後も失敗時は代替メッセージ | [Unwanted] 信頼性 |
| 個別失敗が全体をブロックしない | 1記事の失敗は他の処理に影響しない | [Unwanted] 信頼性 |

---

## 3. Formatter テスト (`src/__tests__/formatter.test.ts`)

#### 正常系

| テストケース | 説明 | 関連要件 |
|-------------|------|----------|
| Markdown を生成できる | Obsidian 互換の Markdown を出力 | [Event-driven] フォーマット |
| YAML frontmatter を出力する | date, sources, article_count, tags を含む | [Ubiquitous] フォーマット |
| カテゴリ別にグループ化する | 記事をカテゴリごとに整理して表示 | [Ubiquitous] フォーマット |
| 正しいパス形式を生成する | `digests/YYYY-MM-DD.md` 形式 | [Ubiquitous] 公開 |

#### 境界値

| テストケース | 説明 |
|-------------|------|
| 記事0件の場合 | 空のダイジェストを正しく生成 |
| カテゴリ1種類の場合 | 単一カテゴリで正しく出力 |

---

## 4. Publisher テスト (`src/__tests__/publisher.test.ts`)

#### 正常系

| テストケース | 説明 | 関連要件 |
|-------------|------|----------|
| GitHub にコミットできる | Contents API でファイルをコミット | [Event-driven] 公開 |
| 正しいパスにコミットする | `digests/YYYY-MM-DD.md` に出力 | [Ubiquitous] 公開 |

#### 異常系

| テストケース | 説明 | 関連要件 |
|-------------|------|----------|
| コミット失敗時にアラーム発報 | CloudWatch アラームをトリガー | [Unwanted] 信頼性 |
| 認証エラーを適切に処理する | GitHub Token 無効時のエラーハンドリング | - |

---

## 5. Lambda Handler テスト (`src/__tests__/index.test.ts`)

#### 統合テスト

| テストケース | 説明 | 関連要件 |
|-------------|------|----------|
| EventBridge イベントを処理できる | 起動イベントを受信して処理開始 | [Event-driven] スケジュール |
| パイプライン全体が動作する | Fetcher → Summarizer → Formatter → Publisher | データフロー |
| タイムアウト内に完了する | 10-15分以内に処理完了 | パフォーマンス要件 |

---

## 6. シークレット取得テスト (`src/__tests__/secrets.test.ts`)

| テストケース | 説明 | 関連要件 |
|-------------|------|----------|
| Secrets Manager から取得できる | AWS Secrets Manager から認証情報を取得 | [Ubiquitous] セキュリティ |
| 必要なキーが存在する | ANTHROPIC_API_KEY, FEEDLY_ACCESS_TOKEN, GITHUB_TOKEN | セキュリティ |

---

## テスト実行コマンド

```bash
# 全テスト実行
npm test

# ウォッチモード
npm run test:watch

# カバレッジ付き
npm run test:coverage
```

---

## モック対象

| 外部依存 | モック方法 |
|----------|-----------|
| Feedly API | vi.mock / nock |
| Anthropic API | vi.mock |
| GitHub API | vi.mock / nock |
| AWS Secrets Manager | @aws-sdk/client-secrets-manager モック |
| CloudWatch | @aws-sdk/client-cloudwatch モック |

---

## 参考

- [要件定義書](spec/daily-digest/requirements.md)
- [設計書](DESIGN.md)
