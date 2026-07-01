import { ArrowDownAZ, Building2, Check, Eye, EyeOff, Info, KeyRound, PackagePlus, Plus, Save, Search, Send, ShieldCheck, Trash2, Truck, UserCog, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, queryString } from "../api/client.js";
import EmptyState from "../components/EmptyState.jsx";
import Loading from "../components/Loading.jsx";
import ProfilePhotoUploader from "../components/ProfilePhotoUploader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import { getCurrentUser, isAdminUser, setCurrentUser } from "../auth.js";
import { deviceCapacity, deviceTitle, formatDate, formatDateTime, formatPhoneNumber } from "../constants.js";

const emptyUser = {
  user_id: "",
  password: "",
  name: "",
  role: "USER",
  organization: "",
  department: "",
  position: "",
  contact: "",
  email: "",
  profile_photo_path: "",
  memo: ""
};

const roleOptions = [
  ["ADMIN", "관리자"],
  ["USER", "사용자"]
];

function roleLabel(role) {
  return role === "ADMIN" ? "관리자" : "사용자";
}

function isPrimaryAdminUser(user) {
  return user?.user_id === "admin";
}

function RoleBadge({ role }) {
  const normalizedRole = role === "ADMIN" ? "ADMIN" : "USER";
  const Icon = normalizedRole === "ADMIN" ? ShieldCheck : UserCog;
  const styles = {
    ADMIN: "border-[#ffc8d6] bg-[#fff0f4] text-[#d84f71] shadow-[0_6px_18px_rgba(216,79,113,0.12)]",
    USER: "border-[#c9c4ff] bg-[#f4f2ff] text-[#6554dc]"
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-extrabold ${styles[normalizedRole] || "border-line bg-slate-50 text-slate-600"}`}>
      <Icon size={13} />
      {roleLabel(normalizedRole)}
    </span>
  );
}

function textCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), "ko", { numeric: true });
}

function todayInputValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function defaultReturnRequestMessage(user, device) {
  return `${user?.name || "사용자"}님, ${deviceTitle(device)} (${device?.device_id || ""}) 장비 반납을 요청드립니다. 확인 후 반납 절차를 진행해주세요.`;
}

function syncStoredUserIfCurrent(user) {
  const current = getCurrentUser();
  if (!current?.user_id || current.user_id !== user?.user_id) return;
  setCurrentUser({
    ...current,
    user_id: current.user_id,
    name: user.name || current.name,
    role: user.role || current.role,
    organization: user.organization || current.organization || "",
    department: user.department || current.department || "",
    position: user.position || current.position || "",
    profile_photo_path: user.profile_photo_path || current.profile_photo_path || ""
  });
}

function UserModal({ user, mode, busy, userOptions = [], onClose, onSubmit, onPhotoUploaded }) {
  const [form, setForm] = useState(() => ({ ...emptyUser, ...(user || {}), password: "" }));
  const [showPassword, setShowPassword] = useState(false);
  const isCreate = mode === "create";
  const currentUser = getCurrentUser();
  const canManageRole = isAdminUser(currentUser);
  const isProtectedAdmin = !isCreate && form.user_id === "admin";
  const organizations = userOptions.filter((option) => option.option_type === "ORGANIZATION").map((option) => option.option_text);
  const departments = userOptions.filter((option) => option.option_type === "DEPARTMENT").map((option) => option.option_text);
  const positions = userOptions.filter((option) => option.option_type === "POSITION").map((option) => option.option_text);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: name === "contact" ? formatPhoneNumber(value) : value }));
  }

  function submit(event) {
    event.preventDefault();
    const nextForm = isProtectedAdmin ? { ...form, role: "ADMIN" } : form;
    onSubmit(canManageRole ? nextForm : { ...nextForm, role: user?.role || nextForm.role || "USER" });
  }

  function handlePhotoUploaded(saved) {
    setForm((current) => ({ ...current, profile_photo_path: saved.profile_photo_path || "" }));
    onPhotoUploaded?.(saved);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-lg bg-white p-4 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <h2 className="mt-1 text-2xl font-extrabold text-ink">{isCreate ? "사용자 등록" : `${form.name || "사용자"} 프로필 수정`}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{form.email || form.user_id || "계정 정보와 프로필 사진을 함께 관리합니다."}</p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <form className="mt-5 grid gap-6 lg:grid-cols-[190px_1fr]" onSubmit={submit}>
          <aside className="flex flex-col items-center gap-4">
            <div className="relative">
              <UserAvatar user={form} size="xl" className="h-32 w-32" />
              {!isCreate ? (
                <ProfilePhotoUploader user={form} iconOnly className="absolute bottom-0 left-0" disabled={busy} onUploaded={handlePhotoUploaded} />
              ) : null}
            </div>
            {isCreate ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs font-bold leading-5 text-slate-500">
                프로필 사진은 사용자 저장 후 수정 화면에서 등록할 수 있습니다.
              </p>
            ) : (
              <p className="text-center text-xs font-bold leading-5 text-slate-500">이미지 왼쪽 아래 아이콘으로 프로필 사진을 변경합니다.</p>
            )}
          </aside>

          <div className="min-w-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="field-label">사용자 ID *</span>
                <input
                  className={`input ${!isCreate ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""}`}
                  value={form.user_id}
                  onChange={(event) => update("user_id", event.target.value)}
                  required
                  readOnly={!isCreate}
                />
              </label>
              <label>
                <span className="field-label">비밀번호 {isCreate ? "*" : ""}</span>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input
                    className="input pl-10 pr-12"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => update("password", event.target.value)}
                    required={isCreate}
                    placeholder={isCreate ? "초기 비밀번호" : "변경할 때만 입력"}
                  />
                  <button
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink"
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              <label>
                <span className="field-label">이름 *</span>
                <input className="input" value={form.name} onChange={(event) => update("name", event.target.value)} required />
              </label>
              <label>
                <span className="field-label">권한</span>
                {canManageRole ? (
                  <>
                    <select
                      className={`select ${isProtectedAdmin ? "bg-slate-100 text-slate-500" : ""}`}
                      value={form.role}
                      onChange={(event) => update("role", event.target.value)}
                      disabled={isProtectedAdmin}
                    >
                      {roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {isProtectedAdmin ? "기본 관리자(admin) 계정은 권한을 변경할 수 없습니다." : "권한 변경 시 해당 사용자에게 알림이 전송됩니다."}
                    </p>
                  </>
                ) : (
                  <div className="flex h-12 items-center justify-between gap-3 rounded-lg border border-line bg-slate-50 px-3">
                    <RoleBadge role={form.role} />
                    <span className="text-xs font-bold text-slate-500">관리자만 변경 가능</span>
                  </div>
                )}
              </label>
              <label>
                <span className="field-label">소속</span>
                <select className="select" value={form.organization} onChange={(event) => update("organization", event.target.value)}>
                  <option value="">소속 선택</option>
                  {form.organization && !organizations.includes(form.organization) ? <option value={form.organization}>{form.organization}</option> : null}
                  {organizations.map((organization) => <option key={organization} value={organization}>{organization}</option>)}
                </select>
              </label>
              <label>
                <span className="field-label">부서</span>
                <select className="select" value={form.department} onChange={(event) => update("department", event.target.value)}>
                  <option value="">부서 선택</option>
                  {form.department && !departments.includes(form.department) ? <option value={form.department}>{form.department}</option> : null}
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              </label>
              <label>
                <span className="field-label">직책</span>
                <select className="select" value={form.position} onChange={(event) => update("position", event.target.value)}>
                  <option value="">직책 선택</option>
                  {form.position && !positions.includes(form.position) ? <option value={form.position}>{form.position}</option> : null}
                  {positions.map((position) => <option key={position} value={position}>{position}</option>)}
                </select>
              </label>
              <label>
                <span className="field-label">연락처</span>
                <input className="input" value={form.contact} onChange={(event) => update("contact", event.target.value)} placeholder="010-0000-0000" inputMode="tel" />
              </label>
              <label>
                <span className="field-label">이메일</span>
                <input className="input" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} />
              </label>
              <label className="sm:col-span-2">
                <span className="field-label">관리 메모</span>
                <textarea className="textarea" value={form.memo} onChange={(event) => update("memo", event.target.value)} />
              </label>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <button className="btn-secondary" type="button" onClick={onClose}>취소</button>
              <button className="btn-primary" disabled={busy}>
                <Save size={18} />
                {busy ? "저장 중" : "저장"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function ConfirmDialog({ title, description, children, confirmText = "확인", cancelText = "취소", busy, danger, confirmDisabled, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 px-4 py-6" onClick={onCancel}>
      <section className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="page-kicker">{danger ? "Confirm Delete" : "Confirm"}</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">{title}</h2>
            {description ? <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p> : null}
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onCancel} aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-secondary" type="button" onClick={onCancel} disabled={busy}>{cancelText}</button>
          <button className={danger ? "btn-danger" : "btn-primary"} type="button" onClick={onConfirm} disabled={busy || confirmDisabled}>
            <Check size={18} />
            {busy ? "처리 중" : confirmText}
          </button>
        </div>
      </section>
    </div>
  );
}

function AssignDeviceModal({ user, busy, onClose, onAssign }) {
  const [devices, setDevices] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [purpose, setPurpose] = useState("");
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("전체");
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    api("/devices?status=AVAILABLE")
      .then((rows) => {
        if (!ignore) setDevices(rows.filter((device) => device.status === "AVAILABLE"));
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message);
          setDevices([]);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    api("/reasons?reason_type=RENT")
      .then((rows) => {
        if (ignore) return;
        setReasons(rows);
        setPurpose((current) => current || rows[0]?.reason_text || "");
      })
      .catch(() => {
        if (!ignore) setReasons([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const filteredDevices = useMemo(() => {
    const rows = devices || [];
    const query = keyword.trim().toLowerCase();
    return rows.filter((device) => {
      if (category !== "전체" && device.category !== category) return false;
      if (!query) return true;
      return (
      [
        device.device_id,
        deviceTitle(device),
        device.category,
        device.model_name,
        device.capacity_gb,
        device.location
      ].some((value) => String(value || "").toLowerCase().includes(query))
      );
    });
  }, [devices, keyword, category]);

  const categories = useMemo(() => {
    const names = [...new Set((devices || []).map((device) => device.category).filter(Boolean))];
    names.sort((a, b) => textCompare(a, b));
    return ["전체", ...names];
  }, [devices]);

  const selectedDevices = useMemo(
    () => (devices || []).filter((device) => selectedIds.includes(device.device_id)),
    [devices, selectedIds]
  );

  function toggleDevice(deviceId) {
    setSelectedIds((current) =>
      current.includes(deviceId)
        ? current.filter((id) => id !== deviceId)
        : [...current, deviceId]
    );
  }

  async function confirmAssign() {
    setError("");
    if (!selectedDevices.length) {
      setError("할당할 장비를 먼저 선택해주세요.");
      return;
    }
    if (!purpose) {
      setError("대여 사유를 선택해주세요.");
      return;
    }
    try {
      await onAssign(selectedDevices, { purpose });
    } catch (err) {
      setConfirmOpen(false);
      setError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-lg bg-white p-5 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="page-kicker">Device Assignment</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">{user.name} 장비 할당</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">대여 가능한 장비를 선택하면 해당 사용자에게 바로 할당됩니다.</p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {error ? <div className="mt-4 rounded-lg border border-[#ffc8d6] bg-[#fff0f4] px-4 py-3 text-sm font-extrabold text-[#d84f71]">{error}</div> : null}

        <section className="mt-5 rounded-lg border border-[#d8d2ff] bg-[#f7f7ff] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-extrabold text-brand">대여자 정보</p>
              <h3 className="mt-1 text-lg font-extrabold text-ink">{user.name}</h3>
            </div>
            <div className="grid gap-2 text-sm font-bold text-slate-600 sm:grid-cols-2 lg:min-w-[680px] lg:grid-cols-4">
              <span>소속: <b className="text-ink">{user.organization || "-"}</b></span>
              <span>부서: <b className="text-ink">{user.department || "-"}</b></span>
              <span>직책: <b className="text-ink">{user.position || "-"}</b></span>
              <span>연락처: <b className="text-ink">{user.contact || "-"}</b></span>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_340px]">
          <section className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="border-b border-line bg-slate-50 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  className="input pl-10"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="장비번호, 장비명, 모델명, 위치 검색"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {categories.map((name) => (
                  <button
                    key={name}
                    className={`chip min-h-10 ${category === name ? "chip-active" : ""}`}
                    type="button"
                    onClick={() => setCategory(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[52vh] overflow-auto p-3">
              {devices === null ? (
                <Loading />
              ) : filteredDevices.length ? (
                <div className="grid gap-2">
                  {filteredDevices.map((device) => {
                    const checked = selectedIds.includes(device.device_id);
                    return (
                      <label
                        key={device.device_id}
                        className={`grid cursor-pointer gap-3 rounded-lg border p-3 transition sm:grid-cols-[auto_1fr_auto] sm:items-center ${
                          checked ? "border-brand bg-[#f4f2ff]" : "border-line bg-white hover:border-[#c9c4ff] hover:bg-[#fbfbff]"
                        }`}
                      >
                        <input
                          className="mt-1 h-5 w-5 accent-brand sm:mt-0"
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDevice(device.device_id)}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-extrabold text-ink">{deviceTitle(device)}</p>
                            <span className="rounded-md bg-white px-2 py-0.5 text-xs font-extrabold text-brand ring-1 ring-line">{device.device_id}</span>
                          </div>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            {device.category || "-"} · {device.model_name || "-"} · {deviceCapacity(device)} · {device.location || "-"}
                          </p>
                        </div>
                        <StatusBadge status={device.status} />
                      </label>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="할당 가능한 장비가 없습니다." description="현재 대여 가능 상태의 장비가 없습니다." />
              )}
            </div>
          </section>

          <aside className="rounded-lg border border-line bg-[#fbfbff] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="section-title">선택 리스트</h3>
              <span className="rounded-lg bg-[#f2f0ff] px-3 py-1 text-xs font-extrabold text-brand">{selectedDevices.length}대</span>
            </div>
            <div className="mt-3 grid max-h-[42vh] gap-2 overflow-auto pr-1">
              {selectedDevices.length ? selectedDevices.map((device) => (
                <div key={device.device_id} className="rounded-lg border border-line bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-ink">{deviceTitle(device)}</p>
                      <p className="mt-1 text-xs font-bold text-brand">{device.device_id}</p>
                    </div>
                    <button className="btn-secondary h-8 w-8 shrink-0 p-0" type="button" onClick={() => toggleDevice(device.device_id)} aria-label="선택 해제">
                      <X size={15} />
                    </button>
                  </div>
                </div>
              )) : (
                <EmptyState title="선택한 장비가 없습니다." description="왼쪽 목록에서 체크하면 여기에 표시됩니다." />
              )}
            </div>
          </aside>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-secondary" type="button" onClick={onClose}>취소</button>
          <button className="btn-primary" type="button" disabled={busy || !selectedDevices.length} onClick={() => setConfirmOpen(true)}>
            <Check size={18} />
            {busy ? "할당 중" : "확인"}
          </button>
        </div>

        {confirmOpen ? (
          <ConfirmDialog
            title="선택한 장비를 할당할까요?"
            description={`${user.name} 사용자에게 선택한 장비 ${selectedDevices.length}대를 대여 처리합니다.`}
            busy={busy}
            confirmText="할당하기"
            confirmDisabled={!purpose}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={confirmAssign}
          >
            <div className="grid gap-3">
              <div className="rounded-lg border border-line bg-[#fbfbff] p-4">
                <p className="text-sm font-extrabold text-ink">대여자 정보</p>
                <dl className="mt-3 grid gap-2 text-sm font-bold text-slate-600 sm:grid-cols-2">
                  <div className="flex justify-between gap-3"><dt>이름</dt><dd className="text-ink">{user.name || "-"}</dd></div>
                  <div className="flex justify-between gap-3"><dt>소속</dt><dd className="text-ink">{user.organization || "-"}</dd></div>
                  <div className="flex justify-between gap-3"><dt>부서</dt><dd className="text-ink">{user.department || "-"}</dd></div>
                  <div className="flex justify-between gap-3"><dt>직책</dt><dd className="text-ink">{user.position || "-"}</dd></div>
                  <div className="flex justify-between gap-3"><dt>연락처</dt><dd className="text-ink">{user.contact || "-"}</dd></div>
                  <div className="flex justify-between gap-3"><dt>대여일</dt><dd className="text-ink">{todayInputValue()}</dd></div>
                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-sm font-bold text-slate-600">목적/사유</span>
                    <select className="select h-11 text-sm" value={purpose} onChange={(event) => setPurpose(event.target.value)} required>
                      <option value="">사유 선택</option>
                      {reasons.map((reason) => (
                        <option key={reason.reason_id} value={reason.reason_text}>{reason.reason_text}</option>
                      ))}
                    </select>
                    {!purpose ? <span className="text-xs font-semibold text-[#d84f71]">대여 사유를 선택해야 할당할 수 있습니다.</span> : null}
                  </label>
                  <div className="flex justify-between gap-3 sm:col-span-2"><dt>대여 위치</dt><dd className="text-ink">{user.department ? `${user.department} 자리` : "사용자 할당"}</dd></div>
                </dl>
              </div>
              <div className="rounded-lg border border-line bg-white p-4">
                <p className="text-sm font-extrabold text-ink">할당 장비</p>
                <div className="mt-3 grid max-h-48 gap-2 overflow-auto">
                  {selectedDevices.map((device) => (
                    <div key={device.device_id} className="flex items-center justify-between gap-3 rounded-lg bg-[#f7f7fd] px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-ink">{deviceTitle(device)}</p>
                        <p className="text-xs font-bold text-brand">{device.device_id}</p>
                      </div>
                      <span className="text-xs font-bold text-slate-500">{device.category || "-"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ConfirmDialog>
        ) : null}
      </section>
    </div>
  );
}

function DetailLine({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-sm font-extrabold text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-extrabold text-ink">{value || "-"}</dd>
    </div>
  );
}

function AssignedDeviceDetailModal({ user, device, busy, onClose, onRequest, onCancel, onResend }) {
  if (!device) return null;
  const isDelivered = device.status === "DELIVERED";
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="page-kicker">Assigned Device</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">{deviceTitle(device)}</h2>
            <p className="mt-1 text-sm font-extrabold text-brand">{device.device_id}</p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-lg border border-line bg-[#fbfbff] p-4">
            <h3 className="text-sm font-extrabold text-ink">할당 정보</h3>
            <dl className="mt-3">
              <DetailLine label="사용자" value={user?.name} />
              <DetailLine label="소속" value={user?.organization} />
              <DetailLine label="부서" value={user?.department} />
              <DetailLine label="직책" value={user?.position} />
              <DetailLine label="연락처" value={user?.contact} />
              <DetailLine label={isDelivered ? "납품 위치" : "대여 위치"} value={device.rent_location || device.location} />
              <DetailLine label={isDelivered ? "납품일" : "대여일"} value={formatDate(device.borrowed_at)} />
            </dl>
          </section>
          <section className="rounded-lg border border-line bg-white p-4">
            <h3 className="text-sm font-extrabold text-ink">장비 정보</h3>
            <dl className="mt-3">
              <DetailLine label="상태" value={<StatusBadge status={device.status} />} />
              <DetailLine label="분류" value={device.category} />
              <DetailLine label="모델명" value={device.model_name} />
              <DetailLine label="용량" value={deviceCapacity(device)} />
              <DetailLine label="제조사" value={device.manufacturer} />
              <DetailLine label="시리얼번호" value={device.serial_number} />
              <DetailLine label="보관위치" value={device.location} />
            </dl>
          </section>
        </div>

        {device.memo ? (
          <section className="mt-4 rounded-lg border border-line bg-slate-50 p-4">
            <h3 className="text-sm font-extrabold text-ink">메모</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-600">{device.memo}</p>
          </section>
        ) : null}

        {device.return_request ? (
          <section className="mt-4 rounded-lg border border-[#ffd8bf] bg-[#fff7f2] p-4">
            <h3 className="text-sm font-extrabold text-[#d47a3d]">반납 요청 중</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{device.return_request.message || "반납 요청이 발송된 장비입니다."}</p>
            <p className="mt-2 text-xs font-bold text-slate-500">요청일: {formatDateTime(device.return_request.created_at)}</p>
          </section>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <button className="btn-secondary" type="button" onClick={onClose}>닫기</button>
          <Link className="btn-secondary justify-center" to={`/devices/${device.device_id}`}>
            <Info size={18} />
            장비 상세로 이동
          </Link>
          {isDelivered ? (
            <Link className="btn-primary justify-center" to={`/devices/${device.device_id}`}>
              <Truck size={18} />
              회수 처리
            </Link>
          ) : device.return_request ? (
            <>
              <button className="btn-danger justify-center" type="button" onClick={() => onCancel(device)} disabled={busy}>
                <X size={18} />
                반납 취소
              </button>
              <button className="btn-accent justify-center" type="button" onClick={() => onResend(device)} disabled={busy}>
                <Send size={18} />
                반납 재요청
              </button>
            </>
          ) : (
            <button className="btn-primary justify-center" type="button" onClick={() => onRequest(device)} disabled={busy}>
              <Send size={18} />
              반납 요청
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function ReturnRequestModal({ user, device, busy, onClose, onSubmit }) {
  const [message, setMessage] = useState(() => defaultReturnRequestMessage(user, device));
  if (!device) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="page-kicker">Return Request</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">반납 요청 보내기</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">사용자 알림함과 화면 하단 알림으로 요청 내용이 전달됩니다.</p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-3 rounded-lg border border-[#d8d2ff] bg-[#f7f7ff] p-4 text-sm font-bold text-slate-600 sm:grid-cols-2">
          <span>요청 대상: <b className="text-ink">{user?.name || "-"}</b></span>
          <span>장비번호: <b className="text-brand">{device.device_id}</b></span>
          <span className="sm:col-span-2">장비명: <b className="text-ink">{deviceTitle(device)}</b></span>
          <span>대여 위치: <b className="text-ink">{device.rent_location || device.location || "-"}</b></span>
          <span>대여일: <b className="text-ink">{formatDate(device.borrowed_at)}</b></span>
        </div>

        <label className="mt-5 block">
          <span className="field-label">요청 문구</span>
          <textarea
            className="textarea min-h-36 text-base"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="사용자에게 보낼 반납 요청 내용을 입력하세요."
            required
          />
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={busy}>취소</button>
          <button className="btn-primary" type="button" onClick={() => onSubmit(device, message)} disabled={busy || !message.trim()}>
            <Send size={18} />
            {busy ? "요청 중" : "반납 요청 보내기"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function Users() {
  const currentUser = getCurrentUser();
  const [users, setUsers] = useState(null);
  const [userOptions, setUserOptions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [keyword, setKeyword] = useState("");
  const [sortMode, setSortMode] = useState("name");
  const [modal, setModal] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignedDetail, setAssignedDetail] = useState(null);
  const [returnRequestTarget, setReturnRequestTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const detailPanelRef = useRef(null);

  function revealDetailOnMobile() {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches) return;
    window.setTimeout(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  async function load(nextKeyword = keyword) {
    const rows = await api(`/users${queryString({ keyword: nextKeyword })}`);
    setUsers(rows);
    if (selected) {
      const stillExists = rows.some((user) => user.user_id === selected.user_id);
      if (stillExists) setSelected(await api(`/users/${encodeURIComponent(selected.user_id)}`));
      else setSelected(null);
    } else if (rows[0]) {
      setSelected(await api(`/users/${encodeURIComponent(rows[0].user_id)}`));
    }
  }

  useEffect(() => {
    Promise.all([load(), api("/user-options").then(setUserOptions)])
      .catch((err) => setError(err.message));
  }, []);

  const sortedUsers = useMemo(() => {
    const rows = [...(users || [])];
    const primaryAdmins = rows.filter(isPrimaryAdminUser);
    const normalUsers = rows.filter((user) => !isPrimaryAdminUser(user));
    if (sortMode === "name") {
      normalUsers.sort((a, b) => textCompare(a.name, b.name) || textCompare(a.user_id, b.user_id));
      return [...primaryAdmins, ...normalUsers];
    }
    if (sortMode === "department") {
      normalUsers.sort((a, b) => textCompare(a.department, b.department) || textCompare(a.name, b.name) || textCompare(a.user_id, b.user_id));
      return [...primaryAdmins, ...normalUsers];
    }
    return [...primaryAdmins, ...normalUsers];
  }, [users, sortMode]);

  async function selectUser(userId) {
    setSelected(await api(`/users/${encodeURIComponent(userId)}`));
    revealDetailOnMobile();
  }

  async function handleProfilePhotoUploaded(user) {
    setSelected((current) => (current?.user_id === user.user_id ? { ...current, ...user } : current));
    setUsers((current) =>
      (current || []).map((row) => (row.user_id === user.user_id ? { ...row, ...user, password: "" } : row))
    );
    syncStoredUserIfCurrent(user);
  }

  async function saveUser(form) {
    setBusy(true);
    setError("");
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      let saved;
      if (modal?.mode === "create") {
        saved = await api("/users", { method: "POST", body: form });
      } else {
        saved = await api(`/users/${encodeURIComponent(modal.user.user_id)}`, { method: "PUT", body: payload });
      }
      syncStoredUserIfCurrent(saved);
      setModal(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(user) {
    if (user?.user_id === currentUser?.user_id) {
      setError("현재 로그인한 본인 계정은 삭제할 수 없습니다.");
      setDeleteTarget(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/users/${encodeURIComponent(user.user_id)}`, { method: "DELETE" });
      setDeleteTarget(null);
      setSelected(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function assignDevicesToUser(devices, options = {}) {
    if (!selected) return;
    const assignmentMemo = "관리자가 사용자에게 장비를 할당함";
    setBusy(true);
    setError("");
    try {
      for (const device of devices) {
        const formData = new FormData();
        formData.append("user_name", selected.name || "");
        formData.append("user_department", selected.department || "");
        formData.append("user_contact", selected.contact || "");
        formData.append("purpose", options.purpose || "사용자 장비 할당");
        formData.append("rent_location", selected.department ? `${selected.department} 자리` : "사용자 할당");
        formData.append("condition_status", "정상");
        formData.append("rented_at", todayInputValue());
        formData.append("memo", assignmentMemo);
        await api(`/devices/${encodeURIComponent(device.device_id)}/rent`, { method: "POST", body: formData });
      }
      setAssignOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  function openReturnRequest(device) {
    setAssignedDetail(null);
    setReturnRequestTarget(device);
  }

  async function sendReturnRequest(device, message) {
    if (!selected || !device) return;
    setBusy(true);
    setError("");
    try {
      await api("/notifications/return-request", {
        method: "POST",
        body: {
          recipient_user_id: selected.user_id,
          device_id: device.device_id,
          message
        }
      });
      setReturnRequestTarget(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resendReturnRequest(device) {
    await sendReturnRequest(device, defaultReturnRequestMessage(selected, device));
    setAssignedDetail(null);
  }

  async function cancelReturnRequest(device) {
    if (!selected || !device) return;
    setBusy(true);
    setError("");
    try {
      await api("/notifications/return-request/cancel", {
        method: "POST",
        body: {
          recipient_user_id: selected.user_id,
          device_id: device.device_id
        }
      });
      setAssignedDetail(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    load(keyword).catch((err) => setError(err.message));
  }

  if (!users) return <Loading />;
  const isSelfSelected = selected?.user_id && selected.user_id === currentUser?.user_id;

  return (
    <div className="app-page">
      <section className="hero-strip">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="page-title">사용자 관리</h1>
            <p className="mt-1 text-sm text-slate-500">사용자 정보와 할당 장비를 관리합니다.</p>
          </div>
          <button className="btn-primary w-full md:w-auto" type="button" onClick={() => setModal({ mode: "create", user: null })}>
            <Plus size={18} />
            사용자 등록
          </button>
        </div>
      </section>

      {error ? <div className="rounded-lg border border-[#ffc8d6] bg-[#fff0f4] px-4 py-3 text-sm font-extrabold text-[#d84f71]">{error}</div> : null}

      <form className="panel flex flex-col gap-3 p-3 sm:p-4 md:flex-row" onSubmit={submitSearch}>
        <input className="input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="이름, ID, 소속, 부서, 연락처 검색" />
          <button className="btn-primary w-full md:w-32">
          <Search size={18} />
          조회
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside ref={detailPanelRef} className="panel order-2 p-3 sm:p-4 md:order-1">
          {selected ? (
            <div>
              <div className="border-b border-line pb-5 text-center">
                <div className="relative mx-auto w-fit">
                  <UserAvatar user={selected} size="xl" className="h-28 w-28 sm:h-36 sm:w-36" />
                  <ProfilePhotoUploader user={selected} iconOnly className="absolute bottom-0 left-0" disabled={busy} onUploaded={handleProfilePhotoUploaded} />
                </div>
                <h2 className="mt-4 truncate text-2xl font-extrabold text-ink">{selected.name}</h2>
                <p className="mt-1 truncate text-sm font-bold text-slate-500">
                  {[selected.organization, selected.department, selected.position].filter(Boolean).join(" / ") || "소속 / 부서 / 직책 미등록"}
                </p>
                <div className="mt-3 flex justify-center">
                  <RoleBadge role={selected.role} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="btn-secondary h-10 px-3" type="button" onClick={() => setModal({ mode: "edit", user: selected })}>
                    <UserCog size={16} />
                    수정
                  </button>
                  <button
                    className="btn-dispose h-10 px-3"
                    type="button"
                    onClick={() => setDeleteTarget(selected)}
                    disabled={busy || selected.user_id === "admin" || isSelfSelected}
                    title={isSelfSelected ? "현재 로그인한 본인 계정은 삭제할 수 없습니다." : ""}
                  >
                    <Trash2 size={16} />
                    삭제
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-[#f7f7fd] px-2 py-3">
                  <p className="text-lg font-extrabold text-ink">{selected.assigned_devices?.length || 0}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">할당</p>
                </div>
                <div className="rounded-lg bg-[#f7f7fd] px-2 py-3">
                  <p className="truncate text-lg font-extrabold text-ink">{selected.organization || "-"}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">소속</p>
                </div>
              </div>

              <dl className="mt-4">
                <DetailLine label="소속" value={selected.organization} />
                <DetailLine label="부서" value={selected.department} />
                <DetailLine label="직책" value={selected.position} />
                <DetailLine label="연락처" value={selected.contact} />
                <DetailLine label="이메일" value={selected.email} />
                <DetailLine label="메모" value={selected.memo} />
              </dl>

              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="section-title">할당 장비</h3>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-[#f2f0ff] px-3 py-1 text-xs font-extrabold text-brand">{selected.assigned_devices?.length || 0}대</span>
                    <button className="btn-primary h-9 px-3 text-xs" type="button" onClick={() => setAssignOpen(true)} disabled={busy}>
                      <PackagePlus size={15} />
                      장비 할당
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  {selected.assigned_devices?.length ? selected.assigned_devices.map((device) => (
                    <div key={device.device_id} className="rounded-lg border border-line bg-[#f7f7fd] p-3 transition hover:border-[#c9c4ff] hover:bg-white">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-ink">{deviceTitle(device)}</p>
                          <p className="mt-1 text-xs font-bold text-brand">{device.device_id}</p>
                          <p className="mt-1 truncate text-xs font-semibold text-slate-500">{device.rent_location || device.location || "-"} · {formatDate(device.borrowed_at)}</p>
                          {device.return_request ? (
                            <p className="mt-2 inline-flex rounded-lg bg-[#fff4ee] px-2.5 py-1 text-xs font-extrabold text-[#d47a3d]">
                              반납 요청 중 · {formatDateTime(device.return_request.created_at)}
                            </p>
                          ) : null}
                        </div>
                        <StatusBadge status={device.status} />
                      </div>
                      <div className={`mt-3 grid gap-2 ${device.return_request ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
                        <button className="btn-secondary h-9 px-2 text-xs" type="button" onClick={() => setAssignedDetail(device)}>
                          <Info size={15} />
                          세부 정보
                        </button>
                        {device.status === "DELIVERED" ? (
                          <Link className="btn-primary h-9 px-2 text-xs" to={`/devices/${device.device_id}`}>
                            <Truck size={15} />
                            회수 처리
                          </Link>
                        ) : device.return_request ? (
                          <>
                            <button className="btn-danger h-9 px-2 text-xs" type="button" onClick={() => cancelReturnRequest(device)} disabled={busy}>
                              <X size={15} />
                              반납 취소
                            </button>
                            <button className="btn-accent h-9 px-2 text-xs" type="button" onClick={() => resendReturnRequest(device)} disabled={busy}>
                              <Send size={15} />
                              재요청
                            </button>
                          </>
                        ) : (
                          <button className="btn-primary h-9 px-2 text-xs" type="button" onClick={() => openReturnRequest(device)} disabled={busy}>
                            <Send size={15} />
                            반납 요청
                          </button>
                        )}
                      </div>
                    </div>
                  )) : <EmptyState title="할당된 장비가 없습니다." />}
                </div>
              </div>

            </div>
          ) : (
            <EmptyState title="사용자를 선택해주세요." />
          )}
        </aside>

        <section className="panel order-1 overflow-hidden md:order-2">
          {users.length ? (
            <>
              <div className="flex flex-col gap-3 border-b border-line bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-extrabold text-slate-500">정렬 기준</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={sortMode === "name" ? "btn-primary h-10 px-3" : "btn-secondary h-10 px-3"}
                    type="button"
                    onClick={() => setSortMode("name")}
                  >
                    <ArrowDownAZ size={17} />
                    이름순
                  </button>
                  <button
                    className={sortMode === "department" ? "btn-primary h-10 px-3" : "btn-secondary h-10 px-3"}
                    type="button"
                    onClick={() => setSortMode("department")}
                  >
                    <Building2 size={17} />
                    부서순
                  </button>
                </div>
              </div>
              <div className="grid gap-2 p-2 sm:grid-cols-2 xl:hidden">
                {sortedUsers.map((user, index) => {
                  const isSelected = selected?.user_id === user.user_id;
                  return (
                    <button
                      key={user.user_id}
                      className={`soft-row text-left ${isPrimaryAdminUser(user) ? "admin-user-row" : ""} ${isSelected ? "border-brand bg-[#f4f2ff] shadow-lift" : ""}`}
                      type="button"
                      onClick={() => selectUser(user.user_id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <UserAvatar user={user} size="sm" />
                            <RoleBadge role={user.role} />
                            <p className="truncate font-extrabold text-ink">{user.name}</p>
                          </div>
                          <p className="mt-1 truncate text-xs font-bold text-slate-500">No {index + 1} · {user.user_id} · {user.organization || "소속 없음"} · {user.department || "부서 없음"}</p>
                        </div>
                        <span className="rounded-lg bg-[#f2f0ff] px-2.5 py-1 text-xs font-extrabold text-brand">{user.assigned_count || 0}대</span>
                      </div>
                      <p className="mt-2 text-sm font-bold text-slate-600">할당 장비 {user.assigned_count || 0}대</p>
                    </button>
                  );
                })}
              </div>
              <div className="hidden p-2 xl:block">
                <div className="overflow-hidden rounded-lg border border-line/70">
                  <table className="w-full table-fixed">
                    <thead className="table-head">
                      <tr>
                        <th className="w-16">순번</th>
                        <th className="w-24">권한</th>
                        <th className="w-28">이름</th>
                        <th className="w-36">사용자 ID</th>
                        <th className="w-32">소속</th>
                        <th className="w-32">부서</th>
                        <th className="w-32">직책</th>
                        <th className="w-36">연락처</th>
                        <th className="w-24">할당</th>
                        <th className="w-28">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedUsers.map((user, index) => (
                        <tr
                          key={user.user_id}
                          className={`cursor-pointer ${isPrimaryAdminUser(user) ? "admin-user-table-row" : "hover:bg-slate-50"}`}
                          onClick={() => selectUser(user.user_id)}
                        >
                          <td className="table-cell font-bold text-slate-500">{index + 1}</td>
                          <td className="table-cell">
                            <RoleBadge role={user.role} />
                          </td>
                          <td className="table-cell font-extrabold text-ink">
                            <span className="flex min-w-0 items-center gap-2">
                              <UserAvatar user={user} size="sm" />
                              <span className="block truncate">{user.name}</span>
                            </span>
                          </td>
                          <td className="table-cell font-extrabold text-brand">{user.user_id}</td>
                          <td className="table-cell"><span className="block truncate">{user.organization || "-"}</span></td>
                          <td className="table-cell"><span className="block truncate">{user.department || "-"}</span></td>
                          <td className="table-cell"><span className="block truncate">{user.position || "-"}</span></td>
                          <td className="table-cell">{user.contact || "-"}</td>
                          <td className="table-cell font-extrabold text-ink">{user.assigned_count || 0}대</td>
                          <td className="table-cell">
                            <button className="btn-secondary h-8 px-2 text-xs" type="button" onClick={(event) => {
                              event.stopPropagation();
                              setModal({ mode: "edit", user });
                            }}>
                              수정
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4">
              <EmptyState title="사용자가 없습니다." description="사용자 등록으로 계정을 추가해보세요." />
            </div>
          )}
        </section>
      </div>

      {modal ? (
        <UserModal
          mode={modal.mode}
          user={modal.user}
          userOptions={userOptions}
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={saveUser}
          onPhotoUploaded={handleProfilePhotoUploaded}
        />
      ) : null}
      {assignOpen && selected ? (
        <AssignDeviceModal
          user={selected}
          busy={busy}
          onClose={() => setAssignOpen(false)}
          onAssign={assignDevicesToUser}
        />
      ) : null}
      {assignedDetail && selected ? (
        <AssignedDeviceDetailModal
          user={selected}
          device={assignedDetail}
          busy={busy}
          onClose={() => setAssignedDetail(null)}
          onRequest={openReturnRequest}
          onCancel={cancelReturnRequest}
          onResend={resendReturnRequest}
        />
      ) : null}
      {returnRequestTarget && selected ? (
        <ReturnRequestModal
          user={selected}
          device={returnRequestTarget}
          busy={busy}
          onClose={() => setReturnRequestTarget(null)}
          onSubmit={sendReturnRequest}
        />
      ) : null}
      {deleteTarget ? (
        <ConfirmDialog
          title="사용자를 삭제할까요?"
          description={`${deleteTarget.name} 사용자 정보를 삭제합니다. 이미 남은 장비 이력은 유지됩니다.`}
          confirmText="삭제"
          danger
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteUser(deleteTarget)}
        />
      ) : null}
    </div>
  );
}
