// Color mapping for terminal colors
const COLORS_LIST: { [key: string]: number } = {
  reset: 0,
  bold: 1,
  dim: 2,
  italic: 3,
  underline: 4,
  blink: 5,
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  bgBlack: 40,
  bgRed: 41,
  bgGreen: 42,
  bgYellow: 43,
  bgBlue: 44,
  bgMagenta: 45,
  bgCyan: 46,
  bgWhite: 47,
};


// Parse color string into ANSI color codes
function parseColor(color: string): string {
  if (!color) return '';

  const colorCodes = color
    .split(' ')
    .filter(c => c in COLORS_LIST)
    .map(c => COLORS_LIST[c]);

  return colorCodes.length ? `\u001b[${colorCodes.join(';')}m` : '';
}
