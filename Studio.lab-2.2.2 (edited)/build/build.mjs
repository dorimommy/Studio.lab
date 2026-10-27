// Builds packages/core into dist/core.js (ISOLATED world) and dist/core-main.js
// (MAIN world) — a global IIFE bundle exposing `StudioLabCore`.
//
// NOTE: the two files are byte-identical on purpose. Chromium deduplicates a
// script URL across `content_scripts` entries within one frame, so the same
// filename listed in both the MAIN and ISOLATED groups would only execute in
// the first one. Two filenames => injected in both worlds.
import { build } from 'esbuild';

const common = {
  entryPoints: ['packages/core/src/index.js'],
  bundle: true,
  format: 'iife',
  globalName: 'StudioLabCore',
  target: 'chrome116',
};

await build({ ...common, outfile: 'dist/core.js' });
await build({ ...common, outfile: 'dist/core-main.js' });

console.log('built dist/core.js + dist/core-main.js');
