// Builds packages/core into dist/core.js — a global IIFE bundle.
// Loaded as a plain script (manifest content_scripts, importScripts in the
// service worker, <script> in account pages); exposes `StudioLabCore`
// (top-level var => works in windows AND service workers, no window.* needed).
import { build } from 'esbuild';

await build({
  entryPoints: ['packages/core/src/index.js'],
  bundle: true,
  format: 'iife',
  globalName: 'StudioLabCore',
  target: 'chrome116',
  outfile: 'dist/core.js',
});

console.log('built dist/core.js');
