import { statusLabel } from "../constants.js";

const styles = {
  AVAILABLE: "bg-[#e9f8ef] text-[#16a34a] ring-[#bbf7d0]",
  RENTED: "bg-[#eef4ff] text-[#1d4ed8] ring-[#dbe7ff]",
  DELIVERED: "bg-[#eef4ff] text-[#2563eb] ring-[#dbe7ff]",
  MAINTENANCE: "bg-[#fff4ee] text-[#d47a3d] ring-[#ffd9c1]",
  BROKEN: "bg-[#fff0f4] text-[#d84f71] ring-[#ffc8d6]",
  LOST: "bg-[#eef1f7] text-[#657186] ring-[#d8deea]",
  DISPOSED: "bg-[#f0f1f5] text-[#3a4055] ring-[#d8dce7]"
};

export default function StatusBadge({ status, label }) {
  return (
    <span
      className={`inline-flex min-w-20 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ${
        styles[status] || "bg-slate-100 text-slate-700 ring-slate-300"
      }`}
    >
      {label || statusLabel(status)}
    </span>
  );
}
