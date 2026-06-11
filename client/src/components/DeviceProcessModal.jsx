import { AlertTriangle, Building2, Camera, MapPin, PackageCheck, RotateCcw, Truck, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { formatPhoneNumber, STATUS_OPTIONS, transactionMemo, transactionPlace } from "../constants.js";
import { compressImageFiles } from "../utils/imageCompress.js";

function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function loginUser() {
  try {
    return JSON.parse(localStorage.getItem("deviceManagerUser") || "null") || {};
  } catch {
    return {};
  }
}

const returnConditions = ["정상", "오염", "파손", "구성품 누락", "작동 불량", "분실", "기타"];

function normalizeDateValue(value) {
  const source = String(value || "").trim();
  const match = source.match(/^(\d{4,})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return source;
  return `${match[1].slice(0, 4)}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function TextField({ label, value, onChange, required, type = "text", placeholder, inputMode, readOnly }) {
  const isDate = type === "date";
  const inputValue = isDate ? normalizeDateValue(value) : value || "";
  const handleChange = (event) => onChange(isDate ? normalizeDateValue(event.target.value) : event.target.value);

  return (
    <label>
      <span className="field-label">{label}</span>
      <input
        className={`input text-base ${readOnly ? "bg-slate-50 text-slate-600" : ""}`}
        type={type}
        inputMode={inputMode}
        value={inputValue}
        min={isDate ? "1900-01-01" : undefined}
        max={isDate ? "2099-12-31" : undefined}
        onChange={handleChange}
        onBlur={handleChange}
        required={required}
        placeholder={placeholder}
        readOnly={readOnly}
      />
    </label>
  );
}

function UserPicker({ label, value, users, onInput, onSelect, required, placeholder }) {
  const [focused, setFocused] = useState(false);
  const keyword = String(value || "").trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!focused || !keyword) return [];
    return users
      .filter((user) =>
        [user.name, user.organization, user.department, user.position, user.user_id]
          .some((field) => String(field || "").toLowerCase().includes(keyword))
      )
      .slice(0, 8);
  }, [focused, keyword, users]);

  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        className="input text-base"
        value={value || ""}
        onChange={(event) => onInput(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
      />
      {suggestions.length ? (
        <div className="mt-2 w-full overflow-hidden rounded-lg border border-line bg-white shadow-soft sm:w-[520px] sm:max-w-[calc(100vw-4rem)]">
          {suggestions.map((user) => (
            <button
              key={user.user_id}
              type="button"
              className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2.5 text-left last:border-b-0 hover:bg-[#f7f7fd]"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(user);
                setFocused(false);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-ink">{user.name}</span>
                <span className="block whitespace-normal text-xs font-bold leading-5 text-slate-500">
                  {[user.organization, user.department, user.position].filter(Boolean).join(" · ") || "-"}
                </span>
              </span>
              <span className="shrink-0 rounded-lg bg-[#e8f6ff] px-2.5 py-1 text-xs font-extrabold text-brand">{user.user_id}</span>
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

function InstitutionPicker({ label, value, institutions, onInput, onSelect, required, placeholder }) {
  const [focused, setFocused] = useState(false);
  const keyword = String(value || "").trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!focused || !keyword) return [];
    return institutions
      .filter((institution) =>
        [institution.institution_name, institution.contact_person, institution.contact, institution.address, institution.memo]
          .some((field) => String(field || "").toLowerCase().includes(keyword))
      )
      .slice(0, 8);
  }, [focused, institutions, keyword]);

  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        className="input text-base"
        value={value || ""}
        onChange={(event) => onInput(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
      />
      {suggestions.length ? (
        <div className="mt-2 w-full overflow-hidden rounded-lg border border-line bg-white shadow-soft sm:w-[520px] sm:max-w-[calc(100vw-4rem)]">
          {suggestions.map((institution) => (
            <button
              key={institution.institution_id}
              type="button"
              className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2.5 text-left last:border-b-0 hover:bg-[#f7f7fd]"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(institution);
                setFocused(false);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-ink">{institution.institution_name}</span>
                <span className="block whitespace-normal text-xs font-bold leading-5 text-slate-500">
                  {[institution.contact_person, institution.contact, institution.address].filter(Boolean).join(" · ") || "-"}
                </span>
              </span>
              <span className="shrink-0 rounded-lg bg-[#f2f0ff] px-2.5 py-1 text-xs font-extrabold text-brand">{institution.assigned_count || 0}대</span>
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

function BorrowerTypeToggle({ value, onChange }) {
  const items = [
    ["PERSON", "개인", UserRound],
    ["INSTITUTION", "기관", Building2]
  ];
  return (
    <div className="flex w-full rounded-lg border border-line bg-white p-1 sm:w-auto">
      {items.map(([type, label, Icon]) => (
        <button
          key={type}
          type="button"
          className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-extrabold transition sm:flex-none ${
            value === type ? "bg-brand text-white shadow-soft" : "text-slate-600 hover:bg-[#f2f0ff] hover:text-brand"
          }`}
          onClick={() => onChange(type)}
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
    </div>
  );
}

function Header({ mode, device, onClose }) {
  const isRent = mode === "rent";
  const isDelivery = mode === "delivery";
  const isRentalEdit = mode === "rentalEdit";
  const isRecovery = mode === "recover";
  const isDeliveryInfo = isRentalEdit && device?.status === "DELIVERED";
  const title = isRentalEdit ? (isDeliveryInfo ? "납품 정보 수정" : "대여 정보 수정") : isDelivery ? "납품 처리" : isRent ? "대여 처리" : isRecovery ? "회수 처리" : "반납 처리";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
      <div>
        <p className="page-kicker">{title}</p>
        <h2 className="mt-1 text-xl font-extrabold text-ink">{device.device_name || device.device_id}</h2>
        <p className="mt-1 text-sm font-extrabold text-brand">{device.device_id}</p>
      </div>
      <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="닫기">
        <X size={18} />
      </button>
    </div>
  );
}

export default function DeviceProcessModal({ device, mode, currentTransaction, onClose, onDone }) {
  const isRent = mode === "rent";
  const isDelivery = mode === "delivery";
  const isRentalEdit = mode === "rentalEdit";
  const isRecovery = mode === "recover";
  const isCheckout = isRent || isDelivery || isRentalEdit;
  const isDeliveryFlow =
    isDelivery ||
    (isRentalEdit &&
      (device?.status === "DELIVERED" ||
        currentTransaction?.action_type === "DELIVERY" ||
        currentTransaction?.source_action_type === "DELIVERY"));
  const returnLabel = isRecovery ? "회수" : "반납";
  const returnStatusOptions = STATUS_OPTIONS.filter(([value]) => !["RENTED", "DELIVERED", "DISPOSED"].includes(value));
  const currentUser = loginUser();
  const shouldBlankDeliveryPerson = isDelivery && !currentTransaction;
  const [users, setUsers] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() =>
    isCheckout
      ? {
          borrower_type:
            currentTransaction?.borrower_type ||
            (device?.borrower_department === "기관" ? "INSTITUTION" : "PERSON"),
          institution_id: currentTransaction?.institution_id || "",
          institution_name:
            currentTransaction?.institution_name ||
            (device?.borrower_department === "기관" ? device?.current_borrower || "" : ""),
          user_name: currentTransaction?.user_name || (shouldBlankDeliveryPerson ? "" : device?.current_borrower || currentUser.name || ""),
          user_department: currentTransaction?.user_department || (shouldBlankDeliveryPerson ? "" : device?.borrower_department || ""),
          user_position: currentTransaction?.user_position || "",
          user_contact: formatPhoneNumber(currentTransaction?.user_contact || ""),
          purpose: currentTransaction?.purpose || "",
          rented_at: device?.borrowed_at || currentTransaction?.rented_at || today(),
          expected_return_at: isDeliveryFlow ? "" : device?.expected_return_at || currentTransaction?.expected_return_at || "",
          rent_location: transactionPlace(currentTransaction || {}),
          condition_status: currentTransaction?.condition_status || "정상",
          memo: transactionMemo(currentTransaction || {}),
          source_action_type: currentTransaction?.action_type || ""
        }
      : {
          borrower_type: device?.borrower_department === "기관" ? "INSTITUTION" : "PERSON",
          institution_id: "",
          institution_name: device?.borrower_department === "기관" ? device?.current_borrower || "" : "",
          user_name: device?.current_borrower || currentUser.name || "",
          user_department: device?.borrower_department || "",
          user_position: "",
          return_reason: "",
          returned_at: today(),
          return_location: "",
          condition_status: "정상",
          has_issue: "false",
          issue_description: "",
          status_after: "",
          memo: ""
        }
  );

  useEffect(() => {
    if (!device || !mode) return;
    const reasonType = isDeliveryFlow ? "DELIVERY" : isRent || isRentalEdit ? "RENT" : isRecovery ? "RECOVERY" : "RETURN";
    api(`/reasons?reason_type=${reasonType}`)
      .then((rows) => {
        setReasons(rows);
        const reasonValue = rows[0]?.reason_text || (isDeliveryFlow ? "납품" : isRecovery ? "회수" : "");
        setForm((current) => ({
          ...current,
          [isCheckout ? "purpose" : "return_reason"]: current[isCheckout ? "purpose" : "return_reason"] || reasonValue
        }));
      })
      .catch((err) => setError(err.message));
  }, [device, isRent, isDeliveryFlow, isRecovery, isCheckout, isRentalEdit, mode]);

  useEffect(() => {
    if (!device || !mode) return;
    api("/users")
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [device, mode]);

  useEffect(() => {
    if (!device || !mode || !isCheckout) return;
    api("/institutions")
      .then(setInstitutions)
      .catch(() => setInstitutions([]));
  }, [device, isCheckout, mode]);

  useEffect(() => {
    if (!users.length) return;
    const current = users.find((user) => user.user_id === currentUser.user_id);
    setForm((previous) => {
      if (previous.borrower_type === "INSTITUTION") return previous;
      if (isRentalEdit && currentTransaction) return previous;
      if (isDelivery && !isRentalEdit) return previous;
      const fallbackUser = isRentalEdit ? (!previous.user_name ? current : null) : (isCheckout || !previous.user_name ? current : null);
      const matched =
        users.find((user) => user.name === previous.user_name && (!previous.user_department || user.department === previous.user_department)) ||
        fallbackUser;
      if (!matched) return previous;
      return {
        ...previous,
        user_name: matched.name || previous.user_name,
        user_department: matched.department || "",
        user_position: matched.position || "",
        user_contact: formatPhoneNumber(matched.contact || previous.user_contact || "")
      };
    });
  }, [users, isCheckout, isDelivery, isRentalEdit, currentTransaction, currentUser.user_id]);

  const reasonChoices = useMemo(() => {
    const choices = [];
    const seen = new Set();
    const add = (value) => {
      const text = String(value || "").trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      choices.push(text);
    };
    reasons.forEach((reason) => add(reason.reason_text));
    if (isCheckout) add(form.purpose);
    if (!choices.length && isDeliveryFlow) add("납품");
    if (!choices.length && isRecovery) add("회수");
    return choices;
  }, [form.purpose, isCheckout, isDeliveryFlow, isRecovery, reasons]);

  if (!device || !mode) return null;

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: name === "user_contact" ? formatPhoneNumber(value) : value }));
  }

  function changeBorrowerType(type) {
    if (type === form.borrower_type) return;
    if (type === "PERSON") {
      const current = users.find((user) => user.user_id === currentUser.user_id);
      const defaultUser = isDelivery && !isRentalEdit ? null : current;
      setForm((previous) => ({
        ...previous,
        borrower_type: "PERSON",
        institution_id: "",
        institution_name: "",
        user_name: defaultUser?.name || (!isDelivery || isRentalEdit ? currentUser.name || "" : ""),
        user_department: defaultUser?.department || "",
        user_position: defaultUser?.position || "",
        user_contact: formatPhoneNumber(defaultUser?.contact || "")
      }));
      return;
    }
    setForm((previous) => ({
      ...previous,
      borrower_type: "INSTITUTION",
      institution_id: "",
      institution_name: "",
      user_name: "",
      user_department: "기관",
      user_position: "",
      user_contact: ""
    }));
  }

  function inputUserName(value) {
    setForm((current) => ({
      ...current,
      borrower_type: "PERSON",
      institution_id: "",
      institution_name: "",
      user_name: value,
      user_department: "",
      user_position: "",
      user_contact: ""
    }));
  }

  function selectUser(user) {
    setForm((current) => ({
      ...current,
      borrower_type: "PERSON",
      institution_id: "",
      institution_name: "",
      user_name: user.name || "",
      user_department: user.department || "",
      user_position: user.position || "",
      user_contact: formatPhoneNumber(user.contact || "")
    }));
  }

  function inputInstitutionName(value) {
    setForm((current) => ({
      ...current,
      borrower_type: "INSTITUTION",
      institution_id: "",
      institution_name: value,
      user_name: value,
      user_department: "기관",
      user_position: "",
      user_contact: ""
    }));
  }

  function selectInstitution(institution) {
    setForm((current) => ({
      ...current,
      borrower_type: "INSTITUTION",
      institution_id: institution.institution_id || "",
      institution_name: institution.institution_name || "",
      user_name: institution.institution_name || "",
      user_department: "기관",
      user_position: institution.contact_person || "",
      user_contact: formatPhoneNumber(institution.contact || "")
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.append(key, value));
    if (isDeliveryFlow) data.set("expected_return_at", "");
    try {
      const compressedPhotos = await compressImageFiles(Array.from(photos), { maxSize: 1600, quality: 0.78 });
      compressedPhotos.forEach((photo) => data.append("photos", photo));
      const path = isRentalEdit
        ? `/devices/${device.device_id}/rental-info`
        : `/devices/${device.device_id}/${isDelivery ? "delivery" : isRent ? "rent" : isRecovery ? "recover" : "return"}`;
      await api(path, { method: isRentalEdit ? "PUT" : "POST", body: data });
      await onDone?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-[1500px] overflow-auto rounded-lg bg-white p-4 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <Header mode={mode} device={device} onClose={onClose} />
        {error ? <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <form className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_440px]" onSubmit={submit}>
          <div className="space-y-4">
            {isCheckout ? (
              <>
                <section className="panel p-4 sm:p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="flex items-center gap-2">
                      {form.borrower_type === "INSTITUTION" ? <Building2 size={20} className="text-brand" /> : <UserRound size={20} className="text-brand" />}
                      <h3 className="section-title">{isDeliveryFlow ? "납품 대상 정보" : "대여자 정보"}</h3>
                    </div>
                    <BorrowerTypeToggle value={form.borrower_type} onChange={changeBorrowerType} />
                  </div>
                  {form.borrower_type === "INSTITUTION" ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <InstitutionPicker label="기관명" value={form.institution_name} institutions={institutions} onInput={inputInstitutionName} onSelect={selectInstitution} required placeholder="기관명을 검색하세요" />
                      <TextField label={isDeliveryFlow ? "납품 구분" : "대여 구분"} value={form.user_department} onChange={() => {}} readOnly />
                      <TextField label="담당자" value={form.user_position} onChange={(value) => update("user_position", value)} placeholder="담당자 이름" />
                      <TextField label="담당자 연락처" value={form.user_contact} onChange={(value) => update("user_contact", value)} placeholder="010-0000-0000" inputMode="tel" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <UserPicker label={isDeliveryFlow ? "납품 대상자 이름" : "대여자 이름"} value={form.user_name} users={users} onInput={inputUserName} onSelect={selectUser} required placeholder="이름을 입력하세요" />
                      <TextField label={isDeliveryFlow ? "납품 대상자 부서" : "대여자 부서"} value={form.user_department} onChange={(value) => update("user_department", value)} placeholder="부서를 입력하세요" />
                      <TextField label="직책" value={form.user_position} onChange={(value) => update("user_position", value)} placeholder="직책을 입력하세요" />
                      <TextField label="연락처" value={form.user_contact} onChange={(value) => update("user_contact", value)} placeholder="010-0000-0000" inputMode="tel" />
                    </div>
                  )}
                  <label className="mt-4 block">
                    <span className="field-label">{isDeliveryFlow ? "납품 사유" : "대여 사유"}</span>
                    <select className="select text-base" value={form.purpose} onChange={(event) => update("purpose", event.target.value)} required>
                      <option value="">사유 선택</option>
                      {reasonChoices.map((reason) => (
                        <option key={reason} value={reason}>{reason}</option>
                      ))}
                    </select>
                  </label>
                </section>
                <section className="panel p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    {isDeliveryFlow ? <Truck size={20} className="text-brand" /> : <PackageCheck size={20} className="text-brand" />}
                    <h3 className="section-title">일정 및 상태</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <TextField label={isDeliveryFlow ? "납품일" : "대여일"} type="date" value={form.rented_at} onChange={(value) => update("rented_at", value)} />
                    {!isDeliveryFlow ? <TextField label="예상 반납일" type="date" value={form.expected_return_at} onChange={(value) => update("expected_return_at", value)} /> : null}
                    <TextField label={isDeliveryFlow ? "납품 장소" : "대여 장소"} value={form.rent_location} onChange={(value) => update("rent_location", value)} placeholder="장비 인계 장소" />
                    <label>
                      <span className="field-label">{isDeliveryFlow ? "납품 시 상태" : "대여 시 상태"}</span>
                      <select className="select text-base" value={form.condition_status} onChange={(event) => update("condition_status", event.target.value)}>
                        <option>정상</option>
                        <option>오염</option>
                        <option>기타</option>
                      </select>
                    </label>
                  </div>
                </section>
              </>
            ) : (
              <>
                <section className="panel p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <UserRound size={20} className="text-brand" />
                    <h3 className="section-title">{returnLabel}자 정보</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                    <UserPicker label={`${returnLabel}자 이름`} value={form.user_name} users={users} onInput={inputUserName} onSelect={selectUser} required placeholder="이름을 입력하세요" />
                    <TextField label="부서" value={form.user_department} onChange={() => {}} readOnly placeholder="이름 선택 시 자동 입력" />
                    <TextField label="직책" value={form.user_position} onChange={() => {}} readOnly placeholder="이름 선택 시 자동 입력" />
                    <TextField label={`${returnLabel}일`} type="date" value={form.returned_at} onChange={(value) => update("returned_at", value)} />
                    <TextField label={`${returnLabel} 장소`} value={form.return_location} onChange={(value) => update("return_location", value)} />
                  </div>
                  <label className="mt-4 block">
                    <span className="field-label">{returnLabel} 사유</span>
                    <select className="select text-base" value={form.return_reason} onChange={(event) => update("return_reason", event.target.value)} required>
                      <option value="">사유 선택</option>
                      {reasons.map((reason) => (
                        <option key={reason.reason_id} value={reason.reason_text}>{reason.reason_text}</option>
                      ))}
                    </select>
                  </label>
                </section>
                <section className="panel p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <AlertTriangle size={20} className="text-brand" />
                    <h3 className="section-title">상태 확인</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    <label>
                      <span className="field-label">{returnLabel} 시 상태</span>
                      <select className="select text-base" value={form.condition_status} onChange={(event) => update("condition_status", event.target.value)}>
                        {returnConditions.map((condition) => <option key={condition}>{condition}</option>)}
                      </select>
                    </label>
                    <label>
                      <span className="field-label">이상 여부</span>
                      <select className="select text-base" value={form.has_issue} onChange={(event) => update("has_issue", event.target.value)}>
                        <option value="false">이상 없음</option>
                        <option value="true">이상 있음</option>
                      </select>
                    </label>
                    <label>
                      <span className="field-label">{returnLabel} 후 상태</span>
                      <select className="select text-base" value={form.status_after} onChange={(event) => update("status_after", event.target.value)}>
                        <option value="">자동 판단</option>
                        {returnStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="mt-4 block">
                    <span className="field-label">이상 내용</span>
                    <textarea className="textarea text-base" value={form.issue_description} onChange={(event) => update("issue_description", event.target.value)} placeholder="파손, 오염, 구성품 누락 등 특이사항을 입력해주세요." />
                  </label>
                </section>
              </>
            )}
          </div>

          <aside className="grid gap-4 md:grid-cols-2 xl:block xl:space-y-4">
            <section className="panel p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <MapPin size={20} className="text-brand" />
                <h3 className="section-title">메모</h3>
              </div>
              <textarea className="textarea min-h-48 text-base sm:min-h-56 xl:min-h-64" value={form.memo} onChange={(event) => update("memo", event.target.value)} placeholder="추가 확인 사항을 입력하세요." />
            </section>
            <section className="panel p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <Camera size={20} className="text-brand" />
                <h3 className="section-title">{isDeliveryFlow ? "납품 사진" : isCheckout ? "대여 사진" : `${returnLabel} 사진`}</h3>
              </div>
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#b9def7] bg-[#e8f6ff] px-4 py-6 text-center">
                <Camera size={28} className="text-brand" />
                <span className="mt-2 text-sm font-extrabold text-ink">{Array.from(photos).length ? `${Array.from(photos).length}장 선택됨` : "사진 선택"}</span>
                <span className="mt-1 text-xs font-semibold text-slate-500">처리 시점의 장비 상태를 남겨주세요.</span>
                <input className="sr-only" type="file" accept="image/*" multiple onChange={(event) => setPhotos(event.target.files || [])} />
              </label>
            </section>
            <button className="btn-primary w-full justify-center" disabled={busy}>
              {isDeliveryFlow || isRecovery ? <Truck size={18} /> : isCheckout ? <PackageCheck size={18} /> : <RotateCcw size={18} />}
              {busy ? "처리 중" : isRentalEdit ? `${isDeliveryFlow ? "납품" : "대여"} 정보 저장` : isDelivery ? "납품 처리" : isRent ? "대여 처리" : `${returnLabel} 처리`}
            </button>
          </aside>
        </form>
      </section>
    </div>
  );
}
