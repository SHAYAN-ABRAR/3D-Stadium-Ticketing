/** A QR code drawn from the module path built on the server (src/server/tickets/qr.ts). */
export function QrCode({
  path,
  size,
  label,
  className = 'size-24',
}: {
  path: string;
  size: number;
  label: string;
  className?: string;
}) {
  const q = 2; // quiet zone in modules
  return (
    <svg
      viewBox={`${-q} ${-q} ${size + 2 * q} ${size + 2 * q}`}
      className={className}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect x={-q} y={-q} width={size + 2 * q} height={size + 2 * q} fill="#ffffff" />
      <path d={path} fill="#15171c" />
    </svg>
  );
}
