/**
 * Publisher テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Publisher, publish, type PublishOptions } from '../publisher'
import * as secrets from '../secrets'

// fetch をモック
const mockFetch = vi.fn()
global.fetch = mockFetch

// secrets をモック
vi.mock('../secrets', () => ({
  getSecrets: vi.fn(),
}))

describe('Publisher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(secrets.getSecrets).mockResolvedValue({
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      FEEDLY_ACCESS_TOKEN: 'test-feedly-token',
      GITHUB_TOKEN: 'test-github-token',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const defaultOptions: PublishOptions = {
    owner: 'testowner',
    repo: 'testrepo',
    branch: 'main',
    path: 'digests/2025-01-01.md',
  }

  describe('正常系', () => {
    it('GitHub Contents API でファイルをコミットできる', async () => {
      // ファイルが存在しない（404）→ 新規作成
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              commit: { sha: 'abc123' },
            }),
        })

      const publisher = new Publisher()
      const result = await publisher.publish('# Test Content', defaultOptions)

      expect(result.commitSha).toBe('abc123')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('digests/YYYY-MM-DD.md パスに正しくコミットする', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              commit: { sha: 'def456' },
            }),
        })

      const publisher = new Publisher()
      await publisher.publish('# Test', {
        ...defaultOptions,
        path: 'digests/2025-06-15.md',
      })

      // PUT リクエストの URL を確認
      const putCall = mockFetch.mock.calls[1]
      expect(putCall[0]).toContain('digests/2025-06-15.md')
    })

    it('コミットメッセージに日付を含める', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              commit: { sha: 'ghi789' },
            }),
        })

      const publisher = new Publisher()
      await publisher.publish('# Test', {
        ...defaultOptions,
        path: 'digests/2025-01-15.md',
      })

      // PUT リクエストの body を確認
      const putCall = mockFetch.mock.calls[1]
      const body = JSON.parse(putCall[1].body)
      expect(body.message).toContain('2025-01-15')
    })

    it('コミット成功時に commit SHA を返す', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              commit: { sha: 'xyz789' },
            }),
        })

      const publisher = new Publisher()
      const result = await publisher.publish('# Test', defaultOptions)

      expect(result.commitSha).toBe('xyz789')
      expect(result.path).toBe(defaultOptions.path)
    })
  })

  describe('パスインクリメント', () => {
    it('既存ファイルがある場合はインクリメントしたパスで作成する', async () => {
      // 最初のパスが存在（200）→ _2 で作成
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              sha: 'existing-sha-123',
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              commit: { sha: 'new-commit-sha' },
            }),
        })

      const publisher = new Publisher()
      const result = await publisher.publish('# New Content', defaultOptions)

      expect(result.commitSha).toBe('new-commit-sha')
      expect(result.path).toBe('digests/2025-01-01_2.md')
    })

    it('複数回インクリメントして利用可能なパスを見つける', async () => {
      // _2 も存在 → _3 で作成
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sha: 'sha-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sha: 'sha-2' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              commit: { sha: 'new-commit' },
            }),
        })

      const publisher = new Publisher()
      const result = await publisher.publish('# Content', defaultOptions)

      expect(result.path).toBe('digests/2025-01-01_3.md')
    })
  })

  describe('エラーハンドリング', () => {
    it('コミット失敗時に CloudWatch アラームをトリガーする', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })

      // リトライなしで即座に失敗させる
      const publisher = new Publisher({ maxRetries: 0, baseDelay: 10 })

      await expect(
        publisher.publish('# Test', defaultOptions)
      ).rejects.toThrow()

      // CloudWatch Logs 経由でアラームがトリガーされる（エラーログ出力）
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('認証エラー (401) 時は適切なエラーをスローする', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })

      const publisher = new Publisher()

      await expect(publisher.publish('# Test', defaultOptions)).rejects.toThrow(
        /認証/
      )
    })

    it('権限エラー (403) 時は適切なエラーをスローする', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      })

      const publisher = new Publisher()

      await expect(publisher.publish('# Test', defaultOptions)).rejects.toThrow(
        /権限/
      )
    })

    it('ネットワークエラー時はリトライする', async () => {
      // 最初の2回はネットワークエラー、3回目で成功
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              commit: { sha: 'success-after-retry' },
            }),
        })

      const publisher = new Publisher({ maxRetries: 3, baseDelay: 10 })
      const result = await publisher.publish('# Test', defaultOptions)

      expect(result.commitSha).toBe('success-after-retry')
      // 2回リトライ + 成功時の2リクエスト = 4回
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })
  })
})

describe('PublishOptions', () => {
  it('owner, repo, branch, path を必須とする', () => {
    // TypeScript の型チェックで担保されるため、ランタイムでの確認
    const options: PublishOptions = {
      owner: 'user',
      repo: 'repo',
      branch: 'main',
      path: 'test.md',
    }

    expect(options.owner).toBe('user')
    expect(options.repo).toBe('repo')
    expect(options.branch).toBe('main')
    expect(options.path).toBe('test.md')
  })
})

describe('publish 関数', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(secrets.getSecrets).mockResolvedValue({
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      FEEDLY_ACCESS_TOKEN: 'test-feedly-token',
      GITHUB_TOKEN: 'test-github-token',
    })
  })

  it('便利関数として使用できる', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            commit: { sha: 'func-sha' },
          }),
      })

    const result = await publish('# Content', {
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      path: 'test.md',
    })

    expect(result.commitSha).toBe('func-sha')
  })
})
