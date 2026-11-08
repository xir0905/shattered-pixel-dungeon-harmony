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

  aboutToAppear(): void {
    webview.WebviewController.setWebDebuggingAccess(true);
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
    Column() {
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
            console.info(`[SPD][js] ${event.message.getMessageLevel()}: ${event.message.getMessage()}`);
          }
          return false;
        })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Black)
  }
}
