const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const uploadsRoot = path.join(__dirname, "..", "uploads");
const qrcodeDir = path.join(uploadsRoot, "qrcodes");
const labelWidth = 800;
const labelHeight = 150;
const labelQrSize = 140;
const labelQrInset = 5;
const labelTextX = 190;
const labelRightPadding = 24;

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

function qrPayload(deviceId) {
  return String(deviceId || "").trim();
}

function labelFontSize(deviceId) {
  const idLength = Math.max(String(deviceId || "").length, 1);
  const availableWidth = labelWidth - labelTextX - labelRightPadding;
  return Math.max(30, Math.min(54, Math.floor(availableWidth / Math.max(idLength * 0.68, 1))));
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

function qrFilePaths(deviceId) {
  const segment = safeSegment(deviceId);
  return [
    path.join(qrcodeDir, `${segment}.png`),
    path.join(qrcodeDir, `${segment}-label.svg`),
    path.join(qrcodeDir, `${segment}-qr.svg`),
    path.join(qrcodeDir, `${segment}-qr-label.svg`)
  ];
}

function deleteQrForDevice(deviceId) {
  qrFilePaths(deviceId).forEach((filePath) => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // QR cleanup should not block device updates.
    }
  });
}

function qrSegmentFromFile(name) {
  if (name.endsWith("-qr-label.svg")) return name.slice(0, -"-qr-label.svg".length);
  if (name.endsWith("-label.svg")) return name.slice(0, -"-label.svg".length);
  if (name.endsWith("-qr.svg")) return name.slice(0, -"-qr.svg".length);
  if (name.endsWith(".png")) return name.slice(0, -".png".length);
  return "";
}

function pruneQrCodes(deviceIds = []) {
  if (!fs.existsSync(qrcodeDir)) return;
  const validSegments = new Set(deviceIds.map(safeSegment).filter(Boolean));
  fs.readdirSync(qrcodeDir, { withFileTypes: true }).forEach((entry) => {
    if (!entry.isFile()) return;
    const segment = qrSegmentFromFile(entry.name);
    if (!segment || validSegments.has(segment)) return;
    try {
      fs.unlinkSync(path.join(qrcodeDir, entry.name));
    } catch {
      // Stale QR files can be cleaned up on a later pass.
    }
  });
}

async function generateQrForDevice(deviceId, origin = "http://localhost:3000") {
  fs.mkdirSync(qrcodeDir, { recursive: true });
  await QRCode.toFile(
    absoluteQrPath(deviceId),
    qrPayload(deviceId),
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
  const qrSvg = await QRCode.toString(qrPayload(deviceId), {
    type: "svg",
    width: labelQrSize,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" }
  });
  const encodedQr = Buffer.from(qrSvg).toString("base64");
  const idText = escapeXml(deviceId);
  const idFontSize = labelFontSize(deviceId);
  const label = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="8cm" height="1.5cm" viewBox="0 0 ${labelWidth} ${labelHeight}" role="img" aria-label="${idText} QR code label">
  <rect width="${labelWidth}" height="${labelHeight}" fill="#000000"/>
  <image href="data:image/svg+xml;base64,${encodedQr}" x="${labelQrInset}" y="${labelQrInset}" width="${labelQrSize}" height="${labelQrSize}"/>
  <text x="${labelTextX}" y="78" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${idFontSize}" font-weight="700" dominant-baseline="middle" letter-spacing="0">${idText}</text>
</svg>
`;
  fs.writeFileSync(absoluteQrLabelPath(deviceId), label, "utf8");
  return publicQrLabelPath(deviceId);
}

module.exports = {
  absoluteQrLabelPath,
  absoluteQrPath,
  deleteQrForDevice,
  generateQrForDevice,
  generateQrLabelForDevice,
  pruneQrCodes,
  publicQrLabelPath,
  publicQrPath,
  qrPayload,
  safeSegment
};
