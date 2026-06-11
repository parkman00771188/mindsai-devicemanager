import { AlertTriangle, Camera, MapPin, RotateCcw, Truck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { getCurrentUser, isAdminUser } from "../auth.js";
import Loading from "../components/Loading.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { STATUS_OPTIONS } from "../constants.js";
import { compressImageFiles } from "../utils/imageCompress.js";

function today() {
  return new Date().toISOString().slice(0, 10);
}

const conditions = ["정상", "오염", "파손", "구성품 누락", "작동 불량", "분실", "기타"];

function TextField({ label, value, onChange, required, type = "text", placeholder }) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <input className="input text-base" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} />
    </label>
  );
}

export default function ReturnPage() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [form, setForm] = useState({
    user_name: "",
    user_department: "",
    return_reason: "",
    returned_at: today(),
    return_location: "",
    condition_status: "정상",
    has_issue: "false",
    issue_description: "",
    status_after: "",
    memo: ""
  });
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedPhotos = Array.from(photos);
  const currentUser = getCurrentUser();
  const isAdmin = isAdminUser(currentUser);

  useEffect(() => {
    api(`/devices/${deviceId}`)
      .then(async (deviceData) => {
        const isRecovery = deviceData.status === "DELIVERED";
        const reasonData = await api(`/reasons?reason_type=${isRecovery ? "RECOVERY" : "RETURN"}`);
        setDevice(deviceData);
        setReasons(reasonData);
        setForm((current) => ({
          ...current,
          user_name: deviceData.current_borrower || "",
          user_department: deviceData.borrower_department || "",
          return_reason: current.return_reason || reasonData[0]?.reason_text || (isRecovery ? "회수" : "")
        }));
      })
      .catch((err) => setError(err.message));
  }, [deviceId]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (device?.status === "DELIVERED" && !isAdmin) {
      setError("회수 처리는 관리자만 할 수 있습니다.");
      return;
    }
    setBusy(true);
    setError("");
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.append(key, value));
    try {
      const compressedPhotos = await compressImageFiles(selectedPhotos, { maxSize: 1600, quality: 0.78 });
      compressedPhotos.forEach((photo) => data.append("photos", photo));
      await api(`/devices/${deviceId}/${isRecovery ? "recover" : "return"}`, { method: "POST", body: data });
      navigate(`/devices/${deviceId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!device && !error) return <Loading />;
  const isRecovery = device?.status === "DELIVERED";
  const canReturn = ["RENTED", "DELIVERED"].includes(device?.status);
  const canProcess = canReturn && (!isRecovery || isAdmin);
  const processLabel = isRecovery ? "회수" : "반납";
  const statusOptions = STATUS_OPTIONS.filter(([value]) => !["RENTED", "DELIVERED", "DISPOSED"].includes(value));

  return (
    <div className="app-page">
      <section className="hero-strip">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="page-title">{processLabel} 처리</h1>
            {device ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link className="font-extrabold text-brand" to={`/devices/${device.device_id}`}>{device.device_name}</Link>
                <span className="text-sm font-bold text-slate-500">{device.device_id}</span>
                <StatusBadge status={device.status} />
              </div>
            ) : null}
          </div>
          <button className="btn-primary w-full sm:w-auto" form="return-form" disabled={!canProcess || busy}>
            {isRecovery ? <Truck size={18} /> : <RotateCcw size={18} />}
            {busy ? "사진 압축·처리 중" : `${processLabel} 처리`}
          </button>
        </div>
      </section>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {!canReturn ? <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">대여 중 또는 납품 상태인 장비만 반납/회수 처리할 수 있습니다.</div> : null}
      {canReturn && isRecovery && !isAdmin ? <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">회수 처리는 관리자만 할 수 있습니다.</div> : null}

      <form id="return-form" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]" onSubmit={submit}>
        <div className="space-y-4">
          <section className="panel p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserRound size={20} className="text-brand" />
              <h2 className="section-title">{processLabel}자 정보</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              <TextField label={`${processLabel}자 이름`} value={form.user_name} onChange={(value) => update("user_name", value)} required />
              <TextField label="부서" value={form.user_department} onChange={(value) => update("user_department", value)} />
              <TextField label={`${processLabel}일`} type="date" value={form.returned_at} onChange={(value) => update("returned_at", value)} />
            </div>
            <label className="mt-4 block">
              <span className="field-label">{processLabel} 사유</span>
              <select className="select text-base" value={form.return_reason} onChange={(event) => update("return_reason", event.target.value)} required>
                <option value="">사유 선택</option>
                {reasons.map((reason) => (
                  <option key={reason.reason_id} value={reason.reason_text}>
                    {reason.reason_text}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="panel p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle size={20} className="text-brand" />
              <h2 className="section-title">상태 확인</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              <label>
                <span className="field-label">{processLabel} 시 상태</span>
                <select className="select text-base" value={form.condition_status} onChange={(event) => update("condition_status", event.target.value)}>
                  {conditions.map((condition) => <option key={condition}>{condition}</option>)}
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
                <span className="field-label">{processLabel} 후 상태</span>
                <select className="select text-base" value={form.status_after} onChange={(event) => update("status_after", event.target.value)}>
                  <option value="">자동 판단</option>
                  {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-4 block">
              <span className="field-label">이상 내용</span>
              <textarea className="textarea text-base" value={form.issue_description} onChange={(event) => update("issue_description", event.target.value)} placeholder="파손, 오염, 구성품 누락 등 특이사항을 입력해주세요." />
            </label>
          </section>
        </div>

        <aside className="grid gap-4 md:grid-cols-2 xl:block xl:space-y-4">
          <section className="panel p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <MapPin size={20} className="text-brand" />
              <h2 className="section-title">장소 및 메모</h2>
            </div>
            <TextField label={`${processLabel} 장소`} value={form.return_location} onChange={(value) => update("return_location", value)} />
            <label className="mt-4 block">
              <span className="field-label">메모</span>
              <textarea className="textarea text-base" value={form.memo} onChange={(event) => update("memo", event.target.value)} />
            </label>
          </section>

          <section className="panel p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Camera size={20} className="text-brand" />
              <h2 className="section-title">{processLabel} 사진</h2>
            </div>
            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#b9def7] bg-[#e8f6ff] px-4 py-6 text-center">
              <Camera size={28} className="text-brand" />
              <span className="mt-2 text-sm font-extrabold text-ink">{selectedPhotos.length ? `${selectedPhotos.length}장 선택됨` : "사진 선택"}</span>
              <span className="mt-1 text-xs font-semibold text-slate-500">{processLabel} 시 장비 상태를 남겨주세요.</span>
              <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setPhotos(event.target.files || [])} />
            </label>
          </section>
        </aside>
      </form>
    </div>
  );
}
