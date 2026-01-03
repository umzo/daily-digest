/**
 * Publisher - GitHub 公開モジュール
 *
 * GitHub Contents API を使用して Markdown ファイルをリポジトリにコミットする。
 * エラー時は CloudWatch Logs にエラーを出力し、アラームをトリガー可能にする。
 */

import { getSecrets } from './secrets'
import { withRetry, logError } from './utils/retry'

/** 公開オプション */
export interface PublishOptions {
  /** リポジトリオーナー */
  owner: string
  /** リポジトリ名 */
  repo: string
  /** ブランチ名 */
  branch: string
  /** ファイルパス（例: digests/2025-01-01.md） */
  path: string
}

/** 公開結果 */
export interface PublishResult {
  /** コミット SHA */
  commitSha: string
}

/** Publisher 設定 */
export interface PublisherConfig {
  /** 最大リトライ回数（デフォルト: 3） */
  maxRetries?: number
  /** 基準待機時間（ミリ秒、デフォルト: 1000） */
  baseDelay?: number
}

/** GitHub API のベース URL */
const GITHUB_API_BASE = 'https://api.github.com'

/** カスタムエラークラス */
class PublisherError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'PublisherError'
  }
}

/**
 * パスから日付を抽出
 */
function extractDateFromPath(path: string): string | null {
  const match = path.match(/(\d{4}-\d{2}-\d{2})\.md$/)
  return match ? match[1] : null
}

/**
 * リトライすべきかを判定
 */
function shouldRetry(error: Error): boolean {
  if (error instanceof PublisherError) {
    // 認証・権限エラーはリトライしない
    if (error.statusCode === 401 || error.statusCode === 403) {
      return false
    }
  }
  // ネットワークエラー、5xx エラーはリトライ
  return true
}

/**
 * Publisher クラス
 *
 * GitHub Contents API を使用してファイルをコミットする。
 */
export class Publisher {
  private readonly maxRetries: number
  private readonly baseDelay: number
  private token: string | null = null

  constructor(config: PublisherConfig = {}) {
    this.maxRetries = config.maxRetries ?? 3
    this.baseDelay = config.baseDelay ?? 1000
  }

  /**
   * GitHub トークンを取得（遅延初期化）
   */
  private async getToken(): Promise<string> {
    if (this.token) {
      return this.token
    }

    const secrets = await getSecrets()
    this.token = secrets.GITHUB_TOKEN
    return this.token
  }

  /**
   * コンテンツを GitHub にコミット
   *
   * @param content コミットするコンテンツ
   * @param options 公開オプション
   * @returns 公開結果
   */
  async publish(content: string, options: PublishOptions): Promise<PublishResult> {
    try {
      return await withRetry(
        () => this.doPublish(content, options),
        {
          maxRetries: this.maxRetries,
          baseDelay: this.baseDelay,
          shouldRetry,
          onRetry: (error, attempt) => {
            logError('Publisher', error, {
              path: options.path,
              attempt,
            })
          },
        }
      )
    } catch (error) {
      // 最終的に失敗した場合は CloudWatch アラーム用にエラーログを出力
      logError('Publisher', error, { path: options.path }, { includeStack: true })
      throw error
    }
  }

  /**
   * 実際の公開処理
   */
  private async doPublish(
    content: string,
    options: PublishOptions
  ): Promise<PublishResult> {
    const token = await this.getToken()
    const { owner, repo, branch, path } = options

    // 既存ファイルの SHA を取得（更新の場合に必要）
    const existingSha = await this.getFileSha(token, owner, repo, branch, path)

    // ファイルをコミット
    const commitSha = await this.commitFile(
      token,
      owner,
      repo,
      branch,
      path,
      content,
      existingSha
    )

    return { commitSha }
  }

  /**
   * 既存ファイルの SHA を取得
   *
   * @returns ファイルが存在する場合は SHA、存在しない場合は undefined
   */
  private async getFileSha(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    path: string
  ): Promise<string | undefined> {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (response.status === 401) {
      throw new PublisherError('GitHub 認証エラー: トークンが無効です', 401)
    }

    if (response.status === 403) {
      throw new PublisherError('GitHub 権限エラー: リポジトリへのアクセス権がありません', 403)
    }

    if (response.status === 404) {
      // ファイルが存在しない
      return undefined
    }

    if (!response.ok) {
      throw new PublisherError(
        `GitHub API エラー: ${response.status} ${response.statusText}`,
        response.status
      )
    }

    const data = await response.json()
    return data.sha
  }

  /**
   * ファイルをコミット
   */
  private async commitFile(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    content: string,
    existingSha?: string
  ): Promise<string> {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`

    // コミットメッセージを生成
    const date = extractDateFromPath(path) || new Date().toISOString().slice(0, 10)
    const action = existingSha ? 'Update' : 'Add'
    const message = `${action} daily digest for ${date}`

    // コンテンツを Base64 エンコード
    const contentBase64 = Buffer.from(content, 'utf-8').toString('base64')

    // リクエストボディ
    const body: Record<string, string> = {
      message,
      content: contentBase64,
      branch,
    }

    if (existingSha) {
      body.sha = existingSha
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    })

    if (response.status === 401) {
      throw new PublisherError('GitHub 認証エラー: トークンが無効です', 401)
    }

    if (response.status === 403) {
      throw new PublisherError('GitHub 権限エラー: リポジトリへの書き込み権限がありません', 403)
    }

    if (!response.ok) {
      throw new PublisherError(
        `GitHub コミットエラー: ${response.status} ${response.statusText}`,
        response.status
      )
    }

    const data = await response.json()
    return data.commit.sha
  }
}

/**
 * コンテンツを GitHub に公開する便利関数
 *
 * @param content コミットするコンテンツ
 * @param options 公開オプション
 * @returns 公開結果
 */
export async function publish(
  content: string,
  options: PublishOptions
): Promise<PublishResult> {
  const publisher = new Publisher()
  return publisher.publish(content, options)
}
