// Empaqueta el servicio local (TypeScript) en dist/service/index.js.
import { build } from 'esbuild';

await build({
  entryPoints: ['service/src/index.ts'],
  outfile: 'dist/service/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
