import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  minify: false,
  sourcemap: true,
  dts: false,
  // Lambda 用に単一ファイルにバンドル
  bundle: true,
  // node_modules を外部化しない（Lambda デプロイ用）
  noExternal: [/.*/],
  // チャンク分割を無効化（単一ファイル出力）
  splitting: false,
})
