import { ArrowRight, Bell, BellRing, CheckCircle2, ClipboardList, PackageCheck, QrCode, RefreshCw, Stethoscope, TabletSmartphone, Truck, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { getCurrentUser, isAdminUser } from "../auth.js";
import ActionBadge from "../components/ActionBadge.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Loading from "../components/Loading.jsx";
import PhotoViewer from "../components/PhotoViewer.jsx";
import TransactionDetailModal from "../components/TransactionDetailModal.jsx";
import { actionLabel, deviceTitle, formatDate, formatDateTime, splitPhotoPaths, transactionMemo, transactionNumber, transactionPlace } from "../constants.js";

function transactionEventDate(row = {}) {
  return ["RETURN", "RECOVERY"].includes(row.action_type) ? row.returned_at : row.rented_at;
}

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

export default function Dashboard() {
  const currentUser = getCurrentUser();
  const isAdmin = isAdminUser(currentUser);
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
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
    const [summaryData, recentData, notificationData] = await Promise.all([api("/dashboard/summary"), api("/dashboard/recent-transactions?limit=10"), api("/notifications?scope=dashboard")]);
    setSummary(summaryData);
    setRecent(recentData);
    setNotifications(notificationData);
  }

  useEffect(() => {
    loadDashboard().catch((err) => setError(err.message));
  }, []);

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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="panel order-2 overflow-hidden lg:order-1">
          <div className="flex items-center justify-between border-b border-line px-4 py-4">
            <h2 className="section-title">최근 이력</h2>
            <Link className="chip chip-active" to="/transactions">
              전체 보기
            </Link>
          </div>
          {recent.length ? (
            <>
              <div className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-1 xl:hidden">
                {recent.map((row) => {
                  const photos = splitPhotoPaths(row.photo_paths);
                  const summary = transactionPlace(row) || transactionMemo(row) || row.issue_description || "메모 없음";
                  return (
                    <button key={row.transaction_id} className="soft-row w-full max-w-full overflow-hidden text-left" type="button" onClick={() => setTransactionDetail(row)}>
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-extrabold text-ink">{deviceTitle(row)}</p>
                          <p className="mt-1 truncate text-xs font-bold text-slate-500">출납 {transactionNumber(row)} · {row.device_id} · {row.user_name || "사용자 없음"}</p>
                          <p className="mt-1 truncate text-xs font-extrabold text-slate-600">소유 소속 · {row.device_owner_organization || "미지정"}</p>
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
                            <span key={`${row.transaction_id}-dash-photo-${index}`} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-slate-100">
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
                  <table className="w-full min-w-[1360px] table-fixed">
                    <thead className="table-head">
                      <tr>
                        <th className="w-20">출납번호</th>
                        <th className="w-[72px]">작업</th>
                        <th className="w-56">장비번호</th>
                        <th className="w-36">장비명</th>
                        <th className="w-28">소유 소속</th>
                        <th className="w-20">사용자</th>
                        <th className="w-32">목적/사유</th>
                        <th className="w-24">처리 기준일</th>
                        <th className="w-20">사진</th>
                        <th className="w-28">메모</th>
                        <th className="w-28">처리자</th>
                        <th className="w-28">처리일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((row) => {
                        const photos = splitPhotoPaths(row.photo_paths);
                        const memo = transactionMemo(row) || row.issue_description || "-";
                        return (
                        <tr key={row.transaction_id} className="cursor-pointer hover:bg-slate-50" onClick={() => setTransactionDetail(row)}>
                          <td className="table-cell whitespace-nowrap align-middle font-extrabold text-brand">{transactionNumber(row)}</td>
                          <td className="table-cell whitespace-nowrap align-middle">
                            <ActionBadge action={row.action_type} />
                          </td>
                          <td className="table-cell whitespace-nowrap align-middle font-extrabold text-brand" title={row.device_id || ""}>
                            <span className="block whitespace-nowrap">{row.device_id || "-"}</span>
                          </td>
                          <td className="table-cell whitespace-nowrap align-middle">
                            <span className="block truncate font-extrabold text-ink">{deviceTitle(row)}</span>
                          </td>
                          <td className="table-cell whitespace-nowrap align-middle"><span className="block truncate">{row.device_owner_organization || "-"}</span></td>
                          <td className="table-cell whitespace-nowrap align-middle">{row.user_name || "-"}</td>
                          <td className="table-cell whitespace-nowrap align-middle"><span className="block truncate">{row.purpose || "-"}</span></td>
                          <td className="table-cell whitespace-nowrap align-middle">{formatDate(transactionEventDate(row))}</td>
                          <td className="table-cell whitespace-nowrap align-middle">
                            {photos.length ? (
                              <div className="flex items-center gap-1.5">
                                {photos.slice(0, 2).map((path, index) => (
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
                                {photos.length > 2 ? <span className="text-xs font-extrabold text-slate-500">+{photos.length - 2}</span> : null}
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="table-cell whitespace-nowrap align-middle" title={memo === "-" ? "" : memo}>
                            <span className="block truncate">{memo}</span>
                          </td>
                          <td className="table-cell whitespace-nowrap align-middle" title={row.handled_by_display || row.handled_by_name || row.handled_by || ""}>
                            <span className="block truncate">{row.handled_by_display || row.handled_by_name || row.handled_by || "-"}</span>
                          </td>
                          <td className="table-cell whitespace-nowrap align-middle text-slate-600">{formatDateTime(row.created_at)}</td>
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
              <EmptyState title="아직 이력이 없습니다." />
            </div>
          )}
        </section>

        <aside className="order-1 lg:order-2">
          <div className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-[12rem] flex-1">
                <h2 className="section-title">알림</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {isAdmin ? "반납 요청 상태와 완료 알림을 확인합니다." : "관리자가 보낸 반납 요청을 확인합니다."}
                </p>
              </div>
              <NoticeTabs value={noticeTab} onChange={setNoticeTab} requestCount={requestNotifications.length} />
            </div>
            <div className="mt-4 grid gap-2">
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
                <EmptyState
                  title={noticeTab === "requests" ? "처리할 요청사항이 없습니다." : "표시할 일반 알림이 없습니다."}
                  description={noticeTab === "requests" ? "반납이 완료된 요청은 목록에서 자동으로 사라집니다." : "일반 알림은 최신 5개만 표시됩니다."}
                />
              )}
            </div>
          </div>
        </aside>
      </div>
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
