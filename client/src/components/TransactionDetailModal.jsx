import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentUser, isAdminUser } from "../auth.js";
import { actionLabel, deviceTitle, formatDate, formatDateTime, splitPhotoPaths, transactionMemo, transactionNumber, transactionPlace } from "../constants.js";
import DeviceDetailModal from "./DeviceDetailModal.jsx";
import StatusBadge from "./StatusBadge.jsx";

function DetailItem({ label, value, preserveWhitespace = false, className = "" }) {
  return (
    <div className={`grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] gap-3 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[5.75rem_minmax(0,1fr)] ${className}`}>
      <dt className="whitespace-nowrap text-xs font-extrabold text-slate-500">{label}</dt>
      <dd className={`min-w-0 break-words text-left text-sm font-extrabold text-ink ${preserveWhitespace ? "whitespace-pre-wrap" : ""}`}>{value || "-"}</dd>
    </div>
  );
}

export default function TransactionDetailModal({ row, onClose, onOpenPhoto, canDelete = false, deleteBusy = false, onDelete, onDeviceChanged }) {
  const [deviceDetailId, setDeviceDetailId] = useState(null);

  useEffect(() => {
    setDeviceDetailId(null);
  }, [row?.transaction_id]);

  if (!row) return null;

  const canDeleteTransaction = canDelete && isAdminUser(getCurrentUser());
  const photos = splitPhotoPaths(row.photo_paths);
  const isDelivery = row.action_type === "DELIVERY";
  const isRecovery = row.action_type === "RECOVERY";
  const borrowerOrgDepartment =
    row.user_org_department ||
    row.borrower_org_department ||
    [row.user_organization, row.user_department].filter(Boolean).join(" / ") ||
    row.user_department;
  const handledByDisplay =
    row.handled_by_display ||
    [row.handled_by_name, row.handled_by_organization, row.handled_by_department].filter(Boolean).join(" / ") ||
    row.handled_by;
  function openDeviceDetail() {
    if (!row.device_id) return;
    setDeviceDetailId(row.device_id);
  }

  const deviceFilterButton = row.device_id ? (
    <button
      className="rounded-lg bg-[#f2f0ff] px-2.5 py-1 text-brand transition hover:bg-[#e7e2ff]"
      type="button"
      onClick={openDeviceDetail}
    >
      {row.device_id}
    </button>
  ) : (
    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-500">장비번호 없음</span>
  );

  function requestDelete() {
    if (!window.confirm(`출납 ${transactionNumber(row)} 이력을 삭제할까요? 삭제 후 최근 이력 목록에서 사라집니다.`)) return;
    onDelete?.(row);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-lg bg-white p-5 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="page-kicker">{actionLabel(row.action_type)}</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">{deviceTitle(row)}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold">
              {deviceFilterButton}
              <span className="text-slate-500">{formatDateTime(row.created_at)}</span>
            </div>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="상세 닫기">
            <X size={18} />
          </button>
        </div>

        <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
          <DetailItem label="출납번호" value={transactionNumber(row)} />
          <div className="grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] gap-3 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[5.75rem_minmax(0,1fr)]">
            <dt className="whitespace-nowrap text-xs font-extrabold text-slate-500">장비번호</dt>
            <dd className="min-w-0 break-words text-left text-sm font-extrabold">
              {row.device_id ? (
                <button className="text-left text-brand underline-offset-4 hover:underline" type="button" onClick={openDeviceDetail}>
                  {row.device_id}
                </button>
              ) : "-"}
            </dd>
          </div>
          <DetailItem label={isDelivery ? "납품 대상" : isRecovery ? "회수 대상" : "사용자"} value={row.user_name} />
          <DetailItem label="기존 장비번호" value={row.device_legacy_device_id || row.legacy_device_id} />
          <DetailItem label="소속/부서" value={borrowerOrgDepartment} />
          <DetailItem label="연락처" value={row.user_contact} />
          <DetailItem label="목적/사유" value={row.purpose} />
          <DetailItem label="처리 장소" value={transactionPlace(row)} />
          <DetailItem label={isDelivery ? "납품일" : "대여일"} value={formatDate(row.rented_at)} />
          <DetailItem label={isRecovery ? "회수일" : "실제 반납일"} value={formatDate(row.returned_at)} />
          <DetailItem label="처리자" value={handledByDisplay} />
          <div className="grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] gap-3 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[5.75rem_minmax(0,1fr)]">
            <dt className="whitespace-nowrap text-xs font-extrabold text-slate-500">현재 상태</dt>
            <dd className="min-w-0 text-left">
              <StatusBadge status={row.device_status || row.after_status} />
            </dd>
          </div>
          <DetailItem label="메모" value={transactionMemo(row)} preserveWhitespace className="sm:col-span-2" />
          <DetailItem label="특이사항" value={row.issue_description} preserveWhitespace className="sm:col-span-2" />
        </dl>

        {photos.length ? (
          <div className="mt-5">
            <h3 className="text-sm font-extrabold text-ink">첨부 사진</h3>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {photos.map((path, index) => (
                <button
                  key={`${row.transaction_id}-${path}-${index}`}
                  type="button"
                  onClick={() => onOpenPhoto(photos, index, row)}
                  className="aspect-square overflow-hidden rounded-lg border border-line bg-slate-100 transition hover:border-cyan-300"
                  title="사진 크게 보기"
                >
                  <img src={path} alt={`${actionLabel(row.action_type)} 사진 ${index + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={deleteBusy}>
            닫기
          </button>
          {canDeleteTransaction ? (
            <button className="btn-danger" type="button" onClick={requestDelete} disabled={deleteBusy}>
              <Trash2 size={18} />
              {deleteBusy ? "삭제 중" : "이력 삭제"}
            </button>
          ) : null}
        </div>
      </section>
      <DeviceDetailModal deviceId={deviceDetailId} onClose={() => setDeviceDetailId(null)} onChanged={onDeviceChanged} />
    </div>
  );
}
