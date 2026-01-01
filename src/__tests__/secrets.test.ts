import { describe, it } from 'vitest'

describe('Secrets', () => {
  describe('Secrets Manager', () => {
    it.todo('AWS Secrets Manager から認証情報を取得できる')
    it.todo('daily-digest-secrets シークレットを取得する')
  })

  describe('必須キー', () => {
    it.todo('ANTHROPIC_API_KEY が存在する')
    it.todo('FEEDLY_ACCESS_TOKEN が存在する')
    it.todo('GITHUB_TOKEN が存在する')
  })

  describe('エラーハンドリング', () => {
    it.todo('シークレットが存在しない場合はエラーをスローする')
    it.todo('必須キーが欠落している場合はエラーをスローする')
  })

  describe('キャッシュ', () => {
    it.todo('取得したシークレットをキャッシュする')
    it.todo('Lambda コールドスタート時に再取得する')
  })
})
