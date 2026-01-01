/**
 * シークレット取得モジュール
 *
 * AWS Secrets Manager から認証情報を取得し、キャッシュする。
 * Lambda のコールドスタート対策として、取得したシークレットはメモリにキャッシュされる。
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'

/** シークレット名（AWS Secrets Manager 上の ID） */
const SECRET_ID = 'daily-digest-secrets'

/** 必須キーの一覧 */
const REQUIRED_KEYS = [
  'ANTHROPIC_API_KEY',
  'FEEDLY_ACCESS_TOKEN',
  'GITHUB_TOKEN',
] as const

/** シークレットの型定義 */
export interface Secrets {
  /** Anthropic API キー */
  ANTHROPIC_API_KEY: string
  /** Feedly OAuth アクセストークン */
  FEEDLY_ACCESS_TOKEN: string
  /** GitHub Personal Access Token */
  GITHUB_TOKEN: string
}

/** キャッシュされたシークレット */
let cachedSecrets: Secrets | null = null

/** Secrets Manager クライアント（再利用のためモジュールレベルで保持） */
const client = new SecretsManagerClient({})

/**
 * シークレットを取得
 *
 * AWS Secrets Manager から認証情報を取得する。
 * 一度取得したシークレットはキャッシュされ、以降の呼び出しではキャッシュから返される。
 *
 * @returns シークレットオブジェクト
 * @throws シークレットの取得・パース・バリデーションに失敗した場合
 */
export async function getSecrets(): Promise<Secrets> {
  // キャッシュがあれば返す
  if (cachedSecrets !== null) {
    return cachedSecrets
  }

  let secretString: string | undefined

  try {
    const command = new GetSecretValueCommand({ SecretId: SECRET_ID })
    const response = await client.send(command)
    secretString = response.SecretString
  } catch (error) {
    throw new Error(
      `シークレットの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  // SecretString が空の場合
  if (!secretString) {
    throw new Error('シークレットの値が空です')
  }

  // JSON パース
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(secretString) as Record<string, unknown>
  } catch {
    throw new Error('シークレットのパースに失敗しました')
  }

  // 必須キーのバリデーション
  for (const key of REQUIRED_KEYS) {
    if (typeof parsed[key] !== 'string' || parsed[key] === '') {
      throw new Error(`必須キーが欠落しています: ${key}`)
    }
  }

  // キャッシュに保存
  cachedSecrets = {
    ANTHROPIC_API_KEY: parsed.ANTHROPIC_API_KEY as string,
    FEEDLY_ACCESS_TOKEN: parsed.FEEDLY_ACCESS_TOKEN as string,
    GITHUB_TOKEN: parsed.GITHUB_TOKEN as string,
  }

  return cachedSecrets
}

/**
 * シークレットキャッシュをクリア
 *
 * 主にテスト用。Lambda のコールドスタート時には自動的にクリアされる。
 */
export function clearSecretsCache(): void {
  cachedSecrets = null
}
