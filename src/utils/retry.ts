/**
 * 共有ユーティリティ - リトライ & ログ
 *
 * 指数バックオフリトライとエラーログ出力のヘルパー関数を提供。
 * Fetcher, Summarizer, Publisher 等の外部 API 呼び出しで使用。
 */

/**
 * リトライオプション
 */
export interface RetryOptions {
  /** 最大リトライ回数（デフォルト: 3） */
  maxRetries?: number

  /** 基準となる待機時間（ミリ秒、デフォルト: 1000） */
  baseDelay?: number

  /** リトライすべきかを判定する関数 */
  shouldRetry?: (error: Error) => boolean

  /** リトライ時に呼ばれるコールバック */
  onRetry?: (error: Error, attempt: number) => void
}

/**
 * 指定ミリ秒待機する Promise を返す
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 指数バックオフリトライ
 *
 * 関数を実行し、失敗した場合は指数バックオフで再試行する。
 * 待機時間は baseDelay * 2^attempt（1s, 2s, 4s, ...）
 *
 * @param fn 実行する非同期関数
 * @param options リトライオプション
 * @returns 関数の実行結果
 * @throws 最大リトライ回数を超えた場合は最後のエラー
 *
 * @example
 * // 基本的な使い方
 * const result = await withRetry(() => fetchData())
 *
 * @example
 * // オプション付き
 * const result = await withRetry(
 *   () => fetchData(),
 *   {
 *     maxRetries: 5,
 *     baseDelay: 500,
 *     shouldRetry: (e) => e.message.includes('rate limit'),
 *     onRetry: (e, attempt) => console.log(`Retry ${attempt}:`, e.message)
 *   }
 * )
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    shouldRetry = () => true,
    onRetry,
  } = options

  let lastError: Error

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // 最後の試行、またはリトライ対象外の場合は即座にスロー
      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError
      }

      // リトライコールバックを呼び出し
      if (onRetry) {
        onRetry(lastError, attempt + 1)
      }

      // 指数バックオフで待機（baseDelay * 2^attempt）
      const delay = baseDelay * Math.pow(2, attempt)
      await sleep(delay)
    }
  }

  // TypeScript のために到達不能コードだが必要
  throw lastError!
}

/**
 * ログ出力オプション
 */
export interface LogOptions {
  /** スタックトレースを含めるか（デフォルト: false） */
  includeStack?: boolean
}

/**
 * エラーログ出力ヘルパー
 *
 * 統一フォーマットでエラーを出力する。
 * CloudWatch Logs で検索しやすい形式。
 *
 * @param context エラーが発生したコンテキスト（例: 'Feedly API', 'Summarizer'）
 * @param error エラーオブジェクトまたは任意の値
 * @param extra 追加情報（オプション）
 * @param options ログ出力オプション
 *
 * @example
 * // 基本的な使い方
 * logError('Feedly API', error)
 *
 * @example
 * // 追加情報付き
 * logError('Summarizer', error, { articleId: '123' })
 *
 * @example
 * // スタックトレース付き
 * logError('Publisher', error, undefined, { includeStack: true })
 */
export function logError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
  options: LogOptions = {}
): void {
  const { includeStack = false } = options

  // エラーメッセージを取得
  const message =
    error instanceof Error
      ? error.message
      : error === null
        ? 'null'
        : error === undefined
          ? 'undefined'
          : String(error)

  // 基本ログ出力
  if (extra) {
    console.error(`[ERROR] ${context}: ${message}`, extra)
  } else {
    console.error(`[ERROR] ${context}: ${message}`)
  }

  // スタックトレース出力
  if (includeStack && error instanceof Error && error.stack) {
    console.error(error.stack)
  }
}
