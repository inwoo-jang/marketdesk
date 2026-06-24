// 리본 책갈피 아이콘. filled=즐겨찾기 ON(파랑 채움), 아니면 외곽선만.
export function BookmarkIcon({ filled, className = "" }: { filled?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      width="20"
      height="20"
      fill={filled ? "#4AA3E8" : "none"}
      stroke={filled ? "#4AA3E8" : "currentColor"}
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1z" />
    </svg>
  );
}
