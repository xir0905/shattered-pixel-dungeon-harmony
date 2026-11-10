// GWT emu 回归套件（future-work F-1）
// 用法：node tools/devtools/emu_regression.js
//
// 覆盖四类移植期修补，任何 GWT 重编译 / gdx 升级 / patches 重放后都跑一遍：
//   1. String.format（patches/gwt-user/.../String.java 的 formatImpl/convert/formatDecimal）
//   2. NIO buffer subarray 语义（patches/.../GwtGL20.java 的 copy() 下标修复，门 bug）
//   3. getDensity（patches/.../GwtGraphics.java 的 usePhysicalPixels 覆盖）
//   4. getRelativeX/Y（GwtInput 把 CSS 事件坐标换算成 canvas 物理坐标）
//
// 说明：这里是对应算法的 Node 移植（与已编译产物同语义），不是加载 .class/.js。
// 用例是行为契约：算法一旦被上游覆盖或重放时改错，这里立即失败。

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = Object.is(actual, expected) || actual === expected;
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push({ name, actual, expected });
    console.log(`  FAIL: ${name}\n        实际 = ${JSON.stringify(actual)}\n        期望 = ${JSON.stringify(expected)}`);
  }
}

function checkClose(name, actual, expected, epsilon) {
  const eps = epsilon === undefined ? 1e-6 : epsilon;
  if (Math.abs(actual - expected) <= eps) {
    passed++;
  } else {
    failed++;
    failures.push({ name, actual, expected });
    console.log(`  FAIL: ${name}\n        实际 = ${actual}\n        期望 = ${expected} (±${eps})`);
  }
}

function checkArray(name, actual, expected) {
  const a = Array.prototype.slice.call(actual);
  const ok = a.length === expected.length && a.every((v, i) => v === expected[i]);
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push({ name, actual: a, expected });
    console.log(`  FAIL: ${name}\n        实际 = [${a}]\n        期望 = [${expected}]`);
  }
}

// =====================================================================
// 1. String.format —— 与 patches/.../String.java 保持一致
// =====================================================================

function javaValueOf(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function formatDecimal(arg, precision) {
  let d;
  if (typeof arg === 'number') {
    d = arg;
  } else if (arg !== null && arg !== undefined) {
    return javaValueOf(arg);
  } else {
    return 'null';
  }
  let factor = 1;
  for (let p = 0; p < precision; p++) factor *= 10;
  let scaled = Math.round(d * factor);
  const negative = scaled < 0;
  if (negative) scaled = -scaled;
  const digits = String(scaled);
  if (precision === 0) return negative ? '-' + digits : digits;
  let padded = digits;
  while (padded.length <= precision) padded = '0' + padded;
  const text = padded.substring(0, padded.length - precision) + '.' +
    padded.substring(padded.length - precision);
  return negative ? '-' + text : text;
}

function convert(conversion, arg, precision) {
  switch (conversion) {
    case 's':
      return javaValueOf(arg);
    case 'S':
      return javaValueOf(arg).toUpperCase();
    case 'd':
      // Java: Integer/Long 直接打印；其他 Number 走 longValue()（向零截断）
      if (typeof arg === 'number') return String(Math.trunc(arg));
      return javaValueOf(arg);
    case 'f':
      return formatDecimal(arg, precision < 0 ? 6 : precision);
    case 'x':
    case 'X': {
      if (typeof arg !== 'number') return javaValueOf(arg);
      const hex = (arg >>> 0).toString(16);
      return conversion === 'X' ? hex.toUpperCase() : hex;
    }
    case 'o':
      if (typeof arg !== 'number') return javaValueOf(arg);
      return (arg >>> 0).toString(8);
    case 'c':
      return typeof arg === 'string' && arg.length === 1 ? arg : '';
    case 'b':
      if (typeof arg === 'boolean') return String(arg);
      return arg === null || arg === undefined ? 'false' : 'true';
    default:
      return javaValueOf(arg);
  }
}

function formatImpl(format, args) {
  let result = '';
  const length = format.length;
  let argIndex = 0;
  let i = 0;
  while (i < length) {
    const c = format.charAt(i);
    if (c !== '%') {
      result += c;
      i++;
      continue;
    }
    i++;
    if (i >= length) {
      result += '%';
      break;
    }
    const next = format.charAt(i);
    if (next === '%') {
      result += '%';
      i++;
      continue;
    }
    if (next === 'n') {
      result += '\n';
      i++;
      continue;
    }
    let explicitIndex = -1;
    if (next >= '1' && next <= '9') {
      const save = i;
      let idx = 0;
      while (i < length && format.charAt(i) >= '0' && format.charAt(i) <= '9') {
        idx = idx * 10 + (format.charAt(i) - '0');
        i++;
      }
      if (i < length && format.charAt(i) === '$') {
        explicitIndex = idx - 1;
        i++;
      } else {
        i = save;
      }
    }
    let zeroPad = false;
    let leftJustify = false;
    while (i < length) {
      const flag = format.charAt(i);
      if (flag === '0') {
        zeroPad = true;
        i++;
      } else if (flag === '-') {
        leftJustify = true;
        i++;
      } else if (flag === '+' || flag === ' ' || flag === ',' || flag === '(' || flag === '#') {
        i++;
      } else {
        break;
      }
    }
    let width = 0;
    while (i < length && format.charAt(i) >= '0' && format.charAt(i) <= '9') {
      width = width * 10 + (format.charAt(i) - '0');
      i++;
    }
    let precision = -1;
    if (i < length && format.charAt(i) === '.') {
      i++;
      precision = 0;
      while (i < length && format.charAt(i) >= '0' && format.charAt(i) <= '9') {
        precision = precision * 10 + (format.charAt(i) - '0');
        i++;
      }
    }
    if (i >= length) break;
    const conversion = format.charAt(i);
    i++;
    if (!'sSdfxXocb'.includes(conversion)) {
      result += '%' + conversion;
      continue;
    }
    let arg;
    if (explicitIndex >= 0) {
      arg = explicitIndex < args.length ? args[explicitIndex] : null;
      argIndex = explicitIndex + 1;
    } else if (argIndex < args.length) {
      arg = args[argIndex];
      argIndex++;
    } else {
      arg = null;
    }
    let piece = convert(conversion, arg, precision);
    if (piece === null || piece === undefined) piece = 'null';
    if (width > piece.length) {
      const padding = width - piece.length;
      if (leftJustify) {
        piece = piece + ' '.repeat(padding);
      } else if (zeroPad && 'dfxXo'.includes(conversion)) {
        piece = '0'.repeat(padding) + piece;
      } else {
        piece = ' '.repeat(padding) + piece;
      }
    }
    result += piece;
  }
  return result;
}

function testFormat() {
  console.log('\n[1/5] String.format（位置参数 / 全转换 / 宽度精度 / 边界）');

  const cases = [
    // 原有 21 例（fmt_test.js 基线，必须保持全过）
    ['%1$d级%2$s', [1, '女猎手'], '1级女猎手'],
    ['%1$d级%2$s', [3, '战士'], '3级战士'],
    ['Level %1$d %2$s', [1, 'Huntress'], 'Level 1 Huntress'],
    ['_%1$.0f%%_', [59.6], '_60%_'],
    ['+%2$.0f%%_', [null, 12.4], '+12%_'],
    ['%.2f', [1.5], '1.50'],
    ['%f', [2.25], '2.250000'],
    ['%2$s attacked %1$s!', ['Gnoll', 'Rat'], 'Rat attacked Gnoll!'],
    ['%1$s then implicit %s', ['A', 'B'], 'A then implicit B'],
    ['50%% sure', [], '50% sure'],
    ['%s has %d gold', ['Hero', 99], 'Hero has 99 gold'],
    ['%05d', [42], '00042'],
    ['%-6s|', ['ab'], 'ab    |'],
    ['%x', [255], 'ff'],
    ['%X', [255], 'FF'],
    ['%d级%s', [5, '法师'], '5级法师'],
    ['%b %b %b', [true, null, 5], 'true false true'],
    ['%c', ['x'], 'x'],
    ['%3$s/%1$s/%2$s', ['a', 'b', 'c'], 'c/a/b'],
    ['100%%怒气', [], '100%怒气'],
    ['%1$.0f%% / %2$.0f%%', [33.3, 66.6], '33% / 67%'],

    // 全部转换符（含未被游戏大量使用、但补丁声明支持的 o）
    ['%s', ['文本'], '文本'],
    ['%S', ['abc'], 'ABC'],
    ['%d', [42], '42'],
    ['%d', [-42], '-42'],
    ['%d', [-3.7], '-3'],
    ['%f', [1], '1.000000'],
    ['%x', [0], '0'],
    ['%x', [-1], 'ffffffff'],
    ['%X', [-1], 'FFFFFFFF'],
    ['%o', [8], '10'],
    ['%o', [255], '377'],
    ['%o', [-1], '37777777777'],
    ['%c', ['中'], '中'],
    ['%c', ['xy'], ''],
    ['%c', [120], ''],
    ['%b', [true], 'true'],
    ['%b', [false], 'false'],
    ['%b', [0], 'true'],
    ['%b', [null], 'false'],

    // null / 缺参 / 越界
    ['%s', [null], 'null'],
    ['%s', [], 'null'],
    ['%d', [null], 'null'],
    ['%f', [null], 'null'],
    ['%x', [null], 'null'],
    ['%1$s', [], 'null'],
    ['%2$s %s', ['a', 'b'], 'b null'],
    ['%9$s', ['a'], 'null'],

    // 宽度 / 对齐 / 补零 / 未实现 flags（跳过不消费）
    ['%5d', [42], '   42'],
    ['%-8d|', [42], '42      |'],
    ['%08.2f', [3.5], '00003.50'],
    ['%8s|', ['ab'], '      ab|'],
    ['%-8s|', ['ab'], 'ab      |'],
    ['%+d', [5], '5'],
    ['% d', [5], '5'],
    ['%,d', [1000], '1000'],
    ['%(d', [-5], '-5'],
    ['%#x', [255], 'ff'],
    ['%3s', ['中'], '  中'],

    // 精度边界（Java Math.round 语义）
    ['%.0f', [59.6], '60'],
    ['%.0f', [-0.4], '0'],
    ['%.0f', [-0.5], '0'],
    ['%.1f', [1.25], '1.3'],
    ['%.2f', [0.005], '0.01'],
    ['%.2f', [-1.5], '-1.50'],
    ['%f', [-1.5], '-1.500000'],
    ['%.3f', [1], '1.000'],
    ['%.2s', ['hello'], 'hello'], // 精度只作用于 f

    // %% / %n / 非法与未知转换
    ['a%nb', [], 'a\nb'],
    ['%', [], '%'],
    ['abc%', [], 'abc%'],
    ['%%%', [], '%%'],
    ['%q%s', ['x'], '%qx'],
    ['100%', [], '100%'],

    // 中文/Unicode 宽度按 UTF-16 长度计算
    ['%2s', ['中'], ' 中'],
  ];

  for (const [format, args, expected] of cases) {
    const got = formatImpl(format, args);
    check(`format(${JSON.stringify(format)}, ${JSON.stringify(args)})`, got, expected);
  }
}

// =====================================================================
// 2. NIO buffer → TypedArray subarray（门 bug 的下标语义）
// =====================================================================

// 修复后的 prod 分支：subarray(position, limit)；错误版是 subarray(position, remaining)。
function fixedSlice(view, position, limit) {
  return view.subarray(position, limit);
}

function buggySlice(view, position, limit) {
  // 上游 prod 分支的错误写法：把 remaining() 当 end 下标
  return view.subarray(position, limit - position);
}

function testSubarray() {
  console.log('\n[2/5] buffer subarray 语义（position/limit vs position/remaining）');

  const f32 = new Float32Array([10, 20, 30, 40, 50]);
  checkArray('Float32 position=0 limit=5（整段）',
    fixedSlice(f32, 0, f32.length), [10, 20, 30, 40, 50]);
  checkArray('Float32 position=1 limit=4（中间段）',
    fixedSlice(f32, 1, 4), [20, 30, 40]);
  checkArray('Float32 position=2 limit=2（空段）',
    fixedSlice(f32, 2, 2), []);
  checkArray('Float32 position=4 limit=5（尾元素）',
    fixedSlice(f32, 4, 5), [50]);

  // 门 bug 现场：position 大于 remaining 时，错误写法 end < begin → 空数组
  const doorLike = new Int16Array(200);
  for (let i = 0; i < doorLike.length; i++) doorLike[i] = i;
  const pos = 100;
  const limit = 120;
  const remaining = limit - pos; // 20
  checkArray('门 bug 修复：position=100 limit=120 remaining=20',
    fixedSlice(doorLike, pos, limit),
    Array.from({ length: 20 }, (_, i) => 100 + i));
  checkArray('门 bug 错误写法（position,remaining）得到空数组',
    buggySlice(doorLike, pos, limit), []);
  check('修复版长度 = remaining', fixedSlice(doorLike, pos, limit).length, remaining);

  // 四种 typed array 一致行为
  checkArray('Int32 subarray(2,5)',
    fixedSlice(new Int32Array([1, 2, 3, 4, 5, 6]), 2, 5), [3, 4, 5]);
  checkArray('Int16 subarray(1,3)',
    fixedSlice(new Int16Array([7, 8, 9, 10]), 1, 3), [8, 9]);
  checkArray('Int8 subarray(3,6)',
    fixedSlice(new Int8Array([1, 2, 3, 4, 5, 6, 7]), 3, 6), [4, 5, 6]);

  // 视图语义：subarray 共享底层 ArrayBuffer（修改子视图影响父视图）
  const shared = new Int32Array([1, 2, 3, 4, 5]);
  const view = fixedSlice(shared, 1, 4);
  view[0] = 99;
  check('subarray 是视图（共享底层 buffer）', shared[1], 99);
  check('父视图元素数不变', shared.length, 5);
  check('子视图长度', view.length, 3);

  // 视图套视图：偏移基于视图自身
  const nested = fixedSlice(fixedSlice(new Int32Array([1, 2, 3, 4, 5]), 1, 4), 1, 3);
  checkArray('subarray 套 subarray', nested, [3, 4]);
}

// =====================================================================
// 3. getDensity（usePhysicalPixels 开关）
// =====================================================================

function getDensity(usePhysicalPixels, devicePixelRatio) {
  if (usePhysicalPixels) return devicePixelRatio;
  return (96 * devicePixelRatio) / 160; // AbstractGraphics 原实现（PPI 推算）
}

function defaultZoom(density, scaleFactor, maxZoom) {
  const max = typeof maxZoom === 'number' ? maxZoom : 99;
  return Math.max(2, Math.min(Math.ceil(density * scaleFactor), max));
}

function testDensity() {
  console.log('\n[3/5] getDensity / PixelScene 默认 zoom');

  // 真机 dpr 3.25：物理像素分支
  checkClose('dpr=3.25 + usePhysicalPixels → 3.25', getDensity(true, 3.25), 3.25);
  check('dpr=3.25 默认 zoom（scaleFactor 2.5）= 9',
    defaultZoom(getDensity(true, 3.25), 2.5), 9);
  // 未打补丁时 0.6*dpr=1.95 → zoom 只有 5，UI 会缩到 ~55%
  checkClose('dpr=3.25 + CSS 像素分支 → 1.95', getDensity(false, 3.25), 1.95);
  check('未打补丁 zoom = 5（反例，说明补丁必要性）',
    defaultZoom(getDensity(false, 3.25), 2.5), 5);

  // 其他 dpr
  checkClose('dpr=1 + 物理 → 1', getDensity(true, 1), 1);
  check('dpr=1 默认 zoom（scaleFactor 2.5）= 3', defaultZoom(getDensity(true, 1), 2.5), 3);
  checkClose('dpr=2 + 物理 → 2', getDensity(true, 2), 2);
  check('dpr=2 默认 zoom = 5', defaultZoom(getDensity(true, 2), 2.5), 5);
  checkClose('dpr=2 + CSS → 1.2', getDensity(false, 2), 1.2);
  check('dpr=2 CSS zoom = 3', defaultZoom(getDensity(false, 2), 2.5), 3);

  // maxDefaultZoom 夹取（小窗口/分屏）
  check('maxDefaultZoom=8 时夹到 8',
    defaultZoom(getDensity(true, 3.25), 2.5, 8), 8);
  // interfaceSize=full 的 scaleFactor 3.75
  check('interfaceSize=full（3.75）→ zoom 13',
    defaultZoom(getDensity(true, 3.25), 3.75), 13);

  // dpr 缺省（getNativeScreenDensity 的 || 1）
  check('devicePixelRatio=0 时按 1 处理',
    getDensity(true, 0 || 1), 1);
}

// =====================================================================
// 4. getRelativeX/Y（CSS 事件坐标 → canvas 物理坐标）
// =====================================================================

// 编译产物 GwtInput.getRelativeX(e,target)：
//   xScaleRatio = canvas.width / canvas.clientWidth（物理 / CSS）
//   round(xScaleRatio * (clientX - absoluteLeft + scrollLeft + docScrollLeft))
// Touch 版本再多一次同样的缩放（DOMImpl.touchGetClientX 已是 CSS 坐标）。
function getRelative(axis, client, absolute, scrollTarget, scrollDoc, canvasPhysical, canvasCss) {
  const ratio = canvasPhysical / canvasCss;
  return Math.round(ratio * (client - absolute + scrollTarget + scrollDoc));
}

function getRelativeX(clientX, absoluteLeft, scrollLeft, docScrollLeft, canvasPhysical, canvasCss) {
  return getRelative('x', clientX, absoluteLeft, scrollLeft, docScrollLeft, canvasPhysical, canvasCss);
}

function getRelativeY(clientY, absoluteTop, scrollTop, docScrollTop, canvasPhysical, canvasCss) {
  return getRelative('y', clientY, absoluteTop, scrollTop, docScrollTop, canvasPhysical, canvasCss);
}

// F-2：CDP 的 Input.dispatchTouchEvent 只认 CSS 像素。
function physicalToCss(physical, screenPhysical, viewportCss) {
  return physical / (screenPhysical / viewportCss);
}

function testRelativeCoordinates() {
  console.log('\n[4/5] getRelativeX/Y 与 CDP CSS 坐标换算');

  // 真机几何：canvas backing 1261×2603，CSS 388×801（左侧 WebView 内无偏移）
  const CW = 1261;
  const CH = 2603;
  const CSSW = 388;
  const CSSH = 801;

  checkClose('xScaleRatio = 1261/388 = 3.25', CW / CSSW, 3.25);
  check('getRelativeX(CSS 0) → 物理 0', getRelativeX(0, 0, 0, 0, CW, CSSW), 0);
  check('getRelativeX(CSS 100) → 物理 325', getRelativeX(100, 0, 0, 0, CW, CSSW), 325);
  check('getRelativeX(CSS 194) → 物理 631（194×3.25 四舍五入）',
    getRelativeX(194, 0, 0, 0, CW, CSSW), 631);
  check('getRelativeX 含 absoluteLeft/scroll 偏移',
    getRelativeX(213, 10, 3, 0, CW, CSSW), 670);

  checkClose('yScaleRatio = 2603/801 ≈ 3.2497', CH / CSSH, 3.2497, 1e-4);
  check('getRelativeY(CSS 0) → 物理 0', getRelativeY(0, 0, 0, 0, CH, CSSH), 0);
  check('getRelativeY(CSS 200) → 物理 650',
    getRelativeY(200, 0, 0, 0, CH, CSSH), 650);
  check('getRelativeY 含 absoluteTop/scroll 偏移',
    getRelativeY(210, 10, 2, 1, CH, CSSH), Math.round((210 - 10 + 2 + 1) * (CH / CSSH)));

  // 圆整规则与 GWT 的 round_3 一致（.5 向上）
  check('round half up: 0.5 → 1', Math.round(0.5), 1);
  check('round half up: -0.5 → 0', Math.round(-0.5), 0);

  // F-2 配方：物理坐标 ÷ (1260/innerWidth) = CSS 坐标
  checkClose('物理 630 → CSS 194（innerWidth 388）',
    physicalToCss(630, 1260, 388), 194, 1e-6);
  checkClose('物理 1260 → CSS 388（最右缘）',
    physicalToCss(1260, 1260, 388), 388, 1e-6);
  checkClose('物理 1200 → CSS 369.52（dpr 3.25）',
    physicalToCss(1200, 1260, 388), 369.52381, 1e-5);

  // 反向验证：把物理坐标原样传给 CDP（按 CSS 解释）会放大 3.25 倍而落到画布外
  const wrongPhysical = 630;
  const wrongRelativeX = getRelativeX(wrongPhysical, 0, 0, 0, CW, CSSW);
  check('误传物理坐标 630 → 相对坐标 2048（超出画布宽 1261）',
    wrongRelativeX, 2048);
  check('误传坐标确实越界', wrongRelativeX > CW, true);

  // 正确换算后往返：CSS 194 → 物理 631
  const css = physicalToCss(630, 1260, 388);
  check('CSS 194 经 getRelativeX → 631（±1 px 圆整）',
    getRelativeX(css, 0, 0, 0, CW, CSSW), 631);

  // 安全区（顶部黑边）场景：WebView 自身顶边为 0，物理 y 的屏幕偏移已由宿主裁掉
  // CSS_y = (物理y - 安全区) / 3.25 仍是同一比例换算
  checkClose('扣除 118px 安全区：(1200-118)/(1260/388) ≈ 333.19',
    physicalToCss(1200 - 118, 1260, 388), 333.1873, 1e-4);
}

// =====================================================================
// 5. 补丁源校验 —— 防止升级/重放时把修复改回去（算法组之外的兜底）
// =====================================================================

function testPatchSources() {
  console.log('\n[5/5] 补丁源与产物校验（patches 被回退时立即失败）');

  const repoRoot = path.join(__dirname, '..', '..');
  const gameRoot = path.join(repoRoot, 'game', 'shattered-pixel-dungeon-master');
  const readIfExists = (p) => {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch (e) {
      return null;
    }
  };

  const stringJava = readIfExists(path.join(gameRoot,
    'html', 'patches', 'gwt-user', 'com', 'google', 'gwt', 'emul', 'java', 'lang', 'String.java'));
  check('String.java 存在', stringJava !== null, true);
  if (stringJava) {
    check('String.java 含 formatImpl', stringJava.includes('formatImpl'), true);
    check('String.java 含显式参数索引', stringJava.includes('explicitIndex'), true);
    check('String.java 含 formatDecimal', stringJava.includes('formatDecimal'), true);
  }

  const glJava = readIfExists(path.join(gameRoot,
    'html', 'patches', 'gdx-backend-gwt', 'com', 'badlogic', 'gdx', 'backends', 'gwt', 'GwtGL20.java'));
  check('GwtGL20.java 存在', glJava !== null, true);
  if (glJava) {
    const fixed = (glJava.match(/subarray\(buffer\.position\(\), buffer\.limit\(\)\)/g) || []).length;
    const buggy = (glJava.match(/subarray\(buffer\.position\(\), buffer\.remaining\(\)\)/g) || []).length;
    check('GwtGL20.java 4 个 copy 分支均为 subarray(position, limit)', fixed, 4);
    check('GwtGL20.java 无 subarray(position, remaining) 残留', buggy, 0);
  }

  const graphicsJava = readIfExists(path.join(gameRoot,
    'html', 'patches', 'gdx-backend-gwt', 'com', 'badlogic', 'gdx', 'backends', 'gwt', 'GwtGraphics.java'));
  check('GwtGraphics.java 存在', graphicsJava !== null, true);
  if (graphicsJava) {
    check('GwtGraphics.getDensity 使用 usePhysicalPixels',
      graphicsJava.includes('config.usePhysicalPixels') &&
      graphicsJava.includes('getNativeScreenDensity()'), true);
  }

  const launcherJava = readIfExists(path.join(gameRoot,
    'html', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon', 'html', 'HtmlLauncher.java'));
  check('HtmlLauncher 以物理像素创建 canvas',
    launcherJava !== null && launcherJava.includes('new GwtApplicationConfiguration(true)'), true);

  // 产物侧：确认当前 rawfile 的 permutation 仍包含 GwtInput 的坐标换算函数
  const permDir = path.join(repoRoot, 'entry', 'src', 'main', 'resources', 'rawfile', 'web', 'shattered');
  let cacheText = null;
  try {
    const cacheFile = fs.readdirSync(permDir).find((name) => name.endsWith('.cache.js'));
    if (cacheFile) cacheText = fs.readFileSync(path.join(permDir, cacheFile), 'utf8');
  } catch (e) {
    cacheText = null;
  }
  check('rawfile 中存在 *.cache.js 产物', cacheText !== null, true);
  if (cacheText) {
    // 产物是压缩混淆的，方法名不可用；检查稳定的浏览器 API 名与 typed array 路径
    check('产物含 devicePixelRatio（getDensity 链路）',
      cacheText.includes('devicePixelRatio'), true);
    check('产物含 clientWidth/clientHeight（getRelative 缩放链路）',
      cacheText.includes('clientWidth') && cacheText.includes('clientHeight'), true);
    check('产物含 subarray（typed array 视图路径）',
      cacheText.includes('subarray('), true);
  }
}

// =====================================================================

function main() {
  console.log('SPD HarmonyOS — GWT emu 回归套件');
  console.log('（GWT 重编译 / gdx 升级 / patches 重放后必须全绿）');

  testFormat();
  testSubarray();
  testDensity();
  testRelativeCoordinates();
  testPatchSources();

  console.log('\n==================================================');
  console.log(`结果：${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('失败用例：');
    for (const f of failures) {
      console.log(` - ${f.name}`);
    }
    console.log('==================================================');
    process.exit(1);
  }
  console.log('==================================================');
}

main();

