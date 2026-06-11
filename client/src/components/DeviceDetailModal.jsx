import { X } from "lucide-react";
import { DeviceDetailContent } from "../pages/DeviceDetail.jsx";

export default function DeviceDetailModal({ device, deviceId, onClose, onChanged }) {
  const resolvedDeviceId = deviceId || device?.device_id;
  if (!resolvedDeviceId) return null;

  return (
    <div className="fixed inset-0 z-[70] flex bg-slate-950/55 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <section
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f4f5fb] shadow-lift sm:h-auto sm:max-h-[94vh] sm:max-w-[min(96vw,1800px)] sm:rounded-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="btn-secondary absolute right-3 top-3 z-30 h-11 w-11 bg-white/95 p-0 shadow-soft sm:right-4 sm:top-4" type="button" onClick={onClose} aria-label="상세 팝업 닫기">
          <X size={20} />
        </button>
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-4 pt-16 sm:pb-5 sm:pl-5 sm:pr-20 sm:pt-5">
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
    </div>
  );
}
