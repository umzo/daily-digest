import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  minify: true,
  sourcemap: true,
  dts: false,
  // Lambda 用に単一ファイルにバンドル
  bundle: true,
  // node_modules を外部化しない（Lambda デプロイ用）
  noExternal: [/.*/],
})
