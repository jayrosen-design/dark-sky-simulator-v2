// Color ramps for raster views. Sky: dark navy (natural) -> violet -> amber -> white (urban).
type RGB = [number, number, number];

const SKY_STOPS: [number, RGB][] = [
  [22.0, [5, 7, 13]],
  [21.7, [16, 24, 56]],
  [21.2, [36, 42, 110]],
  [20.5, [92, 52, 150]],
  [19.8, [170, 70, 140]],
  [19.2, [232, 120, 80]],
  [18.6, [250, 190, 90]],
  [17.8, [255, 245, 215]],
];

export function skyColor(mag: number): RGB {
  if (mag >= SKY_STOPS[0][0]) return SKY_STOPS[0][1];
  for (let i = 1; i < SKY_STOPS.length; i++) {
    const [m1, c1] = SKY_STOPS[i];
    const [m0, c0] = SKY_STOPS[i - 1];
    if (mag >= m1) {
      const t = (m0 - mag) / (m0 - m1);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return SKY_STOPS[SKY_STOPS.length - 1][1];
}

export const SKY_LEGEND = SKY_STOPS.map(([m, c]) => ({ mag: m, css: `rgb(${c.join(",")})` }));

// Diverging for change: blue = darker (improvement), red = brighter.
export function deltaColor(d: number, max: number): [number, number, number, number] {
  const t = Math.max(-1, Math.min(1, d / max));
  const a = Math.min(1, Math.abs(t) * 1.6) * 220;
  return t >= 0 ? [60 + 40 * (1 - t), 150 + 60 * (1 - t), 255, a] : [255, 110 + 60 * (1 + t), 70, a];
}

export function scoreColor(s: number): RGB {
  // 0..1 -> dark -> teal -> yellow
  const t = Math.max(0, Math.min(1, s));
  return [30 + 225 * t ** 2.2, 40 + 200 * t, 70 + 110 * t * (1 - t) * 4 * 0.6];
}
