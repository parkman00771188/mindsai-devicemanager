import {
  CalendarCheck2,
  Clock3,
  FileText,
  Flag,
  Pencil,
  Save,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getCurrentUser, isAdminUser } from "../auth.js";
import { actionLabel, deviceTitle, formatDate, formatDateTime, splitPhotoPaths, transactionMemo, transactionNumber, transactionPlace } from "../constants.js";
import DeviceDetailModal from "./DeviceDetailModal.jsx";
import ActionBadge from "./ActionBadge.jsx";

function DetailItem({ label, value, preserveWhitespace = false, className = "" }) {
  return (
    <div className={`grid min-w-0 grid-cols-[6.25rem_minmax(0,1fr)] gap-3 border-b border-dashed border-line py-2 last:border-b-0 sm:grid-cols-[7.25rem_minmax(0,1fr)] ${className}`}>
      <dt className="whitespace-nowrap text-xs font-extrabold text-slate-500">{label}</dt>
      <dd className={`min-w-0 break-words text-left text-sm font-extrabold text-ink ${preserveWhitespace ? "whitespace-pre-wrap" : ""}`}>{value || "-"}</dd>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, children }) {
  return (
    <div className="flex min-h-[5.5rem] min-w-0 items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-3 shadow-[0_5px_16px_rgba(53,76,128,0.05)] sm:px-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-brand">
        <Icon size={20} strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-extrabold text-slate-500">{label}</p>
        <div className="mt-1 min-w-0 break-words text-sm font-extrabold text-ink sm:text-[15px]">{children || "-"}</div>
      </div>
    </div>
  );
}

function actionDateMeta(row = {}) {
  const definitions = {
    RENT: ["대여일", row.rented_at],
    DELIVERY: ["납품일", row.rented_at],
    RETURN: ["반납일", row.returned_at],
    RECOVERY: ["회수일", row.returned_at]
  };
  const [label, value] = definitions[row.action_type] || ["처리일", row.created_at];
  return { label, value: formatDate(value || row.created_at) };
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
  const source = row || {};
  return {
    created_at: dateTimeInputValue(source.created_at),
    rented_at: String(source.rented_at || "").slice(0, 10),
    expected_return_at: String(source.expected_return_at || "").slice(0, 10),
    returned_at: String(source.returned_at || "").slice(0, 10),
    user_name: source.user_name || "",
    user_organization: source.user_organization || "",
    user_department: source.user_department || "",
    user_position: source.user_position || "",
    user_contact: source.user_contact || "",
    purpose: source.purpose || "",
    place: transactionPlace(source),
    condition_status: source.condition_status || "",
    issue_description: source.issue_description || "",
    handled_by: source.handled_by || "",
    memo: transactionMemo(source)
  };
}

function memoWithPlace(actionType, place, memo) {
  return [place ? `${placeLabel(actionType)}: ${place}` : "", memo].filter(Boolean).join(" / ");
}

function detailMemo(row = {}) {
  const notes = [transactionMemo(row), row.device_memo]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(notes)].join("\n");
}

export default function TransactionDetailModal({ row, onClose, onOpenPhoto, canDelete = false, canEdit = false, deleteBusy = false, updateBusy = false, initialEditing = false, nested = false, onDelete, onUpdate, onDeviceChanged }) {
  const [deviceDetailId, setDeviceDetailId] = useState(null);
  const [editing, setEditing] = useState(initialEditing);
  const [editForm, setEditForm] = useState(() => editFormFromRow(row));
  const [editError, setEditError] = useState("");

  useEffect(() => {
    setDeviceDetailId(null);
    setEditing(initialEditing);
    setEditError("");
    setEditForm(editFormFromRow(row));
  }, [row?.transaction_id, initialEditing]);

  useEffect(() => {
    if (!row) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [row?.transaction_id]);

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
  const actionDate = actionDateMeta(row);
  const targetLabel = isDelivery ? "납품 대상" : isRecovery ? "회수 대상" : "사용자";
  function openDeviceDetail() {
    if (!row.device_id) return;
    setDeviceDetailId(row.device_id);
  }

  const deviceFilterButton = row.device_id ? (
    <button
      className="rounded-lg bg-[#eef4ff] px-2.5 py-1 text-brand transition hover:bg-[#dbe7ff]"
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

  function openEditor() {
    setEditForm(editFormFromRow(row));
    setEditError("");
    setEditing(true);
  }

  function closeEditor() {
    if (initialEditing) onClose();
    else setEditing(false);
  }

  async function saveChanges(event) {
    event.preventDefault();
    setEditError("");
    try {
      const { place, ...changes } = editForm;
      await onUpdate?.(row, { ...changes, memo: memoWithPlace(row.action_type, place.trim(), changes.memo.trim()) });
      closeEditor();
    } catch (error) {
      setEditError(error.message || "이력을 수정하지 못했습니다.");
    }
  }

  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center overflow-hidden bg-slate-950/60 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-[2px] sm:px-5 sm:py-6 ${nested ? "z-[110]" : "z-[60]"}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="max-h-full w-full max-w-6xl overflow-auto overscroll-contain rounded-2xl border border-white/70 bg-[#fbfcff] p-4 shadow-[0_28px_80px_rgba(15,23,42,0.3)] sm:max-h-[94vh] sm:p-6" onClick={(event) => event.stopPropagation()}>
        <header className="relative grid min-w-0 gap-4 pr-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <div className="min-w-0 self-center">
            <ActionBadge action={row.action_type} />
            <h2 className="mt-2 break-words text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-[28px]">{deviceTitle(row)}</h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-extrabold">
              {deviceFilterButton}
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <Clock3 size={16} className="text-slate-400" />
                {formatDateTime(row.created_at)}
              </span>
            </div>
          </div>
          <dl className="grid min-w-0 gap-3 rounded-xl border border-line bg-white/70 px-4 py-3 lg:border-y-0 lg:border-r-0 lg:border-l lg:bg-transparent lg:py-1 lg:pl-6">
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
              <dt className="text-xs font-extrabold text-slate-500">출납번호</dt>
              <dd className="text-sm font-extrabold text-brand">{transactionNumber(row)}</dd>
            </div>
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3">
              <dt className="pt-0.5 text-xs font-extrabold text-slate-500">처리자</dt>
              <dd className="min-w-0 break-words text-sm font-extrabold leading-5 text-ink">{handledByDisplay || "-"}</dd>
            </div>
          </dl>
          <button className="btn-secondary absolute right-0 top-0 h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="상세 닫기">
            <X size={18} />
          </button>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard icon={CalendarCheck2} label="상태">
            <ActionBadge action={row.action_type} size="large" />
          </SummaryCard>
          <SummaryCard icon={UserRound} label={targetLabel}>{row.user_name || "-"}</SummaryCard>
          <SummaryCard icon={CalendarCheck2} label={actionDate.label}>{actionDate.value}</SummaryCard>
          <SummaryCard icon={Flag} label="목적/사유">{row.purpose || row.issue_description || "-"}</SummaryCard>
        </div>

        <section className="mt-4 min-w-0 rounded-xl border border-line bg-white px-4 py-3 shadow-[0_5px_16px_rgba(53,76,128,0.05)]">
          <div className="flex items-center gap-2 border-b border-line pb-2.5 text-brand">
            <CalendarCheck2 size={18} strokeWidth={1.9} />
            <h3 className="text-sm font-extrabold">{actionLabel(row.action_type)} 정보</h3>
          </div>

          <dl className="grid gap-x-8 sm:grid-cols-2">
            <DetailItem
              label="장비번호"
              value={row.device_id ? (
                <button className="text-left text-brand underline-offset-4 hover:underline" type="button" onClick={openDeviceDetail}>
                  {row.device_id}
                </button>
              ) : "-"}
            />
            <DetailItem label="기존 장비번호" value={row.device_legacy_device_id || row.legacy_device_id} />
            <DetailItem label="소속 / 직책" value={[borrowerOrgDepartment, row.user_position].filter(Boolean).join(" / ")} />
            <DetailItem label={targetLabel} value={row.user_name} />
            <DetailItem label="연락처" value={row.user_contact} />
            <DetailItem label={actionDate.label} value={actionDate.value} />
            <DetailItem label="목적/사유" value={row.purpose} />
            {row.rented_at ? <DetailItem label={isDelivery ? "납품일" : "대여일"} value={formatDate(row.rented_at)} /> : null}
            {row.expected_return_at ? <DetailItem label="예상 반납일" value={formatDate(row.expected_return_at)} /> : null}
            <DetailItem label="처리자" value={handledByDisplay} className="sm:col-span-2" />
          </dl>

          <div className="mt-2 flex items-center gap-2 border-y border-line py-2.5 text-brand">
            <FileText size={17} strokeWidth={1.9} />
            <h4 className="text-sm font-extrabold">추가 정보</h4>
          </div>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <DetailItem label="메모" value={detailMemo(row)} preserveWhitespace className="sm:col-span-2" />
            <DetailItem label="특이사항" value={row.issue_description} preserveWhitespace className="sm:col-span-2" />
            <DetailItem label="상태/점검 결과" value={row.condition_status} preserveWhitespace className="sm:col-span-2" />
          </dl>
        </section>

        {photos.length ? (
          <section className="mt-3 rounded-xl border border-line bg-white p-4 shadow-[0_5px_16px_rgba(53,76,128,0.05)]">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
              <h3 className="text-sm font-extrabold text-brand">첨부 사진</h3>
              <span className="rounded-lg bg-[#eef4ff] px-2.5 py-1 text-xs font-extrabold text-brand">{photos.length}장</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
              {photos.map((path, index) => (
                <button
                  key={`${row.transaction_id}-${path}-${index}`}
                  type="button"
                  onClick={() => onOpenPhoto?.(photos, index, row)}
                  className="aspect-square overflow-hidden rounded-lg border border-line bg-slate-100 transition hover:border-brand hover:ring-4 hover:ring-[#dbe7ff]"
                  title="사진 크게 보기"
                >
                  <img src={path} alt={`${actionLabel(row.action_type)} 사진 ${index + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-row-reverse gap-2 border-t border-line bg-[#fbfcff]/95 px-4 pt-3 backdrop-blur sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
          <button className="btn-secondary min-w-0 flex-1 px-2 text-xs sm:flex-none sm:px-4 sm:text-sm" type="button" onClick={onClose} disabled={deleteBusy}>
            닫기
          </button>
          {canEditTransaction && !editing ? (
            <button className="btn-secondary min-w-0 flex-1 border-[#b9d1ff] px-2 text-xs text-brand hover:bg-[#eef4ff] sm:flex-none sm:px-4 sm:text-sm" type="button" onClick={openEditor} disabled={deleteBusy || updateBusy}>
              <Pencil size={16} />
              수정
            </button>
          ) : null}
          {canDeleteTransaction ? (
            <button className="btn min-w-0 flex-1 border border-[#ff9d9d] bg-white px-2 text-xs text-[#ef4444] hover:bg-[#fff0f0] sm:flex-none sm:px-4 sm:text-sm" type="button" onClick={requestDelete} disabled={deleteBusy}>
              <Trash2 size={16} />
              {deleteBusy ? "삭제 중" : "이력 삭제"}
            </button>
          ) : null}
        </div>
      </section>
      {editing ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center overflow-hidden bg-slate-950/45 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-[2px] sm:p-6"
          onClick={() => {
            if (!updateBusy) closeEditor();
          }}
        >
          <section
            className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-[#f8fafc] shadow-[0_28px_80px_rgba(15,23,42,0.35)] sm:max-h-[92vh]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line bg-white px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <p className="page-kicker">History Edit</p>
                <h3 className="mt-1 text-xl font-extrabold text-ink">이력 수정</h3>
                <p className="mt-1 truncate text-xs font-semibold text-slate-500 sm:text-sm">출납 {transactionNumber(row)} · {row.device_id || deviceTitle(row)}</p>
              </div>
              <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={closeEditor} disabled={updateBusy} aria-label="이력 수정 닫기">
                <X size={18} />
              </button>
            </header>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={saveChanges}>
              <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 sm:p-5">
                <p className="mb-4 rounded-lg bg-[#eef4ff] px-3 py-2 text-xs font-bold leading-5 text-brand">장비번호와 처리 유형을 제외한 이력 정보를 변경할 수 있습니다.</p>
                <div className="grid gap-3 sm:grid-cols-2">
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
              </div>

              <footer className="flex shrink-0 justify-end gap-2 border-t border-line bg-white px-4 py-3 sm:px-5">
                <button className="btn-secondary" type="button" onClick={closeEditor} disabled={updateBusy}>취소</button>
                <button className="btn-primary" disabled={updateBusy || !editForm.created_at}>
                  <Save size={18} />
                  {updateBusy ? "저장 중" : "수정 저장"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
      <DeviceDetailModal deviceId={deviceDetailId} onClose={() => setDeviceDetailId(null)} onChanged={onDeviceChanged} />
    </div>,
    document.body
  );
}
