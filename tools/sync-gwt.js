// sync-gwt.js
// One-command flow: GWT build output -> HAP rawfile (+ auto-apply GL patch safety net).
//
// Usage:  node tools/sync-gwt.js
//
// 1. Mirrors game/shattered-pixel-dungeon-master/html/build/dist/shattered/ (GWT output)
//    into entry/src/main/resources/rawfile/web/shattered/ (WebView assets packed into the HAP).
//    Files in the destination that no longer exist in the source are removed
//    (GWT strong names change between builds, stale permutations must not linger).
// 2. Runs tools/patch-gwt-gl.js (idempotent) so any cache.js from a pre-fix build still gets
//    the glBufferSubData copy() correction.
//
// After running this, rebuild the HAP (devecocli build) and reinstall.
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const SRC = path.join(projectRoot, 'game', 'shattered-pixel-dungeon-master', 'html', 'build', 'dist', 'shattered');
const DST = path.join(projectRoot, 'entry', 'src', 'main', 'resources', 'rawfile', 'web', 'shattered');

if (!fs.existsSync(path.join(SRC, 'shattered.nocache.js'))) {
  console.error('source missing or incomplete: ' + SRC);
  console.error('run the GWT build first (html module gradle war/production build).');
  process.exit(1);
}
fs.mkdirSync(DST, { recursive: true });

const srcFiles = fs.readdirSync(SRC).filter(f => fs.statSync(path.join(SRC, f)).isFile());
let copied = 0, unchanged = 0;
for (const f of srcFiles) {
  const s = fs.readFileSync(path.join(SRC, f));
  const d = path.join(DST, f);
  if (fs.existsSync(d) && fs.statSync(d).size === s.length &&
      Buffer.compare(fs.readFileSync(d), s) === 0) {
    unchanged++;
    continue;
  }
  fs.writeFileSync(d, s);
  copied++;
  console.log('copied: ' + f + ' (' + s.length + ' b)');
}
// remove stale files (e.g. old permutation hashes after a GWT rebuild)
for (const f of fs.readdirSync(DST)) {
  const p = path.join(DST, f);
  if (fs.statSync(p).isFile() && !srcFiles.includes(f)) {
    fs.unlinkSync(p);
    console.log('removed stale: ' + f);
  }
}
console.log('sync done: ' + copied + ' copied, ' + unchanged + ' unchanged, ' + srcFiles.length + ' total in source.');

const patch = require('./patch-gwt-gl.js');
const ok = patch.applyPatch();
console.log(ok ? 'patch check: OK' : 'patch check: MANUAL REVIEW NEEDED (pattern absent)');
if (!ok) process.exit(1);

// SFX volume: drop the StereoPannerNode so mono effects keep full amplitude
// (matches Android; see patch-gwt-audio.js). Idempotent.
const audioPatch = require('./patch-gwt-audio.js');
audioPatch.applyPatch();
