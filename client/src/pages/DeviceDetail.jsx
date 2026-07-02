import { AlertTriangle, Camera, CheckCircle2, ChevronLeft, ChevronRight, Download, Edit, Info, ListChecks, PackageCheck, RotateCcw, SearchX, Stethoscope, Trash2, Truck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { getCurrentUser, isAdminUser } from "../auth.js";
import ActionBadge from "../components/ActionBadge.jsx";
import DeviceProcessModal from "../components/DeviceProcessModal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Loading from "../components/Loading.jsx";
import PhotoViewer from "../components/PhotoViewer.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { actionLabel, deviceCapacity, deviceTitle, formatDate, formatDateTime, isLaptopDevice, splitPhotoPaths, statusLabel, transactionMemo, transactionNumber, transactionPlace } from "../constants.js";
import { compressImageFiles } from "../utils/imageCompress.js";
import { downloadQrImage, qrImageUrl } from "../utils/qrDownload.js";

const statusPanels = {
  AVAILABLE: {
    label: "대여 가능",
    title: "바로 대여할 수 있습니다",
    description: "장비 상태가 정상이며 대여 처리 버튼으로 바로 출고할 수 있습니다.",
    icon: PackageCheck,
    className: "border-[#c7f1e9] bg-[#ecfbf7] text-[#1eb6a5]"
  },
  RENTED: {
    label: "대여 중",
    title: "현재 대여 중입니다",
    description: "반납 처리 전까지 다른 사용자나 기관에 대여할 수 없습니다.",
    icon: RotateCcw,
    className: "border-[#d8d2ff] bg-[#f1efff] text-[#6554dc]"
  },
  DELIVERED: {
    label: "납품",
    title: "납품되었습니다",
    description: "회수 처리 전까지 다른 사용자나 기관에 대여하거나 납품할 수 없습니다.",
    icon: Truck,
    className: "border-[#b9def7] bg-[#e8f6ff] text-[#1178c7]"
  },
  MAINTENANCE: {
    label: "점검 중",
    title: "점검 또는 수리 확인이 필요합니다",
    description: "점검 완료 후 대여 가능 상태로 전환할 수 있습니다.",
    icon: Stethoscope,
    className: "border-[#ffd9c1] bg-[#fff4ee] text-[#d47a3d]"
  },
  BROKEN: {
    label: "고장",
    title: "고장 처리 중인 장비입니다",
    description: "점검을 시작하거나 상태 사진과 사유를 남겨 추적하세요.",
    icon: AlertTriangle,
    className: "border-[#ffc8d6] bg-[#fff0f4] text-[#d84f71]"
  },
  LOST: {
    label: "분실",
    title: "분실 상태로 등록된 장비입니다",
    description: "장비를 찾으면 찾음 처리로 대여 가능 상태로 되돌릴 수 있습니다.",
    icon: SearchX,
    className: "border-slate-300 bg-slate-100 text-slate-800"
  },
  DISPOSED: {
    label: "폐기",
    title: "폐기 처리된 장비입니다",
    description: "운영 대상에서 제외된 장비입니다. 필요 시 관리자만 삭제할 수 있습니다.",
    icon: Trash2,
    className: "border-zinc-300 bg-zinc-100 text-zinc-700"
  }
};

function InfoItem({ label, value, preserveWhitespace = false }) {
  return (
    <div className="grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] gap-3 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[5.75rem_minmax(0,1fr)]">
      <dt className="whitespace-nowrap text-sm font-extrabold text-slate-500">{label}</dt>
      <dd className={`min-w-0 break-words text-left text-base font-extrabold text-ink ${preserveWhitespace ? "whitespace-pre-wrap" : ""}`}>{value || "-"}</dd>
    </div>
  );
}

function RentalMetric({ label, value, strong }) {
  return (
    <div className="grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-3 border-b border-slate-200/70 py-3 last:border-b-0 sm:grid-cols-[5.75rem_minmax(0,1fr)]">
      <p className="whitespace-nowrap text-sm font-extrabold text-slate-500">{label}</p>
      <p className={`${strong ? "text-2xl text-brand" : "text-base text-ink"} min-w-0 break-words text-left font-extrabold`}>{value || "-"}</p>
    </div>
  );
}

function CompactInfoTile({ label, value, className = "" }) {
  return (
    <div className={`min-w-0 rounded-lg border border-line bg-white px-3 py-2.5 shadow-soft ${className}`}>
      <p className="text-xs font-extrabold text-slate-500">{label}</p>
      <p className="mt-1 min-h-5 break-words text-sm font-extrabold leading-5 text-ink">{value || "-"}</p>
    </div>
  );
}

function currentCheckoutFromDevice(device = {}) {
  if (!["RENTED", "DELIVERED"].includes(device.status)) return null;
  const hasSnapshot = [
    device.current_borrower_type,
    device.current_user_contact,
    device.current_purpose,
    device.current_rent_location,
    device.current_condition_status,
    device.current_process_memo,
    device.current_source_action_type
  ].some(Boolean);
  if (!hasSnapshot) return null;
  const actionType = device.current_source_action_type || (device.status === "DELIVERED" ? "DELIVERY" : "RENT");
  const placeLabel = actionType === "DELIVERY" || device.status === "DELIVERED" ? "납품 장소" : "대여 장소";
  const orgDepartment =
    (device.current_borrower_type === "INSTITUTION" || device.borrower_department === "기관")
      ? ["기관", device.current_institution_name || device.current_borrower].filter(Boolean).join(" / ")
      : [device.current_user_organization, device.borrower_department].filter(Boolean).join(" / ");
  return {
    action_type: actionType,
    source_action_type: actionType,
    borrower_type: device.current_borrower_type || (device.borrower_department === "기관" ? "INSTITUTION" : "PERSON"),
    institution_id: device.current_institution_id || "",
    institution_name: device.current_institution_name || (device.borrower_department === "기관" ? device.current_borrower || "" : ""),
    user_name: device.current_borrower || "",
    user_organization: device.current_user_organization || (device.borrower_department === "기관" ? "기관" : ""),
    user_department: device.borrower_department || "",
    user_org_department: orgDepartment,
    borrower_org_department: orgDepartment,
    user_position: device.current_user_position || "",
    user_contact: device.current_user_contact || "",
    purpose: device.current_purpose || "",
    rented_at: device.borrowed_at || "",
    expected_return_at: device.expected_return_at || "",
    condition_status: device.current_condition_status || "",
    memo: [device.current_rent_location ? `${placeLabel}: ${device.current_rent_location}` : "", device.current_process_memo || ""].filter(Boolean).join(" / ")
  };
}

function DetailLine({ label, value }) {
  return value ? (
    <p className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 text-sm font-semibold leading-6 text-slate-600">
      <span className="whitespace-nowrap font-extrabold text-slate-800">{label}</span>
      <span className="min-w-0 break-words text-left">{value}</span>
    </p>
  ) : null;
}

function PhotoStrip({ paths, label, onOpen }) {
  if (!paths.length) return null;
  return (
    <div className="scrollbar-none mt-2 flex snap-x gap-2 overflow-x-auto pb-1 sm:mt-3">
      {paths.map((path, index) => (
        <button
          key={`${path}-${index}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(index);
          }}
          className="block h-16 w-16 shrink-0 snap-start overflow-hidden rounded-lg border border-line bg-slate-100 transition hover:border-cyan-300 sm:h-20 sm:w-20"
          title="사진 크게 보기"
        >
          <img src={path} alt={`${label} 사진 ${index + 1}`} className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}

function RecentTransactionCard({ row, className = "", onOpenPhoto, canDelete = false, deleteBusy = false, onDelete }) {
  const photoPaths = splitPhotoPaths(row.photo_paths);
  const memo = transactionMemo(row) || row.issue_description;
  const dateLabel = row.action_type === "DELIVERY" ? "납품일" : row.action_type === "RECOVERY" ? "회수일" : row.action_type === "RETURN" ? "반납일" : "대여일";
  const dateValue = row.action_type === "RECOVERY" || row.action_type === "RETURN" ? row.returned_at : row.rented_at;

  function requestDelete() {
    if (!window.confirm(`출납 ${transactionNumber(row)} 이력을 삭제할까요? 삭제 후 최근 이력 목록에서 사라집니다.`)) return;
    onDelete?.(row);
  }

  return (
    <article className={`max-w-full overflow-hidden rounded-lg border border-line bg-white p-3 shadow-soft sm:p-4 ${className}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <ActionBadge action={row.action_type} />
          <p className="mt-1 truncate text-sm font-bold text-slate-500">{row.user_name || "-"} · {formatDateTime(row.created_at)}</p>
        </div>
        {canDelete ? (
          <button className="btn-danger h-9 w-9 shrink-0 p-0" type="button" onClick={requestDelete} disabled={deleteBusy} aria-label="이력 삭제">
            <Trash2 size={16} />
          </button>
        ) : null}
      </div>
      <div className="mt-2 grid gap-1 rounded-lg bg-slate-50 px-3 py-2 sm:mt-3 sm:gap-1.5 sm:py-3">
        <DetailLine label="목적/사유" value={row.purpose} />
        <DetailLine label="처리 장소" value={transactionPlace(row)} />
        <DetailLine label={dateLabel} value={formatDate(dateValue) !== "-" ? formatDate(dateValue) : ""} />
        <DetailLine label="상태" value={row.condition_status} />
      </div>
      <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-600 sm:mt-3 sm:line-clamp-none">{memo || "등록된 메모가 없습니다."}</p>
      <PhotoStrip paths={photoPaths} label={actionLabel(row.action_type)} onOpen={(index) => onOpenPhoto(photoPaths, index, row)} />
    </article>
  );
}

function HistorySummaryModal({ rows, onClose }) {
  if (!rows) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-lg bg-white p-5 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="page-kicker">History Summary</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">최근 이력 요약</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">핵심 내용만 한 줄로 정리했습니다.</p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="요약 닫기">
            <X size={18} />
          </button>
        </div>

        <div className="scrollbar-none mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="min-w-[940px] w-full table-fixed">
            <thead className="table-head">
              <tr>
                <th className="w-20">출납</th>
                <th className="w-24">작업</th>
                <th className="w-28">사용자</th>
                <th>목적/사유</th>
                <th className="w-36">장소</th>
                <th className="w-28">상태</th>
                <th className="w-24">사진</th>
                <th className="w-36">처리일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const photos = splitPhotoPaths(row.photo_paths);
                const memo = transactionMemo(row) || row.issue_description;
                return (
                  <tr key={`summary-${row.transaction_id}`}>
                    <td className="table-cell font-extrabold text-brand">{transactionNumber(row)}</td>
                    <td className="table-cell">
                      <ActionBadge action={row.action_type} />
                    </td>
                    <td className="table-cell"><span className="block truncate">{row.user_name || row.handled_by || "-"}</span></td>
                    <td className="table-cell align-top" title={row.purpose || memo || ""}>
                      <span className="block whitespace-pre-wrap break-words leading-5">{row.purpose || memo || "-"}</span>
                    </td>
                    <td className="table-cell"><span className="block truncate">{transactionPlace(row) || "-"}</span></td>
                    <td className="table-cell"><span className="block truncate">{row.condition_status || statusLabel(row.after_status)}</span></td>
                    <td className="table-cell">{photos.length ? `${photos.length}장` : "-"}</td>
                    <td className="table-cell text-slate-600">{formatDateTime(row.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function BasicInfoModal({ device, photos, onClose, onOpenPhoto }) {
  if (!device) return null;
  const title = deviceTitle(device);
  const isLaptop = isLaptopDevice(device);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-lg bg-white p-5 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="page-kicker">장비 상세 정보</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">{title}</h2>
            <p className="mt-1 text-sm font-extrabold text-brand">{device.device_id}</p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="상세 닫기">
            <X size={18} />
          </button>
        </div>
        <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
          <InfoItem label="분류" value={device.category} />
          <InfoItem label="기존 장비번호" value={device.legacy_device_id} />
          <InfoItem label="제조사" value={device.manufacturer} />
          <InfoItem label="모델명" value={device.model_name} />
          {!isLaptop ? <InfoItem label="용량" value={deviceCapacity(device)} /> : null}
          {isLaptop ? (
            <>
              <InfoItem label="램 용량" value={device.ram_capacity} />
              <InfoItem label="저장장치 용량" value={device.storage_capacity} />
              <InfoItem label="CPU" value={device.cpu} />
              <InfoItem label="GPU" value={device.gpu} />
              <InfoItem label="Windows 사양" value={device.windows_spec} />
            </>
          ) : null}
          <InfoItem label="시리얼번호" value={device.serial_number} />
          <InfoItem label="구매일" value={formatDate(device.purchase_date)} />
          <InfoItem label="구매금액" value={device.purchase_price} />
          <InfoItem label="관리부서" value={device.department} />
          <InfoItem label="담당자" value={device.manager} />
          <InfoItem label="보관위치" value={device.location} />
          <InfoItem label="최근 반납일" value={formatDate(device.last_returned_at)} />
          <InfoItem label="최근 점검일" value={formatDate(device.last_checked_at)} />
          <InfoItem label="구성품" value={device.components} />
          <InfoItem label="비고" value={device.memo} preserveWhitespace />
        </dl>
        {photos.length ? (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-sm font-extrabold text-ink">장비 사진</h3>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {photos.map((path, index) => (
                <button
                  key={`${path}-${index}`}
                  type="button"
                  onClick={() => onOpenPhoto(index)}
                  className="aspect-square overflow-hidden rounded-lg border border-line bg-slate-100 transition hover:border-cyan-300"
                  title="사진 크게 보기"
                >
                  <img src={path} alt={`장비 사진 ${index + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ReasonModal({ title, description, label, submitLabel, danger, allowPhotos = false, onClose, onSubmit, busy }) {
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState([]);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <section className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="page-kicker">장비 처리</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">{title}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{description}</p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <form
          className="mt-4 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(reason, photos);
          }}
        >
          <label>
            <span className="field-label">{label}</span>
            <textarea className="textarea text-base" value={reason} onChange={(event) => setReason(event.target.value)} required placeholder="처리 사유를 입력하세요." />
          </label>
          {allowPhotos ? (
            <label className="block">
              <span className="field-label">사진 첨부</span>
              <span className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#b9def7] bg-[#e8f6ff] px-4 py-6 text-center">
                <Camera size={28} className="text-brand" />
                <span className="mt-2 text-sm font-extrabold text-ink">{photos.length ? `${photos.length}장 선택됨` : "사진 선택"}</span>
                <span className="mt-1 text-xs font-semibold text-slate-500">처리 시점의 장비 상태를 남겨주세요.</span>
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => setPhotos(Array.from(event.target.files || []))}
                />
              </span>
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" type="button" onClick={onClose}>취소</button>
            <button className={danger ? "btn-danger" : "btn-primary"} disabled={busy}>
              {danger ? <Trash2 size={18} /> : <CheckCircle2 size={18} />}
              {busy ? "처리 중" : submitLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DeleteConfirmModal({ onClose, onConfirm, busy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <section className="w-full max-w-xl rounded-lg bg-white p-5 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="page-kicker">장비 삭제</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">삭제하시겠습니까?</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              삭제하면 장비 목록에서는 숨겨지지만, 기존 대여·반납·점검 이력에는 계속 남습니다.
            </p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={busy}>취소</button>
          <button className="btn-danger" type="button" onClick={onConfirm} disabled={busy}>
            <Trash2 size={18} />
            {busy ? "삭제 중" : "확인"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function DeviceDetailContent({ deviceId, inModal = false, onChanged, onDeleted }) {
  const navigate = useNavigate();
  const [device, setDevice] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [photoViewer, setPhotoViewer] = useState(null);
  const [basicOpen, setBasicOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [processMode, setProcessMode] = useState("");
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusAction, setStatusAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [transactionDeleteBusy, setTransactionDeleteBusy] = useState(false);
  const [qrStyle, setQrStyle] = useState("plain");
  const [recentPage, setRecentPage] = useState(0);
  const [error, setError] = useState("");

  async function load() {
    const detail = await api(`/devices/${deviceId}/detail`);
    setDevice(detail.device);
    setTransactions(detail.transactions || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [deviceId]);

  useEffect(() => {
    setRecentPage(0);
  }, [deviceId, transactions.length]);

  async function dispose(reason) {
    setActionBusy(true);
    setError("");
    try {
      const nextDevice = await api(`/devices/${deviceId}`, { method: "DELETE", body: { reason } });
      setDevice(nextDevice);
      setDisposeOpen(false);
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function changeStatus(status, reason, actionType, photos = []) {
    setActionBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("status", status);
      formData.append("reason", reason || "");
      formData.append("action_type", actionType || "");
      const compressedPhotos = await compressImageFiles(photos, { maxSize: 1600, quality: 0.78 });
      compressedPhotos.forEach((photo) => formData.append("photos", photo));
      const nextDevice = await api(`/devices/${deviceId}/status`, {
        method: "POST",
        body: formData
      });
      setDevice(nextDevice);
      setStatusAction(null);
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function completeMaintenance(result, photos = []) {
    setActionBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("maintenance_type", "고장 점검");
      formData.append("checked_by", "admin");
      formData.append("checked_at", new Date().toISOString().slice(0, 10));
      formData.append("result", result || "");
      formData.append("action_type", "MAINTENANCE_COMPLETE");
      formData.append("issue_level", "보통");
      formData.append("action_taken", result || "");
      formData.append("status_after", "AVAILABLE");
      formData.append("memo", result || "");
      const compressedPhotos = await compressImageFiles(photos, { maxSize: 1600, quality: 0.78 });
      compressedPhotos.forEach((photo) => formData.append("photos", photo));
      await api(`/devices/${deviceId}/maintenance`, {
        method: "POST",
        body: formData
      });
      setStatusAction(null);
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function deleteTransaction(row) {
    if (!row?.transaction_id) return;
    setTransactionDeleteBusy(true);
    setError("");
    try {
      await api(`/transactions/${encodeURIComponent(row.transaction_id)}`, { method: "DELETE" });
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setTransactionDeleteBusy(false);
    }
  }

  async function submitStatusAction(reason, photos = []) {
    if (statusAction === "broken") {
      await changeStatus("BROKEN", reason, "BROKEN", photos);
      return;
    }
    if (statusAction === "lost") {
      await changeStatus("LOST", reason, "LOST", photos);
      return;
    }
    if (statusAction === "lostFound") {
      await changeStatus("AVAILABLE", reason, "LOST_FOUND", photos);
      return;
    }
    if (statusAction === "maintenanceStart") {
      await changeStatus("MAINTENANCE", reason, "MAINTENANCE_START", photos);
      return;
    }
    if (statusAction === "maintenanceComplete") {
      await completeMaintenance(reason, photos);
    }
  }

  async function deleteDevice() {
    setActionBusy(true);
    setError("");
    try {
      await api(`/devices/${deviceId}?delete=true`, { method: "DELETE" });
      if (onDeleted) {
        await onDeleted();
      } else {
        navigate("/devices");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  function openPhotoViewer(paths, index, row) {
    setPhotoViewer({
      paths,
      index,
      title: `${actionLabel(row.action_type)} 사진`,
      description: `${row.user_name || row.handled_by || "사용자 없음"} · ${formatDateTime(row.created_at)}`
    });
  }

  function movePhoto(offset) {
    setPhotoViewer((current) => {
      if (!current) return current;
      const nextIndex = (current.index + offset + current.paths.length) % current.paths.length;
      return { ...current, index: nextIndex };
    });
  }

  if (error) return <EmptyState title={error} />;
  if (!device) return <Loading />;

  const currentUser = getCurrentUser();
  const isAdmin = isAdminUser(currentUser);
  const canRent = device.status === "AVAILABLE";
  const canDeliver = isAdmin && device.status === "AVAILABLE";
  const canReturn = device.status === "RENTED";
  const canRecover = isAdmin && device.status === "DELIVERED";
  const canReturnOrRecover = canReturn || canRecover;
  const canDelete = isAdmin && device.status === "DISPOSED";
  const canDispose = isAdmin && !["DISPOSED", "DELIVERED"].includes(device.status);
  const canFlagIssue = !["DISPOSED", "LOST", "DELIVERED"].includes(device.status);
  const canStartMaintenance = device.status === "BROKEN";
  const canCompleteMaintenance = device.status === "MAINTENANCE";
  const canResolveLost = device.status === "LOST";
  const devicePhotos = [...new Set([...splitPhotoPaths(device.photo_paths), ...splitPhotoPaths(device.main_photo_path)])];
  const displayName = deviceTitle(device);
  const isLaptop = isLaptopDevice(device);
  const checkoutActions = device.status === "DELIVERED" ? ["RENTAL_UPDATE", "DELIVERY"] : ["RENTAL_UPDATE", "RENT"];
  const currentRentalSnapshot = currentCheckoutFromDevice(device);
  const currentRental =
    currentRentalSnapshot ||
    (["RENTED", "DELIVERED"].includes(device.status)
      ? transactions.find((row) => checkoutActions.includes(row.action_type))
      : null);
  const currentRentalMemo = currentRental ? transactionMemo(currentRental) : "";
  const currentRentalPlace = currentRental ? transactionPlace(currentRental) : "";
  const lastCheckout = ["RENTED", "DELIVERED"].includes(device.status) ? transactions.find((row) => ["DELIVERY", "RENT"].includes(row.action_type)) : null;
  const currentRentalIsDelivery = device.status === "DELIVERED" || currentRental?.action_type === "DELIVERY" || (currentRental?.action_type === "RENTAL_UPDATE" && lastCheckout?.action_type === "DELIVERY");
  const currentStatus = statusPanels[device.status] || {
    label: statusLabel(device.status),
    title: statusLabel(device.status),
    description: "현재 장비 상태를 확인해주세요.",
    icon: Info,
    className: "border-slate-200 bg-slate-50 text-slate-800"
  };
  const CurrentStatusIcon = currentStatus.icon || Info;
  const currentRentalOrgDepartment =
    currentRental?.user_org_department ||
    currentRental?.borrower_org_department ||
    [currentRental?.user_organization, currentRental?.user_department].filter(Boolean).join(" / ") ||
    currentRental?.user_department ||
    device.borrower_department;
  const mobileInfoItems = [
    ["분류", device.category],
    ["모델명", device.model_name],
    ["위치", device.location],
    ["기존 번호", device.legacy_device_id],
    ...(isLaptop
      ? [
          ["RAM", device.ram_capacity],
          ["저장장치", device.storage_capacity]
        ]
      : [["용량", deviceCapacity(device)]])
  ];
  const recentPageSize = 4;
  const recentPageCount = Math.max(1, Math.ceil(transactions.length / recentPageSize));
  const safeRecentPage = Math.min(recentPage, recentPageCount - 1);
  const pagedTransactions = transactions.slice(safeRecentPage * recentPageSize, safeRecentPage * recentPageSize + recentPageSize);
  const statusActionConfig = {
    broken: {
      title: "고장 등록",
      description: "고장 상태로 변경하면 점검 버튼을 사용할 수 있습니다.",
      label: "고장 사유",
      submitLabel: "고장 등록",
      danger: true
    },
    lost: {
      title: "분실 등록",
      description: "장비를 분실 상태로 변경합니다. 이력에는 분실 사유가 함께 남습니다.",
      label: "분실 사유",
      submitLabel: "분실 등록",
      danger: true
    },
    lostFound: {
      title: "분실 장비 찾음 처리",
      description: "분실 처리된 장비를 다시 대여 가능 상태로 변경합니다.",
      label: "찾음 처리 메모",
      submitLabel: "찾음 처리"
    },
    maintenanceStart: {
      title: "점검 시작",
      description: "고장 장비를 점검 중 상태로 변경합니다. 필요하면 현재 상태 사진을 함께 남길 수 있습니다.",
      label: "점검 사유",
      submitLabel: "점검 시작"
    },
    maintenanceComplete: {
      title: "점검 완료",
      description: "점검 결과를 입력하면 장비 상태가 대여 가능으로 변경됩니다.",
      label: "점검 결과",
      submitLabel: "점검 완료"
    }
  }[statusAction];

  function moveRecentPage(offset) {
    setRecentPage((current) => (current + offset + recentPageCount) % recentPageCount);
  }

  const detailShellClass = inModal ? "space-y-3 sm:space-y-5" : "app-page";
  const heroClass = inModal ? "rounded-lg border border-line bg-white p-3 shadow-soft sm:p-4" : "hero-strip";
  const heroLayoutClass = inModal
    ? "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
    : "flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between";
  const heroIdentityClass = inModal
    ? "grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-3 sm:flex sm:items-center sm:gap-4"
    : "flex flex-col gap-4 sm:flex-row sm:items-center";
  const heroPhotoClass = inModal
    ? "flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#e8f6ff] transition hover:ring-4 hover:ring-[#e5e1ff] sm:h-20 sm:w-20"
    : "flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#e8f6ff] transition hover:ring-4 hover:ring-[#e5e1ff]";
  const actionGridClass = inModal
    ? "grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end"
    : "grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end";
  const mainGridClass = inModal
    ? "grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]"
    : "grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]";
  const statusTopClass = inModal
    ? "flex flex-col justify-between gap-3 lg:flex-row lg:items-start"
    : "flex flex-col justify-between gap-4 lg:flex-row lg:items-start";
  const statusQuickClass = inModal ? "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end" : "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end";
  const statusSummaryClass = inModal ? "mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3" : "mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3";
  const rentalMetricGridClass = inModal
    ? "mt-3 grid grid-cols-1 rounded-lg border border-white/70 bg-white/75 px-3 sm:grid-cols-2 2xl:grid-cols-3"
    : "mt-3 grid grid-cols-1 rounded-lg border border-white/70 bg-white/75 px-3 sm:grid-cols-2 2xl:grid-cols-3";
  const asideClass = inModal ? "grid gap-3 md:grid-cols-3 xl:block xl:space-y-4" : "grid gap-4 md:grid-cols-3 xl:block xl:space-y-4";

  return (
    <div className={detailShellClass}>
      <section className={heroClass}>
        <div className={heroLayoutClass}>
          <div className={heroIdentityClass}>
            <button
              className={heroPhotoClass}
              type="button"
              onClick={() => {
                if (devicePhotos.length) {
                  setPhotoViewer({
                    paths: devicePhotos,
                    index: 0,
                    title: "장비 사진",
                    description: `${displayName} · ${device.device_id}`
                  });
                }
              }}
              disabled={!devicePhotos.length}
              aria-label="장비 사진 보기"
            >
              {devicePhotos[0] ? (
                <img src={devicePhotos[0]} alt={`${device.device_name} 대표 사진`} className="h-full w-full object-cover" />
              ) : (
                <PackageCheck size={30} className="text-brand" />
              )}
            </button>
            <div className="min-w-0">
              <div className={inModal ? "flex min-w-0 flex-wrap items-center gap-2" : "flex flex-wrap items-center gap-3"}>
                <h1 className={inModal ? "min-w-0 break-words text-xl font-extrabold leading-tight tracking-normal text-ink sm:text-2xl" : "text-2xl font-extrabold tracking-normal text-ink sm:text-3xl"}>{displayName}</h1>
                <span className={`rounded-lg border px-3 py-1 text-sm font-extrabold ${currentStatus.className}`}>{currentStatus.label}</span>
              </div>
              <p className="mt-1 break-words text-sm font-extrabold text-brand">{device.device_id}</p>
              <p className="mt-1 break-words text-sm font-semibold leading-5 text-slate-500 sm:mt-2">{device.location || "위치 미입력"} · {device.category || "분류 미입력"}</p>
            </div>
          </div>
          <div className={actionGridClass}>
            {canRent ? (
              <button className="btn-action-active" type="button" onClick={() => setProcessMode("rent")}>
                <PackageCheck size={18} />
                대여하기
              </button>
            ) : null}
            {canDeliver ? (
              <button className="btn-action-active" type="button" onClick={() => setProcessMode("delivery")}>
                <Truck size={18} />
                납품하기
              </button>
            ) : null}
            {canReturn ? (
              <button className="btn-action-active" type="button" onClick={() => setProcessMode("return")}>
                <RotateCcw size={18} />
                반납하기
              </button>
            ) : null}
            {canRecover ? (
              <button className="btn-recover" type="button" onClick={() => setProcessMode("recover")}>
                <Truck size={18} />
                회수 처리
              </button>
            ) : null}
            {canFlagIssue && device.status !== "BROKEN" && !canCompleteMaintenance ? (
              <button className="btn-broken" type="button" onClick={() => setStatusAction("broken")} disabled={actionBusy}>
                <AlertTriangle size={18} />
                고장
              </button>
            ) : null}
            {canResolveLost ? (
              <button className="btn-lost" type="button" onClick={() => setStatusAction("lostFound")} disabled={actionBusy}>
                <CheckCircle2 size={18} />
                찾음 처리
              </button>
            ) : canFlagIssue && !canCompleteMaintenance ? (
              <button className="btn-lost" type="button" onClick={() => setStatusAction("lost")} disabled={actionBusy}>
                <SearchX size={18} />
                분실
              </button>
            ) : null}
            {canCompleteMaintenance ? (
              <button className="btn-complete" type="button" onClick={() => setStatusAction("maintenanceComplete")} disabled={actionBusy}>
                <CheckCircle2 size={18} />
                점검 완료
              </button>
            ) : canStartMaintenance ? (
              <button className="btn-maintenance" type="button" onClick={() => setStatusAction("maintenanceStart")} disabled={actionBusy}>
                <Stethoscope size={18} />
                점검
              </button>
            ) : null}
            {isAdmin ? (
              <>
                <Link className="btn-edit" to={`/devices/${device.device_id}/edit`}>
                  <Edit size={18} />
                  수정
                </Link>
                {canDelete ? (
                  <button className={inModal ? "btn-dispose col-span-2" : "btn-dispose"} type="button" onClick={() => setDeleteOpen(true)}>
                    <Trash2 size={18} />
                    삭제
                  </button>
                ) : canDispose ? (
                  <button className={inModal ? "btn-dispose col-span-2" : "btn-dispose"} type="button" onClick={() => setDisposeOpen(true)}>
                    <Trash2 size={18} />
                    폐기
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </section>

      <div className={mainGridClass}>
        <section className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <div className={`border-b ${inModal ? "p-3 sm:p-5" : "p-4 sm:p-5"} ${currentStatus.className}`}>
            <div className={statusTopClass}>
              <div className={inModal ? "flex min-w-0 items-start gap-3" : "flex min-w-0 items-start gap-4"}>
                <span className={inModal ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-soft" : "flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-soft"}>
                  <CurrentStatusIcon size={inModal ? 24 : 28} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-extrabold opacity-80">현재 상태</p>
                    <StatusBadge status={device.status} />
                  </div>
                  <h2 className={inModal ? "mt-1 break-words text-xl font-extrabold leading-tight text-current sm:text-2xl" : "mt-1 text-2xl font-extrabold text-current"}>{currentStatus.title}</h2>
                  <p className="mt-2 hidden max-w-3xl text-sm font-bold leading-6 text-current opacity-80 sm:block">{currentStatus.description}</p>
                </div>
              </div>
              <div className={statusQuickClass}>
                {canReturnOrRecover ? (
                  <button className={inModal ? "btn-secondary col-span-2 h-11 px-3 py-2 text-sm sm:col-span-1" : "btn-secondary h-auto px-4 py-3 text-sm"} type="button" onClick={() => setProcessMode("rentalEdit")}>
                    <Edit size={16} />
                    {currentRentalIsDelivery ? "납품 정보 수정" : "대여 정보 수정"}
                  </button>
                ) : null}
                <div className={inModal ? "hidden rounded-lg border border-white/70 bg-white/75 px-3 py-2.5 text-center shadow-soft sm:block" : "hidden rounded-lg border border-white/70 bg-white/75 px-4 py-3 text-center shadow-soft sm:block"}>
                  <p className="text-xs font-extrabold text-slate-500">상태</p>
                  <p className={inModal ? "mt-0.5 text-base font-extrabold text-ink" : "mt-1 text-lg font-extrabold text-ink"}>{currentStatus.label}</p>
                </div>
                <div className={inModal ? "hidden rounded-lg border border-white/70 bg-white/75 px-3 py-2.5 text-center shadow-soft sm:block" : "hidden rounded-lg border border-white/70 bg-white/75 px-4 py-3 text-center shadow-soft sm:block"}>
                  <p className="text-xs font-extrabold text-slate-500">최근 이력</p>
                  <p className={inModal ? "mt-0.5 text-base font-extrabold text-ink" : "mt-1 text-lg font-extrabold text-ink"}>{transactions.length}건</p>
                </div>
              </div>
            </div>

            <div className={statusSummaryClass}>
              <div className={inModal ? "rounded-lg border border-white/70 bg-white/80 px-3 py-3 shadow-soft" : "rounded-lg border border-white/70 bg-white/80 px-4 py-3 shadow-soft"}>
                <p className="text-xs font-extrabold text-slate-500">{currentRentalIsDelivery ? "현재 납품처" : "현재 대여자"}</p>
                <p className={inModal ? "mt-1 min-h-7 break-words text-xl font-extrabold leading-tight text-ink" : "mt-1 min-h-8 break-words text-2xl font-extrabold text-ink"}>{device.current_borrower || (canRent ? "대여 가능" : "-")}</p>
              </div>
              <div className={inModal ? "rounded-lg border border-white/70 bg-white/80 px-3 py-3 shadow-soft" : "rounded-lg border border-white/70 bg-white/80 px-4 py-3 shadow-soft"}>
                <p className="text-xs font-extrabold text-slate-500">소속/부서</p>
                <p className={inModal ? "mt-1 min-h-7 break-words text-base font-extrabold leading-tight text-ink" : "mt-1 min-h-8 break-words text-lg font-extrabold text-ink"}>{currentRentalOrgDepartment || "-"}</p>
              </div>
              <div className={inModal ? "rounded-lg border border-white/70 bg-white/80 px-3 py-3 shadow-soft" : "rounded-lg border border-white/70 bg-white/80 px-4 py-3 shadow-soft"}>
                <p className="text-xs font-extrabold text-slate-500">{currentRentalIsDelivery ? "납품일" : "대여일"}</p>
                <p className={inModal ? "mt-1 min-h-7 break-words text-base font-extrabold leading-tight text-ink" : "mt-1 min-h-8 break-words text-lg font-extrabold text-ink"}>{formatDate(device.borrowed_at || currentRental?.rented_at)}</p>
              </div>
            </div>

            <div className={rentalMetricGridClass}>
              <RentalMetric label="연락처" value={currentRental?.user_contact} />
              <RentalMetric label="목적/사유" value={currentRental?.purpose} />
              <RentalMetric label={currentRentalIsDelivery ? "납품 장소" : "대여 장소"} value={currentRentalPlace} />
            </div>

            <div className={inModal ? "mt-3 rounded-lg border border-white/70 bg-white/75 px-3 py-3" : "mt-4 rounded-lg border border-white/70 bg-white/75 px-4 py-3"}>
              <p className="text-sm font-extrabold text-slate-500">메모</p>
              <p className={inModal ? "mt-1 whitespace-pre-wrap break-words text-sm font-extrabold leading-6 text-ink" : "mt-1 whitespace-pre-wrap text-base font-extrabold leading-7 text-ink"}>{currentRentalMemo || (device.status === "AVAILABLE" ? "대여 가능한 상태입니다." : "등록된 메모가 없습니다.")}</p>
            </div>
          </div>

          <div className="grid gap-3 border-t border-line bg-white px-3 py-3 xl:hidden">
            <section className="rounded-lg border border-line bg-[#f7f7fd] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="page-kicker">Info</p>
                  <h2 className="section-title">기본 정보</h2>
                </div>
                <button className="btn-secondary h-9 px-3 text-xs" type="button" onClick={() => setBasicOpen(true)}>
                  <Info size={15} />
                  상세
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {mobileInfoItems.map(([label, value]) => (
                  <CompactInfoTile key={label} label={label} value={value} className={label === "위치" ? "col-span-2" : ""} />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-line bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="page-kicker">Photos</p>
                  <h2 className="section-title">장비 사진</h2>
                </div>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-500">{devicePhotos.length}장</span>
              </div>
              {devicePhotos.length ? (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {devicePhotos.slice(0, 4).map((path, index) => (
                    <button
                      key={`mobile-photo-${path}-${index}`}
                      type="button"
                      className="relative aspect-square overflow-hidden rounded-lg border border-line bg-slate-100"
                      onClick={() =>
                        setPhotoViewer({
                          paths: devicePhotos,
                          index,
                          title: "장비 사진",
                          description: `${displayName} · ${device.device_id}`
                        })
                      }
                      aria-label={`장비 사진 ${index + 1} 보기`}
                    >
                      <img src={path} alt={`장비 사진 ${index + 1}`} className="h-full w-full object-cover" />
                      {index === 3 && devicePhotos.length > 4 ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-ink/55 text-sm font-extrabold text-white">+{devicePhotos.length - 4}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">등록된 장비 사진이 없습니다.</p>
              )}
            </section>
          </div>

          <div className="border-t border-line bg-white text-ink">
            <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="page-kicker">Activity</p>
                <h2 className="section-title">최근 이력</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-secondary h-9 px-3 text-xs" type="button" onClick={() => setSummaryOpen(true)} disabled={!transactions.length}>
                  <ListChecks size={15} />
                  요약 보기
                </button>
                <span className="inline-flex w-fit items-center rounded-lg border border-line bg-white px-3 py-1 text-xs font-extrabold text-slate-600">
                  총 {transactions.length}건
                </span>
                {transactions.length > recentPageSize ? (
                  <div className="hidden items-center gap-1 lg:flex">
                    <button className="btn-secondary h-9 w-9 p-0" type="button" onClick={() => moveRecentPage(-1)} aria-label="이전 이력">
                      <ChevronLeft size={17} />
                    </button>
                    <span className="min-w-12 text-center text-xs font-extrabold text-slate-500">
                      {safeRecentPage + 1}/{recentPageCount}
                    </span>
                    <button className="btn-secondary h-9 w-9 p-0" type="button" onClick={() => moveRecentPage(1)} aria-label="다음 이력">
                      <ChevronRight size={17} />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            {transactions.length ? (
              <>
                <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2 sm:gap-3 sm:px-4 sm:pb-4 xl:hidden">
                  {transactions.slice(0, recentPageSize).map((row) => (
                    <RecentTransactionCard
                      key={`${row.transaction_id}-mobile`}
                      row={row}
                      className="w-full"
                      onOpenPhoto={openPhotoViewer}
                      canDelete={isAdmin}
                      deleteBusy={transactionDeleteBusy}
                      onDelete={deleteTransaction}
                    />
                  ))}
                </div>
                <div className="hidden gap-3 px-5 pb-5 xl:grid xl:grid-cols-2 2xl:grid-cols-4">
                  {pagedTransactions.map((row) => (
                    <RecentTransactionCard key={row.transaction_id} row={row} onOpenPhoto={openPhotoViewer} canDelete={isAdmin} deleteBusy={transactionDeleteBusy} onDelete={deleteTransaction} />
                  ))}
                </div>
              </>
            ) : (
              <div className="px-5 pb-5">
                <EmptyState title="이력이 없습니다." />
              </div>
            )}
          </div>
        </section>

        <aside className={asideClass}>
          <section className="panel p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">QR 코드</h2>
              <button className="btn-secondary h-10 px-3" type="button" onClick={() => downloadQrImage(device.device_id, qrStyle)}>
                <Download size={16} />
                다운로드
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["plain", "1"],
                ["label", "2"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`h-10 rounded-lg text-sm font-extrabold transition ${
                    qrStyle === value ? "bg-brand text-white shadow-soft" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  onClick={() => setQrStyle(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex h-48 items-center justify-center rounded-lg border border-line bg-slate-50 p-3 sm:mt-4 sm:h-56">
              <img
                src={qrImageUrl(device.device_id, qrStyle)}
                alt={`${device.device_id} QR 코드`}
                className={`${qrStyle === "label" ? "max-h-16 w-full max-w-[360px]" : "h-44 w-44"} rounded-lg bg-white object-contain`}
              />
            </div>
          </section>

          <section className="panel hidden p-4 xl:block">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">기본 정보</h2>
              <button className="btn-secondary h-10 px-3" type="button" onClick={() => setBasicOpen(true)}>
                <Info size={16} />
                상세보기
              </button>
            </div>
            <dl className="mt-3">
              <InfoItem label="분류" value={device.category} />
              <InfoItem label="기존 장비번호" value={device.legacy_device_id} />
              <InfoItem label="모델명" value={device.model_name} />
              {isLaptop ? (
                <>
                  <InfoItem label="램 용량" value={device.ram_capacity} />
                  <InfoItem label="저장장치 용량" value={device.storage_capacity} />
                  <InfoItem label="CPU" value={device.cpu} />
                  <InfoItem label="GPU" value={device.gpu} />
                  <InfoItem label="Windows 사양" value={device.windows_spec} />
                </>
              ) : null}
              <InfoItem label="보관위치" value={device.location} />
            </dl>
          </section>

          <section className="panel hidden p-4 xl:block">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">장비 사진</h2>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-500">{devicePhotos.length}장</span>
            </div>
            {devicePhotos.length ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {devicePhotos.map((path, index) => (
                  <button
                    key={`${path}-${index}`}
                    type="button"
                    className="aspect-square overflow-hidden rounded-lg border border-line bg-slate-100 transition hover:border-brand hover:ring-4 hover:ring-[#e5e1ff]"
                    onClick={() =>
                      setPhotoViewer({
                        paths: devicePhotos,
                        index,
                        title: "장비 사진",
                        description: `${displayName} · ${device.device_id}`
                      })
                    }
                    title="사진 크게 보기"
                  >
                    <img src={path} alt={`장비 사진 ${index + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">등록된 장비 사진이 없습니다.</p>
            )}
          </section>
        </aside>
      </div>

      <BasicInfoModal
        device={basicOpen ? device : null}
        photos={devicePhotos}
        onClose={() => setBasicOpen(false)}
        onOpenPhoto={(index) =>
          setPhotoViewer({
            paths: devicePhotos,
            index,
            title: "장비 사진",
            description: `${device.device_name} · ${device.device_id}`
          })
        }
      />
      <HistorySummaryModal
        rows={summaryOpen ? transactions : null}
        onClose={() => setSummaryOpen(false)}
      />
      <DeviceProcessModal
        key={`${device.device_id}-${processMode}`}
        device={device}
        mode={processMode}
        currentTransaction={currentRental}
        onClose={() => setProcessMode("")}
        onDone={async () => {
          await load();
          await onChanged?.();
        }}
      />
      {disposeOpen ? (
        <ReasonModal
          title="장비 폐기 처리"
          description="폐기 처리 후에는 장비 상태가 폐기로 변경됩니다. 삭제는 폐기 처리된 장비에서만 별도로 진행할 수 있습니다."
          label="폐기 사유"
          submitLabel="폐기 처리"
          danger
          busy={actionBusy}
          onClose={() => setDisposeOpen(false)}
          onSubmit={dispose}
        />
      ) : null}
      {statusActionConfig ? (
        <ReasonModal
          title={statusActionConfig.title}
          description={statusActionConfig.description}
          label={statusActionConfig.label}
          submitLabel={statusActionConfig.submitLabel}
          danger={statusActionConfig.danger}
          allowPhotos
          busy={actionBusy}
          onClose={() => setStatusAction(null)}
          onSubmit={submitStatusAction}
        />
      ) : null}
      {deleteOpen ? (
        <DeleteConfirmModal
          busy={actionBusy}
          onClose={() => setDeleteOpen(false)}
          onConfirm={deleteDevice}
        />
      ) : null}
      <PhotoViewer viewer={photoViewer} onClose={() => setPhotoViewer(null)} onMove={movePhoto} />
    </div>
  );
}

export default function DeviceDetail() {
  const { deviceId } = useParams();
  return <DeviceDetailContent deviceId={deviceId} />;
}
