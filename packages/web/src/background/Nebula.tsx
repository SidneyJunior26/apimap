/** Decorative backdrop: drifting color fields, a faint dot grid and film grain. */
export function Nebula() {
  return (
    <div className="nebula" aria-hidden>
      <div className="nebula__blob nebula__blob--a" />
      <div className="nebula__blob nebula__blob--b" />
      <div className="nebula__blob nebula__blob--c" />
      <div className="nebula__grid" />
      <svg className="nebula__grain" xmlns="http://www.w3.org/2000/svg">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </div>
  );
}
