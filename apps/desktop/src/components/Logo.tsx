// Loop brand mark — inline SVG so it inherits `currentColor` for the ring
// (works in light + dark) while the orange "next-action" dot stays fixed.
// Source of truth: /brand/loop-icon.svg, /brand/loop-logo-primary.svg.

const ORANGE = '#FF5C39';

export function LoopIcon({ size = 24, title = 'Loop' }: { size?: number; title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 96 96"
      width={size}
      height={size}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <g transform="translate(48 48)">
        <path
          d="M 0 -28 A 28 28 0 1 1 -28 0"
          fill="none"
          stroke="currentColor"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <circle cx={0} cy={-28} r={7} fill={ORANGE} />
      </g>
    </svg>
  );
}

export function LoopLockup({ height = 28, title = 'Loop' }: { height?: number; title?: string }) {
  // viewBox 320×96 → preserve aspect ratio via height
  const width = height * (320 / 96);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 96"
      width={width}
      height={height}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <g transform="translate(48 48)">
        <path
          d="M 0 -28 A 28 28 0 1 1 -28 0"
          fill="none"
          stroke="currentColor"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <circle cx={0} cy={-28} r={7} fill={ORANGE} />
      </g>
      <text
        x={104}
        y={62}
        fontFamily="'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif"
        fontSize={52}
        fontWeight={500}
        letterSpacing={-1.5}
        fill="currentColor"
      >
        Loop
      </text>
    </svg>
  );
}
