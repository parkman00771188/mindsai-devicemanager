import {
  Bell,
  Building2,
  CheckCheck,
  History,
  Home,
  LogOut,
  Menu,
  MoreHorizontal,
  Settings,
  TabletSmartphone,
  Trash2,
  Truck,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { getCurrentUser, isAdminUser, roleLabel } from "../auth.js";
import { deviceTitle, formatDateTime } from "../constants.js";
import UserAvatar from "./UserAvatar.jsx";

const navItems = [
  { to: "/", label: "대시보드", icon: Home },
  { to: "/devices", label: "장비 목록", icon: TabletSmartphone },
  { to: "/transactions", label: "최근 이력", icon: History },
  { to: "/deliveries", label: "납품 관리", icon: Truck, adminOnly: true },
  { to: "/users", label: "사용자 관리", icon: Users, adminOnly: true },
  { to: "/institutions", label: "기관 관리", icon: Building2, adminOnly: true },
  { to: "/settings", label: "설정", icon: Settings }
];

const NOTIFICATION_POLL_INTERVAL_MS = 15000;

function isNavPathActive(pathname, item) {
  if (item.to === "/") return pathname === "/";
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function pageTitle(pathname) {
  if (pathname === "/") return "대시보드";
  if (pathname === "/scan") return "QR 스캔";
  if (pathname === "/devices/new") return "장비 등록";
  if (pathname.startsWith("/devices/") && pathname.endsWith("/edit")) return "장비 수정";
  if (pathname.startsWith("/devices/")) return "장비 상세";
  if (pathname.startsWith("/devices")) return "장비 목록";
  if (pathname.startsWith("/transactions")) return "최근 이력";
  if (pathname.startsWith("/deliveries")) return "납품 관리";
  if (pathname.startsWith("/users")) return "사용자 관리";
  if (pathname.startsWith("/institutions")) return "기관 관리";
  if (pathname.startsWith("/maintenance")) return "점검 관리";
  if (pathname.startsWith("/settings")) return "설정";
  return "Device Manager";
}

function NavItem({ item, onClick, variant = "sidebar" }) {
  const Icon = item.icon;
  if (variant === "sheet") {
    return (
      <NavLink
        to={item.to}
        end={item.to === "/"}
        onClick={onClick}
        className={({ isActive }) =>
          [
            "flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-sm font-extrabold transition",
            isActive
              ? "border-[#c9c4ff] bg-[#f2f0ff] text-brand shadow-soft"
              : "border-line bg-white text-ink hover:border-[#c9c4ff] hover:bg-[#f7f7fd]"
          ].join(" ")
        }
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f2f0ff] text-brand">
          <Icon size={18} />
        </span>
        <span className="min-w-0 truncate">{item.label}</span>
      </NavLink>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onClick}
      className={({ isActive }) =>
        [
          "group flex items-center justify-between rounded-lg px-3 py-3 text-sm font-extrabold transition",
          isActive
            ? "is-active bg-white text-brand shadow-lift ring-2 ring-white/45"
            : "text-white hover:bg-white/10 hover:text-white"
        ].join(" ")
      }
    >
      <span className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white transition group-hover:bg-white/20 group-hover:text-white group-[.is-active]:bg-brand group-[.is-active]:text-white">
          <Icon size={18} />
        </span>
        {item.label}
      </span>
    </NavLink>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(() => getCurrentUser());
  const [notifications, setNotifications] = useState([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState(null);
  const notificationInitialized = useRef(false);
  const knownNotificationIds = useRef(new Set());
  const notificationRef = useRef(null);
  const notificationsLoadingRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = isAdminUser(user);
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => isAdmin || !item.adminOnly),
    [isAdmin]
  );
  const mobilePrimaryItems = useMemo(() => {
    const primaryPaths = isAdmin ? ["/", "/devices", "/transactions", "/deliveries"] : ["/", "/devices", "/transactions", "/settings"];
    return primaryPaths.map((path) => visibleNavItems.find((item) => item.to === path)).filter(Boolean);
  }, [isAdmin, visibleNavItems]);
  const secondaryNavItems = visibleNavItems.filter((item) => !mobilePrimaryItems.some((primary) => primary.to === item.to));
  const moreActive = secondaryNavItems.some((item) => isNavPathActive(location.pathname, item));
  const bottomNavColumnCount = mobilePrimaryItems.length + (secondaryNavItems.length ? 1 : 0);
  const currentTitle = pageTitle(location.pathname);

  function logout() {
    localStorage.removeItem("deviceManagerUser");
    navigate("/login", { replace: true });
  }

  async function loadNotifications() {
    if (!user?.user_id || notificationsLoadingRef.current) return;
    notificationsLoadingRef.current = true;
    try {
      const rows = await api("/notifications");
      setNotifications(rows);
      if (!notificationInitialized.current) {
        knownNotificationIds.current = new Set(rows.map((row) => row.notification_id));
        notificationInitialized.current = true;
        return;
      }
      const freshUnread = rows.filter((row) => !row.is_read && !knownNotificationIds.current.has(row.notification_id));
      rows.forEach((row) => knownNotificationIds.current.add(row.notification_id));
      if (freshUnread.length) {
        setToastNotification(freshUnread[0]);
      }
    } finally {
      notificationsLoadingRef.current = false;
    }
  }

  async function readNotification(notification) {
    if (!notification?.notification_id) return;
    if (!notification.is_read) {
      const updated = await api(`/notifications/${encodeURIComponent(notification.notification_id)}/read`, { method: "PUT" });
      setNotifications((current) => current.map((row) => (row.notification_id === updated.notification_id ? updated : row)));
    }
  }

  async function openNotification(notification) {
    await readNotification(notification);
    setNotificationOpen(false);
    setToastNotification(null);
    if (notification?.device_id) {
      navigate(`/devices/${encodeURIComponent(notification.device_id)}`);
    }
  }

  async function readAllNotifications() {
    await api("/notifications/read-all", { method: "PUT" });
    setNotifications((current) => current.map((row) => ({ ...row, is_read: true })));
  }

  function canDeleteNotification(notification) {
    return notification?.type !== "RETURN_REQUEST";
  }

  async function deleteNotification(notification, event) {
    event?.stopPropagation();
    if (!notification?.notification_id || !canDeleteNotification(notification)) return;
    await api(`/notifications/${encodeURIComponent(notification.notification_id)}`, { method: "DELETE" });
    setNotifications((current) => current.filter((row) => row.notification_id !== notification.notification_id));
    setToastNotification((current) => (current?.notification_id === notification.notification_id ? null : current));
  }

  async function deleteDeletableNotifications() {
    await api("/notifications/deletable", { method: "DELETE" });
    setNotifications((current) => current.filter((row) => !canDeleteNotification(row)));
    setToastNotification((current) => (current && canDeleteNotification(current) ? null : current));
  }

  useEffect(() => {
    const syncUser = () => setUser(getCurrentUser());
    window.addEventListener("storage", syncUser);
    window.addEventListener("deviceManagerUserChanged", syncUser);
    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("deviceManagerUserChanged", syncUser);
    };
  }, []);

  useEffect(() => {
    if (!user?.user_id) return;
    let ignore = false;
    api(`/users/${encodeURIComponent(user.user_id)}`)
      .then((fresh) => {
        if (ignore) return;
        const nextUser = {
          user_id: fresh.user_id,
          name: fresh.name || user.name,
          role: fresh.role || user.role,
          organization: fresh.organization || "",
          department: fresh.department || "",
          position: fresh.position || "",
          profile_photo_path: fresh.profile_photo_path || ""
        };
        localStorage.setItem("deviceManagerUser", JSON.stringify(nextUser));
        setUser(nextUser);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [user?.user_id]);

  useEffect(() => {
    if (!user?.user_id) return;
    let ignore = false;
    notificationInitialized.current = false;
    knownNotificationIds.current = new Set();
    const tick = () => {
      if (ignore) return;
      if (document.visibilityState === "hidden") return;
      loadNotifications().catch(() => {});
    };
    const syncOnVisible = () => {
      if (!ignore && document.visibilityState === "visible") tick();
    };
    tick();
    const timer = setInterval(tick, NOTIFICATION_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", syncOnVisible);
    return () => {
      ignore = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", syncOnVisible);
    };
  }, [user?.user_id]);

  useEffect(() => {
    if (!toastNotification) return;
    const timer = setTimeout(() => setToastNotification(null), 7000);
    return () => clearTimeout(timer);
  }, [toastNotification]);

  useEffect(() => {
    if (!notificationOpen) return;
    const closeOnOutsideClick = (event) => {
      if (!notificationRef.current?.contains(event.target)) {
        setNotificationOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [notificationOpen]);

  const unreadCount = notifications.filter((row) => !row.is_read).length;
  const deletableCount = notifications.filter(canDeleteNotification).length;

  return (
    <div className="min-h-screen bg-[#f4f5fb]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 bg-gradient-to-b from-[#7f6df2] to-[#6554dc] px-5 py-5 lg:block">
        <div className="flex h-full flex-col">
          <div className="mb-6 rounded-lg bg-white/12 px-4 py-4 text-white shadow-lift">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/18">
                <TabletSmartphone size={23} />
              </div>
              <div>
                <p className="text-lg font-extrabold tracking-normal">Device Manager</p>
                <p className="text-xs font-bold text-white/70">장비 대여·반납 관리 시스템</p>
              </div>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1.5">
            {visibleNavItems.map((item) => (
              <NavItem key={item.to} item={item} />
            ))}
          </nav>
        </div>
      </aside>

      <div
        className={`fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm transition lg:hidden ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(86vw,22rem)] flex-col overflow-hidden rounded-r-lg bg-[#f4f5fb] px-3 py-3 shadow-lift transition lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="panel mb-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar user={user} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-ink">{user?.name || "사용자"}</p>
                <p className="truncate text-xs font-bold text-slate-500">{[user?.organization, user?.department, user?.position].filter(Boolean).join(" / ") || roleLabel(user?.role)}</p>
              </div>
            </div>
            <button className="btn-secondary h-10 w-10 shrink-0 p-0" onClick={() => setOpen(false)} aria-label="메뉴 닫기">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-extrabold text-slate-500">전체 메뉴</p>
          <p className="text-xs font-bold text-slate-400">보조 메뉴</p>
        </div>
        <nav className="min-h-0 flex-1 space-y-2 overflow-auto pb-2">
          {visibleNavItems.map((item) => (
            <NavItem key={item.to} item={item} onClick={() => setOpen(false)} variant="sheet" />
          ))}
        </nav>
        <button className="btn-secondary mt-3 w-full justify-center" onClick={logout}>
          <LogOut size={17} />
          로그아웃
        </button>
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-line bg-white/95 px-3 py-2 backdrop-blur-xl sm:px-4 sm:py-3 lg:px-7">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button className="btn-secondary h-10 w-10 shrink-0 p-0 sm:h-11 sm:w-11 lg:hidden" onClick={() => setOpen(true)} aria-label="메뉴 열기">
                <Menu size={19} />
              </button>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-extrabold text-brand sm:text-xs">Device Manager</p>
                <p className="truncate text-lg font-extrabold leading-tight text-ink sm:text-xl">{currentTitle}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden min-w-[220px] max-w-[300px] items-center gap-3 rounded-lg bg-[#f7f7fd] px-4 py-2.5 sm:flex">
                <UserAvatar user={user} size="md" />
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-extrabold text-ink">{user?.name || "사용자"} ({user?.user_id || "-"})</p>
                  <p className="truncate text-xs font-bold text-slate-500">{[user?.organization, user?.department, user?.position].filter(Boolean).join(" / ") || roleLabel(user?.role)}</p>
                </div>
              </div>
              <div className="relative" ref={notificationRef}>
                <button
                  className={`btn-secondary relative h-11 w-11 shrink-0 p-0 ${unreadCount ? "text-brand" : ""}`}
                  type="button"
                  onClick={() => setNotificationOpen((value) => !value)}
                  aria-label="알림"
                >
                  <Bell size={18} />
                  {unreadCount ? (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff4f7a] px-1 text-[11px] font-extrabold text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  ) : null}
                </button>
                {notificationOpen ? (
                  <div className="fixed left-3 right-3 top-16 z-40 max-h-[calc(100dvh-5rem)] w-auto overflow-hidden rounded-lg border border-line bg-white shadow-lift sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:max-h-none sm:w-[min(92vw,380px)]">
                    <div className="flex items-center justify-between gap-3 border-b border-line bg-[#f7f7fd] px-4 py-3">
                      <div>
                        <p className="text-sm font-extrabold text-ink">알림</p>
                        <p className="text-xs font-bold text-slate-500">반납 요청과 장비 관련 안내</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button className="btn-secondary h-9 px-2 text-xs" type="button" onClick={readAllNotifications} disabled={!unreadCount}>
                          <CheckCheck size={15} />
                          모두 읽음
                        </button>
                        <button
                          className="btn-secondary h-9 px-2 text-xs text-[#d84f71]"
                          type="button"
                          onClick={deleteDeletableNotifications}
                          disabled={!deletableCount}
                          title="완료된 요청과 일반 알림만 삭제됩니다."
                        >
                          <Trash2 size={15} />
                          정리
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[420px] overflow-auto p-2">
                      {notifications.length ? notifications.slice(0, 20).map((notification) => {
                        const deletable = canDeleteNotification(notification);
                        return (
                          <div
                            key={notification.notification_id}
                            className={`w-full rounded-lg p-3 text-left transition hover:bg-[#f7f7fd] ${
                              notification.is_read ? "bg-white" : "bg-[#f4f2ff]"
                            }`}
                          >
                            <button className="block w-full text-left" type="button" onClick={() => openNotification(notification)}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-extrabold text-ink">{notification.title || "알림"}</p>
                                  {notification.device_id ? (
                                    <p className="mt-1 truncate text-xs font-extrabold text-brand">{notification.device_id} · {deviceTitle(notification)}</p>
                                  ) : (
                                    <p className="mt-1 truncate text-xs font-extrabold text-brand">{notification.type === "ROLE_CHANGE" ? "계정 권한" : "시스템 알림"}</p>
                                  )}
                                </div>
                                {!notification.is_read ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" /> : null}
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">{notification.message}</p>
                            </button>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <p className="min-w-0 truncate text-[11px] font-bold text-slate-400">{formatDateTime(notification.created_at)}</p>
                              {deletable ? (
                                <button
                                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-slate-400 transition hover:border-[#ffc8d6] hover:bg-[#fff0f4] hover:text-[#d84f71]"
                                  type="button"
                                  onClick={(event) => deleteNotification(notification, event)}
                                  aria-label="알림 삭제"
                                  title="알림 삭제"
                                >
                                  <Trash2 size={15} />
                                </button>
                              ) : (
                                <span className="shrink-0 rounded-lg bg-[#fff4ee] px-2 py-1 text-[11px] font-extrabold text-[#d47a3d]">요청 진행 중</span>
                              )}
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="px-4 py-8 text-center text-sm font-bold text-slate-500">새 알림이 없습니다.</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <button className="btn-secondary hidden h-10 shrink-0 px-3 sm:flex sm:h-11" onClick={logout}>
                <LogOut size={17} />
                <span className="hidden sm:inline">로그아웃</span>
              </button>
            </div>
          </div>
        </header>

        <div className="px-3 py-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-5 lg:px-6 lg:pb-8">
          <Outlet />
        </div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-white/95 px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-1.5 shadow-lift backdrop-blur lg:hidden"
        style={{ gridTemplateColumns: `repeat(${bottomNavColumnCount}, minmax(0, 1fr))` }}
      >
        {mobilePrimaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-extrabold transition sm:text-[11px] ${
                  isActive ? "bg-[#f2f0ff] text-brand shadow-soft" : "text-slate-500 hover:bg-slate-50 hover:text-ink"
                }`
              }
            >
              <Icon className="shrink-0" size={17} />
              <span className="max-w-full truncate">{item.label.replace("장비 ", "")}</span>
            </NavLink>
          );
        })}
        {secondaryNavItems.length ? (
          <button
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-extrabold transition sm:text-[11px] ${
              moreActive || open ? "bg-[#f2f0ff] text-brand shadow-soft" : "text-slate-500 hover:bg-slate-50 hover:text-ink"
            }`}
            type="button"
            onClick={() => setOpen(true)}
          >
            <MoreHorizontal size={18} />
            <span>더보기</span>
          </button>
        ) : null}
      </nav>
      {toastNotification ? (
        <div
          className="fixed bottom-24 left-1/2 z-[80] w-[min(92vw,420px)] -translate-x-1/2 rounded-lg border border-[#d8d2ff] bg-white p-4 text-left shadow-lift transition hover:border-brand lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0"
          role="button"
          tabIndex={0}
          onClick={() => openNotification(toastNotification)}
          onKeyDown={(event) => {
            if (event.key === "Enter") openNotification(toastNotification);
          }}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f2f0ff] text-brand">
              <Bell size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-ink">{toastNotification.title || "새 알림"}</p>
              <p className="mt-1 text-xs font-extrabold text-brand">{toastNotification.device_id} · {deviceTitle(toastNotification)}</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-600">{toastNotification.message}</p>
            </div>
            <span className="mt-1 text-[11px] font-extrabold text-brand">{toastNotification.device_id ? "장비 상세로 이동" : "알림 확인"}</span>
            <button
              className="h-8 w-8 rounded-lg bg-slate-50 text-slate-500"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setToastNotification(null);
              }}
              aria-label="알림 닫기"
            >
              <X className="mx-auto" size={15} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
