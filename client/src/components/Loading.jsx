export default function Loading({ label = "불러오는 중" }) {
  return (
    <div className="flex min-h-40 items-center justify-center text-sm font-medium text-slate-500">
      {label}
    </div>
  );
}
