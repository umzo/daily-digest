import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Secrets } from '../secrets.js'

// モック関数
const mockSend = vi.fn()

// AWS SDK をモック化（クラスとして定義）
vi.mock('@aws-sdk/client-secrets-manager', () => {
  return {
    SecretsManagerClient: class {
      send = mockSend
    },
    GetSecretValueCommand: class {
      input: unknown
      constructor(input: unknown) {
        this.input = input
      }
    },
  }
})

describe('Secrets', () => {
  beforeEach(async () => {
    // 各テスト前にモジュールをリセット
    vi.resetModules()
    mockSend.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Secrets Manager', () => {
    it('AWS Secrets Manager から認証情報を取得できる', async () => {
      const mockSecrets: Secrets = {
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        FEEDLY_ACCESS_TOKEN: 'feedly-test-token',
        GITHUB_TOKEN: 'ghp_test-token',
      }

      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify(mockSecrets),
      })

      const { getSecrets } = await import('../secrets.js')
      const secrets = await getSecrets()

      expect(secrets).toEqual(mockSecrets)
    })

    it('daily-digest-secrets シークレットを取得する', async () => {
      const mockSecrets: Secrets = {
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        FEEDLY_ACCESS_TOKEN: 'feedly-test-token',
        GITHUB_TOKEN: 'ghp_test-token',
      }

      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify(mockSecrets),
      })

      const { getSecrets } = await import('../secrets.js')
      await getSecrets()

      // send に渡されたコマンドの input を検証
      expect(mockSend).toHaveBeenCalledTimes(1)
      const command = mockSend.mock.calls[0][0]
      expect(command.input).toEqual({
        SecretId: 'daily-digest-secrets',
      })
    })
  })

  describe('必須キー', () => {
    it('ANTHROPIC_API_KEY が存在する', async () => {
      const mockSecrets: Secrets = {
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        FEEDLY_ACCESS_TOKEN: 'feedly-test-token',
        GITHUB_TOKEN: 'ghp_test-token',
      }

      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify(mockSecrets),
      })

      const { getSecrets } = await import('../secrets.js')
      const secrets = await getSecrets()

      expect(secrets.ANTHROPIC_API_KEY).toBe('sk-ant-test-key')
    })

    it('FEEDLY_ACCESS_TOKEN が存在する', async () => {
      const mockSecrets: Secrets = {
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        FEEDLY_ACCESS_TOKEN: 'feedly-test-token',
        GITHUB_TOKEN: 'ghp_test-token',
      }

      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify(mockSecrets),
      })

      const { getSecrets } = await import('../secrets.js')
      const secrets = await getSecrets()

      expect(secrets.FEEDLY_ACCESS_TOKEN).toBe('feedly-test-token')
    })

    it('GITHUB_TOKEN が存在する', async () => {
      const mockSecrets: Secrets = {
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        FEEDLY_ACCESS_TOKEN: 'feedly-test-token',
        GITHUB_TOKEN: 'ghp_test-token',
      }

      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify(mockSecrets),
      })

      const { getSecrets } = await import('../secrets.js')
      const secrets = await getSecrets()

      expect(secrets.GITHUB_TOKEN).toBe('ghp_test-token')
    })
  })

  describe('エラーハンドリング', () => {
    it('シークレットが存在しない場合はエラーをスローする', async () => {
      mockSend.mockRejectedValueOnce(
        new Error("Secrets Manager can't find the specified secret.")
      )

      const { getSecrets } = await import('../secrets.js')

      await expect(getSecrets()).rejects.toThrow('シークレットの取得に失敗しました')
    })

    it('必須キーが欠落している場合はエラーをスローする', async () => {
      const incompleteSecrets = {
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        // FEEDLY_ACCESS_TOKEN が欠落
        GITHUB_TOKEN: 'ghp_test-token',
      }

      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify(incompleteSecrets),
      })

      const { getSecrets } = await import('../secrets.js')

      await expect(getSecrets()).rejects.toThrow(
        '必須キーが欠落しています: FEEDLY_ACCESS_TOKEN'
      )
    })

    it('SecretString が空の場合はエラーをスローする', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: undefined,
      })

      const { getSecrets } = await import('../secrets.js')

      await expect(getSecrets()).rejects.toThrow('シークレットの値が空です')
    })

    it('JSON パースに失敗した場合はエラーをスローする', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: 'invalid-json',
      })

      const { getSecrets } = await import('../secrets.js')

      await expect(getSecrets()).rejects.toThrow('シークレットのパースに失敗しました')
    })
  })

  describe('キャッシュ', () => {
    it('取得したシークレットをキャッシュする', async () => {
      const mockSecrets: Secrets = {
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        FEEDLY_ACCESS_TOKEN: 'feedly-test-token',
        GITHUB_TOKEN: 'ghp_test-token',
      }

      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(mockSecrets),
      })

      const { getSecrets } = await import('../secrets.js')

      // 1回目の呼び出し
      await getSecrets()
      // 2回目の呼び出し
      await getSecrets()

      // AWS SDK は1回だけ呼ばれる（キャッシュが効いている）
      expect(mockSend).toHaveBeenCalledTimes(1)
    })

    it('clearSecretsCache でキャッシュをクリアできる', async () => {
      const mockSecrets: Secrets = {
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        FEEDLY_ACCESS_TOKEN: 'feedly-test-token',
        GITHUB_TOKEN: 'ghp_test-token',
      }

      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(mockSecrets),
      })

      const { getSecrets, clearSecretsCache } = await import('../secrets.js')

      // 1回目の呼び出し
      await getSecrets()

      // キャッシュをクリア
      clearSecretsCache()

      // 2回目の呼び出し
      await getSecrets()

      // AWS SDK は2回呼ばれる（キャッシュがクリアされた）
      expect(mockSend).toHaveBeenCalledTimes(2)
    })
  })
})
