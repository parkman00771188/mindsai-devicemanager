import { Download, Search, Truck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, downloadUrl, queryString } from "../api/client.js";
import { getCurrentUser, isAdminUser } from "../auth.js";
import ActionBadge from "../components/ActionBadge.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Loading from "../components/Loading.jsx";
import PhotoViewer from "../components/PhotoViewer.jsx";
import TransactionDetailModal from "../components/TransactionDetailModal.jsx";
import { actionLabel, deviceTitle, formatDate, formatDateTime, splitPhotoPaths, transactionMemo, transactionNumber, transactionPlace } from "../constants.js";

function initialFilters(searchParams) {
  return {
    keyword: searchParams.get("keyword") || "",
    device_id: searchParams.get("device_id") || "",
    user_name: searchParams.get("user_name") || "",
    from: searchParams.get("from") || "",
    to: searchParams.get("to") || ""
  };
}

function compactFilters(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ""));
}

function StatBox({ label, value }) {
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3 shadow-soft">
      <p className="text-xs font-extrabold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink">{value}</p>
    </div>
  );
}

export default function Deliveries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState(() => initialFilters(searchParams));
  const [detail, setDetail] = useState(null);
  const [photoViewer, setPhotoViewer] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const searchKey = searchParams.toString();
  const isAdmin = isAdminUser(getCurrentUser());

  async function load(nextFilters = filters) {
    setRows(await api(`/transactions${queryString({ ...nextFilters, actions: "DELIVERY,RECOVERY" })}`));
  }

  useEffect(() => {
    const nextFilters = initialFilters(searchParams);
    setFilters(nextFilters);
    load(nextFilters);
  }, [searchKey]);

  function submit(event) {
    event.preventDefault();
    setSearchParams(compactFilters(filters));
  }

  function update(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function clearFilter(name) {
    const nextFilters = { ...filters, [name]: "" };
    setFilters(nextFilters);
    setSearchParams(compactFilters(nextFilters));
  }

  function openPhotoViewer(paths, index, row) {
    setPhotoViewer({
      paths,
      index,
      title: `${deviceTitle(row)} ${actionLabel(row.action_type)} 사진`,
      description: formatDateTime(row.created_at)
    });
  }

  function movePhoto(offset) {
    setPhotoViewer((current) => {
      if (!current) return current;
      return { ...current, index: (current.index + offset + current.paths.length) % current.paths.length };
    });
  }

  async function deleteTransaction(row) {
    if (!row?.transaction_id) return;
    setDeleteBusy(true);
    try {
      await api(`/transactions/${encodeURIComponent(row.transaction_id)}`, { method: "DELETE" });
      setDetail(null);
      await load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setDeleteBusy(false);
    }
  }

  const summary = useMemo(() => {
    const data = rows || [];
    return {
      total: data.length,
      delivery: data.filter((row) => row.action_type === "DELIVERY").length,
      recovery: data.filter((row) => row.action_type === "RECOVERY").length,
      latest: data[0]?.created_at ? formatDate(data[0].created_at) : "-"
    };
  }, [rows]);

  if (!rows) return <Loading />;

  return (
    <div className="app-page">
      <section className="hero-strip">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="page-title">납품 관리</h1>
            <p className="mt-1 text-sm text-slate-500">개인과 기관으로 납품·회수 처리된 장비 이력을 확인합니다.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex">
            <Link className="btn-primary" to="/devices?status=AVAILABLE">
              <Truck size={18} />
              납품할 장비 찾기
            </Link>
            <a className="btn-secondary" href={downloadUrl("/excel/download")} download>
              <Download size={18} />
              Excel 다운로드
            </a>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox label="납품/회수 이력" value={`${summary.total}건`} />
        <StatBox label="납품" value={`${summary.delivery}건`} />
        <StatBox label="회수" value={`${summary.recovery}건`} />
        <StatBox label="최근 처리일" value={summary.latest} />
      </div>

      <form className="panel space-y-4 p-3 sm:p-4" onSubmit={submit}>
        <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-[minmax(220px,1fr)_minmax(130px,170px)_minmax(130px,170px)_minmax(140px,170px)_minmax(140px,170px)_auto]">
          <input className="input col-span-2 sm:col-span-1" placeholder="키워드" value={filters.keyword} onChange={(event) => update("keyword", event.target.value)} />
          <input className="input" placeholder="장비번호" value={filters.device_id} onChange={(event) => update("device_id", event.target.value)} />
          <input className="input" placeholder="대상자/기관" value={filters.user_name} onChange={(event) => update("user_name", event.target.value)} />
          <input className="input" type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} />
          <input className="input" type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} />
          <button className="btn-primary col-span-2 w-full justify-center sm:col-span-2 xl:col-span-1 xl:w-auto">
            <Search size={18} />
            조회
          </button>
        </div>
        {Object.values(filters).some(Boolean) ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {Object.entries(filters).filter(([, value]) => value).map(([key, value]) => (
              <button
                key={key}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-extrabold text-ink transition hover:bg-[#e9e8f2]"
                type="button"
                onClick={() => clearFilter(key)}
              >
                {value}
                <X size={16} />
              </button>
            ))}
          </div>
        ) : null}
      </form>

      <section className="panel overflow-hidden">
        {rows.length ? (
          <>
            <div className="grid gap-2 p-2 sm:grid-cols-2 xl:hidden">
              {rows.map((row) => {
                const photos = splitPhotoPaths(row.photo_paths);
                const summaryText = transactionPlace(row) || transactionMemo(row) || "메모 없음";
                return (
                  <button key={row.transaction_id} className="soft-row w-full max-w-full overflow-hidden text-left" type="button" onClick={() => setDetail(row)}>
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-extrabold text-ink">{deviceTitle(row)}</p>
                        <p className="mt-1 truncate text-xs font-bold text-slate-500">출납 {transactionNumber(row)} · {row.device_id} · {row.user_name || "대상 없음"}</p>
                        <p className="mt-1 truncate text-sm font-bold text-slate-700">{row.purpose || `${actionLabel(row.action_type)} 사유 없음`}</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{summaryText}</p>
                      </div>
                      <ActionBadge action={row.action_type} />
                    </div>
                    <div className="mt-3 flex justify-between gap-2 text-xs font-extrabold text-slate-500">
                      <span>{formatDateTime(row.created_at)}</span>
                      <span>{photos.length ? `사진 ${photos.length}장` : "사진 없음"}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="hidden p-2 xl:block">
              <div className="overflow-hidden rounded-lg border border-line/70">
                <table className="w-full table-fixed">
                  <thead className="table-head">
                    <tr>
                      <th className="w-20">출납번호</th>
                      <th className="w-20">작업</th>
                      <th className="w-28">장비번호</th>
                      <th className="w-36">장비명</th>
                      <th className="w-28">대상</th>
                      <th className="w-32">목적/사유</th>
                      <th className="w-24">납품/회수일</th>
                      <th className="w-28">장소</th>
                      <th className="w-32">메모</th>
                      <th className="w-20">사진</th>
                      <th className="w-28">처리자</th>
                      <th className="w-28">처리일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const photos = splitPhotoPaths(row.photo_paths);
                      const memo = transactionMemo(row) || row.issue_description || "-";
                      const processDate = row.action_type === "RECOVERY" ? row.returned_at : row.rented_at;
                      return (
                        <tr key={row.transaction_id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetail(row)}>
                          <td className="table-cell font-extrabold text-brand">{transactionNumber(row)}</td>
                          <td className="table-cell"><ActionBadge action={row.action_type} /></td>
                          <td className="table-cell font-extrabold text-brand"><span className="block truncate">{row.device_id || "-"}</span></td>
                          <td className="table-cell font-extrabold text-ink"><span className="block truncate">{deviceTitle(row)}</span></td>
                          <td className="table-cell"><span className="block truncate">{row.user_name || "-"}</span></td>
                          <td className="table-cell"><span className="block truncate">{row.purpose || "-"}</span></td>
                          <td className="table-cell">{formatDate(processDate)}</td>
                          <td className="table-cell"><span className="block truncate">{transactionPlace(row) || "-"}</span></td>
                          <td className="table-cell"><span className="block truncate" title={memo}>{memo}</span></td>
                          <td className="table-cell">{photos.length ? `${photos.length}장` : "-"}</td>
                          <td className="table-cell"><span className="block truncate" title={row.handled_by_display || row.handled_by_name || row.handled_by || ""}>{row.handled_by_display || row.handled_by_name || row.handled_by || "-"}</span></td>
                          <td className="table-cell text-slate-600">{formatDateTime(row.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="p-4">
            <EmptyState title="납품/회수 이력이 없습니다." description="장비 상세에서 납품하기 또는 회수 처리를 하면 이곳에 기록됩니다." />
          </div>
        )}
      </section>

      <TransactionDetailModal row={detail} onClose={() => setDetail(null)} onOpenPhoto={openPhotoViewer} canDelete={isAdmin} deleteBusy={deleteBusy} onDelete={deleteTransaction} onDeviceChanged={load} />
      <PhotoViewer viewer={photoViewer} onClose={() => setPhotoViewer(null)} onMove={movePhoto} />
    </div>
  );
}
