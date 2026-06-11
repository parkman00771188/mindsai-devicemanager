export default function EmptyState({ title = "데이터가 없습니다.", description }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-10 text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}
