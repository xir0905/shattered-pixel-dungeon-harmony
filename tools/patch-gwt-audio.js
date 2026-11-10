// patch-gwt-audio.js
// Root-cause fix for: SPD sound effects (mono) are ~3dB quieter / duller than the Android build.
//
// BUG (in compiled GWT artifact, libgdx AudioControlGraph.setupAudoGraph):
//   function cj(d){var a=d.a;var b=null;
//     if(a.createStereoPanner){b=a.createStereoPanner();b.pan.value=0;d.d=b}   // <-- panner
//     ... gainNode ...
//     b&&b.connect(c); c.connect(d.b); }
//   The per-sound graph is source -> StereoPannerNode(pan 0) -> Gain -> destination.
//   A StereoPannerNode at pan 0 applies EQUAL-POWER panning, so a MONO input
//   (every SPD sound effect) is scaled to cos(pi/4)=0.707 (-3dB) per output
//   channel. Android's SoundPool copies mono to both channels at full amplitude,
//   so on this ArkWeb port every SFX is ~3dB quieter than Android while stereo
//   music (passthrough at pan 0) is unaffected -> "SFX too quiet / muffled".
//   SPD never pans SFX/music (pan = rightVolume-leftVolume, always 0), so the
//   panner is dead weight that only costs 3dB.
//
// FIX: neutralise panner creation (compiles to panNode=null) so the existing
//      setSource path (function aj: c?a.connect(c):a.connect(b)) wires the
//      source straight into the gain node => full mono amplitude, like Android.
//
// NOTE: the same fix is applied at SOURCE level in
//   game/shattered-pixel-dungeon-master/html/patches/gdx-backend-gwt/com/badlogic/gdx/backends/gwt/webaudio/AudioControlGraph.java
// so a fresh GWT build already compiles without the panner; this script is the
// safety net for cache.js produced before that source fix.
//
// Idempotent; creates .orig backups in tools/backup on first run.
// Run standalone (`node tools/patch-gwt-audio.js`) or via tools/sync-gwt.js.
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const webDir = path.join(projectRoot, 'entry', 'src', 'main', 'resources', 'rawfile', 'web', 'shattered');
const backupDir = path.join(projectRoot, 'tools', 'backup');

// Match the panner-creation guard regardless of the minified variable name.
// After patching it becomes "if(!1){..." and no longer matches.
const BAD_RE = /if\((\w+)\.createStereoPanner\)\{/g;

function applyPatch() {
  fs.mkdirSync(backupDir, { recursive: true });
  const files = fs.readdirSync(webDir).filter(f => f.endsWith('.cache.js'));
  if (files.length === 0) {
    throw new Error('no *.cache.js found in ' + webDir);
  }
  for (const f of files) {
    const p = path.join(webDir, f);
    const b = fs.readFileSync(p, 'latin1');
    const sites = (b.match(BAD_RE) || []).length;
    const pannerRefs = b.split('createStereoPanner').length - 1;
    if (sites === 0) {
      if (pannerRefs > 0) {
        // A panner site exists but with a different shape; flag for review.
        console.log(f + ': WARNING createStereoPanner present but guard pattern not found - review');
      } else {
        // Fresh GWT build from the patched source: no panner at all.
        console.log(f + ': source-fixed build (no StereoPannerNode) - OK');
      }
      continue;
    }
    const bak = path.join(backupDir, f + '.orig');
    if (!fs.existsSync(bak)) {
      fs.writeFileSync(bak, b, 'latin1');
      console.log(f + ': backup -> ' + bak);
    }
    const patched = b.replace(BAD_RE, 'if(!1){');
    fs.writeFileSync(p, patched, 'latin1');
    console.log(f + ': patched ' + sites + ' occurrence(s) [disabled StereoPannerNode -> full mono amplitude]');
  }
  return true;
}

module.exports = { applyPatch, webDir };

if (require.main === module) {
  try {
    process.exit(applyPatch() ? 0 : 1);
  } catch (e) {
    console.error(String(e && e.stack || e));
    process.exit(1);
  }
}
