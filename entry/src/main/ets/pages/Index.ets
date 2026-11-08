/*
 * Copyright (c) 2026 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { fileIo as fs, picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';

const BASE_URL: string = 'http://spd.local/';

// Minimum top margin (vp) above the game canvas. With the system bars hidden
// the reported avoid area shrinks to the bare cutout height, which leaves the
// game's own top bar hugging the bezel; ~36vp matches the typical HarmonyOS
// status-bar band and reads as a comfortable margin on notch-free devices too.
const MIN_TOP_INSET_VP: number = 36;

function mimeOf(path: string): string {
  const dot = path.lastIndexOf('.');
  const ext = dot >= 0 ? path.substring(dot + 1).toLowerCase() : '';
  if (ext === 'html' || ext === 'htm') {
    return 'text/html';
  }
  if (ext === 'js') {
    return 'application/javascript';
  }
  if (ext === 'css') {
    return 'text/css';
  }
  if (ext === 'json') {
    return 'application/json';
  }
  if (ext === 'png') {
    return 'image/png';
  }
  if (ext === 'jpg' || ext === 'jpeg') {
    return 'image/jpeg';
  }
  if (ext === 'gif') {
    return 'image/gif';
  }
  if (ext === 'svg') {
    return 'image/svg+xml';
  }
  if (ext === 'ogg') {
    return 'audio/ogg';
  }
  if (ext === 'mp3') {
    return 'audio/mpeg';
  }
  if (ext === 'wav') {
    return 'audio/wav';
  }
  if (ext === 'ttf') {
    return 'font/ttf';
  }
  if (ext === 'txt' || ext === 'fnt' || ext === 'properties' || ext === 'glsl' || ext === 'atlas' || ext === 'xml') {
    return 'text/plain';
  }
  return 'application/octet-stream';
}

/** Two-digit zero padding for the backup file name stamp. */
function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

/** One key/value pair inside a save-backup file (D-8). */
class SpdEntry {
  key: string = '';
  value: string = '';
}

/** Backup file layout — plain JSON so it stays inspectable and portable. */
class SpdDump {
  format: string = 'spd-save-backup';
  version: number = 1;
  createdAt: string = '';
  entries: SpdEntry[] = [];
}

/**
 * Native-side KV store for the game's local files (C-8 save persistence).
 *
 * Exposed to the WebView as window.spdNative via javaScriptProxy and called
 * synchronously from the patched gdx backend (SpdStore.java /
 * LocalStorageFileHandle.java). Each localStorage-style key is persisted as
 * one UTF-8 file under <filesDir>/spd-store, named by encodeURIComponent(key).
 *
 * Every write goes through tmp -> write -> fsync -> rename so a process kill
 * mid-write can never truncate a previously-good file: the destination is
 * only ever replaced by an already-fsynced rename (POSIX atomic replace).
 * This is the fix for saves vanishing when the system reclaims the render
 * process hosting WebView localStorage (lazy on-disk flush) — see
 * spec/savegame-loss.md.
 */
class SpdNativeStore {
  private dirPath: string = '';

  /** Resolve the sandbox directory once; called from aboutToAppear so the
   * context is ready before the Web component captures this object. */
  attach(context: common.UIAbilityContext): void {
    if (this.dirPath !== '') {
      return;
    }
    const dir: string = context.filesDir + '/spd-store';
    try {
      if (!fs.accessSync(dir)) {
        fs.mkdirSync(dir, true);
      }
      this.dirPath = dir;
    } catch (e) {
      console.error(`[SPD] spd-store init failed, native bridge disabled: ${e}`);
    }
  }

  private fileOf(key: string): string {
    return this.dirPath + '/' + encodeURIComponent(key);
  }

  spdPut(key: string, value: string): void {
    if (this.dirPath === '') {
      return;
    }
    const target: string = this.fileOf(key);
    const tmp: string = target + '.tmp';
    try {
      const file: fs.File = fs.openSync(tmp, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
      try {
        fs.writeSync(file.fd, value);
        fs.fsyncSync(file.fd);
      } finally {
        fs.closeSync(file);
      }
      fs.renameSync(tmp, target);
    } catch (e) {
      console.error(`[SPD] spdPut failed (key ${key}, value ${value.length} chars): ${e}`);
    }
  }

  spdExists(key: string): boolean {
    if (this.dirPath === '') {
      return false;
    }
    try {
      return fs.accessSync(this.fileOf(key));
    } catch (e) {
      return false;
    }
  }

  /** Only meaningful after spdExists(key) returned true; returns '' on error. */
  spdGet(key: string): string {
    if (this.dirPath === '') {
      return '';
    }
    try {
      return fs.readTextSync(this.fileOf(key));
    } catch (e) {
      console.error(`[SPD] spdGet failed for ${key}: ${e}`);
      return '';
    }
  }

  spdDel(key: string): void {
    if (this.dirPath === '') {
      return;
    }
    try {
      fs.unlinkSync(this.fileOf(key));
    } catch (e) {
      // deleting a key that is not present is a no-op
    }
  }

  /** All stored keys joined with \u0001 (never appears in gdx keys); '' when
   * empty or unavailable. Mirrors the facade contract in SpdStore.java. */
  spdKeys(): string {
    if (this.dirPath === '') {
      return '';
    }
    try {
      const names: string[] = fs.listFileSync(this.dirPath);
      const out: string[] = [];
      for (let i = 0; i < names.length; i++) {
        const name: string = names[i];
        if (name.endsWith('.tmp')) {
          continue;
        }
        try {
          out.push(decodeURIComponent(name));
        } catch (e) {
          // skip undecodable leftovers (e.g. crashed tmp writes are filtered
          // above; anything else here is not ours)
        }
      }
      return out.join('\u0001');
    } catch (e) {
      console.error(`[SPD] spdKeys failed: ${e}`);
      return '';
    }
  }

  /** How many keys are currently stored (for user feedback). */
  countKeys(): number {
    const joined: string = this.spdKeys();
    return joined.length === 0 ? 0 : joined.split('\u0001').length;
  }

  /** Serialize every stored key/value into a portable JSON backup (D-8). */
  dumpAll(): string {
    const dump: SpdDump = new SpdDump();
    dump.createdAt = new Date().toISOString();
    const joined: string = this.spdKeys();
    const keys: string[] = joined.length === 0 ? [] : joined.split('\u0001');
    for (let i = 0; i < keys.length; i++) {
      const entry: SpdEntry = new SpdEntry();
      entry.key = keys[i];
      entry.value = this.spdGet(keys[i]);
      dump.entries.push(entry);
    }
    return JSON.stringify(dump);
  }

  /** Restore a backup produced by dumpAll(); returns how many keys were
   * written. Keys present in the backup overwrite same-name entries; other
   * existing keys are left alone (merge semantics). */
  restoreAll(text: string): number {
    const dump: SpdDump = JSON.parse(text) as SpdDump;
    if (dump === null || dump === undefined || dump.entries === null || dump.entries === undefined) {
      throw new Error('invalid backup file: entries missing');
    }
    let written: number = 0;
    for (let i = 0; i < dump.entries.length; i++) {
      const entry: SpdEntry = dump.entries[i];
      if (entry !== null && entry !== undefined &&
        typeof entry.key === 'string' && entry.key.length > 0 &&
        typeof entry.value === 'string') {
        this.spdPut(entry.key, entry.value);
        written++;
      }
    }
    return written;
  }
}

@Entry
@Component
struct Index {
  controller: webview.WebviewController = new webview.WebviewController();
  // Hidden by the "[SPD] game-ready" console message from the game (see
  // HtmlLauncher.ReadySignalingListener); 20s timeout is a defensive fallback
  // in case console forwarding ever breaks, so the overlay can never stick.
  @State gameReady: boolean = false;

  // Native file-backed KV store for the game's saves; wired into the WebView
  // as window.spdNative before the first page load (C-8). All reads/writes
  // from the game are synchronous bridge calls — see SpdNativeStore above.
  private spdStore: SpdNativeStore = new SpdNativeStore();

  // Top safe-area inset (vp) reserved above the WebView so the game's own UI
  // (HP bar / depth / prompt) never sits under the camera cutout, notch or
  // status-bar region. Resolved from the system's avoid areas instead of a
  // hardcoded height so it adapts to every device, orientation and fold state
  // (D-7 follow-up: full-bleed immersion put the game UI under the camera).
  @State topInsetVp: number = 0;
  private mainWin: window.Window | null = null;

  aboutToAppear(): void {
    webview.WebviewController.setWebDebuggingAccess(true);
    this.spdStore.attach(getContext(this) as common.UIAbilityContext);
    this.initSafeInsets();
    setTimeout(() => {
      this.gameReady = true;
    }, 20000);
  }

  private initSafeInsets(): void {
    window.getLastWindow(getContext(this)).then((win: window.Window) => {
      this.mainWin = win;
      this.refreshInsets(win);
      try {
        win.on('avoidAreaChange', (data: window.AvoidAreaOptions) => {
          this.refreshInsets(win);
        });
      } catch (e) {
        console.error(`[SPD] avoidAreaChange listen failed: ${e}`);
      }
    }).catch((err: BusinessError) => {
      console.error(`[SPD] getLastWindow failed: ${JSON.stringify(err)}`);
    });
  }

  // Take the larger of the system area (status bar band) and the cutout area
  // (camera notch/pill) so neither can overlap game content on any model.
  private refreshInsets(win: window.Window): void {
    try {
      let topPx: number = 0;
      const sys: window.AvoidArea = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      if (sys.topRect.height > topPx) {
        topPx = sys.topRect.height;
      }
      const cutout: window.AvoidArea = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_CUTOUT);
      if (cutout.topRect.height > topPx) {
        topPx = cutout.topRect.height;
      }
      this.topInsetVp = Math.max(px2vp(topPx), MIN_TOP_INSET_VP);
    } catch (e) {
      console.error(`[SPD] getWindowAvoidArea failed: ${e}`);
    }
  }

  // ---- Save backup / restore (D-8) --------------------------------------
  // Trigger: triple-tap the top black safe-area band (dead space, so no
  // accidental in-game taps). Export writes a portable JSON to a user-chosen
  // location; import merges keys back into the native spd-store and then
  // closes the app so the game reloads the imported saves.
  @State backupOpen: boolean = false;
  @State backupMsg: string = '';
  private bandTaps: number[] = [];

  private onBandTap(): void {
    const now: number = Date.now();
    this.bandTaps = this.bandTaps.filter((t: number) => now - t < 1500);
    this.bandTaps.push(now);
    if (this.bandTaps.length >= 3) {
      this.bandTaps = [];
      this.backupMsg = '';
      this.backupOpen = !this.backupOpen;
    }
  }

  private exportSaves(): void {
    const ctx = getContext(this) as common.UIAbilityContext;
    try {
      const opts: picker.DocumentSaveOptions = new picker.DocumentSaveOptions();
      const d: Date = new Date();
      opts.newFileNames = [
        'spd-saves-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
        '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.json'
      ];
      const docPicker: picker.DocumentViewPicker = new picker.DocumentViewPicker(ctx);
      docPicker.save(opts).then((uris: string[]) => {
        if (uris === null || uris === undefined || uris.length === 0) {
          return;
        }
        try {
          const content: string = this.spdStore.dumpAll();
          const file: fs.File = fs.openSync(uris[0], fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
          try {
            fs.writeSync(file.fd, content);
            fs.fsyncSync(file.fd);
          } finally {
            fs.closeSync(file);
          }
          this.backupMsg = '已导出 ' + this.spdStore.countKeys() + ' 项存档数据';
        } catch (e) {
          console.error(`[SPD] export write failed: ${e}`);
          this.backupMsg = '导出失败：写入目标文件出错';
        }
      }).catch((err: BusinessError) => {
        console.error(`[SPD] export picker failed: ${JSON.stringify(err)}`);
        this.backupMsg = '导出取消或失败';
      });
    } catch (e) {
      console.error(`[SPD] export init failed: ${e}`);
      this.backupMsg = '导出初始化失败';
    }
  }

  private importSaves(): void {
    const ctx = getContext(this) as common.UIAbilityContext;
    try {
      const opts: picker.DocumentSelectOptions = new picker.DocumentSelectOptions();
      opts.maxSelectNumber = 1;
      opts.fileSuffixFilters = ['.json'];
      const docPicker: picker.DocumentViewPicker = new picker.DocumentViewPicker(ctx);
      docPicker.select(opts).then((uris: string[]) => {
        if (uris === null || uris === undefined || uris.length === 0) {
          return;
        }
        try {
          // Picker URIs are best accessed through openSync + read; readTextSync
          // does not reliably accept document-provider URIs.
          let text: string = '';
          const file: fs.File = fs.openSync(uris[0], fs.OpenMode.READ_ONLY);
          try {
            const stat: fs.Stat = fs.statSync(file.fd);
            const buf: ArrayBuffer = new ArrayBuffer(stat.size);
            fs.readSync(file.fd, buf);
            const decoder: util.TextDecoder = util.TextDecoder.create('utf-8');
            text = decoder.decodeToString(new Uint8Array(buf));
          } finally {
            fs.closeSync(file);
          }
          const n: number = this.spdStore.restoreAll(text);
          this.backupMsg = '已导入 ' + n + ' 项，应用即将关闭，请重新打开';
          setTimeout(() => {
            try {
              ctx.terminateSelf();
            } catch (e) {
              console.error(`[SPD] terminateSelf after import failed: ${e}`);
            }
          }, 1200);
        } catch (e) {
          console.error(`[SPD] import failed: ${e}`);
          this.backupMsg = '导入失败：文件读取或格式错误';
        }
      }).catch((err: BusinessError) => {
        console.error(`[SPD] import picker failed: ${JSON.stringify(err)}`);
        this.backupMsg = '导入取消或失败';
      });
    } catch (e) {
      console.error(`[SPD] import init failed: ${e}`);
      this.backupMsg = '导入初始化失败';
    }
  }

  // HarmonyOS back gesture -> in-game BACK action, matching SPD on other
  // platforms. SPD binds Escape (keyCode 27) to GameAction.BACK
  // (SPDAction.java defaultBindings); DefaultGwtInput listens for keydown/
  // keyup on document. GameScene cancels the current action or opens the
  // game menu, open windows close, and scenes without their own override
  // call Game.instance.finish() -> GwtApplication.exit(), which HtmlLauncher
  // turns into the "[SPD] exit-requested" console message handled in onConsole.
  onBackPress(): boolean {
    if (!this.gameReady) {
      return false;
    }
    try {
      this.controller.runJavaScript(
        "document.dispatchEvent(new KeyboardEvent('keydown'," +
        "{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true}));" +
        "document.dispatchEvent(new KeyboardEvent('keyup'," +
        "{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true}));"
      );
    } catch (e) {
      console.error(`[SPD] back->Escape injection failed: ${e}`);
    }
    return true;
  }

  private notFound(): WebResourceResponse {
    const resp = new WebResourceResponse();
    resp.setResponseCode(404);
    resp.setReasonMessage('Not Found');
    resp.setResponseMimeType('text/plain');
    resp.setResponseData('not found');
    return resp;
  }

  private serveFromRawfile(path: string): WebResourceResponse {
    const resp = new WebResourceResponse();
    try {
      const raw: Uint8Array =
        getContext(this).resourceManager.getRawFileContentSync('web/' + path);
      const body: ArrayBuffer =
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
      resp.setResponseCode(200);
      resp.setReasonMessage('OK');
      resp.setResponseMimeType(mimeOf(path));
      resp.setResponseData(body);
    } catch (e) {
      console.error(`[SPD] rawfile miss: ${path}`);
      return this.notFound();
    }
    return resp;
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column() {
        if (this.topInsetVp > 0) {
          // Black band under the camera/notch; the game canvas starts below it.
          // Triple-tap it (dead space) to open the save backup panel (D-8).
          Row()
            .width('100%')
            .height(this.topInsetVp)
            .backgroundColor(Color.Black)
            .onClick(() => {
              this.onBandTap();
            })
        }
        Web({ src: BASE_URL + 'index.html', controller: this.controller })
          .width('100%')
          .layoutWeight(1)
          .backgroundColor(Color.Black)
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .javaScriptProxy({
          object: this.spdStore,
          name: 'spdNative',
          methodList: ['spdPut', 'spdGet', 'spdExists', 'spdDel', 'spdKeys'],
          controller: this.controller
        })
        .fileAccess(true)
        .multiWindowAccess(false)
        .horizontalScrollBarAccess(false)
        .verticalScrollBarAccess(false)
        .overScrollMode(OverScrollMode.NEVER)
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM])
        .onInterceptRequest((event) => {
          if (!event) {
            return this.notFound();
          }
          const url: string = event.request.getRequestUrl();
          if (url.indexOf(BASE_URL) !== 0) {
            return this.notFound();
          }
          let path: string = url.substring(BASE_URL.length);
          const q = path.indexOf('?');
          if (q >= 0) {
            path = path.substring(0, q);
          }
          const h = path.indexOf('#');
          if (h >= 0) {
            path = path.substring(0, h);
          }
          if (path.length === 0 || path.endsWith('/')) {
            path = path + 'index.html';
          }
          return this.serveFromRawfile(path);
        })
        .onErrorReceive((event) => {
          if (event) {
            console.error(`[SPD] web error: ${event.error.getErrorInfo()}`);
          }
        })
        .onConsole((event: OnConsoleEvent): boolean => {
          if (event) {
            const msg: string = event.message.getMessage();
            if (msg.indexOf('[SPD] game-ready') !== -1) {
              this.gameReady = true;
            }
            if (msg.indexOf('[SPD] exit-requested') !== -1) {
              // The game asked to quit (Scene.onBackPressed with no override,
              // e.g. back on the title screen). Finish the ability.
              try {
                (getContext(this) as common.UIAbilityContext).terminateSelf();
              } catch (e) {
                console.error(`[SPD] terminateSelf failed: ${e}`);
              }
            }
            console.info(`[SPD][js] ${event.message.getMessageLevel()}: ${msg}`);
          }
          return false;
        })
      }
      .width('100%')
      .height('100%')

      if (!this.gameReady) {
        Column({ space: 12 }) {
          LoadingProgress()
            .width(48)
            .height(48)
            .color('#e8e8e8')
          Text('Loading')
            .fontColor('#9a9a9a')
            .fontSize(16)
          // Port credit — shown only during the cold-start loading overlay.
          Text('此版本由b站up主xir_9移植')
            .fontColor('#8c8c8c')
            .fontSize(16)
            .margin({ top: 28 })
            .width('100%')
            .textAlign(TextAlign.Center)
          Text('原项目版权所有 Evan Debenham')
            .fontColor('#8c8c8c')
            .fontSize(16)
            .width('100%')
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .height('100%')
        .backgroundColor(Color.Black)
        .justifyContent(FlexAlign.Center)
      }

      // Save backup panel (D-8), opened by triple-tapping the top black band.
      if (this.backupOpen) {
        Column() {
          Column({ space: 14 }) {
            Text('存档备份')
              .fontColor('#e8e8e8')
              .fontSize(20)
            Text('导出：保存到文件，用于换机或重装后恢复\n导入：合并同名存档，完成后应用自动关闭')
              .fontColor('#9a9a9a')
              .fontSize(14)
              .textAlign(TextAlign.Center)
            Button('导出存档')
              .width(240)
              .onClick(() => {
                this.exportSaves();
              })
            Button('导入存档')
              .width(240)
              .onClick(() => {
                this.importSaves();
              })
            Button('关闭')
              .width(240)
              .backgroundColor('#3a3a3a')
              .onClick(() => {
                this.backupOpen = false;
                this.backupMsg = '';
              })
            if (this.backupMsg.length > 0) {
              Text(this.backupMsg)
                .fontColor('#d8c98a')
                .fontSize(13)
                .textAlign(TextAlign.Center)
            }
          }
          .padding(24)
          .borderRadius(16)
          .backgroundColor('#2a2a2a')
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#000000c0')
        .onClick(() => {
          // swallow taps so they never reach the game canvas behind the panel
        })
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Black)
  }
}
