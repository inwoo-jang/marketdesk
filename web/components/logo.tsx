// 마켓데스크 로고. 블루→퍼플 그라데이션 + 라이징 바/상승 화살표 모티프.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="md-grad" x1="2" y1="30" x2="30" y2="2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5B8DEF" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      {/* 라이징 바 */}
      <rect x="3" y="19" width="5" height="10" rx="1.6" fill="url(#md-grad)" opacity="0.55" />
      <rect x="11" y="13" width="5" height="16" rx="1.6" fill="url(#md-grad)" opacity="0.8" />
      <rect x="19" y="8" width="5" height="21" rx="1.6" fill="url(#md-grad)" />
      {/* 상승 화살표 */}
      <path
        d="M5 17 L13 11 L18 14 L28 5"
        stroke="url(#md-grad)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M23.5 5 L28 5 L28 9.5" stroke="url(#md-grad)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight text-ink ${className}`}>
      <LogoMark size={size} />
      <span>
        Market<span className="text-primary">Desk</span>
      </span>
    </span>
  );
}
