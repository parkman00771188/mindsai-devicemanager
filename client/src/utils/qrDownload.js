import { downloadUrl } from "../api/client.js";

export function qrImageUrl(deviceId, style = "plain", download = false) {
  const search = new URLSearchParams();
  if (style === "label") search.set("style", "label");
  if (download) search.set("download", "1");
  const query = search.toString();
  return downloadUrl(`/devices/${encodeURIComponent(deviceId)}/qrcode${query ? `?${query}` : ""}`);
}

function safeFileSegment(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}

function triggerDownload(href, filename) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.crossOrigin = "anonymous";
    image.src = src;
  });
}

async function downloadLabelQrPng(deviceId) {
  const image = await loadImage(qrImageUrl(deviceId, "plain"));
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  const idText = String(deviceId || "");
  const idFontSize = Math.max(34, Math.min(58, Math.floor(720 / Math.max(idText.length * 0.62, 10))));

  context.fillStyle = "#000000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(24, 24, 672, 672);
  context.drawImage(image, 30, 30, 660, 660);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.font = "400 36px Arial, Helvetica, sans-serif";
  context.fillText("Device No.", 360, 766);
  context.font = `800 ${idFontSize}px Arial, Helvetica, sans-serif`;
  context.fillText(idText, 360, 838);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("QR PNG를 생성하지 못했습니다.");
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${safeFileSegment(deviceId)}-qr-label.png`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadPlainQrPng(deviceId) {
  const image = await loadImage(qrImageUrl(deviceId, "plain"));
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("QR PNG瑜??앹꽦?섏? 紐삵뻽?듬땲??");
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${safeFileSegment(deviceId)}-qr.png`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadQrImage(deviceId, style = "plain") {
  if (style === "label") {
    await downloadLabelQrPng(deviceId);
    return;
  }
  await downloadPlainQrPng(deviceId);
}
