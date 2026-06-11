import { ArrowDownAZ, Building2, History, Mail, MapPin, Pencil, Phone, Plus, Save, Search, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, queryString } from "../api/client.js";
import DeviceDetailModal from "../components/DeviceDetailModal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Loading from "../components/Loading.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { deviceTitle, formatDate, formatPhoneNumber } from "../constants.js";

const emptyInstitution = {
  institution_name: "",
  contact_person: "",
  contact: "",
  email: "",
  address: "",
  memo: ""
};

function textCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), "ko", { numeric: true });
}

function DetailLine({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
      {Icon ? <Icon className="mt-0.5 shrink-0 text-brand" size={17} /> : null}
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-extrabold text-slate-500">{label}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-bold text-ink">{value || "-"}</dd>
      </div>
    </div>
  );
}

function InstitutionModal({ institution, mode, busy, onClose, onSubmit }) {
  const [form, setForm] = useState(() => ({ ...emptyInstitution, ...(institution || {}) }));
  const isCreate = mode === "create";

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: name === "contact" ? formatPhoneNumber(value) : value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-lg bg-white p-5 shadow-lift sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="page-kicker">Institution</p>
            <h2 className="mt-1 text-2xl font-extrabold text-ink">{isCreate ? "기관 등록" : `${form.institution_name || "기관"} 정보 수정`}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">기관 대여 처리를 위해 기본 연락처와 주소를 관리합니다.</p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <label>
            <span className="field-label">기관명 *</span>
            <input className="input" value={form.institution_name} onChange={(event) => update("institution_name", event.target.value)} required />
          </label>
          <label>
            <span className="field-label">담당자</span>
            <input className="input" value={form.contact_person} onChange={(event) => update("contact_person", event.target.value)} />
          </label>
          <label>
            <span className="field-label">연락처</span>
            <input className="input" value={form.contact} onChange={(event) => update("contact", event.target.value)} placeholder="010-0000-0000" inputMode="tel" />
          </label>
          <label>
            <span className="field-label">이메일</span>
            <input className="input" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} />
          </label>
          <label className="md:col-span-2">
            <span className="field-label">주소</span>
            <input className="input" value={form.address} onChange={(event) => update("address", event.target.value)} />
          </label>
          <label className="md:col-span-2">
            <span className="field-label">비고</span>
            <textarea className="textarea" value={form.memo} onChange={(event) => update("memo", event.target.value)} />
          </label>
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 md:col-span-2 sm:flex-row sm:justify-end">
            <button className="btn-secondary" type="button" onClick={onClose}>취소</button>
            <button className="btn-primary" disabled={busy}>
              <Save size={18} />
              {busy ? "저장 중" : "저장"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function Institutions() {
  const [institutions, setInstitutions] = useState(null);
  const [selected, setSelected] = useState(null);
  const [keyword, setKeyword] = useState("");
  const [sortMode, setSortMode] = useState("name");
  const [modal, setModal] = useState(null);
  const [detailDeviceId, setDetailDeviceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(search = keyword, selectedId = selected?.institution_id) {
    const rows = await api(`/institutions${queryString({ keyword: search })}`);
    setInstitutions(rows);
    if (selectedId) {
      const match = rows.find((row) => row.institution_id === selectedId);
      setSelected(match ? await api(`/institutions/${encodeURIComponent(match.institution_id)}`) : rows[0] || null);
    } else {
      setSelected(rows[0] || null);
    }
  }

  useEffect(() => {
    load("").catch((err) => {
      setError(err.message);
      setInstitutions([]);
    });
  }, []);

  const sortedInstitutions = useMemo(() => {
    const rows = [...(institutions || [])];
    rows.sort((a, b) => {
      if (sortMode === "assigned") return (Number(b.assigned_count) || 0) - (Number(a.assigned_count) || 0) || textCompare(a.institution_name, b.institution_name);
      return textCompare(a.institution_name, b.institution_name);
    });
    return rows;
  }, [institutions, sortMode]);

  async function selectInstitution(institutionId) {
    setError("");
    try {
      setSelected(await api(`/institutions/${encodeURIComponent(institutionId)}`));
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveInstitution(form) {
    setBusy(true);
    setError("");
    try {
      const saved =
        modal?.mode === "create"
          ? await api("/institutions", { method: "POST", body: form })
          : await api(`/institutions/${encodeURIComponent(modal.institution.institution_id)}`, { method: "PUT", body: form });
      setModal(null);
      await load(keyword, saved.institution_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteInstitution(institution) {
    if (!window.confirm(`${institution.institution_name} 기관을 삭제할까요? 대여/반납 이력은 유지됩니다.`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/institutions/${encodeURIComponent(institution.institution_id)}`, { method: "DELETE" });
      setSelected(null);
      await load(keyword, "");
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

  if (!institutions) return <Loading />;

  return (
    <div className="app-page">
      <section className="hero-strip">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="page-title">기관 관리</h1>
            <p className="mt-1 text-sm text-slate-500">기관 정보와 대여 이력을 관리합니다.</p>
          </div>
          <button className="btn-primary w-full md:w-auto" type="button" onClick={() => setModal({ mode: "create", institution: null })}>
            <Plus size={18} />
            기관 등록
          </button>
        </div>
      </section>

      {error ? <div className="rounded-lg border border-[#ffc8d6] bg-[#fff0f4] px-4 py-3 text-sm font-extrabold text-[#d84f71]">{error}</div> : null}

      <form className="panel flex flex-col gap-3 p-3 sm:p-4 md:flex-row" onSubmit={submitSearch}>
        <input className="input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="기관명, 담당자, 연락처, 주소 검색" />
        <button className="btn-primary w-full md:w-32">
          <Search size={18} />
          조회
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="panel p-3 sm:p-4">
          {selected ? (
            <div>
              <div className="border-b border-line pb-5 text-center">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-lg bg-[#f2f0ff] text-brand sm:h-28 sm:w-28">
                  <Building2 size={44} />
                </div>
                <h2 className="mt-4 truncate text-2xl font-extrabold text-ink">{selected.institution_name}</h2>
                <p className="mt-1 truncate text-sm font-bold text-slate-500">{selected.contact_person || "담당자 미등록"}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="btn-secondary h-10 px-3" type="button" onClick={() => setModal({ mode: "edit", institution: selected })}>
                    <Pencil size={16} />
                    수정
                  </button>
                  <button className="btn-dispose h-10 px-3" type="button" onClick={() => deleteInstitution(selected)} disabled={busy}>
                    <Trash2 size={16} />
                    삭제
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 text-center">
                <div className="rounded-lg bg-[#f7f7fd] px-2 py-3">
                  <p className="text-lg font-extrabold text-ink">{selected.assigned_count || 0}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">대여/납품</p>
                </div>
              </div>

              <dl className="mt-4">
                <DetailLine icon={UserRound} label="담당자" value={selected.contact_person} />
                <DetailLine icon={Phone} label="연락처" value={selected.contact} />
                <DetailLine icon={Mail} label="이메일" value={selected.email} />
                <DetailLine icon={MapPin} label="주소" value={selected.address} />
                <DetailLine icon={History} label="비고" value={selected.memo} />
              </dl>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="section-title">대여/납품 장비</h3>
                  <span className="rounded-lg bg-[#f2f0ff] px-3 py-1 text-xs font-extrabold text-brand">{selected.assigned_devices?.length || 0}대</span>
                </div>
                <div className="mt-3 grid gap-2">
                  {selected.assigned_devices?.length ? selected.assigned_devices.map((device) => (
                    <button key={device.device_id} className="w-full rounded-lg border border-line bg-[#f7f7fd] p-3 text-left transition hover:border-[#c9c4ff] hover:bg-white" type="button" onClick={() => setDetailDeviceId(device.device_id)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-ink">{deviceTitle(device)}</p>
                          <p className="mt-1 text-xs font-bold text-brand">{device.device_id}</p>
                          <p className="mt-1 truncate text-xs font-semibold text-slate-500">{device.rent_location || device.location || "-"} · {formatDate(device.borrowed_at)}</p>
                        </div>
                        <StatusBadge status={device.status} />
                      </div>
                    </button>
                  )) : <EmptyState title="대여/납품 장비가 없습니다." />}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="기관을 선택해주세요." />
          )}
        </aside>

        <section className="panel overflow-hidden">
          {institutions.length ? (
            <>
              <div className="flex flex-col gap-3 border-b border-line bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-extrabold text-slate-500">등록 기관 {institutions.length}곳</p>
                <div className="flex flex-wrap gap-2">
                  <button className={sortMode === "name" ? "btn-primary h-10 px-3" : "btn-secondary h-10 px-3"} type="button" onClick={() => setSortMode("name")}>
                    <ArrowDownAZ size={17} />
                    이름순
                  </button>
                  <button className={sortMode === "assigned" ? "btn-primary h-10 px-3" : "btn-secondary h-10 px-3"} type="button" onClick={() => setSortMode("assigned")}>
                    <Building2 size={17} />
                    대여/납품순
                  </button>
                </div>
              </div>
              <div className="grid gap-2 p-2 sm:grid-cols-2 xl:hidden">
                {sortedInstitutions.map((institution) => (
                  <button key={institution.institution_id} className="soft-row text-left" type="button" onClick={() => selectInstitution(institution.institution_id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-extrabold text-ink">{institution.institution_name}</p>
                        <p className="mt-1 truncate text-xs font-bold text-slate-500">{institution.contact_person || "담당자 미등록"} · {institution.contact || "연락처 없음"}</p>
                      </div>
                      <span className="rounded-lg bg-[#f2f0ff] px-2.5 py-1 text-xs font-extrabold text-brand">{institution.assigned_count || 0}대</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="hidden p-2 xl:block">
                <div className="overflow-hidden rounded-lg border border-line/70">
                  <table className="w-full table-fixed">
                    <thead className="table-head">
                      <tr>
                        <th className="w-16">No</th>
                        <th className="w-56">기관명</th>
                        <th className="w-32">담당자</th>
                        <th className="w-36">연락처</th>
                        <th>주소</th>
                        <th className="w-24">대여중</th>
                        <th className="w-28">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedInstitutions.map((institution, index) => (
                        <tr key={institution.institution_id} className="cursor-pointer hover:bg-slate-50" onClick={() => selectInstitution(institution.institution_id)}>
                          <td className="table-cell font-bold text-slate-500">{index + 1}</td>
                          <td className="table-cell font-extrabold text-ink"><span className="block truncate">{institution.institution_name}</span></td>
                          <td className="table-cell"><span className="block truncate">{institution.contact_person || "-"}</span></td>
                          <td className="table-cell">{institution.contact || "-"}</td>
                          <td className="table-cell"><span className="block truncate">{institution.address || "-"}</span></td>
                          <td className="table-cell font-extrabold text-ink">{institution.assigned_count || 0}대</td>
                          <td className="table-cell">
                            <button className="btn-secondary h-8 px-2 text-xs" type="button" onClick={(event) => {
                              event.stopPropagation();
                              setModal({ mode: "edit", institution });
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
              <EmptyState title="등록된 기관이 없습니다." description="기관 등록으로 대여 대상을 추가해보세요." />
            </div>
          )}
        </section>
      </div>

      {modal ? (
        <InstitutionModal
          mode={modal.mode}
          institution={modal.institution}
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={saveInstitution}
        />
      ) : null}
      <DeviceDetailModal
        deviceId={detailDeviceId}
        onClose={() => setDetailDeviceId("")}
        onChanged={() => load(keyword, selected?.institution_id)}
      />
    </div>
  );
}
