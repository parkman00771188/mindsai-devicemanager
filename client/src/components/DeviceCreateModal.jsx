import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client.js";
import DeviceForm from "./DeviceForm.jsx";

export default function DeviceCreateModal({ onClose, onCreated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function submit(formData) {
    setBusy(true);
    setError("");
    try {
      const saved = await api("/devices", { method: "POST", body: formData });
      await onCreated?.(saved);
    } catch (err) {
      setError(err.message || "장비를 등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-slate-950/55 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <section
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-[#f3f5f9] shadow-[0_28px_80px_rgba(15,23,42,0.3)] sm:max-h-[92vh]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="page-kicker">Device Registration</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink sm:text-2xl">장비 등록</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500 sm:text-sm">장비번호와 QR 코드는 등록 시 자동 생성됩니다.</p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} disabled={busy} aria-label="장비 등록 닫기">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overscroll-contain overflow-auto p-3 sm:p-5">
          {error ? <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
          <DeviceForm mode="create" onSubmit={submit} busy={busy} inModal />
        </div>
      </section>
    </div>,
    document.body
  );
}
