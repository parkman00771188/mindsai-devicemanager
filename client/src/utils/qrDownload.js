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

async function downloadLabelQrSvg(deviceId) {
  triggerDownload(qrImageUrl(deviceId, "label", true), `${safeFileSegment(deviceId)}-qr-label.svg`);
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
    await downloadLabelQrSvg(deviceId);
    return;
  }
  await downloadPlainQrPng(deviceId);
}
