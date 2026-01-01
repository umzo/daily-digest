import { describe, it } from 'vitest'

describe('FeedlyFetcher', () => {
  describe('正常系', () => {
    it.todo('Feedly API から未読記事を取得できる')
    it.todo('Feedly レスポンスを Article 形式に正しく変換できる')
    it.todo('未読記事がない場合は空配列を返す')
    it.todo('記事の publishedAt を Date オブジェクトに変換する')
  })

  describe('エラーハンドリング', () => {
    it.todo('レート制限 (429) 時に指数バックオフで最大3回リトライする')
    it.todo('個別記事の取得失敗時はスキップしてログ出力する')
    it.todo('認証エラー (401) 時は適切なエラーをスローする')
    it.todo('ネットワークエラー時はリトライする')
  })
})
