import {
  Building2,
  Check,
  ClipboardList,
  DatabaseBackup,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Layers3,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Tags,
  Trash2,
  UsersRound,
  UserRoundCog,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadUrl } from "../api/client.js";
import { getCurrentUser, isAdminUser, roleLabel } from "../auth.js";
import DeviceDetailModal from "../components/DeviceDetailModal.jsx";
import ProfilePhotoUploader from "../components/ProfilePhotoUploader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import { formatDate, formatPhoneNumber, statusLabel } from "../constants.js";

const emptyCategory = { category_name: "", prefix: "", memo: "" };
const emptyType = { category_id: "", type_name: "", type_prefix: "", memo: "" };
const emptyReason = { reason_type: "RENT", reason_text: "", memo: "" };
const emptyUserOption = { option_type: "DEPARTMENT", option_text: "", memo: "" };
const emptyInstitution = { institution_name: "", contact_person: "", contact: "", email: "", address: "", memo: "" };

const optionSections = [
  { type: "ORGANIZATION", field: "organization", label: "소속", title: "소속", caption: "회사, 법인, 사업부 단위로 관리합니다.", icon: Building2 },
  { type: "DEPARTMENT", field: "department", label: "부서", title: "부서", caption: "사용자가 속한 팀 또는 부서를 관리합니다.", icon: UsersRound },
  { type: "POSITION", field: "position", label: "직책", title: "직책", caption: "사원, 연구원, 팀장 등 직책을 관리합니다.", icon: UserRoundCog }
];

const tabs = [
  { id: "profile", label: "프로필 설정", icon: UserRoundCog, adminOnly: false },
  { id: "categories", label: "분류 관리", icon: Layers3, adminOnly: true },
  { id: "reasons", label: "사유 관리", icon: ClipboardList, adminOnly: true },
  { id: "user-options", label: "소속/부서/직책 관리", icon: Building2, adminOnly: true },
  { id: "institutions", label: "기관 관리", icon: Building2, adminOnly: true },
  { id: "excel", label: "엑셀 관리", icon: DatabaseBackup, adminOnly: true },
  { id: "paths", label: "저장 경로", icon: FolderOpen, adminOnly: true }
];

const reasonTypes = [
  ["RENT", "대여 사유"],
  ["DELIVERY", "납품 사유"],
  ["RETURN", "반납 사유"],
  ["RECOVERY", "회수 사유"]
];

function textCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), "ko", { numeric: true });
}

function optionMetaFor(type) {
  return optionSections.find((section) => section.type === type) || optionSections[1];
}

function optionTexts(userOptions, type) {
  return userOptions.filter((option) => option.option_type === type).map((option) => option.option_text).filter(Boolean);
}

function categoryPrefixForType(type, categories) {
  const category = categories.find((item) => item.category_id === type.category_id || item.category_name === type.category_name);
  return String(category?.prefix || "").trim();
}

function expectedDeviceIdForType(type, categories) {
  const categoryPrefix = categoryPrefixForType(type, categories);
  const typePrefix = String(type.type_prefix || "").trim();
  const prefix = [categoryPrefix, typePrefix].filter(Boolean).join("-");
  return prefix ? `${prefix}-001` : "-";
}


function Modal({ title, kicker, description, onClose, children, footer, maxWidth = "max-w-3xl" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <section className={`max-h-[92vh] w-full ${maxWidth} overflow-auto rounded-lg bg-white p-5 shadow-lift sm:p-6`} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div className="min-w-0">
            {kicker ? <p className="page-kicker">{kicker}</p> : null}
            <h2 className="mt-1 text-xl font-extrabold text-ink sm:text-2xl">{title}</h2>
            {description ? <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p> : null}
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5">{children}</div>
        {footer ? <div className="mt-5 border-t border-line pt-4">{footer}</div> : null}
      </section>
    </div>
  );
}

function Message({ message }) {
  if (!message) return null;
  const isError = message.type === "error";
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm font-extrabold ${isError ? "border-[#ffc8d6] bg-[#fff0f4] text-[#d84f71]" : "border-[#c7f1e9] bg-[#ecfbf7] text-[#1eb6a5]"}`}>
      {message.text}
    </div>
  );
}

function FieldLine({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <dt className="shrink-0 text-sm font-bold text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-extrabold text-ink">{value || "-"}</dd>
    </div>
  );
}

function DeviceCollectionBody({ devices, error, emptyText, busy, onOpenDetail, onDeleteDevice }) {
  if (error) {
    return <div className="rounded-lg border border-[#ffc8d6] bg-[#fff0f4] px-4 py-3 text-sm font-extrabold text-[#d84f71]">{error}</div>;
  }
  if (!devices) {
    return <div className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">장비를 불러오는 중입니다.</div>;
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-line bg-[#f7f7fd] px-4 py-3">
          <p className="text-xs font-extrabold text-slate-500">전체</p>
          <p className="mt-1 text-2xl font-extrabold text-ink">{devices.length}대</p>
        </div>
        <div className="rounded-lg border border-line bg-[#ecfbf7] px-4 py-3">
          <p className="text-xs font-extrabold text-slate-500">대여 가능</p>
          <p className="mt-1 text-2xl font-extrabold text-[#1eb6a5]">{devices.filter((device) => device.status === "AVAILABLE").length}대</p>
        </div>
        <div className="rounded-lg border border-line bg-[#f1efff] px-4 py-3">
          <p className="text-xs font-extrabold text-slate-500">대여/납품</p>
          <p className="mt-1 text-2xl font-extrabold text-brand">{devices.filter((device) => ["RENTED", "DELIVERED"].includes(device.status)).length}대</p>
        </div>
        <div className="rounded-lg border border-line bg-slate-100 px-4 py-3">
          <p className="text-xs font-extrabold text-slate-500">폐기</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-700">{devices.filter((device) => device.status === "DISPOSED").length}대</p>
        </div>
      </div>

      {devices.length ? (
        <>
          <div className="grid gap-2 xl:hidden">
            {devices.map((device) => (
              <div key={device.device_id} className="rounded-lg border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      className="block max-w-full truncate text-left text-base font-extrabold text-brand underline-offset-4 hover:underline"
                      type="button"
                      onClick={() => onOpenDetail(device.device_id)}
                    >
                      {device.device_id}
                    </button>
                    <p className="mt-1 truncate text-sm font-extrabold text-ink">{device.device_name || device.model_name || "-"}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">기존 장비번호: {device.legacy_device_id || "-"}</p>
                  </div>
                  <StatusBadge status={device.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <FieldLine label="보관위치" value={device.location} />
                  <FieldLine label="현재 사용자" value={device.current_borrower} />
                  <FieldLine label="모델명" value={device.model_name} />
                  <FieldLine label="메모" value={device.memo} />
                </div>
                {device.status === "DISPOSED" ? (
                  <button className="btn-danger mt-3 h-10 w-full" type="button" onClick={() => onDeleteDevice(device)} disabled={busy}>
                    <Trash2 size={16} />
                    {busy ? "삭제 중" : "폐기 장비 삭제"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-lg border border-line/70 xl:block">
            <table className="w-full table-fixed">
              <thead className="table-head">
                <tr>
                  <th className="w-36">장비번호</th>
                  <th className="w-40">기존 장비번호</th>
                  <th>장비명</th>
                  <th className="w-36">모델명</th>
                  <th className="w-28">현재 상태</th>
                  <th className="w-32">현재 사용자</th>
                  <th className="w-36">보관위치</th>
                  <th className="w-24 text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.device_id} className="hover:bg-slate-50">
                    <td className="table-cell font-extrabold text-brand">
                      <button
                        className="block max-w-full truncate text-left underline-offset-4 hover:underline"
                        type="button"
                        onClick={() => onOpenDetail(device.device_id)}
                      >
                        {device.device_id}
                      </button>
                    </td>
                    <td className="table-cell"><span className="block truncate">{device.legacy_device_id || "-"}</span></td>
                    <td className="table-cell font-extrabold text-ink"><span className="block truncate">{device.device_name || "-"}</span></td>
                    <td className="table-cell"><span className="block truncate">{device.model_name || "-"}</span></td>
                    <td className="table-cell"><StatusBadge status={device.status} /></td>
                    <td className="table-cell"><span className="block truncate">{device.current_borrower || "-"}</span></td>
                    <td className="table-cell"><span className="block truncate">{device.location || "-"}</span></td>
                    <td className="table-cell text-center">
                      {device.status === "DISPOSED" ? (
                        <button className="btn-danger h-9 w-9 p-0" type="button" onClick={() => onDeleteDevice(device)} disabled={busy} aria-label={`${device.device_id} 삭제`}>
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
          {emptyText}
        </div>
      )}
    </>
  );
}

function UnderlineTabs({ items, value, onChange }) {
  return (
    <div className="overflow-x-auto border-b border-line bg-white">
      <div className="flex min-w-max gap-8 px-5 pt-2">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`flex min-h-14 items-center border-b-[3px] px-1 pb-1 text-base font-extrabold transition ${
              value === item.value ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-ink"
            }`}
            onClick={() => onChange(item.value)}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className={`ml-2 rounded-lg px-2 py-0.5 text-xs ${value === item.value ? "bg-[#f2f0ff] text-brand" : "bg-slate-100 text-slate-500"}`}>
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function SegmentedTabs({ items, value, onChange }) {
  return (
    <div className="border-b border-line bg-[#f7f7fd] px-4 py-4">
      <div className="flex w-full flex-wrap gap-1 rounded-lg border border-line bg-white p-1 shadow-soft sm:inline-flex sm:w-auto">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-lg px-4 py-2 text-sm font-extrabold transition sm:min-w-28 sm:flex-none sm:px-5 ${
              value === item.value ? "bg-brand text-white shadow-lift" : "text-slate-600 hover:bg-[#f2f0ff] hover:text-brand"
            }`}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full border-2 transition ${
        checked ? "border-brand bg-brand shadow-soft" : "border-[#cfd8ff] bg-[#dce5ff]"
      } ${disabled ? "cursor-not-allowed opacity-60" : "hover:shadow-lift"}`}
    >
      <span
        className={`inline-block h-7 w-7 rounded-full bg-white shadow-lift transition ${
          checked ? "translate-x-7" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function CategoryForm({ value, categories = [], busy, submitLabel = "저장", onChange, onSubmit, onCancel, typeMode = false }) {
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      {typeMode ? (
        <label>
          <span className="field-label">분류 *</span>
          <select className="select" value={value.category_id} onChange={(event) => onChange({ ...value, category_id: event.target.value })} required>
            <option value="">분류 선택</option>
            {categories.map((category) => (
              <option key={category.category_id} value={category.category_id}>
                {category.category_name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label>
        <span className="field-label">{typeMode ? "모델명 *" : "분류명 *"}</span>
        <input
          className="input"
          value={typeMode ? value.type_name : value.category_name}
          onChange={(event) => onChange(typeMode ? { ...value, type_name: event.target.value } : { ...value, category_name: event.target.value })}
          placeholder={typeMode ? "예: Quest 3, 개발용 노트북" : "예: 노트북, VR 장비"}
          required
        />
      </label>

      <label>
        <span className="field-label">{typeMode ? "모델 접두어" : "장비번호 접두어 *"}</span>
        <input
          className="input"
          value={typeMode ? value.type_prefix : value.prefix}
          onChange={(event) => onChange(typeMode ? { ...value, type_prefix: event.target.value } : { ...value, prefix: event.target.value })}
          placeholder={typeMode ? "예: MQ3, DEV" : "예: MD-VR, LAP"}
          maxLength={40}
          required={!typeMode}
        />
      </label>

      <label>
        <span className="field-label">메모</span>
        <textarea className="textarea min-h-24" value={value.memo} onChange={(event) => onChange({ ...value, memo: event.target.value })} />
      </label>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <button className="btn-secondary" type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
        ) : null}
        <button className="btn-primary" disabled={busy}>
          <Check size={18} />
          {busy ? "저장 중" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function ReasonForm({ value, busy, submitLabel = "저장", onChange, onSubmit, onCancel }) {
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <label>
        <span className="field-label">사유 구분 *</span>
        <select className="select" value={value.reason_type} onChange={(event) => onChange({ ...value, reason_type: event.target.value })}>
          {reasonTypes.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="field-label">사유명 *</span>
        <input className="input" value={value.reason_text} onChange={(event) => onChange({ ...value, reason_text: event.target.value })} required />
      </label>
      <label>
        <span className="field-label">메모</span>
        <textarea className="textarea min-h-24" value={value.memo} onChange={(event) => onChange({ ...value, memo: event.target.value })} />
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <button className="btn-secondary" type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
        ) : null}
        <button className="btn-primary" disabled={busy}>
          <Check size={18} />
          {busy ? "저장 중" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function UserOptionForm({ value, busy, submitLabel = "저장", onChange, onSubmit, onCancel }) {
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <label>
        <span className="field-label">항목 구분 *</span>
        <select className="select" value={value.option_type} onChange={(event) => onChange({ ...value, option_type: event.target.value })}>
          {optionSections.map((section) => (
            <option key={section.type} value={section.type}>
              {section.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="field-label">항목명 *</span>
        <input className="input" value={value.option_text} onChange={(event) => onChange({ ...value, option_text: event.target.value })} placeholder="예: 기술연구소, 선임연구원" required />
      </label>
      <label>
        <span className="field-label">메모</span>
        <textarea className="textarea min-h-24" value={value.memo} onChange={(event) => onChange({ ...value, memo: event.target.value })} />
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <button className="btn-secondary" type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
        ) : null}
        <button className="btn-primary" disabled={busy}>
          <Check size={18} />
          {busy ? "저장 중" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function InstitutionForm({ value, busy, submitLabel = "저장", onChange, onSubmit, onCancel }) {
  function update(name, nextValue) {
    onChange({ ...value, [name]: name === "contact" ? formatPhoneNumber(nextValue) : nextValue });
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="field-label">기관명 *</span>
          <input className="input" value={value.institution_name || ""} onChange={(event) => update("institution_name", event.target.value)} required />
        </label>
        <label>
          <span className="field-label">담당자</span>
          <input className="input" value={value.contact_person || ""} onChange={(event) => update("contact_person", event.target.value)} />
        </label>
        <label>
          <span className="field-label">연락처</span>
          <input className="input" value={value.contact || ""} onChange={(event) => update("contact", event.target.value)} placeholder="010-0000-0000" inputMode="tel" />
        </label>
        <label>
          <span className="field-label">이메일</span>
          <input className="input" type="email" value={value.email || ""} onChange={(event) => update("email", event.target.value)} />
        </label>
      </div>
      <label>
        <span className="field-label">주소</span>
        <input className="input" value={value.address || ""} onChange={(event) => update("address", event.target.value)} />
      </label>
      <label>
        <span className="field-label">비고</span>
        <textarea className="textarea min-h-24" value={value.memo || ""} onChange={(event) => update("memo", event.target.value)} />
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <button className="btn-secondary" type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
        ) : null}
        <button className="btn-primary" disabled={busy}>
          <Check size={18} />
          {busy ? "저장 중" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function UserOptionMembersModal({ option, userOptions, onClose, onUpdated }) {
  const meta = optionMetaFor(option.option_type);
  const [users, setUsers] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [changes, setChanges] = useState({ organization: "", department: "", position: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    api("/users")
      .then((rows) => {
        if (!ignore) setUsers(rows);
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const linkedUsers = useMemo(() => users.filter((user) => String(user[meta.field] || "") === String(option.option_text || "")), [users, meta.field, option.option_text]);
  const filteredUsers = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return linkedUsers;
    return linkedUsers.filter((user) =>
      [user.name, user.user_id, user.organization, user.department, user.position, user.contact, user.email].some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [linkedUsers, keyword]);
  const selectedUsers = useMemo(() => users.filter((user) => selectedIds.includes(user.user_id)), [selectedIds, users]);
  const pendingPayload = useMemo(() => Object.fromEntries(Object.entries(changes).filter(([, value]) => value)), [changes]);
  const changeSummary = useMemo(
    () =>
      [
        changes.organization ? ["소속", changes.organization] : null,
        changes.department ? ["부서", changes.department] : null,
        changes.position ? ["직책", changes.position] : null
      ].filter(Boolean),
    [changes]
  );

  function toggleUser(userId) {
    setSelectedIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }

  function toggleVisible() {
    const visibleIds = filteredUsers.map((user) => user.user_id);
    const allSelected = visibleIds.length && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => (allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]));
  }

  function requestApplyChanges() {
    if (!selectedIds.length) {
      setError("변경할 사용자를 선택해주세요.");
      return;
    }
    if (!Object.keys(pendingPayload).length) {
      setError("변경할 소속, 부서 또는 직책을 선택해주세요.");
      return;
    }
    setError("");
    setConfirmOpen(true);
  }

  async function applyChanges() {
    const payload = Object.fromEntries(Object.entries(changes).filter(([, value]) => value));
    if (!selectedIds.length) {
      setError("변경할 사용자를 선택해주세요.");
      return;
    }
    if (!Object.keys(payload).length) {
      setError("변경할 소속, 부서 또는 직책을 선택해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      for (const userId of selectedIds) {
        await api(`/users/${encodeURIComponent(userId)}`, { method: "PUT", body: payload });
      }
      await onUpdated?.();
      setConfirmOpen(false);
      onClose();
    } catch (err) {
      setConfirmOpen(false);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const organizations = optionTexts(userOptions, "ORGANIZATION");
  const departments = optionTexts(userOptions, "DEPARTMENT");
  const positions = optionTexts(userOptions, "POSITION");

  return (
    <>
    <Modal
      title={`${option.option_text} 사용자 목록`}
      kicker={`${meta.label} 인원 관리`}
      description="선택한 사용자를 다른 소속, 부서 또는 직책으로 한 번에 변경할 수 있습니다."
      maxWidth="max-w-[96vw] 2xl:max-w-[1500px]"
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={busy}>
            닫기
          </button>
          <button className="btn-primary" type="button" onClick={requestApplyChanges} disabled={busy || !selectedIds.length}>
            <Check size={18} />
            {busy ? "변경 중" : "선택 사용자 변경"}
          </button>
        </div>
      }
    >
      {error ? <div className="mb-4 rounded-lg border border-[#ffc8d6] bg-[#fff0f4] px-4 py-3 text-sm font-extrabold text-[#d84f71]">{error}</div> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="border-b border-line bg-[#f7f7fd] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input className="input pl-10" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="이름, ID, 소속, 부서, 직책 검색" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-sm font-extrabold text-slate-500">총 {filteredUsers.length}명</p>
              <button className="btn-secondary h-10 px-3 text-xs" type="button" onClick={toggleVisible} disabled={!filteredUsers.length}>
                전체 선택
              </button>
            </div>
          </div>

          <div className="grid gap-2 p-3 xl:hidden">
            {filteredUsers.map((user) => (
              <button key={user.user_id} className="soft-row text-left" type="button" onClick={() => toggleUser(user.user_id)}>
                <div className="flex items-start gap-3">
                  <input className="mt-2 h-5 w-5 accent-[#7367f0]" type="checkbox" checked={selectedIds.includes(user.user_id)} onChange={() => toggleUser(user.user_id)} onClick={(event) => event.stopPropagation()} />
                  <UserAvatar user={user} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold text-ink">{user.name}</p>
                    <p className="mt-1 truncate text-xs font-bold text-slate-500">{user.user_id}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">{[user.organization, user.department, user.position].filter(Boolean).join(" / ") || "-"}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden max-h-[520px] overflow-auto xl:block">
            <table className="w-full table-fixed">
              <thead className="table-head">
                <tr>
                  <th className="w-14">선택</th>
                  <th className="w-40">사용자</th>
                  <th className="w-36">소속</th>
                  <th className="w-36">부서</th>
                  <th className="w-36">직책</th>
                  <th className="w-36">연락처</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.user_id} className="cursor-pointer hover:bg-slate-50" onClick={() => toggleUser(user.user_id)}>
                    <td className="table-cell">
                      <input className="h-5 w-5 accent-[#7367f0]" type="checkbox" checked={selectedIds.includes(user.user_id)} onChange={() => toggleUser(user.user_id)} onClick={(event) => event.stopPropagation()} />
                    </td>
                    <td className="table-cell">
                      <div className="flex min-w-0 items-center gap-2">
                        <UserAvatar user={user} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-ink">{user.name}</p>
                          <p className="truncate text-xs font-bold text-brand">{user.user_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell"><span className="block truncate">{user.organization || "-"}</span></td>
                    <td className="table-cell"><span className="block truncate">{user.department || "-"}</span></td>
                    <td className="table-cell"><span className="block truncate">{user.position || "-"}</span></td>
                    <td className="table-cell">{user.contact || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="rounded-lg border border-[#d8d2ff] bg-[#f7f7ff] p-4">
          <h3 className="section-title">선택 인원 변경</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">선택한 값만 변경됩니다. 비워둔 항목은 그대로 유지됩니다.</p>
          <div className="mt-4 grid gap-3">
            <label>
              <span className="field-label">소속 변경</span>
              <select className="select" value={changes.organization} onChange={(event) => setChanges((current) => ({ ...current, organization: event.target.value }))}>
                <option value="">변경 안 함</option>
                {organizations.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">부서 변경</span>
              <select className="select" value={changes.department} onChange={(event) => setChanges((current) => ({ ...current, department: event.target.value }))}>
                <option value="">변경 안 함</option>
                {departments.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">직책 변경</span>
              <select className="select" value={changes.position} onChange={(event) => setChanges((current) => ({ ...current, position: event.target.value }))}>
                <option value="">변경 안 함</option>
                {positions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm font-extrabold text-ink">선택됨: {selectedIds.length}명</div>
        </aside>
      </div>
    </Modal>
    {confirmOpen ? (
      <Modal
        title="변경하시겠습니까?"
        kicker="Change Confirm"
        description="선택한 인원의 소속, 부서, 직책 정보가 아래 내용으로 변경됩니다."
        maxWidth="max-w-xl"
        onClose={() => {
          if (!busy) setConfirmOpen(false);
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button className="btn-secondary" type="button" onClick={() => setConfirmOpen(false)} disabled={busy}>
              취소
            </button>
            <button className="btn-primary" type="button" onClick={applyChanges} disabled={busy}>
              <Check size={18} />
              {busy ? "변경 중" : "확인"}
            </button>
          </div>
        }
      >
        <div className="rounded-lg border border-[#d8d2ff] bg-[#f7f7ff] p-4">
          <p className="text-sm font-extrabold text-brand">변경 대상</p>
          <p className="mt-1 text-2xl font-extrabold text-ink">{selectedIds.length}명</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedUsers.slice(0, 8).map((user) => (
              <span key={user.user_id} className="rounded-lg bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600">
                {user.name} ({user.user_id})
              </span>
            ))}
            {selectedUsers.length > 8 ? <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-extrabold text-brand">+{selectedUsers.length - 8}명</span> : null}
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {changeSummary.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-white px-4 py-3">
              <span className="text-sm font-bold text-slate-500">{label}</span>
              <span className="min-w-0 break-words text-right text-sm font-extrabold text-ink">{value}</span>
            </div>
          ))}
        </div>
      </Modal>
    ) : null}
    </>
  );
}

export default function Settings() {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const isAdmin = isAdminUser(currentUser);
  const visibleTabs = useMemo(() => tabs.filter((tab) => isAdmin || !tab.adminOnly), [isAdmin]);
  const [activeTab, setActiveTab] = useState("profile");
  const [categoryManagerTab, setCategoryManagerTab] = useState("categories");
  const [categoryFilterTab, setCategoryFilterTab] = useState("");
  const [reasonManagerTab, setReasonManagerTab] = useState("RENT");
  const [userOptionTab, setUserOptionTab] = useState("ORGANIZATION");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [paths, setPaths] = useState(null);
  const [categories, setCategories] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [typeForm, setTypeForm] = useState(emptyType);
  const [reasonForm, setReasonForm] = useState(emptyReason);
  const [userOptionForm, setUserOptionForm] = useState(emptyUserOption);
  const [institutionForm, setInstitutionForm] = useState(emptyInstitution);
  const [editCategory, setEditCategory] = useState(null);
  const [editType, setEditType] = useState(null);
  const [editReason, setEditReason] = useState(null);
  const [editUserOption, setEditUserOption] = useState(null);
  const [editInstitution, setEditInstitution] = useState(null);
  const [blockedCategory, setBlockedCategory] = useState(null);
  const [blockedType, setBlockedType] = useState(null);
  const [categoryDevicesView, setCategoryDevicesView] = useState(null);
  const [typeDevicesView, setTypeDevicesView] = useState(null);
  const [detailDeviceId, setDetailDeviceId] = useState(null);
  const [userOptionMembers, setUserOptionMembers] = useState(null);
  const [userOptionDelete, setUserOptionDelete] = useState(null);
  const [profileForm, setProfileForm] = useState({ user_id: "", name: "", role: "USER", organization: "", department: "", position: "", contact: "", email: "", profile_photo_path: "", memo: "", password: "" });
  const [showProfilePassword, setShowProfilePassword] = useState(false);

  const typesByCategory = useMemo(() => {
    const map = new Map();
    deviceTypes.forEach((type) => {
      const key = type.category_id || type.category_name || "";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(type);
    });
    return map;
  }, [deviceTypes]);

  const userOptionCounts = useMemo(() => Object.fromEntries(optionSections.map((section) => [section.type, userOptions.filter((option) => option.option_type === section.type).length])), [userOptions]);

  useEffect(() => {
    const syncUser = () => setCurrentUser(getCurrentUser());
    window.addEventListener("storage", syncUser);
    window.addEventListener("deviceManagerUserChanged", syncUser);
    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("deviceManagerUserChanged", syncUser);
    };
  }, []);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) setActiveTab("profile");
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    setReasonForm((current) => ({ ...current, reason_type: reasonManagerTab }));
  }, [reasonManagerTab]);

  useEffect(() => {
    setUserOptionForm((current) => ({ ...current, option_type: userOptionTab }));
  }, [userOptionTab]);

  useEffect(() => {
    load().catch((err) => setMessage({ type: "error", text: err.message }));
  }, []);

  useEffect(() => {
    if (!currentUser?.user_id) return;
    loadProfile().catch((err) => setMessage({ type: "error", text: err.message }));
  }, [currentUser?.user_id]);

  async function load() {
    const [categoryRows, typeRows, reasonRows, optionRows, institutionRows, pathRows] = await Promise.all([
      api("/categories").catch(() => []),
      api("/device-types").catch(() => []),
      api("/reasons").catch(() => []),
      api("/user-options").catch(() => []),
      api("/institutions").catch(() => []),
      api("/settings/paths").catch(() => null)
    ]);
    setCategories(categoryRows);
    setDeviceTypes(typeRows);
    setReasons(reasonRows);
    setUserOptions(optionRows);
    setInstitutions(institutionRows);
    setPaths(pathRows);
  }

  async function loadProfile() {
    if (!currentUser?.user_id) return;
    const profile = await api(`/users/${encodeURIComponent(currentUser.user_id)}`);
    setProfileForm({
      user_id: profile.user_id || currentUser.user_id,
      name: profile.name || "",
      role: profile.role || "USER",
      organization: profile.organization || "",
      department: profile.department || "",
      position: profile.position || "",
      contact: profile.contact || "",
      email: profile.email || "",
      profile_photo_path: profile.profile_photo_path || "",
      memo: profile.memo || "",
      password: ""
    });
  }

  function syncStoredCurrentUser(user) {
    const current = getCurrentUser();
    const nextUser = {
      ...current,
      user_id: user.user_id,
      name: user.name || "",
      role: user.role || "USER",
      organization: user.organization || "",
      department: user.department || "",
      position: user.position || "",
      profile_photo_path: user.profile_photo_path || ""
    };
    localStorage.setItem("deviceManagerUser", JSON.stringify(nextUser));
    setCurrentUser(nextUser);
    window.dispatchEvent(new Event("deviceManagerUserChanged"));
  }

  function handleProfilePhotoUploaded(saved) {
    setProfileForm((current) => ({ ...current, profile_photo_path: saved.profile_photo_path || "" }));
    if (saved?.user_id === currentUser?.user_id) syncStoredCurrentUser(saved);
  }

  async function saveProfile(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const payload = { ...profileForm, contact: formatPhoneNumber(profileForm.contact) };
      if (!payload.password) delete payload.password;
      const saved = await api(`/users/${encodeURIComponent(profileForm.user_id)}`, { method: "PUT", body: payload });
      syncStoredCurrentUser(saved);
      setProfileForm((current) => ({ ...current, ...saved, password: "" }));
      setMessage({ type: "success", text: "프로필 설정을 저장했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/categories", { method: "POST", body: categoryForm });
      setCategoryForm(emptyCategory);
      await load();
      setMessage({ type: "success", text: "분류를 추가했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function updateCategory(event) {
    event.preventDefault();
    if (!editCategory) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/categories/${encodeURIComponent(editCategory.category_id)}`, { method: "PUT", body: editCategory });
      setEditCategory(null);
      await load();
      setMessage({ type: "success", text: "분류를 수정했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(category) {
    setBusy(true);
    setMessage(null);
    try {
      const devices = await api(`/devices?category=${encodeURIComponent(category.category_name)}`).catch(() => []);
      const linkedTypes = deviceTypes.filter((type) => type.category_id === category.category_id || type.category_name === category.category_name);
      if (devices.length || linkedTypes.length) {
        setBlockedCategory({ category, devices, types: linkedTypes });
        return;
      }
      if (!window.confirm(`${category.category_name} 분류를 삭제할까요?`)) return;
      await api(`/categories/${encodeURIComponent(category.category_id)}`, { method: "DELETE" });
      await load();
      setMessage({ type: "success", text: "분류를 삭제했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function openCategoryDevices(category) {
    setTypeDevicesView(null);
    setCategoryDevicesView({ category, devices: null, error: "" });
    try {
      const devices = await api(`/devices?category=${encodeURIComponent(category.category_name)}`);
      setCategoryDevicesView({ category, devices, error: "" });
    } catch (err) {
      setCategoryDevicesView({ category, devices: [], error: err.message });
    }
  }

  async function saveDeviceType(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/device-types", { method: "POST", body: typeForm });
      setTypeForm(emptyType);
      await load();
      setMessage({ type: "success", text: "장비 항목을 추가했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function updateDeviceType(event) {
    event.preventDefault();
    if (!editType) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/device-types/${encodeURIComponent(editType.type_id)}`, { method: "PUT", body: editType });
      setEditType(null);
      await load();
      setMessage({ type: "success", text: "장비 항목을 수정했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function removeDeviceType(type) {
    setBusy(true);
    setMessage(null);
    try {
      const categoryDevices = await api(`/devices?category=${encodeURIComponent(type.category_name)}`).catch(() => []);
      const devices = categoryDevices.filter((device) => device.model_name === type.type_name);
      if (devices.length) {
        setBlockedType({ type, devices });
        return;
      }
      if (!window.confirm(`${type.type_name} 항목을 삭제할까요?`)) return;
      await api(`/device-types/${encodeURIComponent(type.type_id)}`, { method: "DELETE" });
      await load();
      setMessage({ type: "success", text: "장비 항목을 삭제했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function openDeviceTypeDevices(type) {
    setCategoryDevicesView(null);
    setTypeDevicesView({ type, devices: null, error: "" });
    try {
      const categoryDevices = await api(`/devices?category=${encodeURIComponent(type.category_name)}`);
      const devices = categoryDevices.filter((device) => device.model_name === type.type_name);
      setTypeDevicesView({ type, devices, error: "" });
    } catch (err) {
      setTypeDevicesView({ type, devices: [], error: err.message });
    }
  }

  async function deleteViewedCategoryDevice(device) {
    if (!device?.device_id || !categoryDevicesView?.category) return;
    if (device.status !== "DISPOSED") {
      window.alert("폐기 상태인 장비만 삭제할 수 있습니다.");
      return;
    }
    if (!window.confirm(`${device.device_id} 장비를 삭제할까요? 삭제 후 장비 목록에서 사라집니다.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/devices/${encodeURIComponent(device.device_id)}?delete=true`, { method: "DELETE" });
      const devices = await api(`/devices?category=${encodeURIComponent(categoryDevicesView.category.category_name)}`);
      setCategoryDevicesView((current) => (current ? { ...current, devices, error: "" } : current));
      setMessage({ type: "success", text: "폐기 장비를 삭제했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function deleteViewedDevice(device) {
    if (!device?.device_id || !typeDevicesView?.type) return;
    if (device.status !== "DISPOSED") {
      window.alert("폐기 상태인 장비만 삭제할 수 있습니다.");
      return;
    }
    if (!window.confirm(`${device.device_id} 장비를 삭제할까요? 삭제 후 장비 목록에서 사라집니다.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/devices/${encodeURIComponent(device.device_id)}?delete=true`, { method: "DELETE" });
      const categoryDevices = await api(`/devices?category=${encodeURIComponent(typeDevicesView.type.category_name)}`);
      const devices = categoryDevices.filter((row) => row.model_name === typeDevicesView.type.type_name);
      setTypeDevicesView((current) => (current ? { ...current, devices, error: "" } : current));
      setMessage({ type: "success", text: "폐기 장비를 삭제했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveReason(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/reasons", { method: "POST", body: reasonForm });
      setReasonForm(emptyReason);
      await load();
      setMessage({ type: "success", text: "사유를 추가했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function updateReason(event) {
    event.preventDefault();
    if (!editReason) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/reasons/${encodeURIComponent(editReason.reason_id)}`, { method: "PUT", body: editReason });
      setEditReason(null);
      await load();
      setMessage({ type: "success", text: "사유를 수정했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function removeReason(reason) {
    if (!window.confirm(`${reason.reason_text} 사유를 삭제할까요?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/reasons/${encodeURIComponent(reason.reason_id)}`, { method: "DELETE" });
      await load();
      setMessage({ type: "success", text: "사유를 삭제했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveUserOption(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/user-options", { method: "POST", body: userOptionForm });
      setUserOptionForm({ ...emptyUserOption, option_type: userOptionTab });
      await load();
      setMessage({ type: "success", text: "사용자 항목을 추가했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function updateUserOption(event) {
    event.preventDefault();
    if (!editUserOption) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/user-options/${encodeURIComponent(editUserOption.option_id)}`, { method: "PUT", body: editUserOption });
      setEditUserOption(null);
      await load();
      setMessage({ type: "success", text: "사용자 항목을 수정했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function removeUserOption(option) {
    setBusy(true);
    setMessage(null);
    try {
      const meta = optionMetaFor(option.option_type);
      const users = await api("/users");
      const linkedUsers = users.filter((user) => String(user[meta.field] || "") === String(option.option_text || ""));
      setUserOptionDelete({ option, users: linkedUsers });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function confirmUserOptionDelete() {
    if (!userOptionDelete?.option) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/user-options/${encodeURIComponent(userOptionDelete.option.option_id)}`, { method: "DELETE" });
      setUserOptionDelete(null);
      await load();
      setMessage({ type: "success", text: "사용자 항목을 삭제했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveInstitution(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/institutions", { method: "POST", body: institutionForm });
      setInstitutionForm(emptyInstitution);
      await load();
      setMessage({ type: "success", text: "기관을 추가했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function updateInstitution(event) {
    event.preventDefault();
    if (!editInstitution) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/institutions/${encodeURIComponent(editInstitution.institution_id)}`, { method: "PUT", body: editInstitution });
      setEditInstitution(null);
      await load();
      setMessage({ type: "success", text: "기관 정보를 수정했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function removeInstitution(institution) {
    if (!window.confirm(`${institution.institution_name} 기관을 삭제할까요?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/institutions/${encodeURIComponent(institution.institution_id)}`, { method: "DELETE" });
      await load();
      setMessage({ type: "success", text: "기관을 삭제했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function backupExcel() {
    setBusy(true);
    setMessage(null);
    try {
      await api("/excel/backup", { method: "POST" });
      setMessage({ type: "success", text: "엑셀 백업을 생성했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function initExcel() {
    if (!window.confirm("샘플 데이터로 엑셀 파일을 다시 초기화할까요? 기존 데이터가 교체됩니다.")) return;
    setBusy(true);
    setMessage(null);
    try {
      await api("/excel/init", { method: "POST", body: { force: true, sample: true } });
      await load();
      setMessage({ type: "success", text: "엑셀 파일을 초기화했습니다." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }


  function renderProfileTab() {
    const organizations = optionTexts(userOptions, "ORGANIZATION");
    const departments = optionTexts(userOptions, "DEPARTMENT");
    const positions = optionTexts(userOptions, "POSITION");
    return (
      <section className="panel p-4 sm:p-6">
        <form className="grid gap-6 xl:grid-cols-[240px_1fr]" onSubmit={saveProfile}>
          <aside className="rounded-lg border border-line bg-[#f7f7fd] p-5 text-center">
            <div className="relative mx-auto w-fit">
              <UserAvatar user={profileForm} size="xl" className="h-36 w-36" />
              <ProfilePhotoUploader user={profileForm} iconOnly className="absolute bottom-0 left-0" disabled={busy || !profileForm.user_id} onUploaded={handleProfilePhotoUploaded} />
            </div>
            <h3 className="mt-4 text-xl font-extrabold text-ink">{profileForm.name || "사용자"}</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">{profileForm.user_id || "-"}</p>
            <span className="mt-3 inline-flex rounded-lg bg-[#f2f0ff] px-3 py-1.5 text-xs font-extrabold text-brand">{roleLabel(profileForm.role)}</span>
          </aside>

          <div className="min-w-0">
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="field-label">사용자 ID</span>
                <input className="input cursor-not-allowed bg-slate-100 text-slate-500" value={profileForm.user_id} readOnly />
              </label>
              <label>
                <span className="field-label">비밀번호</span>
                <div className="relative">
                  <input className="input pr-12" type={showProfilePassword ? "text" : "password"} value={profileForm.password} onChange={(event) => setProfileForm((current) => ({ ...current, password: event.target.value }))} placeholder="변경할 때만 입력" />
                  <button className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink" type="button" onClick={() => setShowProfilePassword((value) => !value)} aria-label={showProfilePassword ? "비밀번호 숨기기" : "비밀번호 보기"}>
                    {showProfilePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              <label>
                <span className="field-label">이름 *</span>
                <input className="input" value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span className="field-label">권한</span>
                <input className="input bg-slate-50" value={roleLabel(profileForm.role)} readOnly />
              </label>
              <label>
                <span className="field-label">소속</span>
                <select className="select" value={profileForm.organization} onChange={(event) => setProfileForm((current) => ({ ...current, organization: event.target.value }))}>
                  <option value="">소속 선택</option>
                  {profileForm.organization && !organizations.includes(profileForm.organization) ? <option value={profileForm.organization}>{profileForm.organization}</option> : null}
                  {organizations.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span className="field-label">부서</span>
                <select className="select" value={profileForm.department} onChange={(event) => setProfileForm((current) => ({ ...current, department: event.target.value }))}>
                  <option value="">부서 선택</option>
                  {profileForm.department && !departments.includes(profileForm.department) ? <option value={profileForm.department}>{profileForm.department}</option> : null}
                  {departments.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span className="field-label">직책</span>
                <select className="select" value={profileForm.position} onChange={(event) => setProfileForm((current) => ({ ...current, position: event.target.value }))}>
                  <option value="">직책 선택</option>
                  {profileForm.position && !positions.includes(profileForm.position) ? <option value={profileForm.position}>{profileForm.position}</option> : null}
                  {positions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span className="field-label">연락처</span>
                <input className="input" value={profileForm.contact} onChange={(event) => setProfileForm((current) => ({ ...current, contact: formatPhoneNumber(event.target.value) }))} placeholder="010-0000-0000" inputMode="tel" />
              </label>
              <label>
                <span className="field-label">이메일</span>
                <input className="input" type="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label className="md:col-span-2">
                <span className="field-label">메모</span>
                <textarea className="textarea" value={profileForm.memo} onChange={(event) => setProfileForm((current) => ({ ...current, memo: event.target.value }))} />
              </label>
            </div>
            <div className="mt-5 flex justify-end border-t border-line pt-4">
              <button className="btn-primary" disabled={busy}>
                <Check size={18} />
                {busy ? "저장 중" : "프로필 저장"}
              </button>
            </div>
          </div>
        </form>
      </section>
    );
  }

  function renderCategoriesTab() {
    const managerTabs = [
      { value: "categories", label: "분류" },
      { value: "types", label: "장비 항목" }
    ];
    const typeFilterTabs = [
      { value: "", label: "전체" },
      ...categories.map((category) => ({
        value: category.category_id,
        label: category.category_name
      }))
    ];
    const filteredTypes = categoryFilterTab
      ? deviceTypes.filter((type) => type.category_id === categoryFilterTab || categories.find((category) => category.category_id === categoryFilterTab)?.category_name === type.category_name)
      : deviceTypes;

    return (
      <section className="panel overflow-hidden">
        <SegmentedTabs items={managerTabs} value={categoryManagerTab} onChange={setCategoryManagerTab} />

        {categoryManagerTab === "categories" ? (
          <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="rounded-lg border border-line bg-white p-4">
              <div className="mb-4">
                <p className="page-kicker">Category</p>
                <h2 className="section-title">분류 추가</h2>
              </div>
              <CategoryForm value={categoryForm} busy={busy} submitLabel="분류 추가" onChange={setCategoryForm} onSubmit={saveCategory} />
            </section>

            <section className="overflow-hidden rounded-lg border border-line bg-white">
              <div className="border-b border-line bg-[#f7f7fd] px-4 py-3">
                <h2 className="section-title">분류 목록</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">장비번호의 큰 접두어와 분류명을 관리합니다.</p>
              </div>
              <div className="grid gap-2 p-2 sm:grid-cols-2 xl:hidden">
                {categories.map((category, index) => {
                  const types = typesByCategory.get(category.category_id) || typesByCategory.get(category.category_name) || [];
                  return (
                    <div key={category.category_id} className="rounded-lg border border-line bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-500">No {index + 1}</p>
                          <p className="mt-1 truncate text-base font-extrabold text-ink">{category.category_name}</p>
                          <p className="mt-1 text-sm font-bold text-brand">{category.prefix}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">장비 항목 {types.length}개 {category.memo ? `· ${category.memo}` : ""}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button className="btn-secondary h-11 w-11 p-0" type="button" onClick={() => openCategoryDevices(category)} aria-label="분류 등록 장비 보기"><Eye size={18} /></button>
                          <button className="btn-secondary h-11 w-11 p-0" type="button" onClick={() => setEditCategory(category)} aria-label="분류 수정"><Pencil size={18} /></button>
                          <button className="btn-danger h-11 w-11 p-0" type="button" onClick={() => removeCategory(category)} aria-label="분류 삭제"><Trash2 size={18} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden p-3 xl:block">
                <div className="overflow-hidden rounded-lg border border-line/70">
                  <table className="w-full table-fixed">
                    <thead className="table-head">
                      <tr>
                        <th className="w-20">No</th>
                        <th>분류명</th>
                        <th className="w-40">장비번호 접두어</th>
                        <th className="w-32">장비 항목</th>
                        <th>메모</th>
                        <th className="w-32 text-center">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((category, index) => {
                        const types = typesByCategory.get(category.category_id) || typesByCategory.get(category.category_name) || [];
                        return (
                          <tr key={category.category_id} className="hover:bg-slate-50">
                            <td className="table-cell font-bold text-slate-500">{index + 1}</td>
                            <td className="table-cell font-extrabold text-ink">{category.category_name}</td>
                            <td className="table-cell font-extrabold text-brand">{category.prefix}</td>
                            <td className="table-cell font-extrabold text-ink">{types.length}개</td>
                            <td className="table-cell"><span className="block truncate">{category.memo || "-"}</span></td>
                            <td className="table-cell">
                              <div className="flex justify-center gap-2">
                                <button className="btn-secondary h-10 w-10 p-0" type="button" onClick={() => openCategoryDevices(category)} aria-label="분류 등록 장비 보기"><Eye size={17} /></button>
                                <button className="btn-secondary h-10 w-10 p-0" type="button" onClick={() => setEditCategory(category)} aria-label="분류 수정"><Pencil size={17} /></button>
                                <button className="btn-danger h-10 w-10 p-0" type="button" onClick={() => removeCategory(category)} aria-label="분류 삭제"><Trash2 size={17} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="rounded-lg border border-line bg-white p-4">
              <div className="mb-4">
                <p className="page-kicker">Device Item</p>
                <h2 className="section-title">장비 항목 추가</h2>
              </div>
              <CategoryForm typeMode value={typeForm} categories={categories} busy={busy} submitLabel="장비 항목 추가" onChange={setTypeForm} onSubmit={saveDeviceType} />
            </section>

            <section className="overflow-hidden rounded-lg border border-line bg-white">
              <UnderlineTabs items={typeFilterTabs} value={categoryFilterTab} onChange={setCategoryFilterTab} />
              <div className="grid gap-2 p-2 sm:grid-cols-2 xl:hidden">
                {filteredTypes.map((type, index) => (
                  <div key={type.type_id} className="rounded-lg border border-line bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-500">No {index + 1} · {type.category_name}</p>
                        <p className="mt-1 truncate text-base font-extrabold text-ink">{type.type_name}</p>
                        <p className="mt-1 text-xs font-extrabold text-slate-500">분류 장비번호 접두어: {categoryPrefixForType(type, categories) || "-"}</p>
                        <p className="mt-1 text-sm font-bold text-brand">모델 접두어: {type.type_prefix || "접두어 없음"}</p>
                        <p className="mt-1 max-w-full truncate text-xs font-extrabold text-slate-600" title={`예상 장비번호: ${expectedDeviceIdForType(type, categories)}`}>
                          예상 장비번호: {expectedDeviceIdForType(type, categories)}
                        </p>
                        {type.memo ? <p className="mt-1 text-xs font-semibold text-slate-500">{type.memo}</p> : null}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button className="btn-secondary h-11 w-11 p-0" type="button" onClick={() => openDeviceTypeDevices(type)} aria-label="등록 장비 보기"><Eye size={18} /></button>
                        <button className="btn-secondary h-11 w-11 p-0" type="button" onClick={() => setEditType(type)} aria-label="장비 항목 수정"><Pencil size={18} /></button>
                        <button className="btn-danger h-11 w-11 p-0" type="button" onClick={() => removeDeviceType(type)} aria-label="장비 항목 삭제"><Trash2 size={18} /></button>
                      </div>
                    </div>
                  </div>
                ))}
                {!filteredTypes.length ? <div className="rounded-lg border border-dashed border-line bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">등록된 장비 항목이 없습니다.</div> : null}
              </div>
              <div className="hidden p-3 xl:block">
                <div className="overflow-x-auto rounded-lg border border-line/70">
                  <table className="w-full min-w-[1360px] table-fixed">
                    <thead className="table-head">
                      <tr>
                        <th className="w-20">No</th>
                        <th className="w-36">분류</th>
                        <th>모델명</th>
                        <th className="w-52">분류 장비번호 접두어</th>
                        <th className="w-40">모델 접두어</th>
                        <th className="w-64">예상 장비번호</th>
                        <th>메모</th>
                        <th className="w-32 text-center">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTypes.map((type, index) => (
                        <tr key={type.type_id} className="hover:bg-slate-50">
                          <td className="table-cell font-bold text-slate-500">{index + 1}</td>
                          <td className="table-cell"><span className="block truncate">{type.category_name || "-"}</span></td>
                          <td className="table-cell font-extrabold text-ink"><span className="block truncate">{type.type_name}</span></td>
                          <td className="table-cell font-extrabold text-slate-600" title={categoryPrefixForType(type, categories)}>
                            <span className="block truncate">{categoryPrefixForType(type, categories) || "-"}</span>
                          </td>
                          <td className="table-cell font-extrabold text-brand">{type.type_prefix || "-"}</td>
                          <td className="table-cell font-extrabold text-slate-700" title={expectedDeviceIdForType(type, categories)}>
                            <span className="block truncate">{expectedDeviceIdForType(type, categories)}</span>
                          </td>
                          <td className="table-cell"><span className="block truncate">{type.memo || "-"}</span></td>
                          <td className="table-cell">
                            <div className="flex justify-center gap-2">
                              <button className="btn-secondary h-10 w-10 p-0" type="button" onClick={() => openDeviceTypeDevices(type)} aria-label="등록 장비 보기"><Eye size={17} /></button>
                              <button className="btn-secondary h-10 w-10 p-0" type="button" onClick={() => setEditType(type)} aria-label="장비 항목 수정"><Pencil size={17} /></button>
                              <button className="btn-danger h-10 w-10 p-0" type="button" onClick={() => removeDeviceType(type)} aria-label="장비 항목 삭제"><Trash2 size={17} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!filteredTypes.length ? <tr><td className="table-cell text-center text-slate-500" colSpan={8}>등록된 장비 항목이 없습니다.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        )}
      </section>
    );
  }

  function renderReasonsTab() {
    const rows = reasons.filter((reason) => reason.reason_type === reasonManagerTab);
    const currentLabel = reasonTypes.find(([type]) => type === reasonManagerTab)?.[1] || "사유";
    const reasonTabs = reasonTypes.map(([type, label]) => ({
      value: type,
      label
    }));

    return (
      <section className="panel overflow-hidden">
        <SegmentedTabs items={reasonTabs} value={reasonManagerTab} onChange={setReasonManagerTab} />
        <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-lg border border-line bg-white p-4">
            <div className="mb-4">
              <p className="page-kicker">Reasons</p>
              <h2 className="section-title">{currentLabel} 추가</h2>
            </div>
            <ReasonForm
              value={reasonForm}
              busy={busy}
              submitLabel="사유 추가"
              onChange={(next) => {
                setReasonForm(next);
                setReasonManagerTab(next.reason_type);
              }}
              onSubmit={saveReason}
            />
          </section>

          <section className="overflow-hidden rounded-lg border border-line bg-white">
            <div className={`border-b border-line px-4 py-4 ${reasonManagerTab === "RENT" ? "bg-[#f2f0ff]" : "bg-[#ecfbf7]"}`}>
              <h3 className="section-title">{currentLabel} 목록</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">현재 탭에 등록된 항목 {rows.length}개</p>
            </div>
            <div className="grid gap-2 p-2 sm:grid-cols-2 xl:hidden">
              {rows.map((reason) => (
                <div key={reason.reason_id} className="rounded-lg border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-extrabold text-ink">{reason.reason_text}</p>
                      {reason.memo ? <p className="mt-1 text-sm font-semibold text-slate-500">{reason.memo}</p> : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button className="btn-secondary h-11 w-11 p-0" type="button" onClick={() => setEditReason(reason)} aria-label="사유 수정"><Pencil size={18} /></button>
                      <button className="btn-danger h-11 w-11 p-0" type="button" onClick={() => removeReason(reason)} aria-label="사유 삭제"><Trash2 size={18} /></button>
                    </div>
                  </div>
                </div>
              ))}
              {!rows.length ? <div className="rounded-lg border border-dashed border-line bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">등록된 사유가 없습니다.</div> : null}
            </div>
            <div className="hidden p-3 xl:block">
              <div className="overflow-hidden rounded-lg border border-line/70">
                <table className="w-full table-fixed">
                  <thead className="table-head">
                    <tr>
                      <th className="w-20">No</th>
                      <th>사유명</th>
                      <th>메모</th>
                      <th className="w-32 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((reason, index) => (
                      <tr key={reason.reason_id} className="hover:bg-slate-50">
                        <td className="table-cell font-bold text-slate-500">{index + 1}</td>
                        <td className="table-cell font-extrabold text-ink">{reason.reason_text}</td>
                        <td className="table-cell"><span className="block truncate">{reason.memo || "-"}</span></td>
                        <td className="table-cell">
                          <div className="flex justify-center gap-2">
                            <button className="btn-secondary h-10 w-10 p-0" type="button" onClick={() => setEditReason(reason)} aria-label="사유 수정"><Pencil size={17} /></button>
                            <button className="btn-danger h-10 w-10 p-0" type="button" onClick={() => removeReason(reason)} aria-label="사유 삭제"><Trash2 size={17} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!rows.length ? <tr><td className="table-cell text-center text-slate-500" colSpan={4}>등록된 사유가 없습니다.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderUserOptionsTab() {
    const section = optionMetaFor(userOptionTab);
    const Icon = section.icon;
    const rows = userOptions.filter((option) => option.option_type === userOptionTab).sort((a, b) => textCompare(a.option_text, b.option_text));
    const optionTabs = optionSections.map((item) => ({
      value: item.type,
      label: item.label
    }));

    return (
      <section className="panel overflow-hidden">
        <SegmentedTabs
          items={optionTabs}
          value={userOptionTab}
          onChange={(value) => {
            setUserOptionTab(value);
            setUserOptionForm((current) => ({ ...current, option_type: value }));
          }}
        />

        <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-lg border border-line bg-white p-4">
            <div className="mb-4">
              <p className="page-kicker">User Options</p>
              <h2 className="section-title">{section.label} 추가</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{section.caption}</p>
            </div>
            <UserOptionForm
              value={userOptionForm}
              busy={busy}
              submitLabel="항목 추가"
              onChange={(next) => {
                setUserOptionForm(next);
                setUserOptionTab(next.option_type);
              }}
              onSubmit={saveUserOption}
            />
          </section>

          <section className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="flex flex-col gap-3 border-b border-line bg-[#f7f7fd] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-brand shadow-soft"><Icon size={22} /></span>
                <div>
                  <h3 className="section-title">{section.title} 목록</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">현재 탭에 등록된 항목 {rows.length}개</p>
                </div>
              </div>
            </div>
            <div className="grid gap-2 p-2 sm:grid-cols-2 xl:hidden">
              {rows.map((option) => (
                <div key={option.option_id} className="rounded-lg border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-extrabold text-ink">{option.option_text}</p>
                      {option.memo ? <p className="mt-1 text-sm font-semibold text-slate-500">{option.memo}</p> : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button className="btn-secondary h-12 w-12 p-0" type="button" onClick={() => setEditUserOption(option)} aria-label={`${option.option_text} 수정`}><Pencil size={19} /></button>
                      <button className="btn-secondary h-12 w-12 p-0" type="button" onClick={() => setUserOptionMembers(option)} aria-label={`${option.option_text} 사용자 보기`}><UsersRound size={19} /></button>
                      <button className="btn-danger h-12 w-12 p-0" type="button" onClick={() => removeUserOption(option)} aria-label={`${option.option_text} 삭제`}><Trash2 size={19} /></button>
                    </div>
                  </div>
                </div>
              ))}
              {!rows.length ? <div className="rounded-lg border border-dashed border-line bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">등록된 항목이 없습니다.</div> : null}
            </div>
            <div className="hidden p-3 xl:block">
              <div className="overflow-hidden rounded-lg border border-line/70">
                <table className="w-full table-fixed">
                  <thead className="table-head">
                    <tr>
                      <th className="w-20">No</th>
                      <th>항목명</th>
                      <th>메모</th>
                      <th className="w-44 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((option, index) => (
                      <tr key={option.option_id} className="hover:bg-slate-50">
                        <td className="table-cell font-bold text-slate-500">{index + 1}</td>
                        <td className="table-cell font-extrabold text-ink">{option.option_text}</td>
                        <td className="table-cell"><span className="block truncate">{option.memo || "-"}</span></td>
                        <td className="table-cell">
                          <div className="flex justify-center gap-2">
                            <button className="btn-secondary h-11 w-11 p-0" type="button" onClick={() => setEditUserOption(option)} aria-label={`${option.option_text} 수정`}><Pencil size={18} /></button>
                            <button className="btn-secondary h-11 w-11 p-0" type="button" onClick={() => setUserOptionMembers(option)} aria-label={`${option.option_text} 사용자 보기`}><UsersRound size={18} /></button>
                            <button className="btn-danger h-11 w-11 p-0" type="button" onClick={() => removeUserOption(option)} aria-label={`${option.option_text} 삭제`}><Trash2 size={18} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!rows.length ? <tr><td className="table-cell text-center text-slate-500" colSpan={4}>등록된 항목이 없습니다.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderInstitutionsTab() {
    const rows = [...institutions].sort((a, b) => textCompare(a.institution_name, b.institution_name));

    return (
      <section className="panel overflow-hidden">
        <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-lg border border-line bg-white p-4">
            <div className="mb-4">
              <p className="page-kicker">Institution</p>
              <h2 className="section-title">기관 추가</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">대여 처리에서 선택할 기관을 미리 등록합니다.</p>
            </div>
            <InstitutionForm
              value={institutionForm}
              busy={busy}
              submitLabel="기관 추가"
              onChange={setInstitutionForm}
              onSubmit={saveInstitution}
            />
          </section>

          <section className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="flex flex-col gap-3 border-b border-line bg-[#f7f7fd] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-brand shadow-soft"><Building2 size={22} /></span>
                <div>
                  <h3 className="section-title">기관 목록</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">등록된 기관 {rows.length}곳</p>
                </div>
              </div>
              <Link className="btn-secondary h-10 px-3 text-sm" to="/institutions">
                <Building2 size={17} />
                기관 관리로 이동
              </Link>
            </div>
            <div className="grid gap-2 p-2 sm:grid-cols-2 xl:hidden">
              {rows.map((institution) => (
                <div key={institution.institution_id} className="rounded-lg border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-extrabold text-ink">{institution.institution_name}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{institution.contact_person || "담당자 미등록"} · {institution.contact || "연락처 없음"}</p>
                      <p className="mt-1 truncate text-xs font-bold text-brand">대여 중 {institution.assigned_count || 0}대 · 이력 {institution.transaction_count || 0}건</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button className="btn-secondary h-12 w-12 p-0" type="button" onClick={() => setEditInstitution(institution)} aria-label={`${institution.institution_name} 수정`}><Pencil size={19} /></button>
                      <button className="btn-danger h-12 w-12 p-0" type="button" onClick={() => removeInstitution(institution)} aria-label={`${institution.institution_name} 삭제`}><Trash2 size={19} /></button>
                    </div>
                  </div>
                </div>
              ))}
              {!rows.length ? <div className="rounded-lg border border-dashed border-line bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">등록된 기관이 없습니다.</div> : null}
            </div>
            <div className="hidden p-3 xl:block">
              <div className="overflow-hidden rounded-lg border border-line/70">
                <table className="w-full table-fixed">
                  <thead className="table-head">
                    <tr>
                      <th className="w-20">No</th>
                      <th className="w-52">기관명</th>
                      <th className="w-32">담당자</th>
                      <th className="w-36">연락처</th>
                      <th>주소</th>
                      <th className="w-24">대여중</th>
                      <th className="w-24">이력</th>
                      <th className="w-36 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((institution, index) => (
                      <tr key={institution.institution_id} className="hover:bg-slate-50">
                        <td className="table-cell font-bold text-slate-500">{index + 1}</td>
                        <td className="table-cell font-extrabold text-ink"><span className="block truncate">{institution.institution_name}</span></td>
                        <td className="table-cell"><span className="block truncate">{institution.contact_person || "-"}</span></td>
                        <td className="table-cell">{institution.contact || "-"}</td>
                        <td className="table-cell"><span className="block truncate">{institution.address || "-"}</span></td>
                        <td className="table-cell font-extrabold text-ink">{institution.assigned_count || 0}대</td>
                        <td className="table-cell font-extrabold text-brand">{institution.transaction_count || 0}건</td>
                        <td className="table-cell">
                          <div className="flex justify-center gap-2">
                            <button className="btn-secondary h-11 w-11 p-0" type="button" onClick={() => setEditInstitution(institution)} aria-label={`${institution.institution_name} 수정`}><Pencil size={18} /></button>
                            <button className="btn-danger h-11 w-11 p-0" type="button" onClick={() => removeInstitution(institution)} aria-label={`${institution.institution_name} 삭제`}><Trash2 size={18} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!rows.length ? <tr><td className="table-cell text-center text-slate-500" colSpan={8}>등록된 기관이 없습니다.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderExcelTab() {
    return (
      <section className="panel p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <a className="btn-primary justify-center" href={downloadUrl("/excel/download")} download><Download size={18} />엑셀 다운로드</a>
          <button className="btn-secondary" type="button" onClick={backupExcel} disabled={busy}><DatabaseBackup size={18} />백업 생성</button>
          <button className="btn-danger" type="button" onClick={initExcel} disabled={busy}><RotateCcw size={18} />샘플 데이터 초기화</button>
        </div>
        <p className="mt-4 text-sm font-semibold leading-6 text-slate-500">엑셀 파일은 서버 데이터 저장소로 사용됩니다. 초기화는 기존 데이터를 교체하므로 필요할 때만 실행하세요.</p>
      </section>
    );
  }


  function renderPathsTab() {
    return (
      <section className="panel p-4 sm:p-6">
        <h2 className="section-title">저장 경로</h2>
        <dl className="mt-4 rounded-lg border border-line bg-white px-4">
          <FieldLine label="엑셀 파일" value={paths?.excelPath} />
          <FieldLine label="업로드 폴더" value={paths?.uploadsPath} />
          <FieldLine label="백업 폴더" value={paths?.backupsPath} />
        </dl>
      </section>
    );
  }

  function renderActiveTab() {
    if (activeTab === "profile") return renderProfileTab();
    if (activeTab === "categories") return renderCategoriesTab();
    if (activeTab === "reasons") return renderReasonsTab();
    if (activeTab === "user-options") return renderUserOptionsTab();
    if (activeTab === "institutions") return renderInstitutionsTab();
    if (activeTab === "excel") return renderExcelTab();
    if (activeTab === "paths") return renderPathsTab();
    return renderProfileTab();
  }

  return (
    <div className="app-page">
      <section className="hero-strip">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="page-title">설정</h1>
            <p className="mt-1 text-sm text-slate-500">분류, 사유, 사용자 옵션과 프로필 정보를 관리합니다.</p>
          </div>
          <Link className="btn-secondary justify-center" to="/">대시보드로 이동</Link>
        </div>
      </section>
      <Message message={message} />
      <nav className="panel flex max-w-full gap-2 overflow-x-auto p-2">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} className={`chip min-h-11 shrink-0 gap-2 ${active ? "chip-active" : ""}`} type="button" onClick={() => setActiveTab(tab.id)}>
              <Icon size={17} />{tab.label}
            </button>
          );
        })}
      </nav>
      {renderActiveTab()}

      {editCategory ? <Modal title="분류 수정" kicker="Category" onClose={() => setEditCategory(null)}><CategoryForm value={editCategory} busy={busy} submitLabel="수정 저장" onChange={setEditCategory} onSubmit={updateCategory} onCancel={() => setEditCategory(null)} /></Modal> : null}
      {editType ? <Modal title="장비 항목 수정" kicker="Device Item" onClose={() => setEditType(null)}><CategoryForm typeMode value={editType} categories={categories} busy={busy} submitLabel="수정 저장" onChange={setEditType} onSubmit={updateDeviceType} onCancel={() => setEditType(null)} /></Modal> : null}
      {editReason ? <Modal title="사유 수정" kicker="Reason" onClose={() => setEditReason(null)}><ReasonForm value={editReason} busy={busy} submitLabel="수정 저장" onChange={setEditReason} onSubmit={updateReason} onCancel={() => setEditReason(null)} /></Modal> : null}
      {editUserOption ? <Modal title="사용자 항목 수정" kicker="User Option" onClose={() => setEditUserOption(null)}><UserOptionForm value={editUserOption} busy={busy} submitLabel="수정 저장" onChange={setEditUserOption} onSubmit={updateUserOption} onCancel={() => setEditUserOption(null)} /></Modal> : null}
      {editInstitution ? <Modal title="기관 정보 수정" kicker="Institution" onClose={() => setEditInstitution(null)} maxWidth="max-w-4xl"><InstitutionForm value={editInstitution} busy={busy} submitLabel="수정 저장" onChange={setEditInstitution} onSubmit={updateInstitution} onCancel={() => setEditInstitution(null)} /></Modal> : null}

      {categoryDevicesView ? (
        <Modal
          title={`${categoryDevicesView.category.category_name} 등록 장비`}
          kicker="Category View"
          description={`${categoryDevicesView.category.category_name} 분류로 등록된 장비를 확인합니다.`}
          onClose={() => {
            setCategoryDevicesView(null);
            setDetailDeviceId(null);
          }}
          maxWidth="max-w-6xl"
        >
          <DeviceCollectionBody
            devices={categoryDevicesView.devices}
            error={categoryDevicesView.error}
            emptyText="이 분류로 등록된 장비가 없습니다."
            busy={busy}
            onOpenDetail={setDetailDeviceId}
            onDeleteDevice={deleteViewedCategoryDevice}
          />
        </Modal>
      ) : null}

      {typeDevicesView ? (
        <Modal
          title={`${typeDevicesView.type.type_name} 등록 장비`}
          kicker="Device Item View"
          description={`${typeDevicesView.type.category_name || "-"} 분류의 ${typeDevicesView.type.type_name} 모델명으로 등록된 장비를 확인합니다.`}
          onClose={() => {
            setTypeDevicesView(null);
            setDetailDeviceId(null);
          }}
          maxWidth="max-w-6xl"
        >
          {typeDevicesView.error ? (
            <div className="rounded-lg border border-[#ffc8d6] bg-[#fff0f4] px-4 py-3 text-sm font-extrabold text-[#d84f71]">{typeDevicesView.error}</div>
          ) : null}
          {!typeDevicesView.devices ? (
            <div className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">장비를 불러오는 중입니다.</div>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-line bg-[#f7f7fd] px-4 py-3">
                  <p className="text-xs font-extrabold text-slate-500">전체</p>
                  <p className="mt-1 text-2xl font-extrabold text-ink">{typeDevicesView.devices.length}대</p>
                </div>
                <div className="rounded-lg border border-line bg-[#ecfbf7] px-4 py-3">
                  <p className="text-xs font-extrabold text-slate-500">대여 가능</p>
                  <p className="mt-1 text-2xl font-extrabold text-[#1eb6a5]">{typeDevicesView.devices.filter((device) => device.status === "AVAILABLE").length}대</p>
                </div>
                <div className="rounded-lg border border-line bg-[#f1efff] px-4 py-3">
                  <p className="text-xs font-extrabold text-slate-500">대여/납품</p>
                  <p className="mt-1 text-2xl font-extrabold text-brand">{typeDevicesView.devices.filter((device) => ["RENTED", "DELIVERED"].includes(device.status)).length}대</p>
                </div>
                <div className="rounded-lg border border-line bg-slate-100 px-4 py-3">
                  <p className="text-xs font-extrabold text-slate-500">폐기</p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-700">{typeDevicesView.devices.filter((device) => device.status === "DISPOSED").length}대</p>
                </div>
              </div>

              {typeDevicesView.devices.length ? (
                <>
                  <div className="grid gap-2 xl:hidden">
                    {typeDevicesView.devices.map((device) => (
                      <div key={device.device_id} className="rounded-lg border border-line bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <button
                              className="block max-w-full truncate text-left text-base font-extrabold text-brand underline-offset-4 hover:underline"
                              type="button"
                              onClick={() => setDetailDeviceId(device.device_id)}
                            >
                              {device.device_id}
                            </button>
                            <p className="mt-1 truncate text-sm font-extrabold text-ink">{device.device_name || device.model_name || "-"}</p>
                            <p className="mt-1 text-xs font-bold text-slate-500">기존 장비번호: {device.legacy_device_id || "-"}</p>
                          </div>
                          <StatusBadge status={device.status} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <FieldLine label="보관위치" value={device.location} />
                          <FieldLine label="현재 사용자" value={device.current_borrower} />
                          <FieldLine label="구매일" value={formatDate(device.purchase_date)} />
                          <FieldLine label="메모" value={device.memo} />
                        </div>
                        {device.status === "DISPOSED" ? (
                          <button className="btn-danger mt-3 h-10 w-full" type="button" onClick={() => deleteViewedDevice(device)} disabled={busy}>
                            <Trash2 size={16} />
                            {busy ? "삭제 중" : "폐기 장비 삭제"}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="hidden overflow-hidden rounded-lg border border-line/70 xl:block">
                    <table className="w-full table-fixed">
                      <thead className="table-head">
                        <tr>
                          <th className="w-36">장비번호</th>
                          <th className="w-40">기존 장비번호</th>
                          <th>장비명</th>
                          <th className="w-28">현재 상태</th>
                          <th className="w-32">현재 사용자</th>
                          <th className="w-36">보관위치</th>
                          <th className="w-24">구매일</th>
                          <th className="w-24 text-center">관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {typeDevicesView.devices.map((device) => (
                          <tr key={device.device_id} className="hover:bg-slate-50">
                            <td className="table-cell font-extrabold text-brand">
                              <button
                                className="block max-w-full truncate text-left underline-offset-4 hover:underline"
                                type="button"
                                onClick={() => setDetailDeviceId(device.device_id)}
                              >
                                {device.device_id}
                              </button>
                            </td>
                            <td className="table-cell"><span className="block truncate">{device.legacy_device_id || "-"}</span></td>
                            <td className="table-cell font-extrabold text-ink"><span className="block truncate">{device.device_name || device.model_name || "-"}</span></td>
                            <td className="table-cell"><StatusBadge status={device.status} /></td>
                            <td className="table-cell"><span className="block truncate">{device.current_borrower || "-"}</span></td>
                            <td className="table-cell"><span className="block truncate">{device.location || "-"}</span></td>
                            <td className="table-cell">{formatDate(device.purchase_date)}</td>
                            <td className="table-cell text-center">
                              {device.status === "DISPOSED" ? (
                                <button className="btn-danger h-9 w-9 p-0" type="button" onClick={() => deleteViewedDevice(device)} disabled={busy} aria-label={`${device.device_id} 삭제`}>
                                  <Trash2 size={16} />
                                </button>
                              ) : (
                                <span className="text-xs font-bold text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                  이 장비 항목으로 등록된 장비가 없습니다.
                </div>
              )}
            </>
          )}
        </Modal>
      ) : null}

      <DeviceDetailModal
        deviceId={detailDeviceId}
        onClose={() => setDetailDeviceId(null)}
        onChanged={async () => {
          if (categoryDevicesView?.category) await openCategoryDevices(categoryDevicesView.category);
          else if (typeDevicesView?.type) await openDeviceTypeDevices(typeDevicesView.type);
          else await load();
        }}
      />

      {blockedCategory ? (
        <Modal title="분류 삭제 전 확인" kicker="Delete Blocked" description="아래 항목이 연결되어 있어 바로 삭제할 수 없습니다. 연결된 장비 또는 장비 항목을 먼저 변경하거나 삭제해주세요." onClose={() => setBlockedCategory(null)}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-line bg-white p-4">
              <h3 className="font-extrabold text-ink">연결된 장비</h3>
              <div className="mt-3 max-h-72 overflow-auto">
                {blockedCategory.devices.length ? blockedCategory.devices.map((device) => (
                  <div key={device.device_id} className="border-b border-line py-2 last:border-b-0">
                    <p className="font-extrabold text-brand">{device.device_id}</p>
                    <p className="text-sm font-semibold text-slate-600">{device.device_name || device.model_name || "-"}</p>
                    <p className="text-xs font-bold text-slate-500">{statusLabel(device.status)} · {device.location || "-"}</p>
                  </div>
                )) : <p className="text-sm font-semibold text-slate-500">연결된 장비 없음</p>}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-white p-4">
              <h3 className="font-extrabold text-ink">연결된 장비 항목</h3>
              <div className="mt-3 max-h-72 overflow-auto">
                {blockedCategory.types.length ? blockedCategory.types.map((type) => (
                  <div key={type.type_id} className="border-b border-line py-2 last:border-b-0">
                    <p className="font-extrabold text-ink">{type.type_name}</p>
                    <p className="text-xs font-bold text-slate-500">접두어: {type.type_prefix || "-"}</p>
                  </div>
                )) : <p className="text-sm font-semibold text-slate-500">연결된 장비 항목 없음</p>}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {blockedType ? (
        <Modal title="장비 항목 삭제 전 확인" kicker="Delete Blocked" description="이 장비 항목으로 등록된 장비가 있어 바로 삭제할 수 없습니다. 장비 정보를 먼저 변경하거나 장비를 삭제해주세요." onClose={() => setBlockedType(null)}>
          <div className="rounded-lg border border-line bg-white p-4">
            <h3 className="font-extrabold text-ink">연결된 장비</h3>
            <div className="mt-3 max-h-80 overflow-auto">
              {blockedType.devices.map((device) => (
                <div key={device.device_id} className="border-b border-line py-2 last:border-b-0">
                  <p className="font-extrabold text-brand">{device.device_id}</p>
                  <p className="text-sm font-semibold text-slate-600">{device.device_name || device.model_name || "-"}</p>
                  <p className="text-xs font-bold text-slate-500">{statusLabel(device.status)} · {device.location || "-"}</p>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}

      {userOptionMembers ? <UserOptionMembersModal option={userOptionMembers} userOptions={userOptions} onClose={() => setUserOptionMembers(null)} onUpdated={load} /> : null}
      {userOptionDelete ? (
        <Modal
          title="사용자 항목 삭제 전 확인"
          kicker="Delete User Option"
          description={userOptionDelete.users.length ? "이 항목을 사용하는 사용자가 있어 삭제할 수 없습니다. 사용자 정보를 먼저 다른 항목으로 변경해주세요." : "아래 항목을 삭제할까요? 삭제 후에는 사용자 등록/수정 드롭다운에서 사라집니다."}
          onClose={() => setUserOptionDelete(null)}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-secondary" type="button" onClick={() => setUserOptionDelete(null)} disabled={busy}>닫기</button>
              {userOptionDelete.users.length ? (
                <button className="btn-primary" type="button" onClick={() => { setUserOptionMembers(userOptionDelete.option); setUserOptionDelete(null); }}>
                  <UsersRound size={18} />사용자 변경
                </button>
              ) : (
                <button className="btn-danger" type="button" onClick={confirmUserOptionDelete} disabled={busy}>
                  <Trash2 size={18} />{busy ? "삭제 중" : "삭제"}
                </button>
              )}
            </div>
          }
        >
          <div className="rounded-lg border border-line bg-[#f7f7fd] p-4">
            <p className="text-sm font-bold text-slate-500">{optionMetaFor(userOptionDelete.option.option_type).label}</p>
            <p className="mt-1 text-xl font-extrabold text-ink">{userOptionDelete.option.option_text}</p>
            {userOptionDelete.option.memo ? <p className="mt-1 text-sm font-semibold text-slate-500">{userOptionDelete.option.memo}</p> : null}
          </div>
          {userOptionDelete.users.length ? (
            <div className="mt-4 rounded-lg border border-[#ffc8d6] bg-[#fff0f4] p-4">
              <h3 className="font-extrabold text-[#d84f71]">연결된 사용자 {userOptionDelete.users.length}명</h3>
              <div className="mt-3 grid max-h-80 gap-2 overflow-auto">
                {userOptionDelete.users.map((user) => (
                  <div key={user.user_id} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2">
                    <UserAvatar user={user} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-extrabold text-ink">{user.name}</p>
                      <p className="truncate text-xs font-bold text-slate-500">{[user.organization, user.department, user.position].filter(Boolean).join(" / ") || "-"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
