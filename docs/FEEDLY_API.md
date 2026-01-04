# Feedly API リファレンス

このドキュメントは daily-digest で使用する Feedly API のリファレンスです。

## ベース URL

```
https://cloud.feedly.com/v3
```

## 認証

すべてのリクエストに OAuth Bearer トークンが必要です。

```
Authorization: Bearer {access_token}
```

---

## GET /streams/contents

ストリームから記事を取得します。

### エンドポイント

```
GET https://cloud.feedly.com/v3/streams/contents
```

### Query Parameters

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|------------|------|
| `streamId` | string | **必須** | - | アクセスするストリームのID。URI エンコードが必要 |
| `count` | string | 任意 | 20 | 取得する記事数（1〜100） |
| `newerThan` | string | 任意 | - | この時刻以降の記事を取得（Unix タイムスタンプ、ミリ秒）。31日前より古くは指定不可 |
| `olderThan` | string | 任意 | - | この時刻より前の記事を取得（Unix タイムスタンプ、ミリ秒） |
| `continuation` | string | 任意 | - | ページング用ID。100件を超える記事を取得する際に使用 |
| `includeAiActions` | boolean | 任意 | true | AI Actions を含めるか |
| `similar` | boolean | 任意 | true | numRelatedEntries を含めるか |

### ストリームID の形式

```
user/{userId}/category/global.all
```

※ `userId` は `/v3/profile` エンドポイントから取得可能

### リクエスト例

```bash
curl -X GET \
  'https://cloud.feedly.com/v3/streams/contents?streamId=user%2F{userId}%2Fcategory%2Fglobal.all&count=100&newerThan=1704067200000&olderThan=1704153600000' \
  -H 'Authorization: Bearer {access_token}'
```

### レスポンス例

```json
{
  "items": [
    {
      "id": "entry-id-here",
      "title": "Article Title",
      "content": { "content": "<p>HTML content...</p>" },
      "summary": { "content": "<p>Summary...</p>" },
      "alternate": [{ "href": "https://example.com/article" }],
      "author": "Author Name",
      "published": 1704067200000,
      "keywords": ["tag1", "tag2"]
    }
  ],
  "continuation": "next-page-id"
}
```

### レスポンスフィールド

| フィールド | 説明 |
|-----------|------|
| `items` | 記事の配列 |
| `continuation` | 次ページ取得用のID（ページングに使用） |

### 記事オブジェクト

| フィールド | 説明 |
|-----------|------|
| `id` | 記事の一意識別子 |
| `title` | 記事タイトル |
| `content` | 記事本文（HTML） |
| `summary` | 記事サマリー（content がない場合に使用） |
| `alternate` | 元記事のURL配列 |
| `author` | 著者名 |
| `published` | 公開日時（Unix タイムスタンプ、ミリ秒） |
| `keywords` | タグ・キーワード配列 |

---

## GET /profile

ユーザープロファイルを取得します（ユーザーID取得に使用）。

### エンドポイント

```
GET https://cloud.feedly.com/v3/profile
```

### レスポンス例

```json
{
  "id": "user/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

---

## POST /markers

記事を既読にマークします。

### エンドポイント

```
POST https://cloud.feedly.com/v3/markers
```

### リクエストボディ

```json
{
  "action": "markAsRead",
  "type": "entries",
  "entryIds": ["entry-id-1", "entry-id-2"]
}
```

---

## エラーレスポンス

| ステータスコード | 説明 |
|-----------------|------|
| 401 | 認証エラー（トークン無効） |
| 429 | レート制限（リクエスト過多） |
| 500 | サーバーエラー |

---

## daily-digest での使用方法

### 時間範囲指定

前日 9:00 JST 〜 当日 9:00 JST の24時間分を取得：

```typescript
const olderThan = todayAt9amJST.getTime()           // 当日 9:00 JST
const newerThan = olderThan - 24 * 60 * 60 * 1000   // 前日 9:00 JST

const params = new URLSearchParams({
  streamId,
  count: '100',
  newerThan: String(newerThan),
  olderThan: String(olderThan),
})
```

### 注意事項

- `newerThan` は31日前より古い値は指定不可
- `count` の最大値は100。それ以上取得する場合は `continuation` を使用してページング
- ストリームIDはURIエンコードが必要

---

## 参考リンク

- [Feedly Developer Portal](https://developer.feedly.com/)
