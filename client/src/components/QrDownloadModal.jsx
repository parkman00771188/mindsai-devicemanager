import { Download, QrCode, X } from "lucide-react";
import { downloadQrImage, qrImageUrl } from "../utils/qrDownload.js";

function QrOption({ deviceId, title, description, style }) {
  const isLabel = style === "label";
  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold text-ink">{title}</h3>
          <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">{description}</p>
        </div>
        <QrCode size={20} className="shrink-0 text-brand" />
      </div>
      <div className="mt-4 flex h-72 items-center justify-center rounded-lg bg-slate-50 p-3">
        <img
          src={qrImageUrl(deviceId, style)}
          alt={`${deviceId} ${title}`}
          className={`${isLabel ? "max-h-24 w-full max-w-[520px]" : "h-56 w-56"} rounded-lg object-contain`}
        />
      </div>
      <button className="btn-primary mt-4 w-full justify-center" type="button" onClick={() => downloadQrImage(deviceId, style)}>
        <Download size={18} />
        다운로드
      </button>
    </section>
  );
}

export default function QrDownloadModal({ device, onClose }) {
  if (!device) return null;
  const title = device.category && device.model_name ? `${device.category} (${device.model_name})` : device.device_name || device.device_id;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-lg bg-white p-5 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="page-kicker">QR 다운로드</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">{title}</h2>
            <p className="mt-1 text-sm font-extrabold text-brand">{device.device_id}</p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <QrOption deviceId={device.device_id} title="일반 QR" description="QR 코드만 있는 기본 버전입니다." style="plain" />
          <QrOption deviceId={device.device_id} title="번호 포함 QR" description="출력 후 붙였을 때 바로 식별할 수 있도록 장비번호를 함께 넣었습니다." style="label" />
        </div>
      </section>
    </div>
  );
}
