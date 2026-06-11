import { ChevronLeft, ChevronRight, X } from "lucide-react";

export default function PhotoViewer({ viewer, onClose, onMove }) {
  if (!viewer) return null;

  const paths = viewer.paths || [];
  const current = paths[viewer.index] || "";
  const hasMany = paths.length > 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 px-4 py-6" onClick={onClose}>
      <div className="relative w-full max-w-6xl rounded-lg bg-white p-3 shadow-lift sm:p-4" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-2 pb-3">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-ink">{viewer.title || "사진 보기"}</p>
            {viewer.description ? <p className="mt-1 truncate text-xs font-bold text-slate-500">{viewer.description}</p> : null}
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="사진 닫기">
            <X size={18} />
          </button>
        </div>

        <div className="relative mt-3 flex min-h-[320px] items-center justify-center rounded-lg bg-slate-950">
          {hasMany ? (
            <button
              className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg bg-white/90 text-ink shadow-soft"
              type="button"
              onClick={() => onMove(-1)}
              aria-label="이전 사진"
            >
              <ChevronLeft size={22} />
            </button>
          ) : null}
          <img src={current} alt={viewer.title || "사진"} className="max-h-[72vh] max-w-full rounded-md object-contain" />
          {hasMany ? (
            <button
              className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg bg-white/90 text-ink shadow-soft"
              type="button"
              onClick={() => onMove(1)}
              aria-label="다음 사진"
            >
              <ChevronRight size={22} />
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 px-1 text-xs font-extrabold text-slate-500">
          <span>{viewer.index + 1} / {paths.length}</span>
          <a className="text-brand" href={current} target="_blank" rel="noreferrer">
            원본 열기
          </a>
        </div>
      </div>
    </div>
  );
}
