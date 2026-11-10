/**
 * Minimal, self-contained CODE128-B encoder (no native deps).
 * Produces the module bit-string which we render as SVG bars — used both for the
 * in-app label preview and for the printable label sheet.
 */

// 107 CODE128 symbols (103 data + 3 start + 1 stop). Index == symbol value.
const BARS: string[] = [
  '11011001100','11001101100','11001100110','10010011000','10010001100','10001001100','10011001000','10011000100','10001100100','11001001000',
  '11001000100','11000100100','10110011100','10011011100','10011001110','10111001100','10011101100','10011100110','11001110010','11001011100',
  '11001001110','11011100100','11001110100','11101101110','11101001100','11100101100','11100100110','11101100100','11100110100','11100110010',
  '11011011000','11011000110','11000110110','10100011000','10001011000','10001000110','10110001000','10001101000','10001100010','11010001000',
  '11000101000','11000100010','10110111000','10110001110','10001101110','10111011000','10111000110','10001110110','11101110110','11010001110',
  '11000101110','11011101000','11011100010','11011101110','11101011000','11101000110','11100010110','11101101000','11101100010','11100011010',
  '11101111010','11001000010','11110001010','10100110000','10100001100','10010110000','10010000110','10000101100','10000100110','10110010000',
  '10110000100','10011010000','10011000010','10000110100','10000110010','11000010010','11001010000','11110111010','11000010100','10001111010',
  '10100111100','10010111100','10010011110','10111100100','10011110100','10011110010','11110100100','11110010100','11110010010','11011011110',
  '11011110110','11110110110','10101111000','10100011110','10001011110','10111101000','10111100010','11110101000','11110100010','10111011110',
  '10111101110','11101011110','11110101110','11010000100','11010010000','11010011100','1100011101011',
];

const START_B = 104;
const STOP = 106;
const MODULO = 103;

/** Encode text as CODE128-B and return the module bit-string ('1' = bar). */
export function code128bBits(text: string): string {
  const chars = text.split('').map((c) => c.charCodeAt(0));
  const values = [START_B, ...chars.map((c) => c - 32)];
  let checksum = START_B;
  values.slice(1).forEach((v, i) => {
    checksum += v * (i + 1);
  });
  const codes = [...values, checksum % MODULO, STOP];
  return codes.map((c) => BARS[c] ?? '').join('');
}

export interface Bar {
  x: number;
  width: number;
}

/** Convert the bit-string into black-bar rectangles (module units). */
export function bitsToBars(bits: string): { bars: Bar[]; total: number } {
  const bars: Bar[] = [];
  let x = 0;
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let w = 0;
      while (i < bits.length && bits[i] === '1') {
        w += 1;
        i += 1;
      }
      bars.push({ x, width: w });
    } else {
      i += 1;
    }
    x += 1;
  }
  return { bars, total: bits.length };
}

/** Build a standalone SVG string for one label's barcode (for printing). */
export function code128Svg(value: string, width = 240, height = 60): string {
  const { bars, total } = bitsToBars(code128bBits(value));
  const scale = total > 0 ? width / total : 1;
  const rects = bars
    .map((b) => `<rect x="${(b.x * scale).toFixed(2)}" y="0" width="${(b.width * scale).toFixed(2)}" height="${height}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
