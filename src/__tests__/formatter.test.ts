import { describe, it } from 'vitest'

describe('Formatter', () => {
  describe('Markdown 生成', () => {
    it.todo('Obsidian 互換の Markdown を生成できる')
    it.todo('記事タイトルを h3 見出しで出力する')
    it.todo('要点を箇条書きリストで出力する')
    it.todo('ソースリンクを blockquote で出力する')
  })

  describe('YAML frontmatter', () => {
    it.todo('date フィールドを YYYY-MM-DD 形式で出力する')
    it.todo('sources フィールドにデータソース一覧を出力する')
    it.todo('article_count フィールドに記事数を出力する')
    it.todo('tags フィールドに digest, daily を出力する')
  })

  describe('カテゴリ分類', () => {
    it.todo('記事をカテゴリ別にグループ化できる')
    it.todo('カテゴリを h2 見出しで出力する')
    it.todo('カテゴリがない記事は Other に分類する')
    it.todo('カテゴリ間にセパレータを出力する')
  })

  describe('境界値', () => {
    it.todo('記事が 0 件の場合も有効な Markdown を生成する')
    it.todo('カテゴリが 1 種類のみの場合も正しく出力する')
    it.todo('非常に長いタイトルを適切に処理する')
  })
})

describe('formatDigest', () => {
  it.todo('digests/YYYY-MM-DD.md 形式のパスを生成する')
  it.todo('groupBy オプションでグループ化方法を指定できる')
})
