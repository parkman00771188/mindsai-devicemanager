import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, queryString } from "../api/client.js";
import EmptyState from "../components/EmptyState.jsx";
import Loading from "../components/Loading.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { formatDateTime, STATUS_OPTIONS } from "../constants.js";
import { compressImageFiles } from "../utils/imageCompress.js";

function today() { return new Date().toISOString().slice(0, 10); }
export default function Maintenance() {
  const [params] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [devices, setDevices] = useState([]);
  const [filters, setFilters] = useState({ device_id: params.get("deviceId") || "", maintenance_type: "" });
  const [form, setForm] = useState({ device_id: params.get("deviceId") || "", maintenance_type: "정기점검", checked_by: "admin", checked_at: today(), result: "", issue_level: "보통", action_taken: "", next_check_at: "", status_after: "", memo: "" });
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(nextFilters = filters) {
    const [maintenanceRows, deviceRows] = await Promise.all([api(`/maintenance${queryString(nextFilters)}`), api("/devices")]);
    setRows(maintenanceRows); setDevices(deviceRows);
  }
  useEffect(() => { load(); }, []);
  const selectedDevice = useMemo(() => devices.find((device) => device.device_id === form.device_id), [devices, form.device_id]);
  function update(name, value) { setForm((current) => ({ ...current, [name]: value })); }
  async function submit(event) {
    event.preventDefault();
    if (!form.device_id) { setError("장비를 선택하세요."); return; }
    setBusy(true); setError("");
    const data = new FormData(); Object.entries(form).forEach(([key, value]) => { if (key !== "device_id") data.append(key, value); });
    try { const compressedPhotos = await compressImageFiles(Array.from(photos), { maxSize: 1600, quality: 0.78 }); compressedPhotos.forEach((photo) => data.append("photos", photo)); await api(`/devices/${form.device_id}/maintenance`, { method: "POST", body: data }); setForm((current) => ({ ...current, result: "", action_taken: "", next_check_at: "", status_after: "", memo: "" })); setPhotos([]); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (!rows) return <Loading />;
  const maintenanceStatusOptions = STATUS_OPTIONS.filter(([value]) => !["RENTED", "DELIVERED", "DISPOSED"].includes(value));
  return (
    <div className="app-page">
      <section className="hero-strip">
        <h1 className="page-title">점검·고장 관리</h1>
        <p className="mt-1 text-sm text-slate-500">점검, 고장, 수리 이력을 관리합니다.</p>
      </section>
      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <form className="panel p-4" onSubmit={submit}>
          <h2 className="section-title">점검 등록</h2>
          <div className="mt-4 grid gap-3">
            <label><span className="field-label">장비</span><select className="select" value={form.device_id} onChange={(event) => update("device_id", event.target.value)} required><option value="">장비 선택</option>{devices.map((device) => <option key={device.device_id} value={device.device_id}>{device.device_id} · {device.device_name}</option>)}</select></label>
            {selectedDevice ? <div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-semibold">{selectedDevice.location || "-"}</span><StatusBadge status={selectedDevice.status} /></div></div> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="field-label">유형</span><select className="select" value={form.maintenance_type} onChange={(event) => update("maintenance_type", event.target.value)}><option>정기점검</option><option>고장</option><option>수리</option></select></label>
              <label><span className="field-label">점검자</span><input className="input" value={form.checked_by} onChange={(event) => update("checked_by", event.target.value)} /></label>
              <label><span className="field-label">점검일</span><input className="input" type="date" value={form.checked_at} onChange={(event) => update("checked_at", event.target.value)} /></label>
              <label><span className="field-label">긴급도</span><select className="select" value={form.issue_level} onChange={(event) => update("issue_level", event.target.value)}><option>낮음</option><option>보통</option><option>높음</option><option>긴급</option></select></label>
              <label><span className="field-label">다음 점검일</span><input className="input" type="date" value={form.next_check_at} onChange={(event) => update("next_check_at", event.target.value)} /></label>
              <label><span className="field-label">점검 후 상태</span><select className="select" value={form.status_after} onChange={(event) => update("status_after", event.target.value)}><option value="">변경 없음</option>{maintenanceStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <label><span className="field-label">점검 결과</span><textarea className="textarea" value={form.result} onChange={(event) => update("result", event.target.value)} /></label>
            <label><span className="field-label">조치 내용</span><textarea className="textarea" value={form.action_taken} onChange={(event) => update("action_taken", event.target.value)} /></label>
            <label><span className="field-label">사진</span><input className="input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setPhotos(event.target.files || [])} /></label>
            <label><span className="field-label">메모</span><textarea className="textarea" value={form.memo} onChange={(event) => update("memo", event.target.value)} /></label>
          </div>
          <button className="btn-primary mt-5 w-full" disabled={busy}><Plus size={18} />{busy ? "사진 압축·저장 중" : "점검 등록"}</button>
        </form>
        <section className="space-y-4">
          <form className="panel grid min-w-0 grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(140px,180px)_auto]" onSubmit={(event) => { event.preventDefault(); load(filters); }}>
            <input className="input" placeholder="장비번호" value={filters.device_id} onChange={(event) => setFilters((current) => ({ ...current, device_id: event.target.value }))} />
            <select className="select" value={filters.maintenance_type} onChange={(event) => setFilters((current) => ({ ...current, maintenance_type: event.target.value }))}><option value="">전체 유형</option><option>정기점검</option><option>고장</option><option>수리</option></select>
            <button className="btn-primary w-full justify-center sm:col-span-2 xl:col-span-1 xl:w-auto"><Search size={18} />조회</button>
          </form>
          <div className="panel overflow-hidden">
            {rows.length ? (
              <>
                <div className="grid gap-2 p-2 sm:grid-cols-2 xl:hidden">
                  {rows.map((row) => (
                    <article key={`${row.maintenance_id}-mobile`} className="rounded-lg border border-line bg-white p-4 shadow-soft">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-extrabold text-ink">{row.device_name || row.device_id}</p>
                          <p className="mt-1 text-xs font-bold text-brand">{row.device_id} · {row.maintenance_id}</p>
                        </div>
                        <StatusBadge status={row.status_after} />
                      </div>
                      <div className="mt-3 grid gap-1 rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="font-bold text-slate-500">유형</span>
                          <span className="font-extrabold text-ink">{row.maintenance_type}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="font-bold text-slate-500">긴급도</span>
                          <span className="font-extrabold text-ink">{row.issue_level || "-"}</span>
                        </div>
                        <p className="line-clamp-2 font-semibold leading-6 text-slate-600">{row.result || row.action_taken || "결과 없음"}</p>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs font-extrabold text-slate-500">
                        <span>{formatDateTime(row.created_at)}</span>
                        <Link className="text-brand" to={`/devices/${row.device_id}`}>장비 보기</Link>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="hidden p-2 xl:block">
                  <div className="overflow-hidden rounded-lg border border-line/70">
                    <table className="w-full table-fixed"><thead className="table-head"><tr><th className="w-24">점검 ID</th><th>장비</th><th className="w-20">유형</th><th className="w-32">결과</th><th className="w-20">긴급도</th><th className="w-24">상태</th><th className="w-32">생성일</th></tr></thead><tbody>{rows.map((row) => <tr key={row.maintenance_id} className="hover:bg-slate-50"><td className="table-cell font-semibold">{row.maintenance_id}</td><td className="table-cell"><Link className="block truncate font-semibold text-brand" to={`/devices/${row.device_id}`}>{row.device_name || row.device_id}</Link><p className="truncate text-xs text-slate-500">{row.device_id}</p></td><td className="table-cell">{row.maintenance_type}</td><td className="table-cell"><span className="block truncate">{row.result || row.action_taken || "-"}</span></td><td className="table-cell">{row.issue_level || "-"}</td><td className="table-cell"><StatusBadge status={row.status_after} /></td><td className="table-cell">{formatDateTime(row.created_at)}</td></tr>)}</tbody></table>
                  </div>
                </div>
              </>
            ) : <div className="p-4"><EmptyState title="점검 이력이 없습니다." /></div>}
          </div>
        </section>
      </div>
    </div>
  );
}
