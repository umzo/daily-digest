/**
 * Formatter - Markdown 生成モジュール
 *
 * Summary 配列を Obsidian 互換の Markdown に変換する。
 * カテゴリ別またはソース別にグループ化し、YAML frontmatter を付与。
 */

import type { Summary } from './fetchers/types'

/** フォーマットオプション */
export interface FormatOptions {
  /** ダイジェストの日付 */
  date: Date
  /** グループ化方法（デフォルト: category） */
  groupBy?: 'category' | 'source'
}

/** ダイジェストオプション（パス生成を含む） */
export interface DigestOptions extends FormatOptions {}

/** フォーマット結果 */
export interface DigestResult {
  /** 生成された Markdown コンテンツ */
  content: string
  /** 出力先パス */
  path: string
}

/** デフォルトカテゴリ */
const DEFAULT_CATEGORY = 'Other'

/**
 * 日付を YYYY-MM-DD 形式にフォーマット
 */
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * ISO 8601 形式の日時文字列を生成
 */
function formatISODateTime(): string {
  return new Date().toISOString()
}

/**
 * 文字列の先頭を大文字にする
 */
function capitalize(str: string): string {
  if (str.length === 0) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Formatter クラス
 *
 * Summary 配列を Markdown に変換する。
 */
export class Formatter {
  /**
   * Summary 配列を Markdown にフォーマット
   *
   * @param summaries 要約配列
   * @param options フォーマットオプション
   * @returns フォーマット結果（content と path）
   */
  format(summaries: Summary[], options: FormatOptions): DigestResult {
    const { date, groupBy = 'category' } = options
    const dateStr = formatDate(date)
    const path = `digests/${dateStr}.md`

    const content = this.buildMarkdown(summaries, dateStr, groupBy)

    return { content, path }
  }

  /**
   * Markdown コンテンツを構築
   */
  private buildMarkdown(
    summaries: Summary[],
    dateStr: string,
    groupBy: 'category' | 'source'
  ): string {
    const parts: string[] = []

    // YAML frontmatter
    parts.push(this.buildFrontmatter(summaries, dateStr))

    // タイトル
    parts.push(`# Daily Digest - ${dateStr}`)
    parts.push('')

    // カテゴリ/ソース別にグループ化して出力
    if (summaries.length > 0) {
      const grouped = this.groupSummaries(summaries, groupBy)
      const categories = Array.from(grouped.keys())

      categories.forEach((category, index) => {
        const items = grouped.get(category)!

        // カテゴリ見出し
        parts.push(`## ${category}`)
        parts.push('')

        // 各記事
        items.forEach((summary) => {
          parts.push(...this.formatArticle(summary))
        })

        // カテゴリ間のセパレータ（最後以外）
        if (index < categories.length - 1) {
          parts.push('---')
          parts.push('')
        }
      })
    }

    // 生成日時
    parts.push('---')
    parts.push('')
    parts.push(`*Generated at ${formatISODateTime()}*`)
    parts.push('')

    return parts.join('\n')
  }

  /**
   * YAML frontmatter を構築
   */
  private buildFrontmatter(summaries: Summary[], dateStr: string): string {
    // ユニークなソースを抽出
    const sources = [...new Set(summaries.map((s) => s.article.source))].sort()

    const lines: string[] = []
    lines.push('---')
    lines.push(`date: ${dateStr}`)

    // sources
    lines.push('sources:')
    if (sources.length > 0) {
      sources.forEach((source) => {
        lines.push(`  - ${source}`)
      })
    }

    // article_count
    lines.push(`article_count: ${summaries.length}`)

    // tags
    lines.push('tags:')
    lines.push('  - digest')
    lines.push('  - daily')

    lines.push('---')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Summary 配列をグループ化
   */
  private groupSummaries(
    summaries: Summary[],
    groupBy: 'category' | 'source'
  ): Map<string, Summary[]> {
    const grouped = new Map<string, Summary[]>()

    summaries.forEach((summary) => {
      let key: string

      if (groupBy === 'source') {
        key = capitalize(summary.article.source)
      } else {
        key = summary.category || DEFAULT_CATEGORY
      }

      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(summary)
    })

    return grouped
  }

  /**
   * 単一記事を Markdown フォーマット
   */
  private formatArticle(summary: Summary): string[] {
    const lines: string[] = []
    const { article, bullets } = summary

    // 記事タイトル (h3)
    lines.push(`### ${article.title}`)

    // 要点（箇条書き）
    bullets.forEach((bullet) => {
      lines.push(`- ${bullet}`)
    })

    // ソースリンク (blockquote)
    const sourceName = capitalize(article.source)
    lines.push('')
    lines.push(`> [Source](${article.url}) via ${sourceName}`)
    lines.push('')

    return lines
  }
}

/**
 * ダイジェストを生成する便利関数
 *
 * @param summaries 要約配列
 * @param options ダイジェストオプション
 * @returns ダイジェスト結果
 */
export function formatDigest(
  summaries: Summary[],
  options: DigestOptions
): DigestResult {
  const formatter = new Formatter()
  return formatter.format(summaries, options)
}
