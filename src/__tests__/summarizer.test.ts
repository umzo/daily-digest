import { describe, it } from 'vitest'

describe('Summarizer', () => {
  describe('正常系', () => {
    it.todo('Claude API を呼び出して要約を取得できる')
    it.todo('各記事につき 3-5 個の箇条書き要点を生成する')
    it.todo('記事を自動でカテゴリ分類できる')
  })

  describe('バッチ処理', () => {
    it.todo('10件の記事を並列処理できる')
    it.todo('100件の記事を 10バッチに分けて処理できる')
    it.todo('バッチ間で適切な待機時間を設ける')
  })

  describe('エラーハンドリング', () => {
    it.todo('API エラー時に指数バックオフで最大3回リトライする')
    it.todo('リトライ後も失敗時はフォールバックメッセージを返す')
    it.todo('個別記事の失敗が他の記事処理をブロックしない')
    it.todo('レート制限時は適切に待機してリトライする')
  })
})

describe('Summary', () => {
  it.todo('article プロパティに元の Article を保持する')
  it.todo('bullets プロパティに要点の配列を保持する')
  it.todo('category プロパティはオプション')
})
