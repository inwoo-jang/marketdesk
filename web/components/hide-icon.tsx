// 숨김/표시 아이콘. slashed=숨김(눈에 짝대기), 아니면 표시(복원, 일반 눈).
export function HideIcon({ slashed = true, className = "" }: { slashed?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {slashed && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}
