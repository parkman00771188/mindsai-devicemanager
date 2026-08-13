import { Pencil, Save, Trash2, X } from "lucide-react";
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

function dateTimeInputValue(value) {
  return String(value || "").replace(" ", "T").slice(0, 16);
}

function placeLabel(actionType) {
  return {
    RENT: "대여 장소",
    DELIVERY: "납품 장소",
    RETURN: "반납 장소",
    RECOVERY: "회수 장소"
  }[actionType] || "처리 장소";
}

function editFormFromRow(row = {}) {
  return {
    created_at: dateTimeInputValue(row.created_at),
    rented_at: String(row.rented_at || "").slice(0, 10),
    expected_return_at: String(row.expected_return_at || "").slice(0, 10),
    returned_at: String(row.returned_at || "").slice(0, 10),
    user_name: row.user_name || "",
    user_organization: row.user_organization || "",
    user_department: row.user_department || "",
    user_position: row.user_position || "",
    user_contact: row.user_contact || "",
    purpose: row.purpose || "",
    place: transactionPlace(row),
    condition_status: row.condition_status || "",
    issue_description: row.issue_description || "",
    handled_by: row.handled_by || "",
    memo: transactionMemo(row)
  };
}

function memoWithPlace(actionType, place, memo) {
  return [place ? `${placeLabel(actionType)}: ${place}` : "", memo].filter(Boolean).join(" / ");
}

export default function TransactionDetailModal({ row, onClose, onOpenPhoto, canDelete = false, canEdit = false, deleteBusy = false, updateBusy = false, onDelete, onUpdate, onDeviceChanged }) {
  const [deviceDetailId, setDeviceDetailId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(() => editFormFromRow(row));
  const [editError, setEditError] = useState("");

  useEffect(() => {
    setDeviceDetailId(null);
    setEditing(false);
    setEditError("");
    setEditForm(editFormFromRow(row));
  }, [row?.transaction_id, row?.created_at, row?.rented_at, row?.expected_return_at, row?.returned_at, row?.user_name, row?.user_organization, row?.user_department, row?.user_position, row?.user_contact, row?.purpose, row?.condition_status, row?.issue_description, row?.handled_by, row?.memo]);

  if (!row) return null;

  const canDeleteTransaction = canDelete && isAdminUser(getCurrentUser());
  const canEditTransaction = canEdit && isAdminUser(getCurrentUser());
  const photos = splitPhotoPaths(row.photo_paths);
  const isDelivery = row.action_type === "DELIVERY";
  const isRecovery = row.action_type === "RECOVERY";
  const isReturn = row.action_type === "RETURN";
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

  function updateEditField(field, value) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  async function saveChanges() {
    setEditError("");
    try {
      const { place, ...changes } = editForm;
      await onUpdate?.(row, { ...changes, memo: memoWithPlace(row.action_type, place.trim(), changes.memo.trim()) });
      setEditing(false);
    } catch (error) {
      setEditError(error.message || "이력을 수정하지 못했습니다.");
    }
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
          <DetailItem label="장비 소유 소속" value={row.device_owner_organization || row.owner_organization} />
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

        {editing ? (
          <section className="mt-5 rounded-lg border border-[#c9c4ff] bg-[#f7f7ff] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-ink">이력 수정</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">장비번호와 처리 유형을 제외한 이력 정보를 변경할 수 있습니다.</p>
              </div>
              <button className="btn-secondary h-9 w-9 p-0" type="button" onClick={() => setEditing(false)} disabled={updateBusy} aria-label="이력 수정 닫기">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="field-label">처리일시</span>
                <input className="input" type="datetime-local" value={editForm.created_at} onChange={(event) => updateEditField("created_at", event.target.value)} required />
              </label>
              <label>
                <span className="field-label">{isDelivery ? "납품일" : "대여일"}</span>
                <input className="input" type="date" value={editForm.rented_at} onChange={(event) => updateEditField("rented_at", event.target.value)} />
              </label>
              <label>
                <span className="field-label">예상 반납일</span>
                <input className="input" type="date" value={editForm.expected_return_at} onChange={(event) => updateEditField("expected_return_at", event.target.value)} />
              </label>
              <label>
                <span className="field-label">{isRecovery ? "회수일" : isReturn ? "반납일" : "실제 반납일"}</span>
                <input className="input" type="date" value={editForm.returned_at} onChange={(event) => updateEditField("returned_at", event.target.value)} />
              </label>
              <label>
                <span className="field-label">{isDelivery ? "납품 대상" : isRecovery ? "회수 대상" : "사용자"}</span>
                <input className="input" value={editForm.user_name} onChange={(event) => updateEditField("user_name", event.target.value)} />
              </label>
              <label>
                <span className="field-label">소속</span>
                <input className="input" value={editForm.user_organization} onChange={(event) => updateEditField("user_organization", event.target.value)} />
              </label>
              <label>
                <span className="field-label">부서</span>
                <input className="input" value={editForm.user_department} onChange={(event) => updateEditField("user_department", event.target.value)} />
              </label>
              <label>
                <span className="field-label">직책</span>
                <input className="input" value={editForm.user_position} onChange={(event) => updateEditField("user_position", event.target.value)} />
              </label>
              <label>
                <span className="field-label">연락처</span>
                <input className="input" value={editForm.user_contact} onChange={(event) => updateEditField("user_contact", event.target.value)} />
              </label>
              <label>
                <span className="field-label">처리자 ID</span>
                <input className="input" value={editForm.handled_by} onChange={(event) => updateEditField("handled_by", event.target.value)} />
              </label>
              <label>
                <span className="field-label">목적/사유</span>
                <input className="input" value={editForm.purpose} onChange={(event) => updateEditField("purpose", event.target.value)} />
              </label>
              <label>
                <span className="field-label">{placeLabel(row.action_type)}</span>
                <input className="input" value={editForm.place} onChange={(event) => updateEditField("place", event.target.value)} />
              </label>
              <label className="sm:col-span-2">
                <span className="field-label">상태/점검 결과</span>
                <input className="input" value={editForm.condition_status} onChange={(event) => updateEditField("condition_status", event.target.value)} />
              </label>
              <label className="sm:col-span-2">
                <span className="field-label">메모</span>
                <textarea className="textarea min-h-24" value={editForm.memo} onChange={(event) => updateEditField("memo", event.target.value)} />
              </label>
              <label className="sm:col-span-2">
                <span className="field-label">특이사항</span>
                <textarea className="textarea min-h-24" value={editForm.issue_description} onChange={(event) => updateEditField("issue_description", event.target.value)} />
              </label>
            </div>
            {editError ? <p className="mt-3 text-sm font-extrabold text-red-600">{editError}</p> : null}
            <div className="mt-4 flex justify-end">
              <button className="btn-primary" type="button" onClick={saveChanges} disabled={updateBusy || !editForm.created_at}>
                <Save size={18} />
                {updateBusy ? "저장 중" : "수정 저장"}
              </button>
            </div>
          </section>
        ) : null}

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
          {canEditTransaction && !editing ? (
            <button className="btn-secondary" type="button" onClick={() => setEditing(true)} disabled={deleteBusy || updateBusy}>
              <Pencil size={18} />
              수정
            </button>
          ) : null}
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
