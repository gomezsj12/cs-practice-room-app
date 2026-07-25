/**
 * SVG path for a Notion-like verified-person rosette in viewBox 0 0 32 32.
 *
 * Smooth polar curve with **fewer, wider** lobes (8); primary wave is kept
 * gentle so the outline stays close to a circle, while a stronger second
 * harmonic domes each lobe so peaks stay **soft** (less “pointed”).
 */
export function notionVerifyRosettePath(): string {
  const cx = 16;
  const cy = 16;
  const lobes = 8;
  /** Base radius: valleys sit near this. */
  const meanR = 10.04;
  /** Primary lobe wave (smaller → shallower scallops, bubblier silhouette). */
  const a1 = 0.82;
  /** Second harmonic (negative): broad, rounded lobe caps. */
  const a2 = -0.132;
  const steps = 160;

  const parts: string[] = [];
  for (let k = 0; k < steps; k++) {
    const theta = (k * 2 * Math.PI) / steps - Math.PI / 2;
    const r =
      meanR + a1 * Math.cos(lobes * theta) + a2 * Math.cos(2 * lobes * theta);
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    parts.push(`${k === 0 ? "M" : "L"} ${x.toFixed(3)} ${y.toFixed(3)}`);
  }
  return `${parts.join("")} Z`;
}

/** Precomputed path for `<path d={...} />` (constant geometry). */
export const NOTION_VERIFY_ROSETTE_PATH = notionVerifyRosettePath();
