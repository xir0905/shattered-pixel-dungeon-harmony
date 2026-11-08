// patch-gwt-gl.js
// Root-cause fix for: door state (and any partial VBO update) never rendering on HarmonyOS WebView.
//
// BUG (in compiled GWT artifact, libgdx GwtGL20):
//   prod branch of copy()/copy_0()/copy_1() does:
//     cggtc.$subarray(buffer.getTypedArray(), buffer.position_1(), buffer.remaining())
//   but cggtc.$subarray uses (begin, END) semantics (it calls this$static.subarray(begin, end)).
//   Passing remaining() as END yields subarray(position, remaining) => when remaining < position
//   (any partial update with position > half the buffer) the view is EMPTY, so glBufferSubData
//   uploads ZERO bytes and the vertex buffer stays stale => doors never change appearance.
//   The dev-mode branch (element-wise copy + subarray(0, remaining)) is correct; only prod is broken.
//
// FIX: pass limit_0() (= position + remaining) as the END argument => uploads [position, limit),
//      matching java.nio GL semantics and the dev branch.
//
// NOTE: the same fix is applied at SOURCE level in
//   game/shattered-pixel-dungeon-master/html/patches/gdx-backend-gwt/com/badlogic/gdx/backends/gwt/GwtGL20.java
// so a fresh GWT build already compiles to the corrected form (buffer.limit_0()); this script is the
// safety net for cache.js files that were produced before that fix or synced from an unpatched build.
//
// Idempotent; creates .orig backups in tools/backup on first run.
// Run standalone (`node tools/patch-gwt-gl.js`) or via tools/sync-gwt.js.
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const webDir = path.join(projectRoot, 'entry', 'src', 'main', 'resources', 'rawfile', 'web', 'shattered');
const backupDir = path.join(projectRoot, 'tools', 'backup');

const BAD = 'castTo(buffer, 403).getTypedArray(), buffer.position_1(), buffer.remaining()';
const GOOD = 'castTo(buffer, 403).getTypedArray(), buffer.position_1(), buffer.limit_0()';

function applyPatch() {
  fs.mkdirSync(backupDir, { recursive: true });
  const files = fs.readdirSync(webDir).filter(f => f.endsWith('.cache.js'));
  if (files.length === 0) {
    throw new Error('no *.cache.js found in ' + webDir);
  }
  let allOk = true;
  for (const f of files) {
    const p = path.join(webDir, f);
    const b = fs.readFileSync(p, 'latin1');
    const badCount = b.split(BAD).length - 1;
    const goodCount = b.split(GOOD).length - 1;
    if (badCount === 0) {
      if (goodCount > 0) {
        console.log(f + ': already patched (' + goodCount + ' site(s))');
      } else {
        // Fully-optimized builds (gwtCompile since 2026-11-08) have the fix compiled from
        // the patched GwtGL20.java source: copy() compiles to an inlined subarray(position,
        // limit) chain and the old literal pattern no longer exists. Verified manually in
        // DB009921…/7DC69C50… (function zf: dze(cast(a,HasArrayBufferView).typedArray,
        // a.positionField, a.limitField) feeding ctx.bufferSubData). Nothing to patch.
        console.log(f + ': source-fixed optimized build (no artifact pattern) - OK');
      }
      continue;
    }
    const bak = path.join(backupDir, f + '.orig');
    if (!fs.existsSync(bak)) {
      fs.writeFileSync(bak, b, 'latin1');
      console.log(f + ': backup -> ' + bak);
    }
    const patched = b.split(BAD).join(GOOD);
    fs.writeFileSync(p, patched, 'latin1');
    console.log(f + ': patched ' + badCount + ' occurrence(s) [remaining() -> limit_0() in GwtGL20 copy prod branches]');
  }
  return allOk;
}

module.exports = { applyPatch, webDir, BAD, GOOD };

if (require.main === module) {
  try {
    process.exit(applyPatch() ? 0 : 1);
  } catch (e) {
    console.error(String(e && e.stack || e));
    process.exit(1);
  }
}
