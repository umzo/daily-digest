import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRetry, logError } from '../retry.js'

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('成功ケース', () => {
    it('関数が成功した場合は結果を返す', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withRetry(fn)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('2回目で成功した場合はリトライして結果を返す', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('一時的なエラー'))
        .mockResolvedValueOnce('success')

      const promise = withRetry(fn)

      // 初回失敗後、1秒待機
      await vi.advanceTimersByTimeAsync(1000)

      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('3回目で成功した場合はリトライして結果を返す', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('一時的なエラー'))
        .mockRejectedValueOnce(new Error('一時的なエラー'))
        .mockResolvedValueOnce('success')

      const promise = withRetry(fn)

      // 初回失敗後、1秒待機
      await vi.advanceTimersByTimeAsync(1000)
      // 2回目失敗後、2秒待機（指数バックオフ）
      await vi.advanceTimersByTimeAsync(2000)

      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })
  })

  describe('指数バックオフ', () => {
    it('デフォルトで 1s, 2s, 4s の間隔でリトライする', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('失敗'))

      const promise = withRetry(fn).catch(() => {})

      // 初回呼び出し
      expect(fn).toHaveBeenCalledTimes(1)

      // 1秒後: 1回目のリトライ
      await vi.advanceTimersByTimeAsync(1000)
      expect(fn).toHaveBeenCalledTimes(2)

      // 2秒後: 2回目のリトライ
      await vi.advanceTimersByTimeAsync(2000)
      expect(fn).toHaveBeenCalledTimes(3)

      // 4秒後: 3回目のリトライ
      await vi.advanceTimersByTimeAsync(4000)
      expect(fn).toHaveBeenCalledTimes(4)

      await promise
    })

    it('カスタム baseDelay を指定できる', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('一時的なエラー'))
        .mockResolvedValueOnce('success')

      const promise = withRetry(fn, { baseDelay: 500 })

      // 初回呼び出し
      expect(fn).toHaveBeenCalledTimes(1)

      // 500ms 後: 1回目のリトライ
      await vi.advanceTimersByTimeAsync(500)
      expect(fn).toHaveBeenCalledTimes(2)

      await promise
    })
  })

  describe('リトライ回数', () => {
    it('デフォルトで最大3回リトライする', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('失敗'))

      const promise = withRetry(fn).catch(() => {})

      // 初回 + 3回リトライ = 4回
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(4000)

      await promise

      expect(fn).toHaveBeenCalledTimes(4)
    })

    it('カスタム maxRetries を指定できる', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('失敗'))

      const promise = withRetry(fn, { maxRetries: 1 }).catch(() => {})

      // 初回 + 1回リトライ = 2回
      await vi.advanceTimersByTimeAsync(1000)

      await promise

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('maxRetries: 0 の場合はリトライしない', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('失敗'))

      await withRetry(fn, { maxRetries: 0 }).catch(() => {})

      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  describe('エラーハンドリング', () => {
    it('最大リトライ回数を超えた場合は最後のエラーをスローする', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('永続的なエラー'))

      let caughtError: Error | null = null
      const promise = withRetry(fn).catch((e: Error) => {
        caughtError = e
      })

      // すべてのリトライを完了させる（1s + 2s + 4s = 7s）
      await vi.advanceTimersByTimeAsync(7000)

      await promise

      expect(caughtError).toBeInstanceOf(Error)
      expect(caughtError?.message).toBe('永続的なエラー')
    })

    it('shouldRetry で特定のエラーをリトライ対象外にできる', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('致命的なエラー'))
      const shouldRetry = (error: Error) => !error.message.includes('致命的')

      await withRetry(fn, { shouldRetry }).catch(() => {})

      // リトライせずに1回で終了
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('shouldRetry が true を返す場合はリトライする', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('一時的なエラー'))
        .mockResolvedValueOnce('success')
      const shouldRetry = () => true

      const promise = withRetry(fn, { shouldRetry })

      await vi.advanceTimersByTimeAsync(1000)

      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  describe('onRetry コールバック', () => {
    it('リトライ時に onRetry が呼ばれる', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('エラー1'))
        .mockRejectedValueOnce(new Error('エラー2'))
        .mockResolvedValueOnce('success')
      const onRetry = vi.fn()

      const promise = withRetry(fn, { onRetry })

      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(2000)

      await promise

      expect(onRetry).toHaveBeenCalledTimes(2)
      expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1)
      expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2)
    })
  })
})

describe('logError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('基本機能', () => {
    it('コンテキストとエラーメッセージを出力する', () => {
      const error = new Error('テストエラー')

      logError('Feedly API', error)

      expect(console.error).toHaveBeenCalledWith(
        '[ERROR] Feedly API: テストエラー'
      )
    })

    it('Error 以外のオブジェクトも処理できる', () => {
      logError('Unknown', 'string error')

      expect(console.error).toHaveBeenCalledWith(
        '[ERROR] Unknown: string error'
      )
    })

    it('null/undefined も処理できる', () => {
      logError('Null', null)

      expect(console.error).toHaveBeenCalledWith('[ERROR] Null: null')
    })
  })

  describe('追加情報', () => {
    it('追加情報を含めて出力できる', () => {
      const error = new Error('テストエラー')
      const extra = { articleId: '123', url: 'https://example.com' }

      logError('Summarizer', error, extra)

      expect(console.error).toHaveBeenCalledWith(
        '[ERROR] Summarizer: テストエラー',
        extra
      )
    })
  })

  describe('スタックトレース', () => {
    it('includeStack: true でスタックトレースを出力する', () => {
      const error = new Error('テストエラー')

      logError('Test', error, undefined, { includeStack: true })

      expect(console.error).toHaveBeenCalledTimes(2)
      expect(console.error).toHaveBeenNthCalledWith(
        1,
        '[ERROR] Test: テストエラー'
      )
      expect(console.error).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('Error: テストエラー')
      )
    })
  })
})
