/**
 * PWA icon generator using `next/og` ImageResponse.
 *
 * Renders a square icon at the requested pixel size with the
 * updated music-note branding. Used by the app manifest icon route
 * handlers.
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
          background: "#000000",
          color: "white",
          borderRadius: size * 0.22,
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
          }}
        >
          <svg
            width={size * 0.78}
            height={size * 0.78}
            viewBox="0 0 512 512"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g fill="#FFFFFF">
              <path d="M156 106C156 90 169 77 185 77H394C410 77 423 90 423 106V185H375V128H204V160H156V106Z" />
              <rect x="156" y="106" width="48" height="274" rx="24" />
              <rect x="375" y="129" width="48" height="220" rx="24" />
              <ellipse
                cx="132"
                cy="396"
                rx="74"
                ry="58"
                transform="rotate(-24 132 396)"
              />
              <ellipse
                cx="346"
                cy="354"
                rx="74"
                ry="58"
                transform="rotate(-24 346 354)"
              />
            </g>
          </svg>
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
    },
  );
}