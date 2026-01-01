import { describe, it } from 'vitest'

describe('Publisher', () => {
  describe('正常系', () => {
    it.todo('GitHub Contents API でファイルをコミットできる')
    it.todo('digests/YYYY-MM-DD.md パスに正しくコミットする')
    it.todo('コミットメッセージに日付を含める')
    it.todo('コミット成功時に commit SHA を返す')
  })

  describe('ファイル更新', () => {
    it.todo('既存ファイルがある場合は更新できる')
    it.todo('既存ファイルの SHA を取得して更新する')
  })

  describe('エラーハンドリング', () => {
    it.todo('コミット失敗時に CloudWatch アラームをトリガーする')
    it.todo('認証エラー (401) 時は適切なエラーをスローする')
    it.todo('権限エラー (403) 時は適切なエラーをスローする')
    it.todo('ネットワークエラー時はリトライする')
  })
})

describe('PublishOptions', () => {
  it.todo('owner, repo, branch, path を必須とする')
})
