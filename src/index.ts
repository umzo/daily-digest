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
 * パイプライン実行
 *
 * Fetcher → Summarizer → Formatter → Publisher の順で処理を実行する。
 */
async function runPipeline(): Promise<HandlerResult> {
  const githubConfig = getGitHubConfig()
  const today = new Date()

  // Step 1: Fetch articles
  console.log('[Pipeline] Fetching articles...')
  let articles: Article[] = []
  try {
    const fetcher = new FeedlyFetcher()
    articles = await fetcher.fetch()
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
    const summarizer = new Summarizer()
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
  const digest = formatter.format(summaries, { date: today })
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
 *
 * @param _event EventBridge イベント（未使用）
 * @param _context Lambda 実行コンテキスト（未使用）
 * @returns 処理結果
 */
export async function handler(
  _event: ScheduledEvent | Record<string, unknown>,
  _context: Context
): Promise<HandlerResult> {
  console.log('[Lambda] Handler started')

  try {
    const result = await runPipeline()

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
