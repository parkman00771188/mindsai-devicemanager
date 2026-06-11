export const STATUS_LABELS = {
  AVAILABLE: "대여 가능",
  RENTED: "대여 중",
  DELIVERED: "납품",
  MAINTENANCE: "점검 중",
  BROKEN: "고장",
  LOST: "분실",
  DISPOSED: "폐기"
};

export const STATUS_OPTIONS = [
  ["AVAILABLE", "대여 가능"],
  ["RENTED", "대여 중"],
  ["DELIVERED", "납품"],
  ["MAINTENANCE", "점검 중"],
  ["BROKEN", "고장"],
  ["LOST", "분실"],
  ["DISPOSED", "폐기"]
];

export const ACTION_LABELS = {
  RENT: "대여",
  DELIVERY: "납품",
  RETURN: "반납",
  RECOVERY: "회수",
  BROKEN: "고장",
  LOST: "분실",
  LOST_FOUND: "찾음 처리",
  MAINTENANCE_START: "점검 시작",
  MAINTENANCE_COMPLETE: "점검 완료",
  STATUS_CHANGE: "상태 변경",
  MAINTENANCE: "점검",
  REGISTER: "등록",
  UPDATE: "수정",
  RENTAL_UPDATE: "대여/납품정보 수정",
  DISPOSE: "폐기",
  DELETE: "삭제"
};

export const DEVICE_FIELDS = [
  ["category", "분류", "text", true],
  ["legacy_device_id", "기존 장비번호", "text"],
  ["manufacturer", "제조사", "text"],
  ["model_name", "모델명", "text"],
  ["serial_number", "시리얼번호", "text"],
  ["purchase_date", "구매일", "date"],
  ["purchase_price", "구매금액", "number"],
  ["department", "관리부서", "text"],
  ["manager", "담당자", "text"],
  ["location", "보관위치", "text", true],
  ["components", "구성품", "text"],
  ["memo", "비고", "textarea"]
];

export function isLaptopDevice(deviceOrCategory = {}) {
  const category =
    typeof deviceOrCategory === "string"
      ? deviceOrCategory
      : deviceOrCategory.device_category || deviceOrCategory.category;
  const normalized = String(category || "").trim().replace(/\s+/g, "").toLowerCase();
  return normalized.includes("노트북") || normalized.includes("laptop") || normalized.includes("notebook");
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || "-";
}

export function actionLabel(action) {
  return ACTION_LABELS[action] || action || "-";
}

function formatCategoryName(value) {
  return String(value || "").trim().replace(/^VR\s+기기$/i, "VR기기");
}

function formatModelName(value) {
  const model = String(value || "").trim();
  if (!model) return "";
  const capacityMatch = model.match(/^(.*?)[\s/]+(\d+\s*(?:GB|TB))$/i);
  if (capacityMatch) return capacityMatch[1].replace(/Quest\s+(\d+)/i, "Quest$1").trim();
  return model.replace(/Quest\s+(\d+)/i, "Quest$1");
}

export function deviceTitle(device = {}) {
  const category = formatCategoryName(device.device_category || device.category);
  const model = formatModelName(device.device_model_name || device.model_name);
  if (category && model) return `${category}(${model})`;
  if (category || model) return category || model;
  const fallback = device.device_name || device.device_id || "-";
  const withoutId = device.device_id ? String(fallback).replace(new RegExp(`\\s+${String(device.device_id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "") : fallback;
  return withoutId.replace(/[\s/(]+\d+(?:\.\d+)?\s*(?:GB|TB)\)?$/i, "").trim() || withoutId;
}

export function deviceCapacity(device = {}) {
  const direct = String(device.device_capacity_gb || device.capacity_gb || "").replace(/[^\d.]/g, "");
  if (direct) return `${direct}GB`;
  const source = String(device.device_model_name || device.model_name || device.device_name || "");
  const match = source.match(/(\d+(?:\.\d+)?)\s*(GB|TB)/i);
  if (!match) return "-";
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return "-";
  const gb = match[2].toUpperCase() === "TB" ? number * 1024 : number;
  return `${Number.isInteger(gb) ? gb : String(gb)}GB`;
}

export function transactionPlace(row = {}) {
  const memo = String(row.memo || "");
  const match = memo.match(/(?:대여|반납|납품|회수) 장소:\s*([^/]+)/);
  return match ? match[1].trim() : "";
}

export function transactionMemo(row = {}) {
  return String(row.memo || "")
    .replace(/(?:대여|반납|납품|회수) 장소:\s*[^/]+\/?\s*/g, "")
    .replace(/\s*\/?\s*(?:대여|납품) 정보 수정(?::.*)?$/g, "")
    .trim();
}

export function transactionNumber(row = {}) {
  const value = String(row.transaction_no || "").replace(/\D/g, "");
  return value ? value.padStart(4, "0") : "-";
}

export function formatPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function formatDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function two(value) {
  return String(value).padStart(2, "0");
}

function formatLocalDateTime(date) {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

export function formatDateTime(value) {
  if (!value) return "-";
  const text = String(value);
  if (text.includes("T")) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return formatLocalDateTime(date);
    return text.replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, "").slice(0, 16);
  }
  return text;
}

export function splitPhotoPaths(value) {
  return String(value || "")
    .split(";")
    .map((path) => path.trim())
    .filter(Boolean);
}
