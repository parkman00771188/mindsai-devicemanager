import { downloadUrl } from "../api/client.js";

const LABEL_QR_VERSION = "horizontal-centered-20260702";

export function qrImageUrl(deviceId, style = "plain", download = false) {
  const search = new URLSearchParams();
  if (style === "label") {
    search.set("style", "label");
    search.set("v", LABEL_QR_VERSION);
  }
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
  const image = await loadImage(qrImageUrl(deviceId, "label"));
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 150;
  const context = canvas.getContext("2d");
  context.fillStyle = "#000000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to create QR label PNG.");
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
  if (!blob) throw new Error("Failed to create QR PNG.");
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
