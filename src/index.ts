/**
 * Lambda Handler - Daily Digest エントリーポイント
 *
 * EventBridge からのスケジュールイベントを受信し、
 * Fetcher → Summarizer → Formatter → Publisher パイプラインを実行する。
 */

import type { Context, ScheduledEvent } from 'aws-lambda'
import type { Article, Summary } from './fetchers/types'
import { FeedlyFetcher } from './fetchers/feedly'
import { Summarizer } from './summarizer'
import { Formatter } from './formatter'
import { Publisher } from './publisher'
import { logError } from './utils/retry'

/**
 * Lambda イベント型
 *
 * EventBridge スケジュールイベントまたは手動呼び出しで日付指定が可能。
 */
export interface DigestEvent {
  /**
   * 取得対象の日付（YYYY-MM-DD 形式）
   *
   * この日付の 9:00 JST から過去24時間分の記事を取得する。
   * 未指定の場合は現在日時を基準にする。
   */
  targetDate?: string
}

/** ハンドラーの実行結果 */
export interface HandlerResult {
  /** 処理成功フラグ */
  success: boolean
  /** 取得した記事数 */
  articleCount?: number
  /** 生成した要約数 */
  summaryCount?: number
  /** コミット SHA */
  commitSha?: string
  /** 出力パス */
  path?: string
  /** エラーメッセージ（失敗時） */
  error?: string
}

/** GitHub リポジトリ設定 */
interface GitHubConfig {
  owner: string
  repo: string
  branch: string
}

/**
 * 環境変数から GitHub 設定を取得
 */
function getGitHubConfig(): GitHubConfig {
  return {
    owner: process.env.GITHUB_OWNER || 'owner',
    repo: process.env.GITHUB_REPO || 'repo',
    branch: process.env.GITHUB_BRANCH || 'main',
  }
}

/**
 * イベントから対象日付をパース
 *
 * @param event Lambda イベント
 * @returns パースされた日付（無効な場合は undefined）
 */
function parseTargetDate(event: ScheduledEvent | DigestEvent | Record<string, unknown>): Date | undefined {
  if ('targetDate' in event && typeof event.targetDate === 'string') {
    const parsed = new Date(event.targetDate)
    if (!isNaN(parsed.getTime())) {
      return parsed
    }
    console.warn(`[Lambda] Invalid targetDate format: ${event.targetDate}, using current date`)
  }
  return undefined
}

/** パイプライン実行オプション */
interface PipelineOptions {
  /** 取得対象の日付（未指定の場合は現在日時を基準） */
  targetDate?: Date
}

/**
 * パイプライン実行
 *
 * Fetcher → Summarizer → Formatter → Publisher の順で処理を実行する。
 *
 * @param options パイプラインオプション
 */
async function runPipeline(options?: PipelineOptions): Promise<HandlerResult> {
  const githubConfig = getGitHubConfig()
  const targetDate = options?.targetDate
  // ダイジェストの日付: targetDate が指定されている場合はその日付、未指定の場合は当日
  const digestDate = targetDate ?? new Date()

  // Step 1: Fetch articles
  console.log('[Pipeline] Fetching articles...')
  if (targetDate) {
    console.log(`[Pipeline] Target date: ${targetDate.toISOString().split('T')[0]}`)
  }
  let articles: Article[] = []
  const fetcher = new FeedlyFetcher()
  try {
    articles = await fetcher.fetch({ targetDate })
    console.log(`[Pipeline] Fetched ${articles.length} articles`)
  } catch (error) {
    // Fetcher 失敗時は空の結果で続行
    logError('Pipeline:Fetch', error, {})
    console.log('[Pipeline] Fetcher failed, continuing with empty articles')
    articles = []
  }

  // Step 2: Summarize articles
  console.log('[Pipeline] Summarizing articles...')
  let summaries: Summary[] = []
  try {
    const summarizer = new Summarizer({
      batchSize: 1,        // 1件ずつ順次処理
      batchDelayMs: 1500,  // 1.5秒間隔 → 40リクエスト/分
    })
    summaries = await summarizer.summarize(articles)
    console.log(`[Pipeline] Generated ${summaries.length} summaries`)
  } catch (error) {
    // Summarizer 完全失敗時は空の要約で続行
    logError('Pipeline:Summarize', error, {})
    console.log('[Pipeline] Summarizer failed, continuing with empty summaries')
    summaries = []
  }

  // Step 3: Format as Markdown
  console.log('[Pipeline] Formatting digest...')
  const formatter = new Formatter()
  const digest = formatter.format(summaries, { date: digestDate })
  console.log(`[Pipeline] Generated digest: ${digest.path}`)

  // Step 4: Publish to GitHub
  console.log('[Pipeline] Publishing to GitHub...')
  try {
    const publisher = new Publisher()
    const result = await publisher.publish(digest.content, {
      owner: githubConfig.owner,
      repo: githubConfig.repo,
      branch: githubConfig.branch,
      path: digest.path,
    })

    console.log(`[Pipeline] Published successfully: ${result.commitSha}`)

    // Step 5: Mark articles as read (GitHub コミット成功後のみ)
    if (articles.length > 0) {
      console.log('[Pipeline] Marking articles as read...')
      try {
        const entryIds = articles.map((a) => a.id)
        await fetcher.markAsRead(entryIds)
        console.log(`[Pipeline] Marked ${entryIds.length} articles as read`)
      } catch (error) {
        // 既読処理失敗はログのみ（コミットは成功しているので続行）
        logError('Pipeline:MarkAsRead', error, {})
        console.log('[Pipeline] Failed to mark as read, but commit succeeded')
      }
    }

    return {
      success: true,
      articleCount: articles.length,
      summaryCount: summaries.length,
      commitSha: result.commitSha,
      path: digest.path,
    }
  } catch (error) {
    // Publisher 失敗は致命的エラー
    logError('Pipeline:Publish', error, { path: digest.path }, { includeStack: true })

    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      articleCount: articles.length,
      summaryCount: summaries.length,
      path: digest.path,
      error: errorMessage,
    }
  }
}

/**
 * Lambda ハンドラー
 *
 * EventBridge スケジュールイベントまたは手動呼び出しを受け付ける。
 * 手動呼び出し時は { "targetDate": "YYYY-MM-DD" } 形式で日付を指定可能。
 *
 * @param event EventBridge イベントまたは日付指定イベント
 * @param _context Lambda 実行コンテキスト（未使用）
 * @returns 処理結果
 */
export async function handler(
  event: ScheduledEvent | DigestEvent | Record<string, unknown>,
  _context: Context
): Promise<HandlerResult> {
  console.log('[Lambda] Handler started')

  try {
    const targetDate = parseTargetDate(event)
    const result = await runPipeline({ targetDate })

    if (result.success) {
      console.log('[Lambda] Handler completed successfully', {
        articleCount: result.articleCount,
        summaryCount: result.summaryCount,
        commitSha: result.commitSha,
      })
    } else {
      console.error('[Lambda] Handler completed with error', {
        error: result.error,
      })
    }

    return result
  } catch (error) {
    // 予期しないエラー
    console.error('[Lambda] Unexpected error', error)

    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      error: `Unexpected error: ${errorMessage}`,
    }
  }
}
