/**
 * 型定義 - Daily Digest システム
 *
 * Fetcher インターフェースと関連する型を定義。
 * すべてのデータソース（Feedly, RSS, X 等）はこのインターフェースを実装する。
 */

/**
 * 記事データの統一フォーマット
 *
 * 各 Fetcher はソース固有のデータをこの形式に変換する。
 */
export interface Article {
  /** 記事の一意識別子（ソース固有の ID） */
  id: string;

  /** データソース名 ('feedly', 'rss', 'x' など) */
  source: string;

  /** 記事タイトル */
  title: string;

  /** 記事本文（HTML タグ除去済み） */
  content: string;

  /** 記事の URL */
  url: string;

  /** 著者名（オプション） */
  author?: string;

  /** 公開日時 */
  publishedAt: Date;

  /** タグ・カテゴリ（オプション） */
  tags?: string[];
}

/**
 * 記事取得用インターフェース
 *
 * 新しいデータソースを追加する際は、このインターフェースを実装する。
 */
export interface Fetcher {
  /** データソース名（ログ出力等で使用） */
  readonly name: string;

  /**
   * 記事を取得
   *
   * @returns 取得した記事の配列
   * @throws 取得に失敗した場合（リトライ後も失敗した場合）
   */
  fetch(): Promise<Article[]>;
}

/**
 * 要約結果
 *
 * Summarizer が生成する要約データ。
 */
export interface Summary {
  /** 要約元の記事 */
  article: Article;

  /** 要点（3-5個の箇条書き） */
  bullets: string[];

  /** 自動分類カテゴリ（オプション） */
  category?: string;
}
