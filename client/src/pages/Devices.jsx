import { Building2, CheckCircle2, ClipboardList, Download, LayoutGrid, Menu, PackageCheck, Plus, Printer, QrCode, RotateCcw, Search, UserRound, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, queryString } from "../api/client.js";
import { getCurrentUser, isAdminUser } from "../auth.js";
import DeviceDetailModal from "../components/DeviceDetailModal.jsx";
import DeviceProcessModal from "../components/DeviceProcessModal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Loading from "../components/Loading.jsx";
import PhotoViewer from "../components/PhotoViewer.jsx";
import QrDownloadModal from "../components/QrDownloadModal.jsx";
import QrPrintModal from "../components/QrPrintModal.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { actionLabel, deviceCapacity, deviceTitle, formatDate, formatDateTime, splitPhotoPaths, STATUS_OPTIONS, statusLabel, transactionMemo, transactionNumber, transactionPlace } from "../constants.js";

const emptyFilters = {
  keyword: "",
  status: "",
  category: "",
  mine: ""
};

function visibleFilters(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ""));
}

function exportValue(value) {
  if (value === undefined || value === null || value === "-") return "";
  return value;
}

function exportDateTime(value) {
  const formatted = formatDateTime(value);
  return formatted === "-" ? "" : formatted;
}

function exportDate(value) {
  const formatted = formatDate(value);
  return formatted === "-" ? "" : formatted;
}

function fileDateStamp() {
  const now = new Date();
  const two = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`;
}

function currentStatusContext(device = {}) {
  const transactions = device.current_transactions || device.transactions || [];
  const isActiveCheckout = ["RENTED", "DELIVERED"].includes(device.status);
  const snapshotActionType = device.current_source_action_type || (device.status === "DELIVERED" ? "DELIVERY" : "RENT");
  const snapshotTransaction = isActiveCheckout && [
    device.current_borrower_type,
    device.current_user_contact,
    device.current_purpose,
    device.current_rent_location,
    device.current_condition_status,
    device.current_process_memo,
    device.current_source_action_type
  ].some(Boolean)
    ? (() => {
        const orgDepartment =
          (device.current_borrower_type === "INSTITUTION" || device.borrower_department === "기관")
            ? ["기관", device.current_institution_name || device.current_borrower].filter(Boolean).join(" / ")
            : [device.current_user_organization, device.borrower_department].filter(Boolean).join(" / ");
        return {
        action_type: snapshotActionType,
        source_action_type: snapshotActionType,
        borrower_type: device.current_borrower_type || (device.borrower_department === "기관" ? "INSTITUTION" : "PERSON"),
        institution_id: device.current_institution_id || "",
        institution_name: device.current_institution_name || (device.borrower_department === "기관" ? device.current_borrower || "" : ""),
        user_name: device.current_borrower || "",
        user_organization: device.current_user_organization || (device.borrower_department === "기관" ? "기관" : ""),
        user_department: device.borrower_department || "",
        user_org_department: orgDepartment,
        borrower_org_department: orgDepartment,
        user_position: device.current_user_position || "",
        user_contact: device.current_user_contact || "",
        purpose: device.current_purpose || "",
        rented_at: device.borrowed_at || "",
        expected_return_at: device.expected_return_at || "",
        condition_status: device.current_condition_status || "",
        memo: [device.current_rent_location ? `${snapshotActionType === "DELIVERY" ? "납품" : "대여"} 장소: ${device.current_rent_location}` : "", device.current_process_memo || ""].filter(Boolean).join(" / ")
        };
      })()
    : null;
  const checkoutActions = device.status === "DELIVERED" ? ["RENTAL_UPDATE", "DELIVERY"] : ["RENTAL_UPDATE", "RENT"];
  const checkoutCandidates = isActiveCheckout ? transactions.filter((row) => checkoutActions.includes(row.action_type)) : [];
  const currentCheckout =
    snapshotTransaction || checkoutCandidates.find((row) => row.purpose || row.issue_description || transactionMemo(row)) || checkoutCandidates[0] || null;
  const lastCheckout = isActiveCheckout ? transactions.find((row) => ["DELIVERY", "RENT"].includes(row.action_type)) : null;
  const latestTransaction = transactions[0] || null;
  const currentTransaction = currentCheckout || latestTransaction || {};
  const isDelivery =
    device.status === "DELIVERED" ||
    currentCheckout?.action_type === "DELIVERY" ||
    (currentCheckout?.action_type === "RENTAL_UPDATE" && lastCheckout?.action_type === "DELIVERY");
  const orgDepartment =
    currentTransaction.user_org_department ||
    currentTransaction.borrower_org_department ||
    [currentTransaction.user_organization, currentTransaction.user_department].filter(Boolean).join(" / ") ||
    currentTransaction.user_department ||
    device.borrower_department;
  const memo = currentCheckout
    ? transactionMemo(currentCheckout) || currentCheckout.issue_description
    : transactionMemo(currentTransaction) || currentTransaction.issue_description;
  const purpose = currentCheckout
    ? currentCheckout.purpose || currentCheckout.issue_description || transactionMemo(currentCheckout)
    : currentTransaction.purpose || currentTransaction.issue_description || transactionMemo(currentTransaction);

  return {
    flowLabel: isActiveCheckout ? (isDelivery ? "납품" : "대여") : "",
    currentTransaction,
    latestTransaction,
    orgDepartment,
    place: currentCheckout ? transactionPlace(currentCheckout) : transactionPlace(currentTransaction),
    purpose: purpose || device.current_status_purpose || "",
    memo: memo || device.current_status_memo || ""
  };
}

function deviceExcelRows(devices = []) {
  return devices.map((device, index) => {
    const context = currentStatusContext(device);
    const currentTransaction = context.currentTransaction || {};
    const latestTransaction = context.latestTransaction || {};
    return {
      순번: index + 1,
      "현재 상태": statusLabel(device.status),
      "현재 처리 구분": context.flowLabel,
      "현재 대상": exportValue(device.current_borrower || currentTransaction.user_name),
      "현재 소속/부서": exportValue(context.orgDepartment),
      "현재 연락처": exportValue(currentTransaction.user_contact),
      "현재 목적/사유": exportValue(context.purpose || currentTransaction.purpose),
      "현재 시작일": exportDate(device.borrowed_at || currentTransaction.rented_at),
      "예상 반납일": exportDate(device.expected_return_at || currentTransaction.expected_return_at),
      "현재 처리 장소": exportValue(context.place || device.rent_location),
      "현재 장비 상태": exportValue(currentTransaction.condition_status),
      "현재 메모": exportValue(context.memo),
      "최근 처리 작업": latestTransaction.action_type ? actionLabel(latestTransaction.action_type) : "",
      "최근 처리자": exportValue(latestTransaction.handled_by_display || latestTransaction.handled_by_name || latestTransaction.handled_by),
      "최근 처리일": exportDateTime(latestTransaction.created_at),
      분류: exportValue(device.category),
      장비번호: exportValue(device.device_id),
      "기존 장비번호": exportValue(device.legacy_device_id),
      장비명: exportValue(deviceTitle(device)),
      제조사: exportValue(device.manufacturer),
      모델명: exportValue(device.model_name),
      용량: exportValue(deviceCapacity(device)),
      RAM: exportValue(device.ram_capacity),
      저장장치: exportValue(device.storage_capacity),
      CPU: exportValue(device.cpu),
      GPU: exportValue(device.gpu),
      "Windows 사양": exportValue(device.windows_spec),
      시리얼번호: exportValue(device.serial_number),
      구매일: exportDate(device.purchase_date),
      구매금액: exportValue(device.purchase_price),
      관리부서: exportValue(device.department),
      담당자: exportValue(device.manager),
      보관위치: exportValue(device.location),
      "최근 반납일": exportDate(device.last_returned_at),
      구성품: exportValue(device.components),
      비고: exportValue(device.memo),
      등록일: exportDateTime(device.created_at),
      수정일: exportDateTime(device.updated_at)
    };
  });
}

function applyDeviceExcelColumnWidths(sheet, rows = []) {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const preferredWidths = {
    순번: 6,
    "현재 상태": 12,
    "현재 처리 구분": 14,
    "현재 대상": 20,
    "현재 소속/부서": 24,
    "현재 연락처": 16,
    "현재 목적/사유": 24,
    "현재 처리 장소": 24,
    "현재 메모": 36,
    "최근 처리 작업": 16,
    "최근 처리자": 24,
    장비번호: 20,
    "기존 장비번호": 22,
    장비명: 24,
    CPU: 26,
    GPU: 28,
    "Windows 사양": 18,
    구성품: 24,
    비고: 32
  };
  sheet["!cols"] = headers.map((header) => {
    const measured = Math.max(
      String(header).length + 2,
      ...rows.slice(0, 200).map((row) => String(row[header] || "").split(/\r?\n/)[0].length + 2)
    );
    return { wch: Math.min(42, Math.max(preferredWidths[header] || 12, measured)) };
  });
}

const statusIconMap = {
  AVAILABLE: CheckCircle2,
  RENTED: RotateCcw,
  DELIVERED: PackageCheck,
  MAINTENANCE: Wrench,
  BROKEN: Wrench,
  LOST: Search,
  DISPOSED: X
};

const mobileStatusClass = {
  AVAILABLE: "bg-[#ecfbf7] text-[#159d8f] ring-[#c7f1e9]",
  RENTED: "bg-brand text-white ring-brand",
  DELIVERED: "bg-[#e8f6ff] text-[#1178c7] ring-[#b9def7]",
  MAINTENANCE: "bg-[#fff4ee] text-[#d47a3d] ring-[#ffd9c1]",
  BROKEN: "bg-[#fff0f4] text-[#d84f71] ring-[#ffc8d6]",
  LOST: "bg-[#eef1f7] text-[#657186] ring-[#d8deea]",
  DISPOSED: "bg-[#f0f1f5] text-[#3a4055] ring-[#d8dce7]"
};

function MobileStatusPill({ status }) {
  return (
    <span
      className={`inline-flex min-h-9 min-w-[5.75rem] shrink-0 items-center justify-center rounded-full px-3 text-xs font-extrabold ring-1 ${
        mobileStatusClass[status] || "bg-slate-100 text-slate-700 ring-slate-300"
      }`}
    >
      {status === "DELIVERED" ? "납품" : statusLabel(status)}
    </span>
  );
}

function CategoryTabs({ categories, value, mine, onChange }) {
  return (
    <div className="flex items-center border-b border-line bg-white">
      <div className="scrollbar-none min-w-0 flex-1 overflow-x-auto">
        <div className="flex min-w-max snap-x gap-4 px-3 pt-1 sm:gap-7 sm:px-5 sm:pt-2">
          <button
            type="button"
            className={`flex min-h-11 snap-start items-center border-b-[3px] px-1 pb-1 text-sm font-extrabold transition sm:min-h-14 sm:text-base ${
              !value && !mine ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-ink"
            }`}
            onClick={() => onChange("")}
          >
            전체
          </button>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`flex min-h-11 snap-start items-center border-b-[3px] px-1 pb-1 text-sm font-extrabold transition sm:min-h-14 sm:text-base ${
                value === category ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-ink"
              }`}
              onClick={() => onChange(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-500 sm:hidden" aria-hidden="true">
        <Menu size={19} />
      </span>
    </div>
  );
}

function StatusFilters({ value, mine, onChange, onMine }) {
  const orderedStatuses = [
    ...STATUS_OPTIONS.filter(([status]) => ["AVAILABLE", "RENTED", "DELIVERED"].includes(status)),
    ...STATUS_OPTIONS.filter(([status]) => !["AVAILABLE", "RENTED", "DELIVERED"].includes(status))
  ];

  return (
    <div className="grid gap-3 pt-1 sm:border-t sm:border-line sm:pt-3 lg:grid-cols-[88px_minmax(0,1fr)] lg:items-start lg:pt-4">
      <p className="text-sm font-extrabold text-ink lg:pt-2 lg:text-base">상태</p>
      <div className="scrollbar-none -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
        {onMine ? (
          <button
            className={`inline-flex min-h-11 shrink-0 snap-start items-center justify-center gap-2 rounded-lg border px-4 text-sm font-extrabold leading-tight transition lg:min-h-11 ${
              mine ? "border-brand bg-brand text-white shadow-lift" : "border-line bg-white text-slate-700 hover:border-[#c9c4ff] hover:bg-[#f2f0ff] hover:text-brand"
            }`}
            type="button"
            onClick={onMine}
          >
            <UserRound size={18} />
            내 장비
          </button>
        ) : null}
        <button
          className={`inline-flex min-h-11 shrink-0 snap-start items-center justify-center gap-2 rounded-lg border px-4 text-sm font-extrabold leading-tight transition lg:min-h-11 ${
            !value && !mine ? "border-brand bg-brand text-white shadow-lift" : "border-line bg-white text-slate-700 hover:border-[#c9c4ff] hover:bg-[#f2f0ff] hover:text-brand"
          }`}
          type="button"
          onClick={() => onChange("")}
        >
          <LayoutGrid size={18} />
          전체
        </button>
        {orderedStatuses.map(([status, label]) => {
          const Icon = statusIconMap[status] || PackageCheck;
          return (
            <button
              key={status}
              className={`inline-flex min-h-11 shrink-0 snap-start items-center justify-center gap-2 rounded-lg border px-4 text-sm font-extrabold leading-tight transition lg:min-h-11 ${
                value === status && !mine ? "border-brand bg-brand text-white shadow-lift" : "border-line bg-white text-slate-700 hover:border-[#c9c4ff] hover:bg-[#f2f0ff] hover:text-brand"
              }`}
              type="button"
              onClick={() => onChange(status)}
            >
              <Icon size={18} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KeywordChip({ keyword, onClear }) {
  if (!keyword) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-base font-extrabold leading-tight text-ink transition hover:bg-[#e9e8f2]"
        type="button"
        onClick={onClear}
        title="키워드 필터 해제"
      >
        {keyword}
        <X size={18} />
      </button>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <dt className="shrink-0 text-sm font-extrabold text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-extrabold text-ink">{value || "-"}</dd>
    </div>
  );
}

function MobileActionPanel({ isAdmin, exportBusy, canExport, onDownload, onOpenCatalog }) {
  if (!isAdmin) {
    return (
      <section className="panel p-4 sm:hidden">
        <button className="group flex w-full min-w-0 items-center gap-3 text-left" type="button" onClick={onOpenCatalog}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-lift transition group-hover:bg-[#6658e8]">
            <PackageCheck size={21} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold text-ink">대여하기</span>
            <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">사용 가능한 장비를 선택하세요.</span>
          </span>
        </button>
      </section>
    );
  }

  return (
    <section className="panel grid grid-cols-2 gap-2 p-3 sm:hidden">
      <button className="group flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg p-2 text-center disabled:opacity-50" type="button" onClick={onDownload} disabled={!canExport || exportBusy}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f2f0ff] text-brand transition group-hover:bg-brand group-hover:text-white">
          <Download size={20} />
        </span>
        <span className="line-clamp-2 text-xs font-extrabold text-ink">{exportBusy ? "생성 중" : "엑셀 다운로드"}</span>
      </button>
      <Link className="group flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg p-2 text-center" to="/devices/new">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-lift transition group-hover:bg-[#6658e8]">
          <Plus size={22} />
        </span>
        <span className="line-clamp-2 text-xs font-extrabold text-ink">장비 등록</span>
      </Link>
    </section>
  );
}

function MobileInfoTile({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-[#f8f6ff] px-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eeeaff] text-brand">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-extrabold text-slate-500">{label}</span>
        <span className="mt-0.5 block truncate text-sm font-extrabold text-ink">{value || "-"}</span>
      </span>
    </div>
  );
}

function DeviceMobileCard({ device, index, onOpen, onQr, action }) {
  const photos = splitPhotoPaths(device.photo_paths || device.main_photo_path);
  const context = currentStatusContext(device);
  const currentLabel = device.status === "DELIVERED" ? "납품처" : "현재 사용자";
  const currentValue = device.current_borrower || (device.status === "AVAILABLE" ? "대여 가능" : "-");
  const purposeValue = context.purpose || "-";
  const memoValue = context.memo || device.memo || "-";

  return (
    <article
      className="mobile-card cursor-pointer overflow-hidden p-3"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#e8f6ff]">
          {photos[0] ? (
            <img src={photos[0]} alt={`${deviceTitle(device)} 사진`} className="h-full w-full object-cover" />
          ) : (
            <PackageCheck size={25} className="text-brand" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-ink">{deviceTitle(device)}</p>
              <p className="mt-1 truncate text-xs font-extrabold text-brand">{device.device_id}</p>
            </div>
            <MobileStatusPill status={device.status} />
          </div>
          <p className="mt-1 truncate text-xs font-bold text-slate-500">No {index + 1} · {device.category || "분류 미입력"} · {device.model_name || "모델 미입력"}</p>
          {device.legacy_device_id ? <p className="mt-1 truncate text-xs font-bold text-slate-500">기존 {device.legacy_device_id}</p> : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MobileInfoTile icon={UserRound} label={currentLabel} value={currentValue} />
        <MobileInfoTile icon={ClipboardList} label="목적/사유" value={purposeValue} />
      </div>
      {action ? (
        <div className="mt-3">{action}</div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <p className="flex min-w-0 items-center gap-2 truncate text-xs font-bold text-slate-600" title={memoValue === "-" ? "" : memoValue}>
            <Building2 size={15} className="shrink-0 text-slate-500" />
            <span className="min-w-0 truncate">{memoValue}</span>
          </p>
          <button
            className="btn-secondary h-10 shrink-0 border-[#c9c4ff] px-3 text-xs text-brand"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onQr?.();
            }}
          >
            <QrCode size={16} />
            QR 보기
          </button>
        </div>
      )}
    </article>
  );
}

function DeviceTable({ devices, onOpen, onQr, actionForDevice }) {
  return (
    <div className="hidden p-2 xl:block">
      <div className="overflow-hidden rounded-lg border border-line/70">
        <table className="w-full table-fixed">
          <thead className="table-head">
            <tr>
              <th className="w-[5%]">순번</th>
              <th className="w-[7%]">상태</th>
              <th className="w-[8%]">분류</th>
              <th className="w-[10%]">장비번호</th>
              <th>장비명</th>
              <th className="w-[10%]">모델명</th>
              <th className="w-[6%]">용량</th>
              <th className="w-[8%]">대여자</th>
              <th className="w-[11%]">목적/사유</th>
              <th className="w-[9%]">기존 장비번호</th>
              <th className="w-[10%]">비고</th>
              <th className="w-[7%]">관리</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device, index) => (
              <tr key={device.device_id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen(device)}>
                <td className="table-cell font-bold text-slate-500">{index + 1}</td>
                <td className="table-cell">
                  <StatusBadge status={device.status} label={device.status === "DELIVERED" ? "납품" : undefined} />
                </td>
                <td className="table-cell"><span className="block truncate">{device.category || "-"}</span></td>
                <td className="table-cell font-extrabold text-brand">{device.device_id}</td>
                <td className="table-cell font-extrabold"><span className="block truncate">{deviceTitle(device)}</span></td>
                <td className="table-cell"><span className="block truncate">{device.model_name || "-"}</span></td>
                <td className="table-cell font-bold text-slate-600">{deviceCapacity(device)}</td>
                <td className="table-cell"><span className="block truncate">{device.current_borrower || "-"}</span></td>
                <td className="table-cell"><span className="block truncate" title={device.current_status_purpose || device.current_purpose || ""}>{device.current_status_purpose || device.current_purpose || "-"}</span></td>
                <td className="table-cell"><span className="block truncate">{device.legacy_device_id || "-"}</span></td>
                <td className="table-cell"><span className="block truncate" title={device.memo || ""}>{device.memo || "-"}</span></td>
                <td className="table-cell">
                  {actionForDevice ? (
                    actionForDevice(device)
                  ) : (
                    <button
                      className="btn-secondary h-8 px-2 text-xs"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onQr?.(device);
                      }}
                    >
                      <Download size={15} />
                      QR
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeviceList({ devices, onOpen, onQr, actionForDevice }) {
  return (
    <>
      <div className="grid gap-3 p-2 sm:grid-cols-2 lg:grid-cols-3 xl:hidden">
        {devices.map((device, index) => (
          <DeviceMobileCard
            key={device.device_id}
            device={device}
            index={index}
            onOpen={() => onOpen(device)}
            onQr={() => onQr?.(device)}
            action={actionForDevice?.(device, true)}
          />
        ))}
      </div>
      <DeviceTable devices={devices} onOpen={onOpen} onQr={onQr} actionForDevice={actionForDevice} />
    </>
  );
}

function RentalCatalogModal({ categories, onClose, onRent, onOpenDevice }) {
  const [devices, setDevices] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [error, setError] = useState("");

  async function load(nextFilters = filters) {
    setError("");
    setDevices(await api(`/devices${queryString(nextFilters)}`));
  }

  function applyFilters(nextFilters) {
    setFilters(nextFilters);
    setAppliedKeyword(nextFilters.keyword || "");
    load(nextFilters).catch((err) => {
      setError(err.message);
      setDevices([]);
    });
  }

  useEffect(() => {
    load(emptyFilters).catch((err) => {
      setError(err.message);
      setDevices([]);
    });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-lg bg-white shadow-lift" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <p className="page-kicker">Device Rental</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">대여할 장비 선택</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">전체 장비에서 상태와 키워드로 찾고 바로 대여할 수 있습니다.</p>
          </div>
          <button className="btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(92vh-92px)] overflow-auto">
          <form
            className="space-y-4 border-b border-line bg-slate-50/60 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters(filters);
            }}
          >
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3">
              <input
                className="input"
                value={filters.keyword}
                onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
            placeholder="장비번호, 기존 장비번호, 장비명, 모델명"
              />
              <button className="btn-primary w-auto px-3 sm:px-4">
                <Search size={18} />
                조회
              </button>
            </div>
            <StatusFilters value={filters.status} onChange={(status) => applyFilters({ ...filters, status })} />
            <KeywordChip keyword={appliedKeyword} onClear={() => applyFilters({ ...filters, keyword: "" })} />
          </form>

          <CategoryTabs categories={categories} value={filters.category} onChange={(category) => applyFilters({ ...filters, category, mine: "" })} />

          {error ? <div className="m-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
          {!devices ? (
            <div className="p-8">
              <Loading />
            </div>
          ) : devices.length ? (
            <DeviceList
              devices={devices}
              onOpen={onOpenDevice}
              actionForDevice={(device, mobile) => (
                <button
                  className={`${device.status === "AVAILABLE" ? "btn-primary" : "btn-secondary"} ${mobile ? "mt-4 h-10 w-full" : "h-8 px-2 text-xs"}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (device.status === "AVAILABLE") onRent(device);
                    else onOpenDevice(device);
                  }}
                >
                  <PackageCheck size={mobile ? 16 : 15} />
                  {device.status === "AVAILABLE" ? "대여하기" : "상세보기"}
                </button>
              )}
            />
          ) : (
            <div className="p-4">
              <EmptyState title="조건에 맞는 장비가 없습니다." description="검색어 또는 상태 필터를 조정해보세요." />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default function Devices() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const isAdmin = isAdminUser(currentUser);
  const [devices, setDevices] = useState(null);
  const [categoryRows, setCategoryRows] = useState([]);
  const [qrDevice, setQrDevice] = useState(null);
  const [detailDevice, setDetailDevice] = useState(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [qrPrintOpen, setQrPrintOpen] = useState(false);
  const [processDevice, setProcessDevice] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [filters, setFilters] = useState(() => ({
    keyword: searchParams.get("keyword") || "",
    status: searchParams.get("status") || "",
    category: searchParams.get("category") || "",
    mine: searchParams.get("mine") || ""
  }));
  const searchKey = searchParams.toString();
  const appliedKeyword = searchParams.get("keyword") || "";

  async function load(nextFilters = filters) {
    const { mine, ...restFilters } = nextFilters;
    const scope = mine ? { ...restFilters, assigned_to_user_id: currentUser?.user_id || "" } : restFilters;
    const rows = await api(`/devices${queryString(scope)}`);
    setDevices(rows);
  }

  function applyFilters(nextFilters) {
    setFilters(nextFilters);
    setSearchParams(visibleFilters(nextFilters));
  }

  useEffect(() => {
    const nextFilters = {
      keyword: searchParams.get("keyword") || "",
      status: searchParams.get("status") || "",
      category: searchParams.get("category") || "",
      mine: searchParams.get("mine") || ""
    };
    setFilters(nextFilters);
    load(nextFilters);
  }, [searchKey, isAdmin, currentUser?.user_id]);

  useEffect(() => {
    api("/categories")
      .then(setCategoryRows)
      .catch(() => setCategoryRows([]));
  }, []);

  const categories = useMemo(() => {
    const fromSettings = categoryRows.map((category) => category.category_name).filter(Boolean);
    const fromDevices = (devices || []).map((device) => device.category).filter(Boolean);
    return [...new Set([...fromSettings, ...fromDevices])];
  }, [categoryRows, devices]);

  async function downloadDeviceExcel() {
    if (!isAdmin || !devices?.length || exportBusy) return;
    setExportBusy(true);
    try {
      const XLSX = await import("xlsx");
      const enrichedDevices = await Promise.all(
        devices.map(async (device) => {
          if (!device?.device_id) return device;
          try {
            const detail = await api(`/devices/${encodeURIComponent(device.device_id)}/detail`);
            return { ...device, current_transactions: detail.transactions || [] };
          } catch {
            return { ...device, current_transactions: [] };
          }
        })
      );
      const rows = deviceExcelRows(enrichedDevices);
      const sheet = XLSX.utils.json_to_sheet(rows);
      applyDeviceExcelColumnWidths(sheet, rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "장비목록");
      XLSX.writeFile(workbook, `장비목록-${fileDateStamp()}.xlsx`);
    } catch (err) {
      window.alert(err.message || "엑셀 다운로드 중 오류가 발생했습니다.");
    } finally {
      setExportBusy(false);
    }
  }

  if (!devices) return <Loading />;

  return (
    <div className="app-page">
      <section className="hero-strip hidden sm:block">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="hidden lg:block">
            <h1 className="page-title">장비 목록</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isAdmin ? "장비번호, 상태, 분류별로 장비를 조회합니다." : "전체 장비를 조회하고 내 장비 필터로 할당 장비를 확인합니다."}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            {isAdmin ? (
              <>
                <button className="btn-secondary w-full md:w-auto" type="button" onClick={downloadDeviceExcel} disabled={!devices.length || exportBusy}>
                  <Download size={18} />
                  {exportBusy ? "생성 중" : "엑셀 다운로드"}
                </button>
                <button className="btn-secondary w-full md:w-auto" type="button" onClick={() => setQrPrintOpen(true)} disabled={!devices.length}>
                  <Printer size={18} />
                  QR 코드 인쇄
                </button>
              </>
            ) : null}
            {isAdmin ? (
              <Link className="btn-primary w-full md:w-auto" to="/devices/new">
                <Plus size={18} />
                장비 등록
              </Link>
            ) : (
              <button className="btn-primary w-full md:w-auto" type="button" onClick={() => setCatalogOpen(true)}>
                <PackageCheck size={18} />
                대여하기
              </button>
            )}
          </div>
        </div>
      </section>

      <MobileActionPanel
        isAdmin={isAdmin}
        exportBusy={exportBusy}
        canExport={devices.length > 0}
        onDownload={downloadDeviceExcel}
        onOpenCatalog={() => setCatalogOpen(true)}
      />

      <form
        className="panel space-y-4 p-3 sm:space-y-4 sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters(filters);
        }}
      >
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_5.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={21} />
            <input
              className="input pl-11"
              value={filters.keyword}
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              placeholder="장비번호, 기존 장비번호, 장비명, 모델명"
            />
          </div>
          <button className="btn-primary w-full px-0 sm:w-auto sm:px-4">
            조회
          </button>
        </div>
        <StatusFilters
          value={filters.status}
          mine={filters.mine}
          onMine={() => applyFilters({ ...filters, status: "", mine: filters.mine ? "" : "1", category: "" })}
          onChange={(status) => applyFilters({ ...filters, status, mine: "" })}
        />
        <KeywordChip keyword={appliedKeyword} onClear={() => applyFilters({ ...filters, keyword: "" })} />
      </form>

      <section className="panel overflow-hidden">
        <CategoryTabs
          categories={categories}
          value={filters.category}
          mine={filters.mine}
          onChange={(category) => applyFilters({ ...filters, category, mine: "" })}
        />

        {devices.length ? (
          <DeviceList devices={devices} onOpen={setDetailDevice} onQr={setQrDevice} />
        ) : (
          <div className="p-4">
            <EmptyState
              title={isAdmin || !filters.mine ? "등록된 장비가 없습니다." : "현재 할당된 장비가 없습니다."}
              description={isAdmin ? "장비 등록에서 첫 장비를 추가해보세요." : filters.mine ? "내 장비 필터를 해제하면 전체 장비를 볼 수 있습니다." : "대여하기 버튼으로 사용 가능한 장비를 찾아보세요."}
            />
          </div>
        )}
      </section>

      {catalogOpen ? (
        <RentalCatalogModal
          categories={categories}
          onClose={() => setCatalogOpen(false)}
          onOpenDevice={(device) => {
            setCatalogOpen(false);
            setDetailDevice(device);
          }}
          onRent={(device) => {
            setCatalogOpen(false);
            setProcessDevice(device);
          }}
        />
      ) : null}
      {qrPrintOpen ? <QrPrintModal devices={devices} categories={categories} onClose={() => setQrPrintOpen(false)} /> : null}
      <DeviceProcessModal
        key={processDevice?.device_id || "rent-catalog"}
        device={processDevice}
        mode={processDevice ? "rent" : ""}
        onClose={() => setProcessDevice(null)}
        onDone={() => load()}
      />
      <DeviceDetailModal
        device={detailDevice}
        onClose={() => setDetailDevice(null)}
        onChanged={() => load()}
      />
      <QrDownloadModal device={qrDevice} onClose={() => setQrDevice(null)} />
    </div>
  );
}
