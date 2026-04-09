/**
 * PWA icon generator using `next/og` ImageResponse.
 *
 * Renders a square icon at the requested pixel size with the
 * "CS Room" branding. Used by the app manifest icon route handlers.
 *
 * @module
 */
import { ImageResponse } from "next/og";

/**
 * Generate a square PWA icon as an {@link ImageResponse}.
 *
 * All dimensions (border-radius, font sizes, gaps) scale proportionally
 * with `size` so the same function works for 192×192 and 512×512.
 *
 * @param size - Width and height of the icon in pixels.
 */
export function createPwaIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#030303",
          color: "white",
          borderRadius: size * 0.22,
          border: "1px solid rgba(255,255,255,0.08)",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: size * 0.02,
          }}
        >
          <div
            style={{
              fontSize: size * 0.1,
              color: "#8b97b1",
              letterSpacing: size * 0.025,
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            CS
          </div>

          <div
            style={{
              fontSize: size * 0.24,
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: -2,
            }}
          >
            Room
          </div>
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
    },
  );
}