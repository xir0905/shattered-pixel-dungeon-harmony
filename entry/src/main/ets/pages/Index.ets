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

const BASE_URL: string = 'http://spd.local/';

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

@Entry
@Component
struct Index {
  controller: webview.WebviewController = new webview.WebviewController();
  // Hidden by the "[SPD] game-ready" console message from the game (see
  // HtmlLauncher.ReadySignalingListener); 20s timeout is a defensive fallback
  // in case console forwarding ever breaks, so the overlay can never stick.
  @State gameReady: boolean = false;

  aboutToAppear(): void {
    webview.WebviewController.setWebDebuggingAccess(true);
    setTimeout(() => {
      this.gameReady = true;
    }, 20000);
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
      Web({ src: BASE_URL + 'index.html', controller: this.controller })
        .width('100%')
        .height('100%')
        .backgroundColor(Color.Black)
        .javaScriptAccess(true)
        .domStorageAccess(true)
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
      if (!this.gameReady) {
        Column({ space: 12 }) {
          LoadingProgress()
            .width(48)
            .height(48)
            .color('#e8e8e8')
          Text('Loading')
            .fontColor('#9a9a9a')
            .fontSize(16)
        }
        .width('100%')
        .height('100%')
        .backgroundColor(Color.Black)
        .justifyContent(FlexAlign.Center)
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Black)
  }
}
