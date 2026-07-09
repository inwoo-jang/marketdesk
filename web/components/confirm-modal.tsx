"use client";

import { useEffect } from "react";

// 확인 모달: 삭제 등 되돌리기 어려운 동작 전 확인. 배경/취소/Esc 로 닫힘.
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "삭제",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-card bg-card p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-ink">{title}</h3>
        {message && <p className="mt-1 text-sm text-ink-sub">{message}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-sub hover:bg-bg-deep">
            취소
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:brightness-105">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
