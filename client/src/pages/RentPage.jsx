import { Camera, MessageSquareText, PackageCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import Loading from "../components/Loading.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { formatPhoneNumber } from "../constants.js";
import { compressImageFiles } from "../utils/imageCompress.js";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function TextField({ label, value, onChange, required, type = "text", placeholder, inputMode }) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <input className="input text-base" type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} />
    </label>
  );
}

export default function RentPage() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [form, setForm] = useState({
    user_name: "",
    user_department: "",
    user_position: "",
    user_contact: "",
    purpose: "",
    rented_at: today(),
    rent_location: "",
    condition_status: "정상",
    memo: ""
  });
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedPhotos = Array.from(photos);

  useEffect(() => {
    Promise.all([api(`/devices/${deviceId}`), api("/reasons?reason_type=RENT")])
      .then(([deviceData, reasonData]) => {
        setDevice(deviceData);
        setReasons(reasonData);
        if (!form.purpose && reasonData[0]?.reason_text) {
          setForm((current) => ({ ...current, purpose: current.purpose || reasonData[0].reason_text }));
        }
      })
      .catch((err) => setError(err.message));
  }, [deviceId]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: name === "user_contact" ? formatPhoneNumber(value) : value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.append(key, value));
    try {
      const compressedPhotos = await compressImageFiles(selectedPhotos, { maxSize: 1600, quality: 0.78 });
      compressedPhotos.forEach((photo) => data.append("photos", photo));
      await api(`/devices/${deviceId}/rent`, { method: "POST", body: data });
      navigate(`/devices/${deviceId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!device && !error) return <Loading />;
  const canRent = device?.status === "AVAILABLE";

  return (
    <div className="app-page">
      <section className="hero-strip">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="page-title">대여 처리</h1>
            {device ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link className="font-extrabold text-brand" to={`/devices/${device.device_id}`}>{device.device_name}</Link>
                <span className="text-sm font-bold text-slate-500">{device.device_id}</span>
                <StatusBadge status={device.status} />
              </div>
            ) : null}
          </div>
          <button className="btn-primary w-full sm:w-auto" form="rent-form" disabled={!canRent || busy}>
            <PackageCheck size={18} />
            {busy ? "사진 압축·처리 중" : "대여 처리"}
          </button>
        </div>
      </section>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {!canRent ? <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">대여 가능 상태의 장비만 대여할 수 있습니다.</div> : null}

      <form id="rent-form" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]" onSubmit={submit}>
        <div className="space-y-4">
          <section className="panel p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserRound size={20} className="text-brand" />
              <h2 className="section-title">대여자 정보</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-2 2xl:grid-cols-5">
              <TextField label="대여자 이름" value={form.user_name} onChange={(value) => update("user_name", value)} required placeholder="홍길동" />
              <TextField label="대여자 부서" value={form.user_department} onChange={(value) => update("user_department", value)} placeholder="부서명" />
              <TextField label="직책" value={form.user_position} onChange={(value) => update("user_position", value)} placeholder="직책" />
              <TextField label="연락처" value={form.user_contact} onChange={(value) => update("user_contact", value)} placeholder="010-0000-0000" inputMode="tel" />
              <TextField label="대여 장소" value={form.rent_location} onChange={(value) => update("rent_location", value)} placeholder="장비 인계 장소" />
            </div>
            <label className="mt-4 block">
              <span className="field-label">대여 사유</span>
              <select className="select text-base" value={form.purpose} onChange={(event) => update("purpose", event.target.value)} required>
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
              <PackageCheck size={20} className="text-brand" />
              <h2 className="section-title">일정 및 상태</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
              <TextField label="대여일" type="date" value={form.rented_at} onChange={(value) => update("rented_at", value)} />
              <label>
                <span className="field-label">대여 시 상태</span>
                <select className="select text-base" value={form.condition_status} onChange={(event) => update("condition_status", event.target.value)}>
                  <option>정상</option>
                  <option>오염</option>
                  <option>기타</option>
                </select>
              </label>
            </div>
          </section>
        </div>

        <aside className="grid gap-4 md:grid-cols-2 xl:block xl:space-y-4">
          <section className="panel p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquareText size={20} className="text-brand" />
              <h2 className="section-title">관리자 메모</h2>
            </div>
            <div className="rounded-lg border border-[#b9def7] bg-[#e8f6ff] p-3">
              <p className="text-sm font-extrabold text-ink">내부 확인 사항</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">장비 상태, 전달 특이사항, 별도 약속처럼 관리자만 확인할 내용을 남겨주세요.</p>
            </div>
            <label className="mt-3 block">
              <span className="field-label">관리자 메모</span>
              <textarea className="textarea text-base" value={form.memo} onChange={(event) => update("memo", event.target.value)} />
            </label>
          </section>

          <section className="panel p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Camera size={20} className="text-brand" />
              <h2 className="section-title">대여 사진</h2>
            </div>
            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#b9def7] bg-[#e8f6ff] px-4 py-6 text-center">
              <Camera size={28} className="text-brand" />
              <span className="mt-2 text-sm font-extrabold text-ink">{selectedPhotos.length ? `${selectedPhotos.length}장 선택됨` : "사진 선택"}</span>
              <span className="mt-1 text-xs font-semibold text-slate-500">대여 시 장비 상태를 남겨주세요.</span>
              <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setPhotos(event.target.files || [])} />
            </label>
          </section>
        </aside>
      </form>
    </div>
  );
}
