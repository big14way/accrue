export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="accrue-g" x1="0" y1="32" x2="32" y2="0">
          <stop offset="0" stopColor="#7ee2b8" />
          <stop offset="1" stopColor="#5cc8ff" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#accrue-g)" />
      <path d="M8 22.5 L13.5 9.5 L19 22.5" stroke="#04110b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.2 18h6.6" stroke="#04110b" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M19.5 20.5c2-.4 3.6-2 4.6-4.6" stroke="#04110b" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="24.6" cy="14.6" r="1.6" fill="#04110b" />
    </svg>
  );
}
