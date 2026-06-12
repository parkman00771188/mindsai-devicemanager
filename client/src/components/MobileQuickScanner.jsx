import { Camera, QrCode, Square, X } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useEffect, useRef, useState } from "react";

const readerId = "mobile-quick-qr-reader";

function parseScannedDeviceId(value) {
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

function cameraConfig() {
  const width = Math.min(320, Math.max(220, Math.floor(window.innerWidth * 0.74)));
  return {
    fps: 15,
    qrbox: { width, height: width },
    aspectRatio: 1,
    disableFlip: false,
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }
  };
}

function readableCameraError(error) {
  const name = error?.name || "";
  const text = String(error?.message || error || "");
  if (name === "NotAllowedError" || text.includes("Permission") || text.includes("NotAllowed")) {
    return "카메라 권한이 차단되었습니다. 브라우저 주소창의 권한 설정에서 카메라를 허용한 뒤 다시 눌러주세요.";
  }
  if (text.includes("Only secure origins") || text.includes("secure")) {
    return "실시간 스캔은 HTTPS 주소에서만 사용할 수 있습니다.";
  }
  return text || "카메라를 시작할 수 없습니다. 잠시 후 다시 시도해주세요.";
}

export default function MobileQuickScanner({ open, onClose, onScan }) {
  const scannerRef = useRef(null);
  const sessionRef = useRef(0);
  const navigatingRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  function ensureScanner() {
    if (!scannerRef.current) scannerRef.current = new Html5Qrcode(readerId, false);
    return scannerRef.current;
  }

  async function resetScanner() {
    const scanner = scannerRef.current;
    if (!scanner) {
      setRunning(false);
      return;
    }
    try {
      await scanner.stop();
    } catch {
      // The camera may already be released.
    }
    try {
      await scanner.clear();
    } catch {
      // The reader may already be cleared.
    }
    scannerRef.current = null;
    setRunning(false);
  }

  async function handleScanned(rawValue) {
    const deviceId = parseScannedDeviceId(rawValue);
    if (!deviceId || navigatingRef.current) return;
    navigatingRef.current = true;
    setMessage(`${deviceId} 장비 상세로 이동합니다.`);
    await resetScanner();
    onScan(deviceId);
  }

  async function tryStartWith(target) {
    const scanner = ensureScanner();
    await scanner.start(
      target,
      cameraConfig(),
      (decodedText) => {
        handleScanned(decodedText).catch((error) => setMessage(readableCameraError(error)));
      },
      () => {}
    );
  }

  async function startScanner(sessionId = sessionRef.current) {
    setMessage("카메라 권한을 확인하는 중입니다.");
    navigatingRef.current = false;

    if (sessionId !== sessionRef.current) return;
    if (!canRequestCameraPermission()) {
      setMessage("실시간 스캔은 HTTPS 주소에서만 사용할 수 있습니다.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("이 브라우저에서는 실시간 카메라 스캔을 사용할 수 없습니다.");
      return;
    }

    await resetScanner();
    if (sessionId !== sessionRef.current) return;

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
      // Facing mode candidates can still start the default rear camera.
    }
    if (sessionId !== sessionRef.current) return;

    let lastError = null;
    for (const target of candidates) {
      if (sessionId !== sessionRef.current) return;
      try {
        await tryStartWith(target);
        if (sessionId !== sessionRef.current) {
          await resetScanner();
          return;
        }
        setRunning(true);
        setMessage("QR 코드를 화면 안에 맞춰주세요.");
        return;
      } catch (error) {
        lastError = error;
        await resetScanner();
      }
    }

    setMessage(readableCameraError(lastError));
  }

  async function close() {
    sessionRef.current += 1;
    navigatingRef.current = false;
    await resetScanner();
    setMessage("");
    onClose();
  }

  useEffect(() => {
    if (!open) return undefined;
    sessionRef.current += 1;
    const sessionId = sessionRef.current;
    setMessage("카메라를 여는 중입니다.");
    const timer = window.setTimeout(() => {
      startScanner(sessionId).catch((error) => setMessage(readableCameraError(error)));
    }, 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) scannerRef.current.stop().catch(() => {});
    };
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#121629] text-white lg:hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#151a31] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-lift">
            <QrCode size={20} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-white/70">Device Manager</p>
            <h2 className="truncate text-xl font-extrabold">QR 스캔</h2>
          </div>
        </div>
        <button
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/8 text-white"
          type="button"
          onClick={close}
          aria-label="스캔 닫기"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="overflow-hidden rounded-lg border border-white/10 bg-black shadow-lift">
          <div id={readerId} className="min-h-[min(78vw,420px)]" />
        </div>
        <div className="rounded-lg border border-white/10 bg-white/8 px-4 py-3 text-sm font-bold leading-6 text-white/82">
          {message || "QR 코드를 화면 안에 맞춰주세요."}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/10 px-3 py-2 text-sm font-extrabold text-white disabled:opacity-45"
            type="button"
            onClick={() => startScanner(sessionRef.current)}
            disabled={running}
          >
            <Camera size={18} />
            다시 시작
          </button>
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/10 px-3 py-2 text-sm font-extrabold text-white disabled:opacity-45"
            type="button"
            onClick={() => resetScanner()}
            disabled={!running}
          >
            <Square size={18} />
            중지
          </button>
        </div>
      </div>
    </div>
  );
}
