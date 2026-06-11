import { Download, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, downloadUrl, queryString } from "../api/client.js";
import { getCurrentUser, isAdminUser } from "../auth.js";
import ActionBadge from "../components/ActionBadge.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Loading from "../components/Loading.jsx";
import PhotoViewer from "../components/PhotoViewer.jsx";
import TransactionDetailModal from "../components/TransactionDetailModal.jsx";
import { actionLabel, deviceTitle, formatDate, formatDateTime, splitPhotoPaths, transactionMemo, transactionNumber, transactionPlace } from "../constants.js";

const hiddenTableActions = new Set(["RETURN", "RECOVERY"]);
const excludedTableActions = "RETURN,RECOVERY";
const actions = ["RENT", "DELIVERY", "RENTAL_UPDATE", "BROKEN", "LOST", "LOST_FOUND", "MAINTENANCE_START", "MAINTENANCE_COMPLETE", "MAINTENANCE", "STATUS_CHANGE", "REGISTER", "UPDATE", "DISPOSE", "DELETE"];

function parseDeviceIds(value) {
  return String(value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function initialFilters(searchParams) {
  const deviceIds = searchParams.get("device_ids") || searchParams.get("device_id") || "";
  const actionType = searchParams.get("action_type") || "";
  const actionsValue = String(searchParams.get("actions") || "")
    .split(",")
    .map((action) => action.trim())
    .filter((action) => action && !hiddenTableActions.has(action))
    .join(",");
  return {
    keyword: searchParams.get("keyword") || "",
    device_id: searchParams.get("device_ids") ? searchParams.get("device_id") || "" : "",
    device_ids: deviceIds,
    user_name: searchParams.get("user_name") || "",
    action_type: hiddenTableActions.has(actionType) ? "" : actionType,
    actions: actionsValue,
    from: searchParams.get("from") || "",
    to: searchParams.get("to") || ""
  };
}

function compactFilters(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ""));
}

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState(() => initialFilters(searchParams));
  const [photoViewer, setPhotoViewer] = useState(null);
  const [transactionDetail, setTransactionDetail] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const isAdmin = isAdminUser(getCurrentUser());
  const isRentReturnView = filters.actions === "RENT";
  const searchKey = searchParams.toString();
  const appliedKeyword = searchParams.get("keyword") || "";
  const selectedDeviceIds = useMemo(() => parseDeviceIds(filters.device_ids), [filters.device_ids]);
  const actionChoices = isRentReturnView ? ["RENT"] : actions;

  async function load(nextFilters = filters) {
    setRows(await api(`/transactions${queryString({ ...nextFilters, exclude_actions: excludedTableActions })}`));
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

  function applyFilters(nextFilters) {
    setFilters(nextFilters);
    setSearchParams(compactFilters(nextFilters));
  }

  function update(name, value) {
    setFilters((current) => ({
      ...current,
      [name]: value,
      actions: name === "action_type" ? "" : current.actions
    }));
  }

  function selectAction(action) {
    applyFilters({
      ...filters,
      action_type: action,
      actions: isRentReturnView ? "RENT" : filters.actions
    });
  }

  function addDeviceFilter(deviceId) {
    if (!deviceId) return;
    const nextIds = [...new Set([...selectedDeviceIds, deviceId])];
    const nextFilters = { ...filters, device_id: "", device_ids: nextIds.join(",") };
    setTransactionDetail(null);
    setFilters(nextFilters);
    setSearchParams(compactFilters(nextFilters));
  }

  function removeDeviceFilter(deviceId) {
    const nextIds = selectedDeviceIds.filter((id) => id !== deviceId);
    const nextFilters = { ...filters, device_ids: nextIds.join(",") };
    setFilters(nextFilters);
    setSearchParams(compactFilters(nextFilters));
  }

  function clearDeviceFilters() {
    const nextFilters = { ...filters, device_id: "", device_ids: "" };
    setFilters(nextFilters);
    setSearchParams(compactFilters(nextFilters));
  }

  function openPhotoViewer(paths, index, row) {
    setPhotoViewer({
      paths,
      index,
      title: `${actionLabel(row.action_type)} 사진`,
      description: `${deviceTitle(row)} · ${formatDateTime(row.created_at)}`
    });
  }

  async function deleteTransaction(row) {
    if (!row?.transaction_id) return;
    setDeleteBusy(true);
    try {
      await api(`/transactions/${encodeURIComponent(row.transaction_id)}`, { method: "DELETE" });
      setTransactionDetail(null);
      await load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setDeleteBusy(false);
    }
  }

  function movePhoto(offset) {
    setPhotoViewer((current) => {
      if (!current) return current;
      const nextIndex = (current.index + offset + current.paths.length) % current.paths.length;
      return { ...current, index: nextIndex };
    });
  }

  if (!rows) return <Loading />;

  const thClass = "px-2.5 py-2.5";
  const tdClass = "overflow-hidden border-t border-line px-2.5 py-2.5 text-sm whitespace-nowrap align-middle";

  return (
    <div className="app-page">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="hidden lg:block">
          <h1 className="page-title">{isRentReturnView ? "최근 대여 이력" : "전체 이력"}</h1>
          <p className="mt-1 text-sm text-slate-500">장비별, 사용자별, 기관별 작업 이력을 조회합니다.</p>
        </div>
        <a className="btn-secondary w-full sm:w-auto" href={downloadUrl("/excel/download")} download>
          <Download size={18} />
          Excel 다운로드
        </a>
      </div>

      <form className="panel space-y-4 p-3 sm:p-4" onSubmit={submit}>
        <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-[minmax(220px,1fr)_minmax(130px,170px)_minmax(130px,170px)_minmax(140px,170px)_minmax(140px,170px)_auto]">
          <input className="input col-span-2 sm:col-span-1" placeholder="키워드" value={filters.keyword} onChange={(event) => update("keyword", event.target.value)} />
          <input className="input" placeholder="장비번호" value={filters.device_id} onChange={(event) => update("device_id", event.target.value)} />
          <input className="input" placeholder="사용자명" value={filters.user_name} onChange={(event) => update("user_name", event.target.value)} />
          <label className="min-w-0">
            <span className="field-label xl:hidden">시작일</span>
            <input className="input" type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} />
          </label>
          <label className="min-w-0">
            <span className="field-label xl:hidden">종료일</span>
            <input className="input" type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} />
          </label>
          <button className="btn-primary col-span-2 w-full justify-center sm:col-span-2 xl:col-span-1 xl:w-auto">
            <Search size={18} />
            조회
          </button>
        </div>

        <div className="grid gap-3 border-t border-line pt-4 xl:grid-cols-[88px_minmax(0,1fr)] xl:items-start">
          <p className="text-sm font-extrabold text-ink xl:pt-2 xl:text-base">작업</p>
          <div className="scrollbar-none -mx-1 flex max-w-full snap-x gap-2 overflow-x-auto px-1 pb-1 xl:mx-0 xl:flex-wrap xl:overflow-visible xl:px-0 xl:pb-0">
            <button
                className={`chip min-h-10 shrink-0 snap-start px-3 text-sm xl:min-h-11 xl:px-4 xl:text-base ${!filters.action_type ? "chip-active" : ""}`}
              type="button"
              onClick={() => selectAction("")}
            >
              {isRentReturnView ? "대여" : "전체"}
            </button>
            {actionChoices.map((action) => (
              <button
                key={action}
                className={`chip min-h-10 shrink-0 snap-start px-3 text-sm xl:min-h-11 xl:px-4 xl:text-base ${filters.action_type === action ? "chip-active" : ""}`}
                type="button"
                onClick={() => selectAction(action)}
              >
                {actionLabel(action)}
              </button>
            ))}
          </div>
        </div>

        {(appliedKeyword || selectedDeviceIds.length || filters.action_type) ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {appliedKeyword ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-base font-extrabold leading-tight text-ink transition hover:bg-[#e9e8f2]"
                type="button"
                onClick={() => applyFilters({ ...filters, keyword: "" })}
                title="키워드 필터 해제"
              >
                {appliedKeyword}
                <X size={18} />
              </button>
            ) : null}
            {selectedDeviceIds.length ? (
              <button className="chip min-h-11 w-11 p-0 text-xl" type="button" onClick={clearDeviceFilters} aria-label="장비번호 필터 초기화">
                ↻
              </button>
            ) : null}
            {selectedDeviceIds.map((deviceId) => (
              <button
                key={deviceId}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-base font-extrabold leading-tight text-ink transition hover:bg-[#e9e8f2]"
                type="button"
                onClick={() => removeDeviceFilter(deviceId)}
                title="장비번호 필터 해제"
              >
                {deviceId}
                <X size={18} />
              </button>
            ))}
            {filters.action_type ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-base font-extrabold leading-tight text-ink transition hover:bg-[#e9e8f2]"
                type="button"
                onClick={() => selectAction("")}
              >
                {actionLabel(filters.action_type)}
                <X size={18} />
              </button>
            ) : null}
          </div>
        ) : null}
      </form>

      <section className="panel overflow-hidden">
        {rows.length ? (
          <>
            <div className="grid gap-2 p-2 sm:grid-cols-2 xl:hidden">
              {rows.map((row) => {
                const photos = splitPhotoPaths(row.photo_paths);
                const summary = transactionPlace(row) || transactionMemo(row) || row.issue_description || "메모 없음";
                return (
                  <button key={row.transaction_id} className="soft-row w-full max-w-full overflow-hidden text-left" type="button" onClick={() => setTransactionDetail(row)}>
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-extrabold text-ink">{deviceTitle(row)}</p>
                        <p className="mt-1 truncate text-xs font-bold text-slate-500">출납 {transactionNumber(row)} · {row.device_id} · {row.user_name || "사용자 없음"}</p>
                        <p className="mt-1 truncate text-sm font-bold text-slate-700">{row.purpose || "목적/사유 없음"}</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{summary}</p>
                      </div>
                      <ActionBadge action={row.action_type} />
                    </div>
                    <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-slate-500">
                      <span className="min-w-0 truncate">{formatDateTime(row.created_at)}</span>
                      <span className="shrink-0">{photos.length ? `사진 ${photos.length}장` : "사진 없음"}</span>
                    </div>
                    {photos.length ? (
                      <div className="mt-3 flex max-w-full gap-1.5 overflow-hidden">
                        {photos.slice(0, 4).map((path, index) => (
                          <span key={`${row.transaction_id}-mobile-photo-${index}`} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-slate-100">
                            <img src={path} alt={`${actionLabel(row.action_type)} 사진 ${index + 1}`} className="h-full w-full object-cover" />
                          </span>
                        ))}
                        {photos.length > 4 ? (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-extrabold text-slate-500">+{photos.length - 4}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="hidden p-2 xl:block">
              <div className="overflow-hidden rounded-lg border border-line/70">
                <table className="w-full table-fixed">
                  <thead className="table-head">
                    <tr>
                      <th className={`${thClass} w-20`}>출납번호</th>
                      <th className={`${thClass} w-20`}>작업</th>
                      <th className={`${thClass} w-28`}>장비번호</th>
                      <th className={`${thClass} w-36`}>장비명</th>
                      <th className={`${thClass} w-20`}>사용자</th>
                      <th className={`${thClass} w-32`}>목적/사유</th>
                      <th className={`${thClass} w-24`}>대여/납품일</th>
                      <th className={`${thClass} w-20`}>사진</th>
                      <th className={`${thClass} w-28`}>메모</th>
                      <th className={`${thClass} w-28`}>처리자</th>
                      <th className={`${thClass} w-28`}>처리일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const photos = splitPhotoPaths(row.photo_paths);
                      const memo = transactionMemo(row) || row.issue_description || "-";
                      return (
                        <tr key={row.transaction_id} className="cursor-pointer hover:bg-slate-50" onClick={() => setTransactionDetail(row)}>
                          <td className={`${tdClass} font-extrabold text-brand`}>{transactionNumber(row)}</td>
                          <td className={tdClass}>
                            <ActionBadge action={row.action_type} />
                          </td>
                          <td className={tdClass}>
                            <span className="block truncate font-extrabold text-brand">{row.device_id || "-"}</span>
                          </td>
                          <td className={tdClass} title={deviceTitle(row)}>
                            <span className="block truncate font-extrabold text-ink">{deviceTitle(row)}</span>
                          </td>
                          <td className={tdClass}>{row.user_name || "-"}</td>
                          <td className={tdClass} title={row.purpose || ""}>
                            <span className="block truncate">{row.purpose || "-"}</span>
                          </td>
                          <td className={tdClass}>{formatDate(row.rented_at)}</td>
                          <td className={tdClass}>
                            {photos.length ? (
                              <div className="flex items-center gap-1.5">
                                {photos.slice(0, 3).map((path, index) => (
                                  <button
                                    key={`${row.transaction_id}-${path}-${index}`}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openPhotoViewer(photos, index, row);
                                    }}
                                    className="h-8 w-8 overflow-hidden rounded-lg border border-line bg-slate-100"
                                    title="사진 크게 보기"
                                  >
                                    <img src={path} alt={`${actionLabel(row.action_type)} 사진 ${index + 1}`} className="h-full w-full object-cover" />
                                  </button>
                                ))}
                                {photos.length > 3 ? <span className="text-xs font-extrabold text-slate-500">+{photos.length - 3}</span> : null}
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className={tdClass} title={memo === "-" ? "" : memo}>
                            <span className="block truncate">{memo}</span>
                          </td>
                          <td className={tdClass} title={row.handled_by_display || row.handled_by_name || row.handled_by || ""}>
                            <span className="block truncate">{row.handled_by_display || row.handled_by_name || row.handled_by || "-"}</span>
                          </td>
                          <td className={tdClass}>{formatDateTime(row.created_at)}</td>
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
            <EmptyState title="조회된 이력이 없습니다." />
          </div>
        )}
      </section>

      <TransactionDetailModal
        row={transactionDetail}
        onClose={() => setTransactionDetail(null)}
        onOpenPhoto={(paths, index, row) => openPhotoViewer(paths, index, row)}
        canDelete={isAdmin}
        deleteBusy={deleteBusy}
        onDelete={deleteTransaction}
        onDeviceChanged={load}
      />
      <PhotoViewer viewer={photoViewer} onClose={() => setPhotoViewer(null)} onMove={movePhoto} />
    </div>
  );
}
