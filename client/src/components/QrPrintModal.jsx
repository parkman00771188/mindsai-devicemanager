import { Check, Printer, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { deviceCapacity, deviceTitle } from "../constants.js";
import StatusBadge from "./StatusBadge.jsx";
import { qrLabelPngDataUrl } from "../utils/qrDownload.js";

const scaleOptions = Array.from({ length: 13 }, (_, index) => 30 + index * 10);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function deviceSearchText(device = {}) {
  return [
    device.device_id,
    device.legacy_device_id,
    deviceTitle(device),
    device.category,
    device.model_name,
    device.manufacturer,
    device.location,
    device.owner_organization
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function printQrLabels(devices, scale) {
  const printWindow = window.open("", "_blank", "width=1200,height=900");
  if (!printWindow) {
    throw new Error("팝업이 차단되어 인쇄 창을 열 수 없습니다. 브라우저 팝업 허용 후 다시 시도해주세요.");
  }

  printWindow.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>QR 코드 준비 중</title></head><body style="font-family:Arial,sans-serif;padding:32px"><strong>QR 이미지를 준비하고 있습니다...</strong></body></html>`);
  printWindow.document.close();

  let qrImages;
  try {
    qrImages = new Map(await Promise.all(devices.map(async (device) => [device.device_id, await qrLabelPngDataUrl(device.device_id)])));
  } catch (error) {
    if (!printWindow.closed) {
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>QR 코드 오류</title></head><body style="font-family:Arial,sans-serif;padding:32px;color:#b91c1c"><strong>${escapeHtml(error.message || "QR 이미지를 준비하지 못했습니다.")}</strong></body></html>`);
      printWindow.document.close();
    }
    throw error;
  }
  if (printWindow.closed) throw new Error("인쇄 창이 닫혔습니다.");

  const effectiveScale = scale;
  const labelWidthCm = (8 * effectiveScale) / 100;
  const labelHeightCm = (1.5 * effectiveScale) / 100;
  const infoFontPt = (13 * effectiveScale) / 100;
  const blockGapMm = effectiveScale > 100 ? 11 : 14;
  const cards = devices
    .map((device) => {
      const title = deviceTitle(device);
      const legacy = device.legacy_device_id || "-";
      const labelUrl = qrImages.get(device.device_id);
      const labels = Array.from({ length: 3 })
        .map(() => `<img class="qr-label" src="${escapeHtml(labelUrl)}" alt="${escapeHtml(device.device_id)} QR label" />`)
        .join("");

      return `
        <section class="device-card">
          <div class="device-info">
            <div>- <strong>${escapeHtml(title)}</strong> : ${escapeHtml(device.device_id)}</div>
            <div>- <strong>기존 장비번호</strong> : ${escapeHtml(legacy)}</div>
          </div>
          <div class="label-stack">${labels}</div>
        </section>
      `;
    })
    .join("");

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>QR 코드 인쇄</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 8mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      background: #ffffff;
      color: #111111;
      font-family: Arial, "Noto Sans KR", "Malgun Gothic", sans-serif;
    }
    .sheet {
      --label-width: ${labelWidthCm}cm;
      --label-height: ${labelHeightCm}cm;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(var(--label-width), var(--label-width)));
      align-items: start;
      gap: 23mm ${blockGapMm}mm;
      padding: 0;
    }
    .device-card {
      width: var(--label-width);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .device-info {
      margin: 0 0 5mm;
      font-size: ${infoFontPt}pt;
      line-height: 1.25;
      letter-spacing: 0;
      white-space: nowrap;
    }
    .device-info strong {
      font-weight: 800;
    }
    .label-stack {
      display: grid;
      gap: 3mm;
    }
    .qr-label {
      display: block;
      width: var(--label-width);
      height: var(--label-height);
      object-fit: contain;
    }
    @media screen {
      body {
        padding: 18px;
      }
    }
    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <main class="sheet">${cards}</main>
  <script>
    const images = Array.from(document.images);
    Promise.all(images.map(async (image) => {
      if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error("QR image load failed"));
        });
      }
      if (!image.naturalWidth) throw new Error("QR image is empty");
      if (image.decode) await image.decode().catch(() => {});
    })).then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))).then(() => {
      setTimeout(() => {
        window.focus();
        window.print();
      }, 250);
    }).catch((error) => {
      document.body.insertAdjacentHTML("afterbegin", '<p style="color:#b91c1c;font-weight:700">QR 이미지를 표시하지 못했습니다. 창을 닫고 다시 시도해주세요.</p>');
      console.error(error);
    });
  </script>
</body>
</html>`);
  printWindow.document.close();
}

function DevicePickRow({ device, selected, onToggle }) {
  const meta = [device.category, device.model_name, deviceCapacity(device), device.manufacturer].filter(Boolean).join(" · ");

  return (
    <button
      className={`flex min-h-[74px] w-full items-center gap-3 rounded-lg border bg-white px-3 py-3 text-left transition ${
        selected ? "border-brand bg-[#eef4ff] shadow-soft" : "border-line hover:border-[#dbe7ff] hover:bg-[#f8fafc]"
      }`}
      type="button"
      onClick={onToggle}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 ${
          selected ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-transparent"
        }`}
      >
        <Check size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-base font-extrabold text-ink">{deviceTitle(device)}</span>
          <span className="rounded-lg border border-line bg-white px-2 py-0.5 text-xs font-extrabold text-brand">{device.device_id}</span>
        </span>
        <span className="mt-1 block truncate text-sm font-bold text-slate-500">{meta || "장비 정보 미입력"}</span>
      </span>
      <StatusBadge status={device.status} label={device.status === "DELIVERED" ? "납품" : undefined} />
    </button>
  );
}

export default function QrPrintModal({ devices = [], categories = [], onClose }) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [scale, setScale] = useState(100);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState("");

  const filteredDevices = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return devices.filter((device) => {
      if (status && device.status !== status) return false;
      if (category && device.category !== category) return false;
      if (normalizedKeyword && !deviceSearchText(device).includes(normalizedKeyword)) return false;
      return true;
    });
  }, [category, devices, keyword, status]);

  const selectedDevices = useMemo(() => devices.filter((device) => selectedIds.has(device.device_id)), [devices, selectedIds]);
  const filteredSelectedCount = filteredDevices.filter((device) => selectedIds.has(device.device_id)).length;

  function toggleDevice(deviceId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  }

  function selectFiltered() {
    setSelectedIds((current) => {
      const next = new Set(current);
      filteredDevices.forEach((device) => next.add(device.device_id));
      return next;
    });
  }

  function clearFiltered() {
    setSelectedIds((current) => {
      const next = new Set(current);
      filteredDevices.forEach((device) => next.delete(device.device_id));
      return next;
    });
  }

  async function confirmPrint() {
    if (!selectedDevices.length || printBusy) return;
    setPrintBusy(true);
    setPrintError("");
    try {
      await printQrLabels(selectedDevices, scale);
    } catch (error) {
      setPrintError(error.message || "QR 인쇄 창을 준비하지 못했습니다.");
    } finally {
      setPrintBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <section className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg bg-white shadow-lift" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <p className="page-kicker">QR Label Print</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">QR 코드 인쇄</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">인쇄할 장비를 선택하면 장비당 QR 라벨 3개가 출력됩니다.</p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-h-0 overflow-auto border-b border-line lg:border-b-0 lg:border-r">
            <div className="sticky top-0 z-10 border-b border-line bg-white/95 p-4 backdrop-blur">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={21} />
                <input
                  className="input pl-11"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="장비번호, 장비명, 모델명, 위치 검색"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={`btn-secondary h-10 px-3 text-sm ${!category ? "border-brand bg-brand text-white" : ""}`} type="button" onClick={() => setCategory("")}>
                  전체
                </button>
                {categories.map((item) => (
                  <button
                    key={item}
                    className={`btn-secondary h-10 px-3 text-sm ${category === item ? "border-brand bg-brand text-white" : ""}`}
                    type="button"
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <select className="input h-10 w-full py-0 text-sm sm:w-44" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">전체 상태</option>
                  <option value="AVAILABLE">대여 가능</option>
                  <option value="RENTED">대여 중</option>
                  <option value="DELIVERED">납품</option>
                  <option value="MAINTENANCE">점검 중</option>
                  <option value="BROKEN">고장</option>
                  <option value="LOST">분실</option>
                  <option value="DISPOSED">폐기</option>
                </select>
                <div className="flex gap-2">
                  <button className="btn-secondary h-10 px-3 text-sm" type="button" onClick={selectFiltered} disabled={!filteredDevices.length}>
                    전체 목록 선택
                  </button>
                  <button className="btn-secondary h-10 px-3 text-sm" type="button" onClick={clearFiltered} disabled={!filteredSelectedCount}>
                    선택 해제
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-4">
              {filteredDevices.length ? (
                filteredDevices.map((device) => (
                  <DevicePickRow
                    key={device.device_id}
                    device={device}
                    selected={selectedIds.has(device.device_id)}
                    onToggle={() => toggleDevice(device.device_id)}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-line bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">조건에 맞는 장비가 없습니다.</div>
              )}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col bg-[#f8fafc]">
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-extrabold text-ink">선택 리스트</h3>
                <span className="rounded-lg bg-[#eef4ff] px-3 py-1 text-sm font-extrabold text-brand">{selectedDevices.length}대</span>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-white p-3">
                {selectedDevices.length ? (
                  <div className="grid gap-2">
                    {selectedDevices.map((device) => (
                      <div key={device.device_id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-ink">{deviceTitle(device)}</p>
                          <p className="mt-0.5 truncate text-xs font-extrabold text-brand">{device.device_id}</p>
                        </div>
                        <button className="btn-secondary h-8 w-8 shrink-0 p-0" type="button" onClick={() => toggleDevice(device.device_id)} aria-label="선택 해제">
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-line bg-slate-50 p-6 text-center">
                    <p className="text-base font-extrabold text-ink">선택한 장비가 없습니다.</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">왼쪽 목록에서 체크하면 여기에 표시됩니다.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-line bg-white p-4">
              <h3 className="text-base font-extrabold text-ink">인쇄 옵션</h3>
              <div className="mt-3">
                <label className="block">
                  <span className="field-label">비율 설정</span>
                  <select className="input mt-1 h-11 py-0" value={scale} onChange={(event) => setScale(Number(event.target.value))}>
                    {scaleOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </aside>
        </div>

        <div className="flex justify-end gap-2 border-t border-line bg-white px-5 py-4 sm:px-6">
          {printError ? <p className="mr-auto self-center text-sm font-extrabold text-red-600">{printError}</p> : null}
          <button className="btn-secondary" type="button" onClick={onClose}>
            취소
          </button>
          <button className="btn-primary" type="button" onClick={confirmPrint} disabled={!selectedDevices.length || printBusy}>
            <Printer size={18} />
            {printBusy ? "QR 준비 중" : "확인"}
          </button>
        </div>
      </section>
    </div>
  );
}
