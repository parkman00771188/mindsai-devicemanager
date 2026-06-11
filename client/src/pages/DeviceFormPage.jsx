import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import DeviceForm from "../components/DeviceForm.jsx";
import Loading from "../components/Loading.jsx";

export default function DeviceFormPage({ mode }) {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isEdit = mode === "edit";

  useEffect(() => {
    if (isEdit) api(`/devices/${deviceId}`).then(setDevice).catch((err) => setError(err.message));
  }, [deviceId, isEdit]);

  async function submit(formData) {
    setBusy(true); setError("");
    try {
      const saved = await api(isEdit ? `/devices/${deviceId}` : "/devices", { method: isEdit ? "PUT" : "POST", body: formData });
      navigate(`/devices/${saved.device_id}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (isEdit && !device && !error) return <Loading />;
  return (
    <div className="app-page">
      <section className="hero-strip">
        <h1 className="page-title">{isEdit ? "장비 수정" : "장비 등록"}</h1>
        <p className="mt-1 text-sm text-slate-500">{isEdit ? "장비 정보 변경은 이력에 기록됩니다." : "장비번호와 QR 코드는 등록 시 자동 생성됩니다."}</p>
      </section>
      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      <DeviceForm initialDevice={device} mode={isEdit ? "edit" : "create"} onSubmit={submit} busy={busy} />
    </div>
  );
}
