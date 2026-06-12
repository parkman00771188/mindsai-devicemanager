import { AlertTriangle, Camera, Image as ImageIcon, Play, Search, ShieldCheck, Square, Upload, X } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

const readerId = "qr-reader";

function parseDeviceId(value) {
  const text = String(value || "").trim();
  const devicePathMatch = text.match(/\/(?:devices?|d)\/([^/?#]+)/i);
  if (devicePathMatch) return decodeURIComponent(devicePathMatch[1]);
  const queryMatch = text.match(/[?&](?:device_id|deviceId|id)=([^&#]+)/i);
  if (queryMatch) return decodeURIComponent(queryMatch[1]);
  const plainMatch = text.match(/[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3,4}/i);
  return plainMatch ? plainMatch[0].toUpperCase() : text;
}

function isLocalhost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function canRequestCameraPermission() {
  return Boolean(window.isSecureContext || isLocalhost());
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function browserName() {
  const ua = navigator.userAgent;
  if (/CriOS|Chrome/i.test(ua) && /Android/i.test(ua)) return "Android Chrome";
  if (/CriOS/i.test(ua)) return "iOS Chrome";
  if (/Safari/i.test(ua) && isIOS()) return "iOS Safari";
  if (/Safari/i.test(ua)) return "Safari";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Chrome/i.test(ua)) return "Chrome";
  return "현재 브라우저";
}

function permissionCopy(type) {
  if (type === "denied") {
    return {
      icon: AlertTriangle,
      title: "카메라 권한이 차단되어 있어요",
      body: "브라우저가 카메라 권한을 차단했습니다. 권한을 허용으로 바꾼 뒤 다시 시도하거나, 사진으로 QR 스캔을 사용하세요.",
      primary: "다시 시도",
      secondary: "사진으로 스캔"
    };
  }

  if (type === "insecure") {
    return {
      icon: AlertTriangle,
      title: "현재 주소에서는 실시간 카메라가 막힙니다",
      body: "모바일에서 PC의 http://IP:3000 주소로 접속하면 브라우저가 카메라 API를 숨깁니다. HTTPS 주소로 접속하면 실시간 스캔이 가능하고, 지금은 사진으로 QR 스캔을 사용할 수 있습니다.",
      primary: "그래도 시도",
      secondary: "사진으로 스캔"
    };
  }

  if (type === "unsupported") {
    return {
      icon: AlertTriangle,
      title: "실시간 카메라 API를 찾지 못했습니다",
      body: "이 브라우저 또는 현재 접속 방식에서는 getUserMedia를 사용할 수 없습니다. 사진으로 QR 스캔은 계속 사용할 수 있습니다.",
      primary: "다시 확인",
      secondary: "사진으로 스캔"
    };
  }

  return {
    icon: ShieldCheck,
    title: "카메라 권한이 필요해요",
    body: "실시간 QR 스캔을 시작합니다. 권한 창이 뜨면 카메라 사용을 허용해주세요.",
    primary: "허용하고 시작",
    secondary: "사진으로 스캔"
  };
}

function cameraConfig() {
  const width = Math.min(320, Math.max(220, Math.floor(window.innerWidth * 0.72)));
  return {
    fps: 15,
    qrbox: { width, height: width },
    aspectRatio: 1,
    disableFlip: false,
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }
  };
}

function readableScanError(error) {
  const raw = String(error?.message || error || "");
  if (/QR code parse error|No MultiFormat Readers|NotFoundException|No barcode/i.test(raw)) {
    return "선택한 사진에서 QR 코드를 찾지 못했습니다. QR이 선명하게 보이도록 다시 촬영하거나 앨범에서 다른 사진을 선택해주세요.";
  }
  if (/File type|image/i.test(raw)) {
    return "이미지 파일만 QR 스캔에 사용할 수 있습니다.";
  }
  return raw || "이미지에서 QR 코드를 찾지 못했습니다. QR 코드가 화면 안에 크게 보이는 사진으로 다시 시도해주세요.";
}

export default function Scan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scannerRef = useRef(null);
  const navigatingRef = useRef(false);
  const autoStartRef = useRef(false);
  const albumInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [scanningImage, setScanningImage] = useState(false);
  const [manualId, setManualId] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("warn");
  const [permissionDialog, setPermissionDialog] = useState(null);
  const [recent, setRecent] = useState(() => JSON.parse(localStorage.getItem("recentScans") || "[]"));
  const autoStart = searchParams.get("auto") === "1";
  const environment = useMemo(() => ({
    browser: browserName(),
    secure: canRequestCameraPermission(),
    hasCameraApi: Boolean(navigator.mediaDevices?.getUserMedia),
    href: window.location.href
  }), []);

  function remember(deviceId) {
    const next = [deviceId, ...recent.filter((item) => item !== deviceId)].slice(0, 6);
    setRecent(next);
    localStorage.setItem("recentScans", JSON.stringify(next));
  }

  function showMessage(text, tone = "warn") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function goToDeviceFast(rawValue) {
    const deviceId = parseDeviceId(rawValue);
    if (!deviceId || navigatingRef.current) return;
    navigatingRef.current = true;
    remember(deviceId);
    showMessage(`${deviceId} 장비 상세로 이동합니다.`, "success");
    await resetScanner();

    const targetPath = `/devices/${encodeURIComponent(deviceId)}`;
    navigate(targetPath);

    window.setTimeout(() => {
      const scanScreenStillMounted = Boolean(document.getElementById(readerId));
      if (window.location.pathname !== targetPath || scanScreenStillMounted) {
        window.location.assign(targetPath);
      }
    }, 350);
  }

  function ensureScanner() {
    if (!scannerRef.current) scannerRef.current = new Html5Qrcode(readerId, false);
    return scannerRef.current;
  }

  async function detectPermissionState() {
    if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
    if (!navigator.permissions?.query) return "prompt";
    try {
      const result = await navigator.permissions.query({ name: "camera" });
      return result.state;
    } catch {
      return "prompt";
    }
  }

  async function resetScanner() {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      await scanner.stop();
    } catch {
      // The browser may have already released the camera.
    }
    try {
      await scanner.clear();
    } catch {
      // The scanner may not have rendered yet.
    }
    scannerRef.current = null;
    setRunning(false);
  }

  async function requestStart() {
    setMessage("");
    if (!canRequestCameraPermission()) {
      setPermissionDialog("insecure");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionDialog("unsupported");
      return;
    }
    const state = await detectPermissionState();
    if (state === "unsupported") {
      setPermissionDialog("unsupported");
      return;
    }
    if (state === "granted") {
      await start();
      return;
    }
    setPermissionDialog(state === "denied" ? "denied" : "prompt");
  }

  async function tryStartWith(target) {
    const scanner = ensureScanner();
    await scanner.start(
      target,
      cameraConfig(),
      (decodedText) => {
        goToDeviceFast(decodedText).catch(() => {});
      },
      () => {}
    );
  }

  async function start() {
    setPermissionDialog(null);
    setMessage("");

    if (!canRequestCameraPermission()) {
      setPermissionDialog("insecure");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionDialog("unsupported");
      return;
    }

    await resetScanner();

    const candidates = [
      { facingMode: { exact: "environment" } },
      { facingMode: "environment" }
    ];

    try {
      const cameras = await Html5Qrcode.getCameras();
      const rear = cameras.find((camera) => /back|rear|environment|후면|뒤/i.test(camera.label || ""));
      if (rear?.id) candidates.push(rear.id);
      cameras.forEach((camera) => {
        if (camera.id && camera.id !== rear?.id) candidates.push(camera.id);
      });
    } catch {
      // Some browsers only expose camera labels after permission; facingMode candidates still work.
    }

    let lastError = null;
    for (const target of candidates) {
      try {
        await tryStartWith(target);
        setRunning(true);
        return;
      } catch (err) {
        lastError = err;
        await resetScanner();
      }
    }

    const name = lastError?.name || "";
    const text = String(lastError?.message || lastError || "");
    if (name === "NotAllowedError" || text.includes("Permission") || text.includes("NotAllowed")) {
      setPermissionDialog("denied");
      return;
    }
    if (text.includes("Only secure origins") || text.includes("secure")) {
      setPermissionDialog("insecure");
      return;
    }
    setMessage(text || "카메라를 시작할 수 없습니다. 사진으로 QR 스캔을 사용해보세요.");
  }

  async function stop() {
    await resetScanner();
  }

  async function scanImageFile(file) {
    if (!file) return;
    setPermissionDialog(null);
    showMessage(`'${file.name || "선택한 사진"}'에서 QR 코드를 찾는 중입니다.`, "info");
    setScanningImage(true);
    await resetScanner();
    try {
      const scanner = ensureScanner();
      const decodedText = await scanner.scanFile(file, true);
      showMessage("QR 코드를 읽었습니다. 장비를 검색합니다.", "success");
      await goToDeviceFast(decodedText);
    } catch (err) {
      showMessage(readableScanError(err), "error");
    } finally {
      setScanningImage(false);
      if (albumInputRef.current) albumInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  function openAlbumPicker() {
    setPermissionDialog(null);
    albumInputRef.current?.click();
  }

  function openCameraPicker() {
    setPermissionDialog(null);
    cameraInputRef.current?.click();
  }

  function focusManualInput() {
    setPermissionDialog(null);
    document.getElementById("manual-device-id")?.focus();
  }

  useEffect(() => {
    if (!autoStart || autoStartRef.current) return;
    autoStartRef.current = true;
    const timer = window.setTimeout(() => {
      start().catch((error) => {
        showMessage(String(error?.message || error || "카메라를 시작할 수 없습니다."), "error");
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [autoStart]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) scannerRef.current.stop().catch(() => {});
    };
  }, []);

  const dialog = permissionDialog ? permissionCopy(permissionDialog) : null;
  const DialogIcon = dialog?.icon || Camera;
  const messageClass = {
    info: "bg-sky-50 text-sky-800",
    success: "bg-emerald-50 text-emerald-800",
    warn: "bg-amber-50 text-amber-800",
    error: "bg-rose-50 text-rose-800"
  }[messageTone] || "bg-amber-50 text-amber-800";

  return (
    <div className="app-page">
      <section className="hero-strip">
        <p className="page-kicker">QR 스캔</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">현장에서 바로 장비 상세로 이동</h1>
        <p className="mt-2 text-sm font-semibold text-slate-500">실시간 카메라 스캔과 사진 QR 스캔을 모두 지원합니다.</p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="panel p-4">
          <div id={readerId} className="min-h-[260px] overflow-hidden rounded-lg border border-line bg-slate-950 shadow-soft sm:min-h-[320px]" />
          <input
            ref={albumInputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => scanImageFile(event.target.files?.[0])}
          />
          <input
            ref={cameraInputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => scanImageFile(event.target.files?.[0])}
          />
          {message ? <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${messageClass}`}>{message}</div> : null}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button className="btn-primary" type="button" onClick={requestStart} disabled={running}>
              <Play size={18} />
              실시간 스캔
            </button>
            <button className="btn-secondary" type="button" onClick={openAlbumPicker} disabled={scanningImage}>
              <Upload size={18} />
              앨범에서 선택
            </button>
            <button className="btn-secondary" type="button" onClick={openCameraPicker} disabled={scanningImage}>
              <Camera size={18} />
              사진 촬영
            </button>
            <button className="btn-secondary" type="button" onClick={stop} disabled={!running}>
              <Square size={18} />
              중지
            </button>
          </div>
        </section>

        <aside className="grid gap-4 md:grid-cols-3 xl:block xl:space-y-4">
          <section className="panel p-4">
            <h2 className="section-title">작동 상태</h2>
            <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <span>브라우저</span>
                <span className="font-extrabold text-ink">{environment.browser}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>보안 주소</span>
                <span className={environment.secure ? "font-extrabold text-[#1eb6a5]" : "font-extrabold text-[#d84f71]"}>
                  {environment.secure ? "가능" : "실시간 제한"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>카메라 API</span>
                <span className={environment.hasCameraApi ? "font-extrabold text-[#1eb6a5]" : "font-extrabold text-[#d84f71]"}>
                  {environment.hasCameraApi ? "감지됨" : "없음"}
                </span>
              </div>
            </div>
            {!environment.secure ? (
              <div className="mt-3 rounded-lg bg-[#fff4ee] px-3 py-2 text-xs font-bold leading-5 text-[#b7622a]">
                모바일 실시간 스캔은 HTTPS 또는 기기 자체 localhost에서만 안정적으로 동작합니다. 현재 주소에서는 사진으로 스캔을 사용하세요.
              </div>
            ) : null}
          </section>

          <form className="panel p-4" onSubmit={(event) => { event.preventDefault(); goToDeviceFast(manualId).catch(() => {}); }}>
            <h2 className="section-title">직접 입력</h2>
            <div className="mt-3 flex gap-2">
              <input
                id="manual-device-id"
                className="input"
                value={manualId}
                onChange={(event) => setManualId(event.target.value)}
                placeholder="MD-VR-MQ3-001"
              />
              <button className="btn-primary h-12 w-12 p-0" aria-label="이동">
                <Search size={18} />
              </button>
            </div>
          </form>

          <div className="panel p-4">
            <h2 className="section-title">최근 스캔</h2>
            <div className="mt-3 grid gap-2">
              {recent.length ? recent.map((deviceId) => (
                <Link key={deviceId} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-brand" to={`/devices/${deviceId}`}>
                  {deviceId}
                </Link>
              )) : <p className="text-sm text-slate-500">최근 스캔한 장비가 없습니다.</p>}
            </div>
          </div>
        </aside>
      </div>

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lift sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#e8f6ff] text-brand">
                  <DialogIcon size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-ink">{dialog.title}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{dialog.body}</p>
                </div>
              </div>
              <button className="h-10 w-10 rounded-lg bg-slate-50 text-slate-500" onClick={() => setPermissionDialog(null)} aria-label="닫기">
                <X className="mx-auto" size={18} />
              </button>
            </div>

            {["denied", "insecure", "unsupported"].includes(permissionDialog) ? (
              <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-600">
                iPhone Safari: 설정 앱 → Safari → 카메라 → 허용<br />
                iOS 사이트 설정: 주소창 왼쪽 AA/페이지 설정 → 웹 사이트 설정 → 카메라 허용<br />
                Android Chrome: 주소창 왼쪽 아이콘 → 권한 → 카메라 허용
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button className="btn-secondary" type="button" onClick={openAlbumPicker}>
                <ImageIcon size={18} />
                {dialog.secondary}
              </button>
              <button className="btn-primary" type="button" onClick={start}>
                {dialog.primary}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
