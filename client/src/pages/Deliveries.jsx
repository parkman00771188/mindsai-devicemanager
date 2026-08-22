import { CalendarClock, ClipboardList, PackageCheck, RotateCcw, Search, SlidersHorizontal, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, queryString } from "../api/client.js";
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

const statToneClasses = {
  blue: "bg-[#eef4ff] text-brand",
  indigo: "bg-[#f0efff] text-[#6557c8]",
  cyan: "bg-[#ebf8fb] text-[#1789a7]",
  slate: "bg-[#f1f4f8] text-slate-600"
};

function StatBox({ label, value, icon: Icon, tone = "blue" }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-3 shadow-soft sm:px-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${statToneClasses[tone] || statToneClasses.blue}`}>
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-extrabold text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-xl font-extrabold text-ink sm:text-2xl">{value}</p>
      </div>
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
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(() => {
    const initial = initialFilters(searchParams);
    return Boolean(initial.device_id || initial.user_name || initial.from || initial.to);
  });
  const searchKey = searchParams.toString();
  const isAdmin = isAdminUser(getCurrentUser());
  const advancedFilterCount = [filters.device_id, filters.user_name, filters.from, filters.to].filter(Boolean).length;

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

  function resetFilters() {
    const nextFilters = initialFilters(new URLSearchParams());
    setFilters(nextFilters);
    setSearchParams({});
    setAdvancedFiltersOpen(false);
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
      <section className="device-list-hero delivery-list-hero hidden sm:block">
        <div className="relative z-10 flex min-h-[7.5rem] items-start">
          <div className="max-w-xl">
            <p className="page-kicker">Delivery Operations</p>
            <h1 className="page-title mt-1">납품 관리</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">개인과 기관으로 납품·회수 처리된 장비 흐름을 확인합니다.</p>
          </div>
        </div>
        <div className="delivery-list-hero-art" aria-hidden="true">
          <span className="delivery-list-hero-truck"><Truck size={43} strokeWidth={1.7} /></span>
          <span className="delivery-list-hero-route"><i /><i /><i /></span>
          <span className="delivery-list-hero-package"><PackageCheck size={31} strokeWidth={1.8} /></span>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox label="납품/회수 이력" value={`${summary.total}건`} icon={ClipboardList} />
        <StatBox label="납품" value={`${summary.delivery}건`} icon={Truck} tone="indigo" />
        <StatBox label="회수" value={`${summary.recovery}건`} icon={RotateCcw} tone="cyan" />
        <StatBox label="최근 처리일" value={summary.latest} icon={CalendarClock} tone="slate" />
      </div>

      <form className="panel space-y-3 p-3 sm:p-4" onSubmit={submit}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input className="input pl-10" placeholder="납품·회수 이력 검색" value={filters.keyword} onChange={(event) => update("keyword", event.target.value)} />
          </div>
          <button
            className={`btn-secondary relative h-11 w-11 shrink-0 p-0 ${advancedFiltersOpen || advancedFilterCount ? "border-[#b9cdfa] bg-[#eef4ff] text-brand" : ""}`}
            type="button"
            onClick={() => setAdvancedFiltersOpen((current) => !current)}
            aria-label={advancedFiltersOpen ? "상세 필터 닫기" : "상세 필터 열기"}
            aria-expanded={advancedFiltersOpen}
            aria-controls="delivery-advanced-filters"
            title="상세 필터"
          >
            <SlidersHorizontal size={18} />
            {advancedFilterCount ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-white">
                {advancedFilterCount}
              </span>
            ) : null}
          </button>
          <button className="btn-primary h-11 w-11 shrink-0 whitespace-nowrap p-0 sm:w-auto sm:px-5" aria-label="납품 이력 조회하기">
            <Search size={17} />
            <span className="hidden sm:inline">조회하기</span>
          </button>
        </div>

        {advancedFiltersOpen ? (
          <div id="delivery-advanced-filters" className="space-y-3 border-t border-line pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="text-brand" size={17} />
                <div>
                  <p className="text-sm font-extrabold text-ink">상세 필터</p>
                  <p className="text-xs font-bold text-slate-500">장비, 대상자와 처리 기간을 조합할 수 있습니다.</p>
                </div>
              </div>
              <button className="btn-secondary h-9 shrink-0 px-2.5 text-xs sm:px-3" type="button" onClick={resetFilters}>
                <RotateCcw size={15} />
                <span className="hidden sm:inline">필터 초기화</span>
              </button>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(11rem,14rem)_minmax(11rem,14rem)_minmax(21rem,1fr)]">
              <input className="input" placeholder="장비번호" value={filters.device_id} onChange={(event) => update("device_id", event.target.value)} />
              <input className="input" placeholder="대상자/기관" value={filters.user_name} onChange={(event) => update("user_name", event.target.value)} />
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:col-span-2 xl:col-span-1">
                <input className="input min-w-0 px-2 text-sm" type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} aria-label="시작일" />
                <span className="text-xs font-extrabold text-slate-400">~</span>
                <input className="input min-w-0 px-2 text-sm" type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} aria-label="종료일" />
              </div>
            </div>
          </div>
        ) : null}
      </form>

      <section className="panel overflow-hidden">
        <div className="border-b border-line bg-white px-3 py-3 sm:px-4">
          <p className="text-sm font-extrabold text-ink">납품·회수 이력</p>
          <p className="mt-0.5 text-xs font-bold text-slate-500">조회 결과 {rows.length}건</p>
        </div>
        {rows.length ? (
          <>
            <div className="mobile-list-surface grid sm:grid-cols-2 sm:bg-[#f6f8fc] xl:hidden">
              {rows.map((row) => {
                const photos = splitPhotoPaths(row.photo_paths);
                const summaryText = transactionPlace(row) || transactionMemo(row) || "메모 없음";
                return (
                  <button key={row.transaction_id} className="soft-row w-full max-w-full overflow-hidden text-left" type="button" onClick={() => setDetail(row)}>
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-base font-extrabold text-ink">{deviceTitle(row)}</p>
                        <p className="mt-1 line-clamp-2 break-words text-xs font-bold leading-5 text-slate-500">출납 {transactionNumber(row)} · {row.device_id} · {row.user_name || "대상 없음"}</p>
                        <p className="mt-1 line-clamp-2 break-words text-sm font-bold text-slate-700">{row.purpose || `${actionLabel(row.action_type)} 사유 없음`}</p>
                        <p className="mt-0.5 line-clamp-2 break-words text-xs font-semibold leading-5 text-slate-500">{summaryText}</p>
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
              <div className="overflow-x-auto rounded-lg border border-line/70">
                <table className="w-full min-w-[1440px] table-fixed">
                  <thead className="table-head">
                    <tr>
                      <th className="w-20">출납번호</th>
                      <th className="w-[72px]">작업</th>
                      <th className="w-56">장비번호</th>
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
                          <td className="table-cell font-extrabold text-brand"><span className="block whitespace-nowrap">{row.device_id || "-"}</span></td>
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
