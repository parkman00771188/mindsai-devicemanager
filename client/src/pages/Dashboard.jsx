import { ArrowRight, Bell, BellRing, Boxes, CheckCircle2, ClipboardList, PackageCheck, QrCode, RefreshCw, Stethoscope, TabletSmartphone, Truck, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { getCurrentUser, isAdminUser } from "../auth.js";
import ActionBadge from "../components/ActionBadge.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Loading from "../components/Loading.jsx";
import PhotoViewer from "../components/PhotoViewer.jsx";
import TransactionDetailModal from "../components/TransactionDetailModal.jsx";
import { deviceTitle, formatDateTime, transactionNumber } from "../constants.js";

function StatCard({ label, value, icon: Icon, tone, to }) {
  const content = (
      <div className="flex h-full items-center gap-3 sm:gap-4 xl:gap-2 2xl:gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 xl:h-10 xl:w-10 2xl:h-12 2xl:w-12 ${tone}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-extrabold leading-tight tracking-tight text-ink sm:text-[22px]">{value}</p>
          <p className="mt-1 break-words text-xs font-semibold leading-tight text-slate-400 sm:text-[13px]">{label}</p>
        </div>
      </div>
  );
  const className = "metric-card block p-4 sm:px-5 sm:py-[18px] xl:px-3 xl:py-4 2xl:px-5 2xl:py-[18px]";
  return to ? <Link className={className} to={to}>{content}</Link> : <div className={className}>{content}</div>;
}

function NoticeTabs({ value, onChange, requestCount }) {
  const tabs = [
    { value: "requests", label: "요청사항", count: requestCount },
    { value: "general", label: "일반" }
  ];
  return (
    <div className="flex w-full rounded-lg border border-line bg-white p-1 shadow-soft sm:inline-flex sm:w-auto">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          className={`flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-extrabold transition sm:min-w-24 sm:flex-none ${
            value === tab.value ? "bg-brand text-white shadow-lift" : "text-slate-600 hover:bg-[#eef4ff] hover:text-brand"
          }`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count ? (
            <span className={`rounded-full px-1.5 py-0.5 text-xs ${value === tab.value ? "bg-white/20 text-white" : "bg-[#eef4ff] text-brand"}`}>
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function NotificationCard({ notification, isAdmin, onOpen }) {
  const isReturnRequest = notification.type === "RETURN_REQUEST";
  const isReturnComplete = notification.type === "RETURN_COMPLETE";
  const title = isReturnRequest
    ? isAdmin
      ? "반납 요청 중"
      : "반납 요청"
    : notification.title || "알림";
  const tone = isReturnComplete ? "bg-[#e9f8ef] text-[#16a34a]" : isReturnRequest ? "bg-[#fff4ee] text-[#d47a3d]" : "bg-[#eef4ff] text-brand";
  const Icon = isReturnComplete ? CheckCircle2 : isReturnRequest ? BellRing : Bell;

  return (
    <button className="soft-row w-full text-left" type="button" onClick={() => onOpen(notification)}>
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-extrabold text-ink">{title}</p>
              {notification.device_id ? (
                <p className="mt-1 truncate text-xs font-extrabold text-brand">{notification.device_id} · {deviceTitle(notification)}</p>
              ) : (
                <p className="mt-1 truncate text-xs font-extrabold text-brand">시스템 알림</p>
              )}
            </div>
            {!notification.is_read && notification.type !== "RETURN_REQUEST" ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" /> : null}
          </div>
          <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">{notification.message || "-"}</p>
          <p className="mt-2 text-xs font-bold text-slate-400">{formatDateTime(notification.created_at)}</p>
        </div>
      </div>
    </button>
  );
}

const inventoryColors = [
  "#2563eb",
  "#14b8a6",
  "#8b5cf6",
  "#f59e0b",
  "#ef6357",
  "#0ea5e9",
  "#64748b",
  "#22c55e",
  "#ec4899",
  "#f97316",
  "#6366f1",
  "#84cc16"
];

function InventoryDonut({ items, total }) {
  let cursor = 0;
  const segments = items.map((item, index) => {
    const start = cursor;
    const end = total ? cursor + (item.count / total) * 360 : cursor;
    cursor = end;
    return `${inventoryColors[index % inventoryColors.length]} ${start}deg ${end}deg`;
  });
  const chartBackground = total && segments.length ? `conic-gradient(${segments.join(", ")})` : "#e8edf5";

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4">
        <div>
          <h2 className="section-title">장비별 재고 현황</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">분류별 보유 장비 비율</p>
        </div>
        <Link className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef4ff] text-brand transition hover:bg-[#dbe7ff]" to="/devices" aria-label="장비 목록 보기" title="장비 목록 보기">
          <Boxes size={18} />
        </Link>
      </div>
      <div className="grid min-h-[19rem] items-center gap-5 p-4 sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:p-5">
        <div className="mx-auto flex flex-col items-center">
          <div className="relative h-40 w-40 rounded-full shadow-[0_14px_35px_rgba(54,77,125,0.14)]" style={{ background: chartBackground }} role="img" aria-label={`전체 장비 ${total}대의 분류별 재고 원형 차트`}>
            <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full border border-white/80 bg-white shadow-inner">
              <strong className="text-3xl font-extrabold leading-none text-ink">{total}</strong>
              <span className="mt-1 text-xs font-extrabold text-slate-500">전체</span>
            </div>
          </div>
          <p className="mt-3 text-xs font-bold text-slate-400">폐기 장비 제외</p>
        </div>

        <div className="scrollbar-none max-h-[17rem] min-w-0 space-y-1 overflow-y-auto pr-1">
          {items.length ? items.map((item, index) => {
            const percentage = total ? ((item.count / total) * 100).toFixed(1) : "0.0";
            const target = item.category === "미분류" ? "/devices" : `/devices?category=${encodeURIComponent(item.category)}`;
            return (
              <Link key={item.category} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg px-2 py-2 transition hover:bg-[#f6f8fc]" to={target}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: inventoryColors[index % inventoryColors.length] }} />
                <span className="truncate text-sm font-extrabold text-slate-700">{item.category}</span>
                <span className="text-sm font-extrabold text-ink">{item.count}대</span>
                <span className="w-12 text-right text-xs font-bold text-slate-400">{percentage}%</span>
              </Link>
            );
          }) : (
            <EmptyState title="등록된 장비가 없습니다." />
          )}
        </div>
      </div>
    </section>
  );
}

function RecentHistoryPanel({ rows, onOpen }) {
  const visibleRows = rows.slice(0, 7);
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4">
        <div>
          <h2 className="section-title">최근 이력</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">최근 처리된 장비 활동</p>
        </div>
        <Link className="chip chip-active" to="/transactions">전체 보기</Link>
      </div>
      {visibleRows.length ? (
        <div className="divide-y divide-line px-2 sm:px-3">
          {visibleRows.map((row) => (
            <button
              key={row.transaction_id}
              className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-3 text-left transition hover:bg-[#f6f8fc] sm:grid-cols-[minmax(0,1.35fr)_auto_minmax(5rem,0.6fr)_7.25rem] sm:px-3"
              type="button"
              onClick={() => onOpen(row)}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef4ff] text-brand">
                  <TabletSmartphone size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold text-ink">{row.device_id || "-"}</span>
                  <span className="mt-0.5 block truncate text-xs font-bold text-slate-500">{deviceTitle(row)} · 출납 {transactionNumber(row)}</span>
                </span>
              </span>
              <ActionBadge action={row.action_type} />
              <span className="hidden min-w-0 truncate text-sm font-bold text-slate-600 sm:block">{row.user_name || "사용자 없음"}</span>
              <span className="col-span-2 text-right text-xs font-bold text-slate-400 sm:col-span-1">{formatDateTime(row.created_at)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="p-4"><EmptyState title="아직 이력이 없습니다." /></div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const currentUser = getCurrentUser();
  const isAdmin = isAdminUser(currentUser);
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [devices, setDevices] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState("");
  const [noticeTab, setNoticeTab] = useState("requests");
  const [transactionDetail, setTransactionDetail] = useState(null);
  const [photoViewer, setPhotoViewer] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const navigate = useNavigate();

  async function loadDashboard() {
    setError("");
    const [summaryData, recentData, deviceData, notificationData] = await Promise.all([
      api("/dashboard/summary"),
      api("/dashboard/recent-transactions?limit=10"),
      api("/devices"),
      api("/notifications?scope=dashboard")
    ]);
    setSummary(summaryData);
    setRecent(recentData);
    setDevices(deviceData);
    setNotifications(notificationData);
  }

  useEffect(() => {
    loadDashboard().catch((err) => setError(err.message));
  }, []);

  const categoryInventory = useMemo(() => {
    const counts = new Map();
    devices
      .filter((device) => device.status !== "DISPOSED")
      .forEach((device) => {
        const category = String(device.category || "").trim() || "미분류";
        counts.set(category, (counts.get(category) || 0) + 1);
      });
    return [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, "ko"));
  }, [devices]);
  const inventoryTotal = categoryInventory.reduce((total, item) => total + item.count, 0);

  function openPhotoViewer(paths, index, row) {
    setPhotoViewer({
      paths,
      index,
      title: `${deviceTitle(row)} 사진`,
      description: formatDateTime(row.created_at)
    });
  }

  function movePhoto(offset) {
    setPhotoViewer((current) => {
      if (!current) return current;
      return { ...current, index: (current.index + offset + current.paths.length) % current.paths.length };
    });
  }

  async function openNotification(notification) {
    if (!notification?.notification_id) return;
    if (!notification.is_read) {
      const updated = await api(`/notifications/${encodeURIComponent(notification.notification_id)}/read`, { method: "PUT" });
      setNotifications((current) => current.map((row) => (row.notification_id === updated.notification_id ? updated : row)));
    }
    if (notification.device_id) navigate(`/devices/${encodeURIComponent(notification.device_id)}`);
  }

  async function deleteTransaction(row) {
    if (!row?.transaction_id) return;
    setDeleteBusy(true);
    try {
      await api(`/transactions/${encodeURIComponent(row.transaction_id)}`, { method: "DELETE" });
      setTransactionDetail(null);
      await loadDashboard();
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
      await loadDashboard();
      return updated;
    } catch (err) {
      throw err;
    } finally {
      setUpdateBusy(false);
    }
  }

  if (!summary) {
    if (error) {
      return (
        <div className="app-page">
          <section className="panel p-6">
            <h1 className="section-title">대시보드를 불러오지 못했습니다</h1>
            <p className="mt-2 text-sm font-semibold text-slate-600">{error}</p>
            <button className="btn-primary mt-4" type="button" onClick={() => loadDashboard().catch((err) => setError(err.message))}>
              <RefreshCw size={18} />
              다시 불러오기
            </button>
          </section>
        </div>
      );
    }
    return <Loading />;
  }

  const requestNotifications = notifications.filter((notification) => notification.type === "RETURN_REQUEST" || (notification.type === "RETURN_COMPLETE" && !notification.is_read));
  const generalNotifications = notifications
    .filter((notification) => notification.type !== "RETURN_REQUEST" && notification.type !== "RETURN_COMPLETE")
    .slice(0, 5);
  const visibleNotifications = noticeTab === "requests" ? requestNotifications : generalNotifications;

  return (
    <div className="app-page dashboard-page">
      <section className="dashboard-hero">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="dashboard-greeting">안녕하세요, {currentUser?.name || "사용자"}님 👋</h1>
            <p className="mt-1.5 text-sm font-medium text-slate-500 sm:text-[15px]">오늘의 장비 현황과 최근 출납 이력을 한눈에 확인하세요.</p>
          </div>
          <div className="hidden gap-2 sm:flex">
            <Link className="btn-primary" to="/scan?auto=1">
              <QrCode size={18} />
              QR 스캔
            </Link>
            <Link className="btn-secondary" to="/devices/new">
              <ClipboardList size={18} />
              장비 등록
            </Link>
          </div>
        </div>
      </section>

      <Link className="dashboard-mobile-cta sm:hidden" to="/scan?auto=1">
        <span className="dashboard-mobile-cta-icon"><QrCode size={23} /></span>
        <span className="relative z-10 min-w-0 flex-1">
          <strong className="block text-lg font-extrabold">QR로 장비 확인</strong>
          <span className="mt-1 block text-sm font-medium text-white/80">스캔하여 대여·반납을 빠르게 처리하세요.</span>
        </span>
        <span className="dashboard-mobile-cta-arrow"><ArrowRight size={23} /></span>
      </Link>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="전체 장비" value={summary.total} icon={TabletSmartphone} tone="bg-[#eef4ff] text-brand" to="/devices" />
        <StatCard label="대여 가능" value={summary.available} icon={ClipboardList} tone="bg-[#e9f8ef] text-[#16a34a]" to="/devices?status=AVAILABLE" />
        <StatCard label="대여 중" value={summary.rented} icon={PackageCheck} tone="bg-[#eef4ff] text-[#2563eb]" to="/devices?status=RENTED" />
        <StatCard label="납품" value={summary.delivered} icon={Truck} tone="bg-[#eef0f4] text-[#4e5968]" to="/devices?status=DELIVERED" />
        <StatCard label="점검 중" value={summary.maintenance} icon={Stethoscope} tone="bg-[#fff4ee] text-[#d47a3d]" to="/devices?status=MAINTENANCE" />
        <StatCard label="고장" value={summary.broken} icon={Wrench} tone="bg-[#fdecec] text-[#ef4444]" to="/devices?status=BROKEN" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(23rem,0.72fr)_minmax(0,1.28fr)]">
        <InventoryDonut items={categoryInventory} total={inventoryTotal} />
        <RecentHistoryPanel rows={recent} onOpen={setTransactionDetail} />
      </div>

      <section className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[12rem] flex-1">
            <h2 className="section-title">알림</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {isAdmin ? "반납 요청 상태와 완료 알림을 확인합니다." : "관리자가 보낸 반납 요청을 확인합니다."}
            </p>
          </div>
          <NoticeTabs value={noticeTab} onChange={setNoticeTab} requestCount={requestNotifications.length} />
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleNotifications.length ? (
            visibleNotifications.map((notification) => (
              <NotificationCard
                key={notification.notification_id}
                notification={notification}
                isAdmin={isAdmin}
                onOpen={openNotification}
              />
            ))
          ) : (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState
                title={noticeTab === "requests" ? "처리할 요청사항이 없습니다." : "표시할 일반 알림이 없습니다."}
                description={noticeTab === "requests" ? "반납이 완료된 요청은 목록에서 자동으로 사라집니다." : "일반 알림은 최신 5개만 표시됩니다."}
              />
            </div>
          )}
        </div>
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
        onDeviceChanged={loadDashboard}
      />
      <PhotoViewer viewer={photoViewer} onClose={() => setPhotoViewer(null)} onMove={movePhoto} />
    </div>
  );
}
