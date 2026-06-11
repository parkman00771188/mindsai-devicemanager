import { actionLabel } from "../constants.js";

const actionTones = {
  REGISTER: "bg-[#f4f0ff] text-[#6d28d9] border-[#ddd6fe]",
  RENT: "bg-[#e9fbf6] text-[#009b86] border-[#98e6d8]",
  DELIVERY: "bg-[#eef7ff] text-[#1178c7] border-[#b9def7]",
  RETURN: "bg-[#eaf4ff] text-[#2563eb] border-[#bfdbfe]",
  RECOVERY: "bg-[#f0fbff] text-[#0e7490] border-[#a5f3fc]",
  BROKEN: "bg-[#fff0f4] text-[#d84f71] border-[#ffc8d6]",
  LOST: "bg-[#eef1f7] text-[#657186] border-[#d8deea]",
  LOST_FOUND: "bg-[#fff7e6] text-[#b45309] border-[#fcd34d]",
  MAINTENANCE_START: "bg-[#fff4ee] text-[#d47a3d] border-[#ffd9c1]",
  MAINTENANCE_COMPLETE: "bg-[#ecfbf7] text-[#1eb6a5] border-[#c7f1e9]",
  UPDATE: "bg-[#fff4ee] text-[#c96a3b] border-[#ffd4bd]",
  RENTAL_UPDATE: "bg-[#fff7e6] text-[#b45309] border-[#fcd34d]",
  DISPOSE: "bg-[#fff0f4] text-[#d84f71] border-[#ffc8d6]",
  DELETE: "bg-[#f0f1f5] text-[#3a4055] border-[#d8dce7]",
  MAINTENANCE: "bg-[#f1efff] text-[#6554dc] border-[#d8d2ff]",
  STATUS_CHANGE: "bg-[#eef1f7] text-[#657186] border-[#d8deea]"
};

export default function ActionBadge({ action }) {
  return (
    <span className={`inline-flex max-w-full shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-extrabold ${actionTones[action] || actionTones.STATUS_CHANGE}`}>
      {actionLabel(action)}
    </span>
  );
}
