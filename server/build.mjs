import { build } from 'esbuild'
await build({
  entryPoints: ['server/index.ts', 'server/job.ts', 'server/stdio.ts'],
  outdir: 'server/dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
})
