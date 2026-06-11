const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const uploadsRoot = path.join(__dirname, "..", "uploads");
const qrcodeDir = path.join(uploadsRoot, "qrcodes");

function safeSegment(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function qrTarget(deviceId, origin = "http://localhost:3000") {
  return `${origin.replace(/\/$/, "")}/d/${encodeURIComponent(deviceId)}`;
}

function publicQrPath(deviceId) {
  return `/uploads/qrcodes/${safeSegment(deviceId)}.png`;
}

function absoluteQrPath(deviceId) {
  return path.join(qrcodeDir, `${safeSegment(deviceId)}.png`);
}

function publicQrLabelPath(deviceId) {
  return `/uploads/qrcodes/${safeSegment(deviceId)}-label.svg`;
}

function absoluteQrLabelPath(deviceId) {
  return path.join(qrcodeDir, `${safeSegment(deviceId)}-label.svg`);
}

async function generateQrForDevice(deviceId, origin = "http://localhost:3000") {
  fs.mkdirSync(qrcodeDir, { recursive: true });
  await QRCode.toFile(
    absoluteQrPath(deviceId),
    qrTarget(deviceId, origin),
    {
      width: 720,
      margin: 2,
      color: { dark: "#172033", light: "#ffffff" }
    }
  );
  return publicQrPath(deviceId);
}

async function generateQrLabelForDevice(deviceId, origin = "http://localhost:3000") {
  fs.mkdirSync(qrcodeDir, { recursive: true });
  const qrSvg = await QRCode.toString(qrTarget(deviceId, origin), {
    type: "svg",
    width: 660,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" }
  });
  const encodedQr = Buffer.from(qrSvg).toString("base64");
  const idText = escapeXml(deviceId);
  const idFontSize = Math.max(34, Math.min(58, Math.floor(720 / Math.max(String(deviceId).length * 0.62, 10))));
  const label = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900" viewBox="0 0 720 900" role="img" aria-label="${idText} QR code">
  <rect width="720" height="900" fill="#000000"/>
  <rect x="24" y="24" width="672" height="672" fill="#ffffff"/>
  <image href="data:image/svg+xml;base64,${encodedQr}" x="30" y="30" width="660" height="660"/>
  <text x="360" y="770" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="400">Device No.</text>
  <text x="360" y="842" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${idFontSize}" font-weight="800">${idText}</text>
</svg>
`;
  fs.writeFileSync(absoluteQrLabelPath(deviceId), label, "utf8");
  return publicQrLabelPath(deviceId);
}

module.exports = {
  absoluteQrLabelPath,
  absoluteQrPath,
  generateQrForDevice,
  generateQrLabelForDevice,
  publicQrLabelPath,
  publicQrPath,
  safeSegment
};
