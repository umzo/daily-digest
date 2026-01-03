/**
 * プロンプト定義
 *
 * LLM に送信するプロンプトテンプレートを管理。
 * 調整が必要な場合はこのファイルを編集する。
 */

import type { Article } from './fetchers/types'

/**
 * 記事要約用のシステムプロンプト
 */
export const SUMMARIZER_SYSTEM_PROMPT = `あなたは情報整理のエキスパートです。
記事の要点を3-5個の箇条書きで簡潔にまとめてください。

# ルール
- 各項目は1行で完結させる
- 重要な数値や固有名詞は必ず含める
- 主観的な評価は避け、事実のみを抽出する

# 出力形式
箇条書きの後に、記事のカテゴリを1つ選んで記載してください。
カテゴリは Tech, Business, Science, Entertainment, Other のいずれかです。

例:
- 要点1
- 要点2
- 要点3

カテゴリ: Tech`

/**
 * 記事要約用のユーザープロンプトを構築
 */
export function buildSummarizerPrompt(article: Article): string {
  return `# 記事
タイトル: ${article.title}
本文: ${article.content}`
}
