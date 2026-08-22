import { CalendarDays, ChevronLeft, ChevronRight, Download, History, List, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
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

const hiddenTableActions = new Set(["UPDATE", "RENTAL_UPDATE"]);
const excludedTableActions = "UPDATE,RENTAL_UPDATE";
const actions = ["RENT", "DELIVERY", "RETURN", "RECOVERY", "BROKEN", "LOST", "LOST_FOUND", "MAINTENANCE_START", "MAINTENANCE_COMPLETE", "MAINTENANCE", "STATUS_CHANGE", "REGISTER", "DISPOSE", "DELETE"];

function transactionEventDate(row = {}) {
  return ["RETURN", "RECOVERY"].includes(row.action_type) ? row.returned_at : row.rented_at;
}

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
    owner_organization: searchParams.get("owner_organization") || "",
    action_type: hiddenTableActions.has(actionType) ? "" : actionType,
    actions: actionsValue,
    from: searchParams.get("from") || "",
    to: searchParams.get("to") || ""
  };
}

function compactFilters(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ""));
}

function transactionCalendarDate(row = {}) {
  const value = transactionEventDate(row) || row.created_at;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date) {
  if (!date) return "";
  const two = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function monthKey(date) {
  if (!date) return "";
  const two = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}`;
}

function shiftMonth(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function calendarTitle(date) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(date);
}

function calendarDateTitle(key) {
  if (!key) return "선택 날짜";
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(year, month - 1, day));
}

function TransactionCalendar({ rows, cursor, onCursorChange, onOpen }) {
  const groupedRows = useMemo(() => {
    const grouped = new Map();
    rows.forEach((row) => {
      const key = dateKey(transactionCalendarDate(row));
      if (!key) return;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });
    return grouped;
  }, [rows]);
  const currentMonthKey = monthKey(cursor);
  const monthDateKeys = useMemo(
    () => [...groupedRows.keys()].filter((key) => key.startsWith(currentMonthKey)).sort(),
    [groupedRows, currentMonthKey]
  );
  const [selectedDateKey, setSelectedDateKey] = useState("");

  useEffect(() => {
    setSelectedDateKey((current) => {
      if (current.startsWith(currentMonthKey) && groupedRows.has(current)) return current;
      return monthDateKeys.at(-1) || "";
    });
  }, [currentMonthKey, groupedRows, monthDateKeys]);

  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - firstOfMonth.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const selectedRows = selectedDateKey ? groupedRows.get(selectedDateKey) || [] : [];
  const monthCount = monthDateKeys.reduce((count, key) => count + (groupedRows.get(key)?.length || 0), 0);
  const todayKey = dateKey(new Date());
  const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-line px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div>
          <p className="text-base font-extrabold text-ink">{calendarTitle(cursor)}</p>
          <p className="mt-0.5 text-xs font-bold text-slate-500">이력이 있는 날짜 {monthDateKeys.length}일 · 총 {monthCount}건</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn-secondary h-9 w-9 shrink-0 p-0" type="button" onClick={() => onCursorChange(shiftMonth(cursor, -1))} aria-label="이전 달" title="이전 달">
            <ChevronLeft size={17} />
          </button>
          <button className="btn-secondary h-9 px-3 text-xs" type="button" onClick={() => onCursorChange(new Date())}>이번 달</button>
          <button className="btn-secondary h-9 w-9 shrink-0 p-0" type="button" onClick={() => onCursorChange(shiftMonth(cursor, 1))} aria-label="다음 달" title="다음 달">
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <div className="p-2 sm:p-3">
        <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-line bg-white">
          {weekdayLabels.map((label, index) => (
            <div key={label} className={`border-b border-line bg-[#f6f8fc] px-1 py-2 text-center text-xs font-extrabold ${index === 0 ? "text-[#e2556f]" : index === 6 ? "text-brand" : "text-slate-500"}`}>
              {label}
            </div>
          ))}
          {calendarDays.map((date, index) => {
            const key = dateKey(date);
            const dayRows = groupedRows.get(key) || [];
            const isCurrentMonth = monthKey(date) === currentMonthKey;
            const isSelected = key === selectedDateKey;
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={`relative min-h-[4.75rem] min-w-0 border-b border-r border-line p-1 transition sm:min-h-[8.25rem] sm:p-1.5 ${(index + 1) % 7 === 0 ? "border-r-0" : ""} ${index >= 35 ? "border-b-0" : ""} ${isCurrentMonth ? "bg-white" : "bg-[#f8fafc]"} ${isSelected ? "z-[1] ring-2 ring-inset ring-brand" : ""} ${dayRows.length ? "cursor-pointer hover:bg-[#f7faff]" : ""}`}
                onClick={() => dayRows.length && setSelectedDateKey(key)}
              >
                <div className="flex items-center justify-between gap-1">
                  <button
                    className={`flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-extrabold ${isToday ? "bg-brand text-white" : isCurrentMonth ? "text-ink" : "text-slate-300"}`}
                    type="button"
                    disabled={!dayRows.length}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (dayRows.length) setSelectedDateKey(key);
                    }}
                    aria-label={dayRows.length ? `${calendarDateTitle(key)} 이력 ${dayRows.length}건` : undefined}
                  >
                    {date.getDate()}
                  </button>
                  {dayRows.length ? <span className="rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[10px] font-extrabold text-brand sm:hidden">{dayRows.length}</span> : null}
                </div>
                <div className="mt-1 hidden space-y-1 sm:block">
                  {dayRows.slice(0, 3).map((row) => (
                    <button
                      key={row.transaction_id}
                      className="flex w-full min-w-0 items-center gap-1.5 rounded-md bg-[#eef4ff] px-1.5 py-1 text-left transition hover:bg-[#dbe7ff]"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(row);
                      }}
                      title={`${actionLabel(row.action_type)} · ${row.device_id || deviceTitle(row)}`}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      <span className="shrink-0 text-[10px] font-extrabold text-brand">{actionLabel(row.action_type)}</span>
                      <span className="min-w-0 truncate text-[10px] font-bold text-slate-600">{row.device_id || deviceTitle(row)}</span>
                    </button>
                  ))}
                  {dayRows.length > 3 ? <p className="px-1 text-[10px] font-extrabold text-slate-400">외 {dayRows.length - 3}건</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedRows.length ? (
        <div className="border-t border-line bg-[#fbfcff] p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-ink">{calendarDateTitle(selectedDateKey)}</p>
              <p className="mt-0.5 text-xs font-bold text-slate-500">선택한 날짜의 전체 이력</p>
            </div>
            <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-extrabold text-brand">{selectedRows.length}건</span>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {selectedRows.map((row) => (
              <button key={row.transaction_id} className="soft-row flex min-w-0 items-center gap-3 text-left" type="button" onClick={() => onOpen(row)}>
                <ActionBadge action={row.action_type} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-ink">{row.device_id || "-"} · {deviceTitle(row)}</span>
                  <span className="mt-1 block truncate text-xs font-bold text-slate-500">{row.user_name || "사용자 없음"} · {formatDateTime(row.created_at)}</span>
                </span>
                <ChevronRight className="shrink-0 text-slate-400" size={16} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="border-t border-line px-4 py-6 text-center text-sm font-bold text-slate-500">이력이 있는 날짜를 선택하면 상세 목록이 표시됩니다.</div>
      )}
    </div>
  );
}

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState(() => initialFilters(searchParams));
  const [photoViewer, setPhotoViewer] = useState(null);
  const [transactionDetail, setTransactionDetail] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [viewMode, setViewMode] = useState("list");
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(() => {
    const initial = initialFilters(searchParams);
    return Boolean(initial.device_id || initial.device_ids || initial.user_name || initial.owner_organization || initial.action_type || initial.from || initial.to);
  });
  const isAdmin = isAdminUser(getCurrentUser());
  const isRentReturnView = filters.actions === "RENT";
  const searchKey = searchParams.toString();
  const selectedDeviceIds = useMemo(() => parseDeviceIds(filters.device_ids), [filters.device_ids]);
  const actionChoices = isRentReturnView ? ["RENT"] : actions;
  const advancedFilterCount = [
    filters.owner_organization,
    filters.device_id || filters.device_ids,
    filters.user_name,
    filters.from,
    filters.to,
    filters.action_type
  ].filter(Boolean).length;

  async function load(nextFilters = filters) {
    setRows(await api(`/transactions${queryString({ ...nextFilters, exclude_actions: excludedTableActions })}`));
  }

  useEffect(() => {
    const nextFilters = initialFilters(searchParams);
    setFilters(nextFilters);
    load(nextFilters);
  }, [searchKey]);

  useEffect(() => {
    api("/user-options?option_type=ORGANIZATION")
      .then((items) => setOrganizations(items.map((item) => item.option_text).filter(Boolean)))
      .catch(() => setOrganizations([]));
  }, []);

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

  function resetFilters() {
    const nextFilters = initialFilters(new URLSearchParams(isRentReturnView ? { actions: "RENT" } : {}));
    applyFilters(nextFilters);
    setAdvancedFiltersOpen(false);
  }

  function openCalendarView() {
    const latestCalendarDate = rows?.map(transactionCalendarDate).find(Boolean);
    if (latestCalendarDate) setCalendarCursor(new Date(latestCalendarDate.getFullYear(), latestCalendarDate.getMonth(), 1));
    setViewMode("calendar");
  }

  function addDeviceFilter(deviceId) {
    if (!deviceId) return;
    const nextIds = [...new Set([...selectedDeviceIds, deviceId])];
    const nextFilters = { ...filters, device_id: "", device_ids: nextIds.join(",") };
    setTransactionDetail(null);
    setAdvancedFiltersOpen(true);
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

  async function updateTransaction(row, changes) {
    if (!row?.transaction_id) return;
    setUpdateBusy(true);
    try {
      const updated = await api(`/transactions/${encodeURIComponent(row.transaction_id)}`, { method: "PUT", body: changes });
      setTransactionDetail(updated);
      await load();
      return updated;
    } catch (err) {
      throw err;
    } finally {
      setUpdateBusy(false);
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

  const thClass = "px-2.5 py-2";
  const tdClass = "overflow-hidden whitespace-nowrap border-t border-line px-2.5 py-2 text-[13.5px] align-middle";

  return (
    <div className="app-page">
      <section className="device-list-hero history-list-hero hidden sm:block">
        <div className="relative z-10 flex min-h-[7.5rem] flex-col justify-between gap-5 md:flex-row md:items-start">
          <div className="max-w-xl">
            <p className="page-kicker">Activity History</p>
            <h1 className="page-title mt-1">{isRentReturnView ? "최근 대여 이력" : "전체 이력"}</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">장비별 작업 흐름을 목록과 월별 캘린더로 조회합니다.</p>
          </div>
          <a className="btn-secondary w-full md:w-auto" href={downloadUrl("/excel/download")} download>
            <Download size={18} />
            Excel 다운로드
          </a>
        </div>
        <div className="history-list-hero-art" aria-hidden="true">
          <span className="history-list-hero-calendar"><CalendarDays size={47} strokeWidth={1.7} /></span>
          <span className="history-list-hero-line"><i /><i /><i /></span>
          <span className="history-list-hero-history"><History size={31} strokeWidth={1.8} /></span>
        </div>
      </section>

      <form className="panel space-y-3 p-3 sm:p-4" onSubmit={submit}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input className="input pl-10" placeholder="전체 이력 검색" value={filters.keyword} onChange={(event) => update("keyword", event.target.value)} />
          </div>
          <button
            className={`btn-secondary relative h-11 w-11 shrink-0 p-0 ${advancedFiltersOpen || advancedFilterCount ? "border-[#b9cdfa] bg-[#eef4ff] text-brand" : ""}`}
            type="button"
            onClick={() => setAdvancedFiltersOpen((current) => !current)}
            aria-label={advancedFiltersOpen ? "상세 필터 닫기" : "상세 필터 열기"}
            aria-expanded={advancedFiltersOpen}
            aria-controls="transaction-advanced-filters"
            title="상세 필터"
          >
            <SlidersHorizontal size={18} />
            {advancedFilterCount ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-white">
                {advancedFilterCount}
              </span>
            ) : null}
          </button>
          <button className="btn-primary h-11 w-11 shrink-0 whitespace-nowrap p-0 sm:w-auto sm:px-5" aria-label="이력 조회하기">
            <Search size={17} />
            <span className="hidden sm:inline">조회하기</span>
          </button>
        </div>

        {advancedFiltersOpen ? (
          <div id="transaction-advanced-filters" className="space-y-3 border-t border-line pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="text-brand" size={17} />
                <div>
                  <p className="text-sm font-extrabold text-ink">상세 필터</p>
                  <p className="text-xs font-bold text-slate-500">소속, 장비, 사용자, 기간과 작업을 조합할 수 있습니다.</p>
                </div>
              </div>
              <button className="btn-secondary h-9 shrink-0 px-2.5 text-xs sm:px-3" type="button" onClick={resetFilters}>
                <RotateCcw size={15} />
                <span className="hidden sm:inline">필터 초기화</span>
              </button>
            </div>

            <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(10rem,13rem)_minmax(10rem,13rem)_minmax(8rem,11rem)_minmax(21rem,1fr)]">
              <select className="select" value={filters.owner_organization} onChange={(event) => update("owner_organization", event.target.value)} aria-label="장비 소유 소속">
                <option value="">전체 소속</option>
                {organizations.map((organization) => <option key={organization} value={organization}>{organization}</option>)}
              </select>
              <input className="input" placeholder="장비번호" value={filters.device_id} onChange={(event) => update("device_id", event.target.value)} />
              <input className="input" placeholder="사용자명" value={filters.user_name} onChange={(event) => update("user_name", event.target.value)} />
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
                <input className="input min-w-0 px-2 text-sm" type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} aria-label="시작일" />
                <span className="text-xs font-extrabold text-slate-400">~</span>
                <input className="input min-w-0 px-2 text-sm" type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} aria-label="종료일" />
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 border-t border-line pt-3">
              <p className="pt-2 text-sm font-extrabold text-ink">작업</p>
              <div className="scrollbar-none flex max-w-full snap-x gap-1.5 overflow-x-auto pb-1">
                <button
                  className={`inline-flex min-h-9 shrink-0 snap-start items-center justify-center rounded-lg border px-3 text-[13px] font-extrabold transition ${!filters.action_type ? "border-brand bg-brand text-white" : "border-line bg-white text-slate-600 hover:border-[#b9cdfa] hover:bg-[#eef4ff] hover:text-brand"}`}
                  type="button"
                  onClick={() => selectAction("")}
                >
                  {isRentReturnView ? "대여" : "전체"}
                </button>
                {actionChoices.map((action) => (
                  <button
                    key={action}
                    className={`inline-flex min-h-9 shrink-0 snap-start items-center justify-center rounded-lg border px-3 text-[13px] font-extrabold transition ${filters.action_type === action ? "border-brand bg-brand text-white" : "border-line bg-white text-slate-600 hover:border-[#b9cdfa] hover:bg-[#eef4ff] hover:text-brand"}`}
                    type="button"
                    onClick={() => selectAction(action)}
                  >
                    {actionLabel(action)}
                  </button>
                ))}
              </div>
            </div>

            {selectedDeviceIds.length ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <button className="chip min-h-9 w-9 p-0 text-base" type="button" onClick={clearDeviceFilters} aria-label="장비번호 필터 초기화">
                  ↻
                </button>
                {selectedDeviceIds.map((deviceId) => (
                  <button
                    key={deviceId}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-extrabold text-ink transition hover:bg-[#e5e9f1]"
                    type="button"
                    onClick={() => removeDeviceFilter(deviceId)}
                    title="장비번호 필터 해제"
                  >
                    {deviceId}
                    <X size={16} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </form>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-3 py-3 sm:px-4">
          <div>
            <p className="text-sm font-extrabold text-ink">{viewMode === "list" ? "이력 목록" : "월별 캘린더"}</p>
            <p className="mt-0.5 text-xs font-bold text-slate-500">조회 결과 {rows.length}건</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-[#f6f8fc] p-1" role="group" aria-label="이력 보기 방식">
            <button
              className={`flex h-9 w-9 items-center justify-center rounded-md transition ${viewMode === "list" ? "bg-brand text-white shadow-soft" : "text-slate-500 hover:bg-white hover:text-brand"}`}
              type="button"
              onClick={() => setViewMode("list")}
              aria-label="목록형으로 보기"
              aria-pressed={viewMode === "list"}
              title="목록형"
            >
              <List size={18} />
            </button>
            <button
              className={`flex h-9 w-9 items-center justify-center rounded-md transition ${viewMode === "calendar" ? "bg-brand text-white shadow-soft" : "text-slate-500 hover:bg-white hover:text-brand"}`}
              type="button"
              onClick={openCalendarView}
              aria-label="캘린더형으로 보기"
              aria-pressed={viewMode === "calendar"}
              title="캘린더형"
            >
              <CalendarDays size={18} />
            </button>
          </div>
        </div>

        {viewMode === "calendar" ? (
          rows.length ? (
            <TransactionCalendar rows={rows} cursor={calendarCursor} onCursorChange={setCalendarCursor} onOpen={setTransactionDetail} />
          ) : (
            <div className="p-4">
              <EmptyState title="캘린더에 표시할 이력이 없습니다." description="조회 조건을 조정하면 날짜별 이력을 확인할 수 있습니다." />
            </div>
          )
        ) : rows.length ? (
          <>
            <div className="grid gap-2 p-2 sm:grid-cols-2 xl:hidden">
              {rows.map((row) => {
                const photos = splitPhotoPaths(row.photo_paths);
                const summary = transactionPlace(row) || transactionMemo(row) || row.issue_description || "메모 없음";
                return (
                  <button key={row.transaction_id} className="soft-row w-full max-w-full overflow-hidden text-left" type="button" onClick={() => setTransactionDetail(row)}>
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-base font-extrabold text-ink">{deviceTitle(row)}</p>
                        <p className="mt-1 line-clamp-2 break-words text-xs font-bold leading-5 text-slate-500">출납 {transactionNumber(row)} · {row.device_id} · {row.user_name || "사용자 없음"}</p>
                        <p className="mt-1 break-words text-xs font-extrabold text-slate-600">소유 소속 · {row.device_owner_organization || "미지정"}</p>
                        <p className="mt-1 line-clamp-2 break-words text-sm font-bold text-slate-700">{row.purpose || "목적/사유 없음"}</p>
                        <p className="mt-0.5 line-clamp-2 break-words text-xs font-semibold leading-5 text-slate-500">{summary}</p>
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
              <div className="overflow-x-auto rounded-lg border border-line/70">
                <table className="w-full min-w-[1560px] table-fixed">
                  <thead className="table-head">
                    <tr>
                      <th className={`${thClass} w-20`}>출납번호</th>
                      <th className={`${thClass} w-[72px]`}>작업</th>
                      <th className={`${thClass} w-52`}>장비번호</th>
                      <th className={`${thClass} w-40`}>장비명</th>
                      <th className={`${thClass} w-28`}>소유 소속</th>
                      <th className={`${thClass} w-20`}>사용자</th>
                      <th className={`${thClass} w-32`}>목적/사유</th>
                      <th className={`${thClass} w-28`}>처리 기준일</th>
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
                            <span className="block whitespace-nowrap font-extrabold text-brand">{row.device_id || "-"}</span>
                          </td>
                          <td className={tdClass} title={deviceTitle(row)}>
                            <span className="block truncate font-extrabold text-ink">{deviceTitle(row)}</span>
                          </td>
                          <td className={tdClass}><span className="block truncate">{row.device_owner_organization || "-"}</span></td>
                          <td className={tdClass}>{row.user_name || "-"}</td>
                          <td className={tdClass} title={row.purpose || ""}>
                            <span className="block truncate">{row.purpose || "-"}</span>
                          </td>
                          <td className={tdClass}>{formatDate(transactionEventDate(row))}</td>
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
                                    className="h-7 w-7 overflow-hidden rounded-lg border border-line bg-slate-100"
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
        canEdit={isAdmin}
        deleteBusy={deleteBusy}
        updateBusy={updateBusy}
        onDelete={deleteTransaction}
        onUpdate={updateTransaction}
        onDeviceChanged={load}
      />
      <PhotoViewer viewer={photoViewer} onClose={() => setPhotoViewer(null)} onMove={movePhoto} />
    </div>
  );
}
