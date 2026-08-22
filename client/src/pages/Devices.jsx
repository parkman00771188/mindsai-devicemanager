import { Building2, CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ClipboardList, HardDrive, LayoutGrid, Menu, Monitor, MoreHorizontal, PackageCheck, Plus, Printer, QrCode, RotateCcw, Search, TabletSmartphone, UserRound, Wrench, X } from "lucide-react";
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
import { deviceCapacity, deviceTitle, splitPhotoPaths, STATUS_OPTIONS, statusLabel, transactionMemo, transactionNumber, transactionPlace } from "../constants.js";

const emptyFilters = {
  keyword: "",
  status: "",
  category: "",
  owner_organization: "",
  mine: ""
};

const deviceSortCollator = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" });

function compareDeviceText(left, right) {
  const leftValue = String(left || "").trim();
  const rightValue = String(right || "").trim();
  if (!leftValue && !rightValue) return 0;
  if (!leftValue) return 1;
  if (!rightValue) return -1;
  return deviceSortCollator.compare(leftValue, rightValue);
}

function sortDeviceRows(rows) {
  return [...rows].sort((left, right) => {
    const categoryComparison = compareDeviceText(left.category, right.category);
    if (categoryComparison) return categoryComparison;
    return compareDeviceText(left.device_id, right.device_id);
  });
}

function visibleFilters(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ""));
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
  AVAILABLE: "bg-[#e9f8ef] text-[#159d8f] ring-[#bbf7d0]",
  RENTED: "bg-brand text-white ring-brand",
  DELIVERED: "bg-[#eef4ff] text-[#2563eb] ring-[#dbe7ff]",
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

function CategoryTabs({ categories, value, mine, onChange, compact = false }) {
  if (compact) {
    return (
      <div className="flex items-center border-b border-line bg-white px-2 py-2.5 sm:px-3">
        <div className="scrollbar-none min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center gap-1.5">
            <button
              type="button"
              className={`flex min-h-9 snap-start items-center rounded-lg px-4 text-sm font-extrabold transition ${
                !value && !mine ? "bg-brand text-white shadow-lift" : "text-slate-600 hover:bg-[#eef4ff] hover:text-brand"
              }`}
              onClick={() => onChange("")}
            >
              전체
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={`flex min-h-9 snap-start items-center rounded-lg px-4 text-sm font-extrabold transition ${
                  value === category ? "bg-brand text-white shadow-lift" : "text-slate-600 hover:bg-[#eef4ff] hover:text-brand"
                }`}
                onClick={() => onChange(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-500" aria-hidden="true">
          <ChevronRight size={18} />
        </span>
      </div>
    );
  }

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

function StatusFilters({ value, mine, onChange, onMine, compact = false }) {
  const orderedStatuses = [
    ...STATUS_OPTIONS.filter(([status]) => ["AVAILABLE", "RENTED", "DELIVERED"].includes(status)),
    ...STATUS_OPTIONS.filter(([status]) => !["AVAILABLE", "RENTED", "DELIVERED"].includes(status))
  ];

  if (compact) {
    const buttonClass = (active) =>
      `inline-flex min-h-10 shrink-0 snap-start items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-extrabold leading-tight transition ${
        active
          ? "border-brand bg-white text-brand shadow-[0_0_0_1px_rgba(37,99,235,0.08)]"
          : "border-line bg-white text-slate-700 hover:border-[#b9cdfa] hover:bg-[#eef4ff] hover:text-brand"
      }`;

    return (
      <div className="grid gap-2 border-t border-line pt-3 lg:grid-cols-[4.5rem_minmax(0,1fr)] lg:items-start">
        <p className="text-sm font-extrabold text-ink lg:pt-2.5">상태</p>
        <div className="scrollbar-none -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
          {onMine ? (
            <button className={buttonClass(Boolean(mine))} type="button" onClick={onMine}>
              <UserRound size={16} />
              내 장비
            </button>
          ) : null}
          <button className={buttonClass(!value && !mine)} type="button" onClick={() => onChange("")}>
            전체
          </button>
          {orderedStatuses.map(([status, label]) => {
            const Icon = statusIconMap[status] || PackageCheck;
            return (
              <button key={status} className={buttonClass(value === status && !mine)} type="button" onClick={() => onChange(status)}>
                <Icon size={16} />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 pt-1 sm:border-t sm:border-line sm:pt-3 lg:grid-cols-[88px_minmax(0,1fr)] lg:items-start lg:pt-4">
      <p className="text-sm font-extrabold text-ink lg:pt-2 lg:text-base">상태</p>
      <div className="scrollbar-none -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
        {onMine ? (
          <button
            className={`inline-flex min-h-11 shrink-0 snap-start items-center justify-center gap-2 rounded-lg border px-4 text-sm font-extrabold leading-tight transition lg:min-h-11 ${
              mine ? "border-brand bg-brand text-white shadow-lift" : "border-line bg-white text-slate-700 hover:border-[#dbe7ff] hover:bg-[#eef4ff] hover:text-brand"
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
            !value && !mine ? "border-brand bg-brand text-white shadow-lift" : "border-line bg-white text-slate-700 hover:border-[#dbe7ff] hover:bg-[#eef4ff] hover:text-brand"
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
                value === status && !mine ? "border-brand bg-brand text-white shadow-lift" : "border-line bg-white text-slate-700 hover:border-[#dbe7ff] hover:bg-[#eef4ff] hover:text-brand"
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
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-base font-extrabold leading-tight text-ink transition hover:bg-[#e5e9f1]"
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

function MobileActionPanel({ isAdmin, onOpenCatalog }) {
  if (!isAdmin) {
    return (
      <section className="panel grid grid-cols-2 gap-2 p-3 sm:hidden">
        <button className="group flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg p-2 text-center" type="button" onClick={onOpenCatalog}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-lift transition group-hover:bg-[#1d4ed8]">
            <PackageCheck size={21} />
          </span>
          <span className="line-clamp-2 text-xs font-extrabold text-ink">대여하기</span>
        </button>
        <Link className="group flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg p-2 text-center" to="/devices/new">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-lift transition group-hover:bg-[#1d4ed8]">
            <Plus size={22} />
          </span>
          <span className="line-clamp-2 text-xs font-extrabold text-ink">장비 등록</span>
        </Link>
      </section>
    );
  }

  return (
    <section className="panel grid grid-cols-1 gap-2 p-3 sm:hidden">
      <Link className="group flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg p-2 text-center" to="/devices/new">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-lift transition group-hover:bg-[#1d4ed8]">
          <Plus size={22} />
        </span>
        <span className="line-clamp-2 text-xs font-extrabold text-ink">장비 등록</span>
      </Link>
    </section>
  );
}

function MobileInfoTile({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-[#f8fafc] px-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-brand">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block break-words text-xs font-extrabold leading-tight text-slate-500">{label}</span>
        <span className="mt-0.5 block break-words text-sm font-extrabold leading-tight text-ink">{value || "-"}</span>
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
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eef4ff] sm:h-20 sm:w-20">
          {photos[0] ? (
            <img src={photos[0]} alt={`${deviceTitle(device)} 사진`} className="h-full w-full object-cover" />
          ) : (
            <PackageCheck size={25} className="text-brand" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-start gap-2">
            <div className="min-w-[7rem] flex-1">
              <p className="break-words text-base font-extrabold leading-snug text-ink">{deviceTitle(device)}</p>
              <p className="mt-1 break-all text-xs font-extrabold text-brand">{device.device_id}</p>
            </div>
            <MobileStatusPill status={device.status} />
          </div>
          <p className="mt-1 line-clamp-2 break-words text-xs font-bold leading-5 text-slate-500">No {index + 1} · {device.category || "분류 미입력"} · {device.model_name || "모델 미입력"}</p>
          {device.legacy_device_id ? <p className="mt-1 break-all text-xs font-bold text-slate-500">기존 {device.legacy_device_id}</p> : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MobileInfoTile icon={UserRound} label={currentLabel} value={currentValue} />
        <MobileInfoTile icon={ClipboardList} label="목적/사유" value={purposeValue} />
      </div>
      <p className="mt-2 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs font-extrabold text-slate-600">
        소유 소속 · {device.owner_organization || "미지정"}
      </p>
      {action ? (
        <div className="mt-3">{action}</div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <p className="flex min-w-0 items-start gap-2 text-xs font-bold leading-5 text-slate-600" title={memoValue === "-" ? "" : memoValue}>
            <Building2 size={15} className="shrink-0 text-slate-500" />
            <span className="min-w-0 break-words">{memoValue}</span>
          </p>
          <button
            className="btn-secondary h-10 shrink-0 border-[#dbe7ff] px-3 text-xs text-brand"
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

function DeviceTable({ devices, onOpen, onQr, actionForDevice, startIndex = 0 }) {
  return (
    <div className="hidden p-2 lg:block">
      <div className="overflow-x-auto rounded-lg border border-line/70">
        <table className="w-full min-w-[1180px] table-fixed">
          <thead className="table-head">
            <tr>
              <th className="w-[4%]">순번</th>
              <th className="w-[8%]">상태</th>
              <th className="w-[9%]">분류</th>
              <th className="w-[17%]">장비번호</th>
              <th className="w-[15%]">장비명</th>
              <th className="w-[9%]">모델명</th>
              <th className="w-[7%]">용량</th>
              <th className="w-[8%]">대여자</th>
              <th className="w-[9%]">목적/사유</th>
              <th className="w-[10%]">소유 소속</th>
              <th className="w-[4%]" aria-label="관리" />
            </tr>
          </thead>
          <tbody>
            {devices.map((device, index) => (
              <tr key={device.device_id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen(device)}>
                <td className="table-cell font-bold text-slate-500">{startIndex + index + 1}</td>
                <td className="table-cell">
                  <StatusBadge status={device.status} label={device.status === "DELIVERED" ? "납품" : undefined} />
                </td>
                <td className="table-cell"><span className="line-clamp-2 break-words leading-5" title={device.category || ""}>{device.category || "-"}</span></td>
                <td className="table-cell font-extrabold text-brand"><span className="block whitespace-nowrap" title={device.device_id}>{device.device_id}</span></td>
                <td className="table-cell font-extrabold"><span className="line-clamp-2 break-words leading-5" title={deviceTitle(device)}>{deviceTitle(device)}</span></td>
                <td className="table-cell"><span className="line-clamp-2 break-words leading-5" title={device.model_name || ""}>{device.model_name || "-"}</span></td>
                <td className="table-cell font-bold text-slate-600">{deviceCapacity(device)}</td>
                <td className="table-cell"><span className="line-clamp-2 break-words leading-5" title={device.current_borrower || ""}>{device.current_borrower || "-"}</span></td>
                <td className="table-cell"><span className="line-clamp-2 break-words leading-5" title={device.current_status_purpose || device.current_purpose || ""}>{device.current_status_purpose || device.current_purpose || "-"}</span></td>
                <td className="table-cell"><span className="line-clamp-2 break-words leading-5" title={device.owner_organization || ""}>{device.owner_organization || "-"}</span></td>
                <td className="table-cell text-center">
                  {actionForDevice ? (
                    actionForDevice(device)
                  ) : (
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-[#eef4ff] hover:text-brand"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onQr?.(device);
                      }}
                      aria-label={`${device.device_id} QR 코드 보기`}
                      title="QR 코드 보기"
                    >
                      <MoreHorizontal size={18} />
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

function DeviceList({ devices, onOpen, onQr, actionForDevice, startIndex = 0 }) {
  return (
    <>
      <div className="grid gap-3 p-2 sm:grid-cols-2 lg:hidden">
        {devices.map((device, index) => (
          <DeviceMobileCard
            key={device.device_id}
            device={device}
            index={startIndex + index}
            onOpen={() => onOpen(device)}
            onQr={() => onQr?.(device)}
            action={actionForDevice?.(device, true)}
          />
        ))}
      </div>
      <DeviceTable devices={devices} onOpen={onOpen} onQr={onQr} actionForDevice={actionForDevice} startIndex={startIndex} />
    </>
  );
}

function DevicePagination({ total, page, pageSize, onChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstVisible = Math.max(0, Math.min(page - 2, pageCount - 5));
  const visiblePages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => firstVisible + index);
  const pageButtonClass = "inline-flex h-8 w-8 !min-h-8 items-center justify-center rounded-lg border border-line bg-white p-0 text-xs font-extrabold text-slate-600 transition hover:border-[#b9cdfa] hover:bg-[#eef4ff] hover:text-brand disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className="flex flex-col gap-3 border-t border-line px-3 py-3 text-sm font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p>전체 {total}건</p>
      <div className="flex items-center justify-center gap-1">
        <button className={pageButtonClass} type="button" onClick={() => onChange(0)} disabled={page === 0} aria-label="첫 페이지">
          <ChevronsLeft size={15} />
        </button>
        <button className={pageButtonClass} type="button" onClick={() => onChange(page - 1)} disabled={page === 0} aria-label="이전 페이지">
          <ChevronLeft size={15} />
        </button>
        {visiblePages.map((pageIndex) => (
          <button
            key={pageIndex}
            className={`${pageButtonClass} ${pageIndex === page ? "!border-brand !bg-brand !text-white shadow-lift" : ""}`}
            type="button"
            onClick={() => onChange(pageIndex)}
            aria-current={pageIndex === page ? "page" : undefined}
          >
            {pageIndex + 1}
          </button>
        ))}
        <button className={pageButtonClass} type="button" onClick={() => onChange(page + 1)} disabled={page >= pageCount - 1} aria-label="다음 페이지">
          <ChevronRight size={15} />
        </button>
        <button className={pageButtonClass} type="button" onClick={() => onChange(pageCount - 1)} disabled={page >= pageCount - 1} aria-label="마지막 페이지">
          <ChevronsRight size={15} />
        </button>
      </div>
      <p className="text-left sm:text-right">{pageSize}개씩 보기</p>
    </div>
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
  const [organizations, setOrganizations] = useState([]);
  const [qrDevice, setQrDevice] = useState(null);
  const [detailDevice, setDetailDevice] = useState(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [qrPrintOpen, setQrPrintOpen] = useState(false);
  const [processDevice, setProcessDevice] = useState(null);
  const [devicePage, setDevicePage] = useState(0);
  const [filters, setFilters] = useState(() => ({
    keyword: searchParams.get("keyword") || "",
    status: searchParams.get("status") || "",
    category: searchParams.get("category") || "",
    owner_organization: searchParams.get("owner_organization") || "",
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
    setDevicePage(0);
    setFilters(nextFilters);
    setSearchParams(visibleFilters(nextFilters));
  }

  useEffect(() => {
    const nextFilters = {
      keyword: searchParams.get("keyword") || "",
      status: searchParams.get("status") || "",
      category: searchParams.get("category") || "",
      owner_organization: searchParams.get("owner_organization") || "",
      mine: searchParams.get("mine") || ""
    };
    setFilters(nextFilters);
    load(nextFilters);
  }, [searchKey, isAdmin, currentUser?.user_id]);

  useEffect(() => {
    Promise.all([api("/categories"), api("/user-options?option_type=ORGANIZATION")])
      .then(([categoryData, organizationData]) => {
        setCategoryRows(categoryData);
        setOrganizations(organizationData.map((option) => option.option_text).filter(Boolean));
      })
      .catch(() => {
        setCategoryRows([]);
        setOrganizations([]);
      });
  }, []);

  const categories = useMemo(() => {
    const fromSettings = categoryRows.map((category) => category.category_name).filter(Boolean);
    const fromDevices = (devices || []).map((device) => device.category).filter(Boolean);
    return [...new Set([...fromSettings, ...fromDevices])];
  }, [categoryRows, devices]);

  const sortedDevices = useMemo(() => sortDeviceRows(devices || []), [devices]);
  const devicePageSize = 50;
  const devicePageCount = Math.max(1, Math.ceil(sortedDevices.length / devicePageSize));
  const safeDevicePage = Math.min(devicePage, devicePageCount - 1);
  const visibleDevices = sortedDevices.slice(safeDevicePage * devicePageSize, (safeDevicePage + 1) * devicePageSize);

  useEffect(() => {
    if (devicePage !== safeDevicePage) setDevicePage(safeDevicePage);
  }, [devicePage, safeDevicePage]);

  if (!devices) return <Loading />;

  return (
    <div className="app-page">
      <section className="device-list-hero hidden sm:block">
        <div className="relative z-10 flex min-h-[7.5rem] flex-col justify-between gap-5 md:flex-row md:items-start">
          <div className="max-w-xl">
            <p className="page-kicker">Device Manager</p>
            <h1 className="page-title mt-1">장비 목록</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              {isAdmin ? "장비번호, 상태, 분류별로 장비를 조회합니다." : "전체 장비를 조회하고 내 장비 필터로 할당 장비를 확인합니다."}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto md:justify-end">
            {isAdmin ? (
              <button className="btn-secondary w-full md:w-auto" type="button" onClick={() => setQrPrintOpen(true)} disabled={!devices.length}>
                <Printer size={18} />
                QR 코드 인쇄
              </button>
            ) : null}
            {isAdmin ? (
              <Link className="btn-primary w-full md:w-auto" to="/devices/new">
                <Plus size={18} />
                장비 등록
              </Link>
            ) : (
              <>
                <button className="btn-secondary w-full md:w-auto" type="button" onClick={() => setCatalogOpen(true)}>
                  <PackageCheck size={18} />
                  대여하기
                </button>
                <Link className="btn-primary w-full md:w-auto" to="/devices/new">
                  <Plus size={18} />
                  장비 등록
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="device-list-hero-art" aria-hidden="true">
          <span className="device-list-hero-monitor"><Monitor size={62} strokeWidth={1.6} /></span>
          <span className="device-list-hero-drive"><HardDrive size={25} strokeWidth={1.8} /></span>
          <span className="device-list-hero-tablet"><TabletSmartphone size={29} strokeWidth={1.8} /></span>
          <span className="device-list-hero-card"><QrCode size={28} strokeWidth={1.8} /></span>
        </div>
      </section>

      <MobileActionPanel
        isAdmin={isAdmin}
        onOpenCatalog={() => setCatalogOpen(true)}
      />

      <form
        className="panel space-y-3 p-3 sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters(filters);
        }}
      >
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(11rem,15rem)_minmax(22rem,1fr)_auto_auto] xl:items-center">
          <select
            id="device-owner-organization-filter"
            className="select"
            value={filters.owner_organization}
            onChange={(event) => setFilters((current) => ({ ...current, owner_organization: event.target.value, mine: "" }))}
            aria-label="장비 소유 소속"
          >
            <option value="">전체 소속</option>
            {organizations.map((organization) => <option key={organization} value={organization}>{organization}</option>)}
          </select>
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={21} />
            <input
              className="input pl-11"
              value={filters.keyword}
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              placeholder="장비번호, 기존 장비번호, 장비명, 모델명"
            />
          </div>
          <button className="btn-secondary w-full whitespace-nowrap px-4" type="button" onClick={() => applyFilters(emptyFilters)}>
            <RotateCcw size={16} />
            필터 초기화
          </button>
          <button className="btn-primary w-full whitespace-nowrap px-5">
            <Search size={17} />
            조회하기
          </button>
        </div>
        <StatusFilters
          value={filters.status}
          mine={filters.mine}
          onMine={() => applyFilters({ ...filters, status: "", mine: filters.mine ? "" : "1", category: "" })}
          onChange={(status) => applyFilters({ ...filters, status, mine: "" })}
          compact
        />
        <KeywordChip keyword={appliedKeyword} onClear={() => applyFilters({ ...filters, keyword: "" })} />
      </form>

      <section className="panel overflow-hidden">
        <CategoryTabs
          categories={categories}
          value={filters.category}
          mine={filters.mine}
          onChange={(category) => applyFilters({ ...filters, category, mine: "" })}
          compact
        />

        {sortedDevices.length ? (
          <>
            <DeviceList devices={visibleDevices} onOpen={setDetailDevice} onQr={setQrDevice} startIndex={safeDevicePage * devicePageSize} />
            <DevicePagination total={sortedDevices.length} page={safeDevicePage} pageSize={devicePageSize} onChange={setDevicePage} />
          </>
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
      {qrPrintOpen ? <QrPrintModal devices={sortedDevices} categories={categories} onClose={() => setQrPrintOpen(false)} /> : null}
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
