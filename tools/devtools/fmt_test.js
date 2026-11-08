// Node port of the patched formatImpl algorithm for validation
function convert(conversion, arg, precision) {
  switch (conversion) {
    case 's': return String(arg);
    case 'S': return String(arg).toUpperCase();
    case 'd':
      if (typeof arg === 'number') return String(Math.trunc(arg));
      return String(arg);
    case 'f': return formatDecimal(arg, precision < 0 ? 6 : precision);
    case 'x': return typeof arg === 'number' ? (arg >>> 0).toString(16) : String(arg);
    case 'X': return typeof arg === 'number' ? (arg >>> 0).toString(16).toUpperCase() : String(arg);
    case 'c': return typeof arg === 'string' && arg.length === 1 ? arg : '';
    case 'b': return typeof arg === 'boolean' ? String(arg) : (arg == null ? 'false' : 'true');
    default: return String(arg);
  }
}
function formatDecimal(arg, precision) {
  if (typeof arg !== 'number') return arg == null ? 'null' : String(arg);
  const scaled = Math.round(arg * Math.pow(10, precision));
  const negative = scaled < 0;
  let digits = String(Math.abs(scaled));
  if (precision === 0) return (negative ? '-' : '') + digits;
  while (digits.length <= precision) digits = '0' + digits;
  const s = digits.substring(0, digits.length - precision) + '.' + digits.substring(digits.length - precision);
  return negative ? '-' + s : s;
}
function formatImpl(format, args) {
  let result = '';
  const length = format.length;
  let argIndex = 0;
  let i = 0;
  while (i < length) {
    const c = format.charAt(i);
    if (c !== '%') { result += c; i++; continue; }
    i++;
    if (i >= length) { result += '%'; break; }
    let next = format.charAt(i);
    if (next === '%') { result += '%'; i++; continue; }
    if (next === 'n') { result += '\n'; i++; continue; }
    let explicitIndex = -1;
    if (next >= '1' && next <= '9') {
      const save = i;
      let idx = 0;
      while (i < length && format.charAt(i) >= '0' && format.charAt(i) <= '9') { idx = idx * 10 + (format.charAt(i) - '0'); i++; }
      if (i < length && format.charAt(i) === '$') { explicitIndex = idx - 1; i++; }
      else { i = save; }
    }
    let zeroPad = false, leftJustify = false;
    while (i < length) {
      const flag = format.charAt(i);
      if (flag === '0') { zeroPad = true; i++; }
      else if (flag === '-') { leftJustify = true; i++; }
      else if (flag === '+' || flag === ' ' || flag === ',' || flag === '(' || flag === '#') { i++; }
      else break;
    }
    let width = 0;
    while (i < length && format.charAt(i) >= '0' && format.charAt(i) <= '9') { width = width * 10 + (format.charAt(i) - '0'); i++; }
    let precision = -1;
    if (i < length && format.charAt(i) === '.') {
      i++; precision = 0;
      while (i < length && format.charAt(i) >= '0' && format.charAt(i) <= '9') { precision = precision * 10 + (format.charAt(i) - '0'); i++; }
    }
    if (i >= length) break;
    const conversion = format.charAt(i);
    i++;
    if (!'sSdfxXocb'.includes(conversion)) { result += '%' + conversion; continue; }
    let arg;
    if (explicitIndex >= 0) {
      arg = explicitIndex < args.length ? args[explicitIndex] : null;
      argIndex = explicitIndex + 1;
    } else if (argIndex < args.length) { arg = args[argIndex]; argIndex++; }
    else arg = null;
    let piece = convert(conversion, arg, precision);
    if (piece == null) piece = 'null';
    if (width > piece.length) {
      const padding = width - piece.length;
      if (leftJustify) piece = piece + ' '.repeat(padding);
      else if (zeroPad && 'dfxXo'.includes(conversion)) piece = '0'.repeat(padding) + piece;
      else piece = ' '.repeat(padding) + piece;
    }
    result += piece;
  }
  return result;
}

// ==== Test cases ====
const cases = [
  // [format, args, expected]
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
];
let pass = 0, fail = 0;
for (const [f, a, exp] of cases) {
  const got = formatImpl(f, a);
  if (got === exp) { pass++; }
  else { fail++; console.log(`FAIL: format(${JSON.stringify(f)}, ${JSON.stringify(a)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); }
}
console.log(`${pass} passed, ${fail} failed`);
