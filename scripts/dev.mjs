// Desarrollo: recompila el servicio al cambiar y arranca Vite (puerto 5173).
import { context } from 'esbuild';
import { spawn } from 'node:child_process';

let child = null;
const restart = () => {
  if (child) child.kill();
  child = spawn(process.execPath, ['dist/service/index.js'], { stdio: 'inherit' });
};
const ctx = await context({
  entryPoints: ['service/src/index.ts'],
  outfile: 'dist/service/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  plugins: [{ name: 'restart', setup(b) { b.onEnd((r) => { if (!r.errors.length) restart(); }); } }],
});
await ctx.watch();
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' });
const stop = () => { child?.kill(); vite.kill(); ctx.dispose(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
