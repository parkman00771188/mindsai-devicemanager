import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { DeviceDetailContent } from "../pages/DeviceDetail.jsx";

export default function DeviceDetailModal({ device, deviceId, onClose, onChanged }) {
  const resolvedDeviceId = deviceId || device?.device_id;

  useEffect(() => {
    if (!resolvedDeviceId) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [resolvedDeviceId]);

  if (!resolvedDeviceId) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-950/55 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="relative flex max-h-full w-full flex-col overflow-hidden rounded-[20px] border border-white/70 bg-[#f3f5f9] shadow-[0_28px_80px_rgba(15,23,42,0.3)] sm:max-h-[94vh] sm:max-w-6xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-14 items-center justify-end border-b border-line bg-white px-3 py-2 sm:hidden">
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="상세 팝업 닫기">
            <X size={19} />
          </button>
        </header>
        <button className="btn-secondary absolute right-9 top-9 z-30 hidden h-11 w-11 bg-white/95 p-0 sm:flex" type="button" onClick={onClose} aria-label="상세 팝업 닫기">
          <X size={20} />
        </button>
        <div className="min-h-0 flex-1 overscroll-contain overflow-auto p-3 sm:p-5">
          <DeviceDetailContent
            deviceId={resolvedDeviceId}
            inModal
            onChanged={onChanged}
            onDeleted={async () => {
              await onChanged?.();
              onClose();
            }}
          />
        </div>
      </section>
    </div>,
    document.body
  );
}
