import { useMemo } from 'react';
import Svg, { Rect } from 'react-native-svg';

import { bitsToBars, code128bBits } from '@/lib/code128';

/** SVG CODE128-B barcode (replaces the web app's jsbarcode `<svg>`). */
export function Barcode({
  value,
  width = 240,
  height = 56,
  showValue = true,
}: {
  value: string;
  width?: number;
  height?: number;
  showValue?: boolean;
}) {
  const { bars, total } = useMemo(() => {
    try {
      return bitsToBars(code128bBits(value));
    } catch {
      return { bars: [], total: 1 };
    }
  }, [value]);

  const scale = total > 0 ? width / total : 1;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />
      {bars.map((b, i) => (
        <Rect
          key={i}
          x={b.x * scale}
          y={0}
          width={b.width * scale}
          height={height}
          fill="#000000"
        />
      ))}
    </Svg>
  );
}
