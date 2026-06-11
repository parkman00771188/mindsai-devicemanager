const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const XLSX = require("xlsx");
const { publicQrPath } = require("./qrGenerator");

const dataDir = path.join(__dirname, "..", "data");
const uploadsDir = path.join(__dirname, "..", "uploads");
const excelPath = path.join(dataDir, "devices.xlsx");
const DEFAULT_ORGANIZATIONS = ["마인즈에이아이", "메디마인드"];

const SHEETS = {
  Devices: [
    "device_id",
    "legacy_device_id",
    "device_name",
    "category",
    "manufacturer",
    "model_name",
    "capacity_gb",
    "ram_capacity",
    "storage_capacity",
    "cpu",
    "gpu",
    "windows_spec",
    "serial_number",
    "purchase_date",
    "purchase_price",
    "department",
    "manager",
    "location",
    "status",
    "current_borrower",
    "current_borrower_type",
    "current_institution_id",
    "current_institution_name",
    "current_user_organization",
    "current_user_position",
    "current_user_contact",
    "current_purpose",
    "current_rent_location",
    "current_condition_status",
    "current_process_memo",
    "current_source_action_type",
    "borrower_department",
    "borrowed_at",
    "expected_return_at",
    "last_returned_at",
    "last_checked_at",
    "components",
    "main_photo_path",
    "photo_paths",
    "qr_code_path",
    "memo",
    "created_at",
    "updated_at",
    "is_deleted"
  ],
  Transactions: [
    "transaction_id",
    "transaction_no",
    "device_id",
    "action_type",
    "borrower_type",
    "institution_id",
    "institution_name",
    "user_name",
    "user_organization",
    "user_department",
    "user_position",
    "user_contact",
    "purpose",
    "rented_at",
    "expected_return_at",
    "returned_at",
    "before_status",
    "after_status",
    "condition_status",
    "issue_description",
    "photo_paths",
    "handled_by",
    "memo",
    "created_at"
  ],
  Maintenance: [
    "maintenance_id",
    "device_id",
    "maintenance_type",
    "checked_by",
    "checked_at",
    "result",
    "issue_level",
    "action_taken",
    "next_check_at",
    "photo_paths",
    "status_after",
    "memo",
    "created_at"
  ],
  Users: [
    "user_id",
    "password",
    "name",
    "role",
    "organization",
    "department",
    "position",
    "contact",
    "email",
    "profile_photo_path",
    "memo",
    "created_at",
    "updated_at",
    "is_deleted"
  ],
  Institutions: [
    "institution_id",
    "institution_name",
    "contact_person",
    "contact",
    "email",
    "address",
    "memo",
    "created_at",
    "updated_at",
    "is_deleted"
  ],
  UserOptions: [
    "option_id",
    "option_type",
    "option_text",
    "memo",
    "created_at",
    "updated_at",
    "is_deleted"
  ],
  Notifications: [
    "notification_id",
    "recipient_user_id",
    "sender_user_id",
    "type",
    "device_id",
    "title",
    "message",
    "is_read",
    "created_at",
    "read_at",
    "is_deleted"
  ],
  AuditLogs: [
    "log_id",
    "user_id",
    "action",
    "target_type",
    "target_id",
    "before_value",
    "after_value",
    "ip_address",
    "created_at"
  ],
  Categories: [
    "category_id",
    "category_name",
    "prefix",
    "memo",
    "created_at",
    "updated_at",
    "is_deleted"
  ],
  DeviceTypes: [
    "type_id",
    "category_id",
    "category_name",
    "type_name",
    "type_prefix",
    "memo",
    "created_at",
    "updated_at",
    "is_deleted"
  ],
  Reasons: [
    "reason_id",
    "reason_type",
    "reason_text",
    "memo",
    "created_at",
    "updated_at",
    "is_deleted"
  ]
};

let writeLock = Promise.resolve();

function two(value) {
  return String(value).padStart(2, "0");
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function now() {
  const date = new Date();
  return `${localDate(date)}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

function today() {
  return localDate();
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function ymd() {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function fileStamp() {
  return now().replace(/[-:T.]/g, "").slice(0, 14);
}

function ensureDirs() {
  [
    dataDir,
    uploadsDir,
    path.join(uploadsDir, "devices"),
    path.join(uploadsDir, "transactions"),
    path.join(uploadsDir, "maintenance"),
    path.join(uploadsDir, "qrcodes"),
    path.join(uploadsDir, "backups")
  ].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
}

function bool(value) {
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes"].includes(String(value || "").toLowerCase());
}

function text(value) {
  return String(value ?? "").trim();
}

const PASSWORD_HASH_PREFIX = "scrypt$";

function isPasswordHash(value) {
  return text(value).startsWith(PASSWORD_HASH_PREFIX);
}

function hashPassword(password) {
  const plain = text(password);
  if (!plain) return "";
  if (isPasswordHash(plain)) return plain;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `${PASSWORD_HASH_PREFIX}1$${salt}$${hash}`;
}

function verifyPassword(password, storedPassword) {
  const plain = text(password);
  const stored = text(storedPassword);
  if (!plain || !stored) return false;
  if (!isPasswordHash(stored)) return stored === plain;

  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt" || parts[1] !== "1") return false;
  try {
    const expected = Buffer.from(parts[3], "hex");
    if (!expected.length) return false;
    const actual = crypto.scryptSync(plain, parts[2], expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function normalizeUserRole(role) {
  return text(role).toUpperCase() === "ADMIN" ? "ADMIN" : "USER";
}

function userRoleLabel(role) {
  return normalizeUserRole(role) === "ADMIN" ? "관리자" : "사용자";
}

function defaultOrganizationForUser(user, index = 0) {
  const current = text(user?.organization);
  if (current) return current;
  const source = `${user?.user_id || ""} ${user?.email || ""} ${user?.memo || ""}`.toLowerCase();
  if (source.includes("medi") || source.includes("메디")) return "메디마인드";
  if (source.includes("mind") || source.includes("마인즈")) return "마인즈에이아이";
  return DEFAULT_ORGANIZATIONS[index % DEFAULT_ORGANIZATIONS.length];
}

function splitCapacityFromModel(value) {
  const source = text(value);
  const match = source.match(/^(.*?)(?:[\s/,(]+)(\d+(?:\.\d+)?)\s*(GB|TB)\)?$/i);
  if (!match) return { modelName: source, capacityGb: "" };
  const number = Number(match[2]);
  const capacityGb = match[3].toUpperCase() === "TB" ? number * 1024 : number;
  return {
    modelName: match[1].replace(/[(/,\s-]+$/g, "").trim(),
    capacityGb: Number.isInteger(capacityGb) ? String(capacityGb) : String(capacityGb)
  };
}

function normalizeCapacity(value) {
  const source = String(value ?? "").trim();
  const number = Number(source.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return "";
  const multiplier = /TB/i.test(source) ? 1024 : 1;
  const capacityGb = number * multiplier;
  return Number.isInteger(capacityGb) ? String(capacityGb) : String(capacityGb);
}

function isLaptopCategory(value) {
  const normalized = text(value).replace(/\s+/g, "").toLowerCase();
  return normalized.includes("노트북") || normalized.includes("laptop") || normalized.includes("notebook");
}

function normalizeDateInput(value) {
  const source = text(value);
  const match = source.match(/^(\d{4,})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return source;
  return `${match[1].slice(0, 4)}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function splitPaths(value) {
  return text(value)
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function rowFor(sheet, source = {}) {
  return Object.fromEntries(SHEETS[sheet].map((column) => [column, source[column] ?? ""]));
}

function applyCurrentCheckoutSnapshot(device, values = {}) {
  device.current_borrower = values.borrowerName || "";
  device.current_borrower_type = values.borrowerType || "";
  device.current_institution_id = values.institutionId || "";
  device.current_institution_name = values.institutionName || "";
  device.current_user_organization = values.userOrganization || "";
  device.borrower_department = values.userDepartment || "";
  device.current_user_position = values.userPosition || "";
  device.current_user_contact = values.userContact || "";
  device.current_purpose = values.purpose || "";
  device.current_rent_location = values.rentLocation || "";
  device.current_condition_status = values.conditionStatus || "";
  device.current_process_memo = values.memo || "";
  device.current_source_action_type = values.sourceActionType || "";
  device.borrowed_at = values.rentedAt || "";
  device.expected_return_at = values.expectedReturnAt || "";
}

function clearCurrentCheckoutSnapshot(device) {
  applyCurrentCheckoutSnapshot(device, {});
}

function defaultCategories(created = now()) {
  return [
    ["CAT-0001", "노트북", "LAP", "노트북/랩탑 장비"],
    ["CAT-0002", "VR 기기", "VR", "VR 헤드셋 및 컨트롤러"],
    ["CAT-0003", "태블릿", "TAB", "태블릿 장비"],
    ["CAT-0004", "키오스크 부품", "KIT", "키오스크 교체 부품"],
    ["CAT-0005", "검사 장비", "INS", "검사/측정 장비"],
    ["CAT-0006", "기타", "EQ", "기타 장비"],
    ["CAT-0007", "PC", "PC", "데스크톱 PC"],
    ["CAT-0008", "그래픽카드", "GPU", "GeForce 그래픽카드"],
    ["CAT-0009", "모니터", "MON", "업무용 모니터"],
    ["CAT-0010", "SSD", "SSD", "내장/교체 SSD"],
    ["CAT-0011", "외장하드", "EXT", "외장 저장장치"]
  ].map(([category_id, category_name, prefix, memo]) =>
    rowFor("Categories", {
      category_id,
      category_name,
      prefix,
      memo,
      created_at: created,
      updated_at: created,
      is_deleted: false
    })
  );
}

function defaultDeviceTypes(created = now()) {
  return [
    ["TYP-0001", "CAT-0001", "노트북", "업무용 노트북", "WORK", "일반 사무/업무용"],
    ["TYP-0002", "CAT-0001", "노트북", "개발용 노트북", "DEV", "개발 및 테스트용"],
    ["TYP-0003", "CAT-0002", "VR 기기", "Quest 2", "MQ2", "Meta Quest 2"],
    ["TYP-0004", "CAT-0002", "VR 기기", "Quest 3", "MQ3", "Meta Quest 3"],
    ["TYP-0005", "CAT-0003", "태블릿", "Galaxy Tab", "GTAB", "태블릿 장비"],
    ["TYP-0006", "CAT-0006", "기타", "기타 장비", "", ""],
    ["TYP-0007", "CAT-0007", "PC", "업무용 PC", "WORK", "일반 업무용 데스크톱"],
    ["TYP-0008", "CAT-0007", "PC", "개발용 PC", "DEV", "개발/렌더링용 데스크톱"],
    ["TYP-0009", "CAT-0008", "그래픽카드", "GeForce RTX 3070", "3070", "RTX 3070"],
    ["TYP-0010", "CAT-0008", "그래픽카드", "GeForce RTX 2070", "2070", "RTX 2070"],
    ["TYP-0011", "CAT-0008", "그래픽카드", "GeForce RTX 4070", "4070", "RTX 4070"],
    ["TYP-0012", "CAT-0009", "모니터", "27인치 모니터", "27", "27 inch monitor"],
    ["TYP-0013", "CAT-0009", "모니터", "32인치 모니터", "32", "32 inch monitor"],
    ["TYP-0014", "CAT-0010", "SSD", "NVMe SSD 1TB", "NVME1T", "1TB NVMe SSD"],
    ["TYP-0015", "CAT-0010", "SSD", "NVMe SSD 2TB", "NVME2T", "2TB NVMe SSD"],
    ["TYP-0016", "CAT-0011", "외장하드", "외장하드 2TB", "EXT2T", "2TB external drive"],
    ["TYP-0017", "CAT-0011", "외장하드", "외장하드 4TB", "EXT4T", "4TB external drive"]
  ].map(([type_id, category_id, category_name, type_name, type_prefix, memo]) =>
    rowFor("DeviceTypes", {
      type_id,
      category_id,
      category_name,
      type_name,
      type_prefix,
      memo,
      created_at: created,
      updated_at: created,
      is_deleted: false
    })
  );
}

function defaultReasons(created = now()) {
  return [
    ["RSN-0001", "RENT", "업무 사용", "회사 업무 목적"],
    ["RSN-0002", "RENT", "임상시험 준비", "임상/테스트 준비"],
    ["RSN-0003", "RENT", "교육/시연", "교육 또는 데모"],
    ["RSN-0004", "RENT", "외부 출장", "외부 현장 사용"],
    ["RSN-0005", "RENT", "기타", ""],
    ["RSN-0006", "RETURN", "기기 반납", "일반 반납"],
    ["RSN-0007", "RETURN", "퇴사", "퇴사자 반납"],
    ["RSN-0008", "RETURN", "프로젝트 종료", "업무 종료 후 반납"],
    ["RSN-0009", "RETURN", "점검 전환", "점검/수리 필요"],
    ["RSN-0010", "RETURN", "기타", ""],
    ["RSN-0011", "DELIVERY", "기관 납품", "기관 또는 외부 대상 납품"],
    ["RSN-0012", "DELIVERY", "개인 납품", "개인 대상 납품"],
    ["RSN-0013", "DELIVERY", "프로젝트 납품", "프로젝트 장비 납품"],
    ["RSN-0014", "DELIVERY", "기타", ""],
    ["RSN-0015", "RECOVERY", "기기 회수", "일반 회수"],
    ["RSN-0016", "RECOVERY", "납품 종료", "납품 기간 종료 후 회수"],
    ["RSN-0017", "RECOVERY", "점검 회수", "점검 또는 수리 필요"],
    ["RSN-0018", "RECOVERY", "기타", ""]
  ].map(([reason_id, reason_type, reason_text, memo]) =>
    rowFor("Reasons", {
      reason_id,
      reason_type,
      reason_text,
      memo,
      created_at: created,
      updated_at: created,
      is_deleted: false
    })
  );
}

function defaultUsers(created = now()) {
  return [
    ["admin", "admin123!", "관리자", "ADMIN", "관리팀", "시스템 관리자", "010-0000-0000", "admin@local.dev", "기본 관리자 계정"],
    ["lee.field", "user123!", "이현장", "USER", "현장지원팀", "현장 엔지니어", "010-1111-2222", "lee.field@local.dev", "현장 검사 장비 주 사용자"],
    ["shin.research", "user123!", "신연구", "USER", "R&D팀", "연구원", "010-2222-3333", "shin.research@local.dev", "VR 실험 장비 사용자"],
    ["park.design", "user123!", "박디자인", "USER", "디자인팀", "UX 디자이너", "010-3333-4444", "park.design@local.dev", "시연 장비 사용자"],
    ["choi.dev", "user123!", "최개발", "USER", "개발팀", "개발 리드", "010-4444-5555", "choi.dev@local.dev", "개발용 장비 사용자"],
    ["kim.qa", "user123!", "김품질", "USER", "품질관리팀", "QA 엔지니어", "010-5555-0001", "kim.qa@local.dev", "검증 장비 사용자"],
    ["jung.ops", "user123!", "정운영", "USER", "운영팀", "운영 담당자", "010-5555-0002", "jung.ops@local.dev", "운영 장비 사용자"],
    ["han.edu", "user123!", "한교육", "USER", "교육운영팀", "교육 담당자", "010-5555-0003", "han.edu@local.dev", "교육 시연 담당"],
    ["seo.sales", "user123!", "서영업", "USER", "영업팀", "세일즈 매니저", "010-5555-0004", "seo.sales@local.dev", "외부 데모 장비 사용자"],
    ["oh.support", "user123!", "오지원", "USER", "고객지원팀", "지원 엔지니어", "010-5555-0005", "oh.support@local.dev", "고객 지원 장비 사용자"],
    ["baek.lab", "user123!", "백실험", "USER", "R&D팀", "실험 연구원", "010-5555-0006", "baek.lab@local.dev", "VR 실험 보조"],
    ["moon.media", "user123!", "문미디어", "USER", "콘텐츠팀", "미디어 담당자", "010-5555-0007", "moon.media@local.dev", "VR 콘텐츠 검수"],
    ["lim.admin", "user123!", "임관리", "USER", "관리팀", "자산 담당자", "010-5555-0008", "lim.admin@local.dev", "자산 실사 담당"],
    ["kang.plan", "user123!", "강기획", "USER", "기획팀", "서비스 기획자", "010-5555-0009", "kang.plan@local.dev", "기획 검수 장비 사용자"],
    ["yoon.dev", "user123!", "윤개발", "USER", "개발팀", "프론트엔드 개발자", "010-5555-0010", "yoon.dev@local.dev", "개발 테스트 사용자"],
    ["jang.dev", "user123!", "장개발", "USER", "개발팀", "백엔드 개발자", "010-5555-0011", "jang.dev@local.dev", "서버 테스트 사용자"],
    ["cho.marketing", "user123!", "조마케팅", "USER", "마케팅팀", "마케팅 담당자", "010-5555-0012", "cho.marketing@local.dev", "프로모션 데모 사용자"],
    ["nam.finance", "user123!", "남재무", "USER", "재무팀", "재무 담당자", "010-5555-0013", "nam.finance@local.dev", "업무 장비 사용자"]
  ].map(([user_id, password, name, role, department, position, contact, email, memo], index) =>
    rowFor("Users", {
      user_id,
      password,
      name,
      role,
      organization: defaultOrganizationForUser({ user_id, email, memo }, index),
      department,
      position,
      contact,
      email,
      profile_photo_path: "",
      memo,
      created_at: created,
      updated_at: created,
      is_deleted: false
    })
  );
}

function defaultUserOptions(created = now()) {
  const users = defaultUsers(created);
  const organizations = [...new Set(DEFAULT_ORGANIZATIONS)];
  const departments = [...new Set(users.map((user) => text(user.department)).filter(Boolean))];
  const positions = defaultPositionOptions();
  let index = 1;
  return [
    ...organizations.map((value) => ["ORGANIZATION", value, "기본 소속"]),
    ...departments.map((value) => ["DEPARTMENT", value, "사용자 부서"]),
    ...positions.map((value) => ["POSITION", value, "사용자 직책"])
  ].map(([option_type, option_text, memo]) =>
    rowFor("UserOptions", {
      option_id: `UOPT-${String(index++).padStart(4, "0")}`,
      option_type,
      option_text,
      memo,
      created_at: created,
      updated_at: created,
      is_deleted: false
    })
  );
}


function defaultPositionOptions() {
  return [
    "사원",
    "주임",
    "대리",
    "과장",
    "차장",
    "부장",
    "이사",
    "상무",
    "전무",
    "부사장",
    "대표",
    "연구원",
    "선임연구원",
    "책임연구원",
    "수석연구원"
  ];
}

function initialData(sample = true) {
  const created = now();
  const data = {
    Devices: [],
    Transactions: [],
    Maintenance: [],
    Users: defaultUsers(created),
    Institutions: [],
    UserOptions: defaultUserOptions(created),
    Notifications: [],
    AuditLogs: [],
    Categories: defaultCategories(created),
    DeviceTypes: defaultDeviceTypes(created),
    Reasons: defaultReasons(created)
  };
  if (!sample) return data;

  data.Devices = [
    {
      device_id: "EQ-0001",
      device_name: "Meta Quest 3",
      category: "VR 기기",
      manufacturer: "Meta",
      model_name: "Quest 3",
      capacity_gb: "128",
      serial_number: "SN-QST-0001",
      purchase_date: "2026-01-12",
      purchase_price: "790000",
      department: "교육운영팀",
      manager: "김관리",
      location: "본사 장비실 A",
      status: "AVAILABLE",
      current_borrower: "",
      borrower_department: "",
      borrowed_at: "",
      expected_return_at: "",
      last_returned_at: "",
      last_checked_at: addDays(-8),
      components: "본체, 컨트롤러 2개, 충전 케이블",
      main_photo_path: "",
      photo_paths: "",
      qr_code_path: publicQrPath("EQ-0001"),
      memo: "시연용 VR 장비",
      created_at: created,
      updated_at: created,
      is_deleted: false
    },
    {
      device_id: "TAB-0001",
      device_name: "Galaxy Tab S9",
      category: "태블릿",
      manufacturer: "Samsung",
      model_name: "SM-X710",
      serial_number: "SN-TAB-0001",
      purchase_date: "2025-11-04",
      purchase_price: "980000",
      department: "품질관리팀",
      manager: "박담당",
      location: "강남 세브란스",
      status: "RENTED",
      current_borrower: "이현장",
      borrower_department: "현장지원팀",
      borrowed_at: today(),
      expected_return_at: addDays(7),
      last_returned_at: "",
      last_checked_at: addDays(-18),
      components: "본체, 펜, 케이스",
      main_photo_path: "",
      photo_paths: "",
      qr_code_path: publicQrPath("TAB-0001"),
      memo: "검사 앱 설치 완료",
      created_at: created,
      updated_at: created,
      is_deleted: false
    },
    {
      device_id: "LAP-0001",
      device_name: "ThinkPad X1 Carbon",
      category: "노트북",
      manufacturer: "Lenovo",
      model_name: "X1 Carbon Gen 12",
      serial_number: "SN-LAP-0001",
      purchase_date: "2025-08-22",
      purchase_price: "2100000",
      department: "개발팀",
      manager: "최개발",
      location: "본사 장비실 B",
      status: "MAINTENANCE",
      current_borrower: "",
      borrower_department: "",
      borrowed_at: "",
      expected_return_at: "",
      last_returned_at: addDays(-2),
      last_checked_at: today(),
      components: "본체, 어댑터, 파우치",
      main_photo_path: "",
      photo_paths: "",
      qr_code_path: publicQrPath("LAP-0001"),
      memo: "배터리 점검 중",
      created_at: created,
      updated_at: created,
      is_deleted: false
    },
    {
      device_id: "KIT-0001",
      device_name: "Kiosk Payment Module",
      category: "키오스크 부품",
      manufacturer: "Local Vendor",
      model_name: "PAY-200",
      serial_number: "SN-KIT-0001",
      purchase_date: "2025-05-18",
      purchase_price: "320000",
      department: "서비스기술팀",
      manager: "정서비스",
      location: "수리 대기 선반",
      status: "BROKEN",
      current_borrower: "",
      borrower_department: "",
      borrowed_at: "",
      expected_return_at: "",
      last_returned_at: "",
      last_checked_at: addDays(-1),
      components: "결제 모듈, 케이블",
      main_photo_path: "",
      photo_paths: "",
      qr_code_path: publicQrPath("KIT-0001"),
      memo: "카드 인식 불량",
      created_at: created,
      updated_at: created,
      is_deleted: false
    }
  ].map((row) => rowFor("Devices", row));

  data.Transactions = [
    rowFor("Transactions", {
      transaction_id: `TRX-${ymd()}-0001`,
      transaction_no: "0001",
      device_id: "TAB-0001",
      action_type: "RENT",
      user_name: "이현장",
      user_department: "현장지원팀",
      user_contact: "010-0000-0000",
      purpose: "현장 검사",
      rented_at: today(),
      expected_return_at: addDays(7),
      before_status: "AVAILABLE",
      after_status: "RENTED",
      condition_status: "정상",
      handled_by: "admin",
      memo: "초기 샘플 대여 이력",
      created_at: created
    })
  ];

  data.Maintenance = [
    rowFor("Maintenance", {
      maintenance_id: `MNT-${ymd()}-0001`,
      device_id: "LAP-0001",
      maintenance_type: "정기점검",
      checked_by: "admin",
      checked_at: today(),
      result: "배터리 성능 저하 확인",
      issue_level: "보통",
      action_taken: "충전 사이클 점검",
      next_check_at: addDays(30),
      status_after: "MAINTENANCE",
      memo: "초기 샘플 점검 이력",
      created_at: created
    })
  ];

  return data;
}

function writeAll(data) {
  ensureDirs();
  const workbook = XLSX.utils.book_new();
  Object.entries(SHEETS).forEach(([sheet, columns]) => {
    const rows = (data[sheet] || []).map((row) => rowFor(sheet, row));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: columns }), sheet);
  });
  XLSX.writeFile(workbook, excelPath, { bookType: "xlsx" });
}

function ensureWorkbook() {
  ensureDirs();
  if (!fs.existsSync(excelPath)) {
    writeAll(initialData(true));
    return;
  }

  const workbook = XLSX.readFile(excelPath);
  let changed = false;
  Object.entries(SHEETS).forEach(([sheet, columns]) => {
    if (!workbook.Sheets[sheet]) {
      const rows =
        sheet === "Categories"
          ? defaultCategories()
          : sheet === "DeviceTypes"
          ? defaultDeviceTypes()
          : sheet === "Reasons"
          ? defaultReasons()
          : sheet === "UserOptions"
          ? defaultUserOptions()
          : [];
      workbook.Sheets[sheet] = XLSX.utils.json_to_sheet(rows, { header: columns });
      workbook.SheetNames.push(sheet);
      changed = true;
    }
  });

  Object.entries(SHEETS).forEach(([sheet, columns]) => {
    if (!workbook.Sheets[sheet]) return;
    const rowsWithHeader = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: "" });
    const header = rowsWithHeader[0] || [];
    const missingColumns = columns.filter((column) => !header.includes(column));
    if (!missingColumns.length) return;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: "" });
    workbook.Sheets[sheet] = XLSX.utils.json_to_sheet(rows.map((row) => rowFor(sheet, row)), { header: columns });
    changed = true;
  });

  if (workbook.Sheets.Categories) {
    const categories = XLSX.utils.sheet_to_json(workbook.Sheets.Categories, { defval: "" });
    if (!categories.length) {
      workbook.Sheets.Categories = XLSX.utils.json_to_sheet(defaultCategories(), { header: SHEETS.Categories });
      changed = true;
    }
  }

  if (workbook.Sheets.DeviceTypes) {
    const types = XLSX.utils.sheet_to_json(workbook.Sheets.DeviceTypes, { defval: "" });
    if (!types.length) {
      workbook.Sheets.DeviceTypes = XLSX.utils.json_to_sheet(defaultDeviceTypes(), { header: SHEETS.DeviceTypes });
      changed = true;
    }
  }

  if (workbook.Sheets.Reasons) {
    const reasons = XLSX.utils.sheet_to_json(workbook.Sheets.Reasons, { defval: "" });
    if (!reasons.length) {
      workbook.Sheets.Reasons = XLSX.utils.json_to_sheet(defaultReasons(), { header: SHEETS.Reasons });
      changed = true;
    }
  }

  if (workbook.Sheets.UserOptions) {
    const userOptions = XLSX.utils.sheet_to_json(workbook.Sheets.UserOptions, { defval: "" });
    if (!userOptions.length) {
      workbook.Sheets.UserOptions = XLSX.utils.json_to_sheet(defaultUserOptions(), { header: SHEETS.UserOptions });
      changed = true;
    }
  }

  if (changed) XLSX.writeFile(workbook, excelPath, { bookType: "xlsx" });
}

function readAll() {
  ensureWorkbook();
  const workbook = XLSX.readFile(excelPath);
  const data = Object.fromEntries(
    Object.entries(SHEETS).map(([sheet]) => {
      const rows = workbook.Sheets[sheet] ? XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: "" }) : [];
      return [sheet, rows.map((row) => rowFor(sheet, row))];
    })
  );
  let changed = false;
  changed = ensureDemoDirectory(data) || changed;
  changed = normalizeUserOrganizations(data) || changed;
  changed = ensureUserOptions(data) || changed;
  changed = ensureDefaultReasonRows(data) || changed;
  changed = ensurePasswordHashes(data) || changed;
  changed = normalizeUserPositions(data) || changed;
  changed = ensureCategoryRowsForDevicesAndTypes(data) || changed;
  changed = normalizeDeviceCapacities(data) || changed;
  changed = normalizeDeviceNumbers(data) || changed;
  changed = ensureTransactionNumbers(data) || changed;
  changed = normalizeDeliveryTransactionStatuses(data) || changed;
  changed = normalizeDeliveredStatuses(data) || changed;
  changed = ensureCurrentCheckoutSnapshots(data) || changed;
  if (changed) writeAll(data);
  return data;
}

function readData() {
  return writeLock.then(() => readAll());
}

function withWrite(mutator) {
  const run = writeLock.then(async () => {
    const data = readAll();
    const result = await mutator(data);
    writeAll(data);
    return result;
  });
  writeLock = run.catch(() => {});
  return run;
}

function activeDevices(data) {
  return data.Devices.filter((device) => !bool(device.is_deleted));
}

function findDevice(data, id) {
  return activeDevices(data).find((device) => device.device_id === id);
}

function attachDevice(rows, devices) {
  const map = new Map(devices.map((device) => [device.device_id, device]));
  return rows.map((row) => {
    const device = map.get(row.device_id);
    const devicePhotos = splitPaths(device?.photo_paths || device?.main_photo_path);
    const rowPhotos = splitPaths(row.photo_paths);
    return {
      ...row,
      photo_paths: rowPhotos.length ? row.photo_paths : row.action_type === "REGISTER" ? devicePhotos.join(";") : row.photo_paths,
      device_name: device?.device_name || "",
      device_legacy_device_id: device?.legacy_device_id || "",
      device_category: device?.category || "",
      device_model_name: device?.model_name || "",
      device_capacity_gb: device?.capacity_gb || "",
      device_ram_capacity: device?.ram_capacity || "",
      device_storage_capacity: device?.storage_capacity || "",
      device_cpu: device?.cpu || "",
      device_gpu: device?.gpu || "",
      device_windows_spec: device?.windows_spec || "",
      device_status: device?.status || ""
    };
  });
}

function organizationDepartmentLabel(organization, department) {
  return [text(organization), text(department)].filter(Boolean).join(" / ");
}

function handlerDisplay(user, fallback) {
  if (!user) return text(fallback);
  return [user.name || fallback, user.organization, user.department].map(text).filter(Boolean).join(" / ");
}

function transactionBorrowerInfo(data, row) {
  if (borrowerType(row) === "INSTITUTION") {
    const institution = findInstitution(data, row.institution_id) || findInstitutionByName(data, row.institution_name || row.user_name);
    const institutionName = institution?.institution_name || row.institution_name || row.user_name || "";
    return {
      organization: "기관",
      department: institutionName,
      orgDepartment: organizationDepartmentLabel("기관", institutionName)
    };
  }
  const user = findBorrowerUser(data, row);
  const organization = row.user_organization || user?.organization || "";
  const department = row.user_department || user?.department || "";
  return {
    organization,
    department,
    orgDepartment: organizationDepartmentLabel(organization, department)
  };
}

function transactionSortKey(row = {}) {
  return [
    text(row.created_at),
    text(row.transaction_no).padStart(10, "0"),
    text(row.transaction_id)
  ].join("|");
}

function compareTransactionsAsc(a, b) {
  return transactionSortKey(a).localeCompare(transactionSortKey(b));
}

function compareTransactionsDesc(a, b) {
  return transactionSortKey(b).localeCompare(transactionSortKey(a));
}

function deviceTransactionsDesc(data, deviceId) {
  return [...(data.Transactions || [])]
    .filter((row) => row.device_id === deviceId)
    .sort(compareTransactionsDesc);
}

function transactionsByDeviceDesc(data) {
  const byDevice = new Map();
  (data.Transactions || []).forEach((row) => {
    const deviceId = text(row.device_id);
    if (!deviceId) return;
    if (!byDevice.has(deviceId)) byDevice.set(deviceId, []);
    byDevice.get(deviceId).push(row);
  });
  byDevice.forEach((rows) => rows.sort(compareTransactionsDesc));
  return byDevice;
}

function protectedCurrentStateTransactionIds(data, device) {
  const protectedIds = new Set();
  if (!device || device.status === "AVAILABLE") return protectedIds;

  const rows = deviceTransactionsDesc(data, device.device_id);
  if (!rows.length) return protectedIds;

  if (device.status === "RENTED" || device.status === "DELIVERED") {
    const openAction = device.status === "DELIVERED" ? "DELIVERY" : "RENT";
    for (const row of rows) {
      if (["RETURN", "RECOVERY"].includes(row.action_type) || row.after_status === "AVAILABLE") break;
      if (row.action_type === openAction || row.action_type === "RENTAL_UPDATE") {
        protectedIds.add(row.transaction_id);
      }
    }
    return protectedIds;
  }

  for (const row of rows) {
    if (row.after_status === "AVAILABLE") break;
    if (row.after_status === device.status) protectedIds.add(row.transaction_id);
  }
  return protectedIds;
}

function isTransactionDeletionProtected(data, row = {}) {
  return false;
}

function attachTransactions(rows, data) {
  return attachDevice(rows, data.Devices).map((row) => {
    const handler = findUser(data, row.handled_by);
    const borrower = transactionBorrowerInfo(data, row);
    return {
      ...row,
      user_organization: borrower.organization,
      borrower_organization: borrower.organization,
      borrower_department: borrower.department,
      user_org_department: borrower.orgDepartment,
      borrower_org_department: borrower.orgDepartment,
      handled_by_name: handler?.name || "",
      handled_by_organization: handler?.organization || "",
      handled_by_department: handler?.department || "",
      handled_by_display: handlerDisplay(handler, row.handled_by),
      deletion_protected: isTransactionDeletionProtected(data, row)
    };
  });
}

function borrowerType(input = {}) {
  return text(input.borrower_type).toUpperCase() === "INSTITUTION" ? "INSTITUTION" : "PERSON";
}

function nextInstitutionId(data) {
  return nextId(data.Institutions || [], "ORG", "institution_id");
}

function institutionSummary(data, institution) {
  const institutionId = text(institution?.institution_id);
  const institutionName = text(institution?.institution_name);
  const transactions = (data.Transactions || [])
    .filter((row) => {
      if (institutionId && row.institution_id === institutionId) return true;
      return borrowerType(row) === "INSTITUTION" && text(row.institution_name || row.user_name) === institutionName;
    })
    .sort(compareTransactionsDesc);
  const rentLocations = latestRentLocations(data);
  const assignedDevices = activeDevices(data).filter((device) => {
    if (!["RENTED", "DELIVERED"].includes(device.status)) return false;
    if (text(device.borrower_department) !== "기관") return false;
    return text(device.current_borrower) === institutionName;
  });
  return {
    ...institution,
    assigned_count: assignedDevices.length,
    transaction_count: transactions.length,
    assigned_devices: assignedDevices.map((device) => ({
      ...device,
      rent_location: rentLocations.get(device.device_id) || ""
    })),
    transactions: attachTransactions(transactions, data).slice(0, 30)
  };
}

function placeFromMemo(memo) {
  const match = text(memo).match(/(?:대여|반납|납품|회수) 장소:\s*([^/]+)/);
  return match ? match[1].trim() : "";
}

function statusMemoFromTransaction(row = {}) {
  return (
    text(row.memo)
      .replace(/(?:대여|반납|납품|회수) 장소:\s*[^/]+\/?\s*/g, "")
      .replace(/\s*\/?\s*(?:대여|납품) 정보 수정(?::.*)?$/g, "")
      .trim() ||
    text(row.issue_description) ||
    ""
  );
}

function firstStatusMemo(rows = []) {
  return statusMemoFromTransaction(rows.find((row) => statusMemoFromTransaction(row)) || rows[0] || {});
}

function statusPurposeFromTransaction(row = {}) {
  return text(row.purpose) || text(row.issue_description) || statusMemoFromTransaction(row);
}

function firstStatusPurpose(rows = []) {
  return statusPurposeFromTransaction(rows.find((row) => statusPurposeFromTransaction(row)) || rows[0] || {});
}

function currentStatusPrimaryRow(rows = []) {
  return rows.find((row) =>
    [row.user_contact, row.purpose, row.condition_status, row.memo, row.issue_description].some((value) => text(value))
  ) || rows[0] || null;
}

function currentStatusRowsFromList(device = {}, rows = []) {
  if (!rows.length) return [];

  if (device.status === "RENTED") {
    return rows.filter((item) => ["RENTAL_UPDATE", "RENT"].includes(item.action_type));
  } else if (device.status === "DELIVERED") {
    return rows.filter((item) => ["RENTAL_UPDATE", "DELIVERY"].includes(item.action_type));
  } else if (device.status === "AVAILABLE") {
    return rows.filter(
      (item) =>
        item.after_status === "AVAILABLE" &&
        ["RETURN", "RECOVERY", "LOST_FOUND", "MAINTENANCE_COMPLETE", "STATUS_CHANGE"].includes(item.action_type)
    );
  } else if (device.status === "DISPOSED") {
    return rows.filter((item) => item.action_type === "DISPOSE" || item.after_status === "DISPOSED");
  }

  return rows.filter((item) => item.after_status === device.status);
}

function currentStatusRows(data, device = {}) {
  return currentStatusRowsFromList(device, deviceTransactionsDesc(data, device.device_id));
}

function currentStatusMemo(data, device = {}) {
  return firstStatusMemo(currentStatusRows(data, device));
}

function currentStatusPurpose(data, device = {}) {
  return firstStatusPurpose(currentStatusRows(data, device));
}

function checkoutSnapshotValuesFromTransaction(data, device, row) {
  if (!row) return null;
  const type = borrowerType(row);
  const borrower = transactionBorrowerInfo(data, row);
  const sourceActionType =
    device.status === "DELIVERED" || row.action_type === "DELIVERY" || (row.action_type === "RENTAL_UPDATE" && row.after_status === "DELIVERED")
      ? "DELIVERY"
      : "RENT";
  return {
    borrowerName: row.user_name || device.current_borrower || "",
    borrowerType: type,
    institutionId: type === "INSTITUTION" ? row.institution_id || "" : "",
    institutionName: type === "INSTITUTION" ? row.institution_name || row.user_name || "" : "",
    userOrganization: row.user_organization || borrower.organization || "",
    userDepartment: row.user_department || borrower.department || device.borrower_department || "",
    userPosition: row.user_position || "",
    userContact: row.user_contact || "",
    purpose: row.purpose || "",
    rentLocation: placeFromMemo(row.memo),
    conditionStatus: row.condition_status || "",
    memo: statusMemoFromTransaction(row),
    sourceActionType,
    rentedAt: row.rented_at || device.borrowed_at || "",
    expectedReturnAt: sourceActionType === "DELIVERY" ? "" : row.expected_return_at || device.expected_return_at || ""
  };
}

function mergeCurrentCheckoutSnapshot(device, values = {}) {
  const pairs = [
    ["current_borrower", values.borrowerName],
    ["current_borrower_type", values.borrowerType],
    ["current_institution_id", values.institutionId],
    ["current_institution_name", values.institutionName],
    ["current_user_organization", values.userOrganization],
    ["borrower_department", values.userDepartment],
    ["current_user_position", values.userPosition],
    ["current_user_contact", values.userContact],
    ["current_purpose", values.purpose],
    ["current_rent_location", values.rentLocation],
    ["current_condition_status", values.conditionStatus],
    ["current_process_memo", values.memo],
    ["current_source_action_type", values.sourceActionType],
    ["borrowed_at", values.rentedAt],
    ["expected_return_at", values.expectedReturnAt]
  ];
  let changed = false;
  pairs.forEach(([field, value]) => {
    if (text(device[field]) || !text(value)) return;
    device[field] = value;
    changed = true;
  });
  return changed;
}

function ensureCurrentCheckoutSnapshots(data) {
  let changed = false;
  const byDevice = transactionsByDeviceDesc(data);
  activeDevices(data).forEach((device) => {
    if (!["RENTED", "DELIVERED"].includes(device.status)) return;
    const alreadyHasSnapshot = [
      device.current_borrower_type,
      device.current_user_contact,
      device.current_purpose,
      device.current_rent_location,
      device.current_condition_status,
      device.current_process_memo,
      device.current_source_action_type
    ].some((value) => text(value));
    const rows = byDevice.get(device.device_id) || [];
    const statusRows = currentStatusRowsFromList(device, rows);
    const row = currentStatusPrimaryRow(statusRows);
    if (!row) return;

    const values = checkoutSnapshotValuesFromTransaction(data, device, row);
    if (alreadyHasSnapshot) {
      changed = mergeCurrentCheckoutSnapshot(device, values) || changed;
      return;
    }
    applyCurrentCheckoutSnapshot(device, values);
    changed = true;
  });
  return changed;
}

function latestRentLocations(data) {
  const locations = new Map();
  [...(data.Transactions || [])]
    .filter((row) => ["RENT", "DELIVERY", "RENTAL_UPDATE"].includes(row.action_type))
    .sort(compareTransactionsDesc)
    .forEach((row) => {
      if (!locations.has(row.device_id)) locations.set(row.device_id, placeFromMemo(row.memo));
    });
  return locations;
}

function ensureCategoryRowsForDevicesAndTypes(data, created = now()) {
  let changed = false;
  data.Categories = data.Categories || [];
  const defaultsByName = new Map(defaultCategories(created).map((category) => [category.category_name, category]));
  const required = new Map();

  activeDeviceTypes(data).forEach((type) => {
    const categoryName = text(type.category_name);
    if (categoryName) required.set(categoryName, text(type.category_id));
  });
  activeDevices(data).forEach((device) => {
    const categoryName = text(device.category);
    if (categoryName && !required.has(categoryName)) required.set(categoryName, "");
  });

  required.forEach((preferredId, categoryName) => {
    const active = activeCategories(data).find((category) => category.category_name === categoryName);
    if (active) {
      activeDeviceTypes(data).forEach((type) => {
        if (type.category_name === categoryName && type.category_id !== active.category_id) {
          type.category_id = active.category_id;
          type.updated_at = active.updated_at || created;
          changed = true;
        }
      });
      return;
    }

    const defaultCategory = defaultsByName.get(categoryName);
    const preferredCategoryId = defaultCategory?.category_id || preferredId || nextCategoryId(data);
    const categoryId = data.Categories.some((category) => category.category_id === preferredCategoryId)
      ? nextCategoryId(data)
      : preferredCategoryId;
    const row = rowFor("Categories", {
      ...(defaultCategory || {}),
      category_id: categoryId,
      category_name: categoryName,
      prefix: normalizePrefix(defaultCategory?.prefix || prefixFor(categoryName)) || "EQ",
      memo: defaultCategory?.memo || "Auto restored category",
      created_at: created,
      updated_at: created,
      is_deleted: false
    });
    data.Categories.push(row);
    activeDeviceTypes(data).forEach((type) => {
      if (type.category_name === categoryName) {
        type.category_id = categoryId;
        type.updated_at = created;
      }
    });
    changed = true;
  });

  return changed;
}

function normalizeDeviceCapacities(data) {
  let changed = false;
  (data.Devices || []).forEach((device) => {
    if (isLaptopCategory(device.category)) {
      if (device.capacity_gb) {
        device.capacity_gb = "";
        changed = true;
      }
      const displayName = deviceDisplayName(device.category, device.model_name);
      if (displayName && device.device_name !== displayName) {
        device.device_name = displayName;
        changed = true;
      }
      return;
    }

    const capacity = normalizeCapacity(device.capacity_gb);
    if (device.capacity_gb !== capacity) {
      device.capacity_gb = capacity;
      changed = true;
    }

    if (!device.capacity_gb) {
      const parsed = splitCapacityFromModel(device.model_name);
      if (parsed.capacityGb) {
        device.model_name = parsed.modelName;
        device.capacity_gb = parsed.capacityGb;
        changed = true;
      }
    } else {
      const parsed = splitCapacityFromModel(device.model_name);
      if (parsed.capacityGb && parsed.modelName !== device.model_name) {
        device.model_name = parsed.modelName;
        changed = true;
      }
    }

    const displayName = deviceDisplayName(device.category, device.model_name);
    if (displayName && device.device_name !== displayName) {
      device.device_name = displayName;
      changed = true;
    }

    const matchedType = findDeviceType(data, device.category, device.model_name, device.capacity_gb);
    const typeCapacity = splitCapacityFromModel(matchedType?.type_name).capacityGb;
    if (typeCapacity && capacityMatches(device.capacity_gb, typeCapacity) && normalizeCapacity(device.capacity_gb) !== typeCapacity) {
      device.capacity_gb = typeCapacity;
      changed = true;
    }
  });
  return changed;
}

function normalizeDeviceNumbers(data) {
  return reassignDeviceNumbers(data, activeDevices(data), now()).length > 0;
}

function nextUserOptionId(data) {
  return nextId(data.UserOptions || [], "UOPT", "option_id");
}

function userOptionType(value) {
  const type = text(value).toUpperCase();
  if (type === "POSITION") return "POSITION";
  if (type === "ORGANIZATION") return "ORGANIZATION";
  return "DEPARTMENT";
}

function ensureUserOptions(data) {
  let changed = false;
  const created = now();
  data.UserOptions = data.UserOptions || [];
  const addOption = (optionType, optionText, memo = "") => {
    const type = userOptionType(optionType);
    const value = text(optionText);
    if (!value) return;
    const existing = data.UserOptions.find((option) => option.option_type === type && option.option_text === value);
    if (existing) return;
    data.UserOptions.push(
      rowFor("UserOptions", {
        option_id: nextUserOptionId(data),
        option_type: type,
        option_text: value,
        memo,
        created_at: created,
        updated_at: created,
        is_deleted: false
      })
    );
    changed = true;
  };

  defaultUserOptions(created).forEach((option) => addOption(option.option_type, option.option_text, option.memo));
  DEFAULT_ORGANIZATIONS.forEach((organization) => addOption("ORGANIZATION", organization, "기본 소속"));
  activeUsers(data).forEach((user) => {
    addOption("ORGANIZATION", user.organization, "사용자 데이터에서 자동 추가");
    addOption("DEPARTMENT", user.department, "사용자 데이터에서 자동 추가");
    addOption("POSITION", user.position, "사용자 데이터에서 자동 추가");
  });

  return changed;
}

function ensureDefaultReasonRows(data) {
  let changed = false;
  const created = now();
  data.Reasons = data.Reasons || [];
  defaultReasons(created).forEach((reason) => {
    const exists = activeReasons(data).some(
      (row) => row.reason_type === reason.reason_type && row.reason_text === reason.reason_text
    );
    if (exists) return;
    data.Reasons.push(
      rowFor("Reasons", {
        ...reason,
        reason_id: nextReasonId(data),
        created_at: created,
        updated_at: created,
        is_deleted: false
      })
    );
    changed = true;
  });
  return changed;
}


function latestDeviceFlowTransaction(data, deviceId) {
  return [...(data.Transactions || [])]
    .filter((row) => row.device_id === deviceId && ["RENT", "DELIVERY", "RETURN", "RECOVERY"].includes(row.action_type))
    .sort(compareTransactionsDesc)[0];
}

function normalizeDeliveryTransactionStatuses(data) {
  let changed = false;
  const byDevice = new Map();
  (data.Transactions || []).forEach((row) => {
    const deviceId = text(row.device_id);
    if (!deviceId) return;
    if (!byDevice.has(deviceId)) byDevice.set(deviceId, []);
    byDevice.get(deviceId).push(row);
  });

  byDevice.forEach((rows) => {
    let activeCheckout = "";
    rows
      .sort(compareTransactionsAsc)
      .forEach((row) => {
        if (row.action_type === "RENT") {
          activeCheckout = "RENT";
          return;
        }
        if (row.action_type === "DELIVERY") {
          activeCheckout = "DELIVERY";
          if (row.after_status !== "DELIVERED") {
            row.after_status = "DELIVERED";
            changed = true;
          }
          return;
        }
        if (row.action_type === "RETURN" && activeCheckout === "DELIVERY") {
          row.action_type = "RECOVERY";
          if (row.before_status === "RENTED" || !row.before_status) row.before_status = "DELIVERED";
          row.memo = text(row.memo).replace(/반납 장소:/g, "회수 장소:");
          activeCheckout = "";
          changed = true;
          return;
        }
        if (row.action_type === "RECOVERY" || row.action_type === "RETURN") {
          activeCheckout = "";
        }
      });
  });
  return changed;
}

function normalizeDeliveredStatuses(data) {
  let changed = false;
  activeDevices(data).forEach((device) => {
    if (device.status !== "RENTED") return;
    const latestFlow = latestDeviceFlowTransaction(data, device.device_id);
    if (latestFlow?.action_type !== "DELIVERY") return;
    device.status = "DELIVERED";
    device.updated_at = device.updated_at || now();
    changed = true;
  });
  return changed;
}

function normalizeUserOrganizations(data) {
  let changed = false;
  activeUsers(data).forEach((user, index) => {
    if (text(user.organization)) return;
    user.organization = defaultOrganizationForUser(user, index);
    user.updated_at = now();
    changed = true;
  });
  return changed;
}

function ensurePasswordHashes(data) {
  let changed = false;
  const updatedAt = now();
  (data.Users || []).forEach((user) => {
    if (!text(user.password) || isPasswordHash(user.password)) return;
    user.password = hashPassword(user.password);
    user.updated_at = updatedAt;
    changed = true;
  });
  return changed;
}

function normalizeUserPositions(data) {
  let changed = false;
  const options = [
    ...new Set([
      ...defaultPositionOptions(),
      ...activeUserOptions(data)
        .filter((option) => option.option_type === "POSITION")
        .map((option) => text(option.option_text))
        .filter(Boolean)
    ])
  ];
  const userPositions = ["사원", "주임", "대리", "과장"];
  const researchPositions = ["연구원", "선임연구원", "책임연구원", "수석연구원"];
  const rolePositions = {
    admin: "대표",
    "lim.admin": "부장",
    "choi.dev": "차장",
    "jung.ops": "과장"
  };

  activeUsers(data).forEach((user, index) => {
    if (options.includes(user.position)) return;
    let nextPosition = rolePositions[user.user_id];
    if (!nextPosition && /R&D|연구|실험/.test(`${user.department} ${user.memo}`)) {
      nextPosition = researchPositions[index % researchPositions.length];
    }
    if (!nextPosition) {
      nextPosition = userPositions[index % userPositions.length];
    }
    user.position = nextPosition;
    user.updated_at = now();
    changed = true;
  });

  return changed;
}

function ensureDemoDirectory(data) {
  if (process.env.SEED_DEMO_DATA !== "true") return false;

  let changed = false;
  const created = now();
  data.Categories = data.Categories || [];
  defaultCategories(created).forEach((demoCategory) => {
    const existing = data.Categories.find((category) => category.category_id === demoCategory.category_id || category.category_name === demoCategory.category_name);
    if (!existing) {
      data.Categories.push(demoCategory);
      changed = true;
    }
  });

  data.DeviceTypes = data.DeviceTypes || [];
  defaultDeviceTypes(created).forEach((demoType) => {
    const existing = data.DeviceTypes.find((type) => type.type_id === demoType.type_id || (type.category_name === demoType.category_name && type.type_name === demoType.type_name));
    if (!existing) {
      data.DeviceTypes.push(demoType);
      changed = true;
    }
  });

  const demoUsers = defaultUsers(created);
  data.Users = data.Users || [];
  demoUsers.forEach((demoUser) => {
    const existing = data.Users.find((user) => user.user_id === demoUser.user_id);
    if (!existing) {
      data.Users.push(demoUser);
      changed = true;
      return;
    }
    ["organization", "department", "position", "contact", "email", "memo", "updated_at", "is_deleted"].forEach((field) => {
      if (existing[field] === undefined || existing[field] === "") {
        existing[field] = field === "updated_at" ? existing.created_at || created : demoUser[field];
        changed = true;
      }
    });
  });

  const assignedUsers = demoUsers.filter((user) => user.user_id !== "admin");
  const gpuModels = ["GeForce RTX 3070", "GeForce RTX 2070", "GeForce RTX 4070"];
  const monitorModels = ["27인치 모니터", "32인치 모니터"];
  const storageModels = [
    ["SSD", "NVMe SSD 1TB", "Samsung", "1024", "NVMe SSD"],
    ["SSD", "NVMe SSD 2TB", "Samsung", "2048", "NVMe SSD"],
    ["외장하드", "외장하드 2TB", "WD", "2048", "USB-C 외장하드"],
    ["외장하드", "외장하드 4TB", "Seagate", "4096", "백업용 외장하드"]
  ];
  const demoDevices = assignedUsers.flatMap((user, index) => {
    const userKey = user.user_id.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
    const pcModel = user.department === "개발팀" || user.department === "R&D팀" ? "개발용 PC" : "업무용 PC";
    const vrModel = index % 3 === 0 ? "Quest 2" : "Quest 3";
    const gpuModel = gpuModels[index % gpuModels.length];
    const monitorModel = monitorModels[index % monitorModels.length];
    const [storageCategory, storageModel, storageMaker, storageCapacity, storageComponents] = storageModels[index % storageModels.length];
    const base = {
      status: "RENTED",
      current_borrower: user.name,
      borrower_department: user.department,
      borrowed_at: addDays(-(index % 9) - 1),
      department: user.department,
      manager: user.name,
      location: `${user.department || "공용"} 자리`,
      expected_return_at: "",
      last_returned_at: "",
      last_checked_at: "",
      main_photo_path: "",
      photo_paths: "",
      created_at: created,
      updated_at: created,
      is_deleted: false
    };
    return [
      {
        ...base,
        marker: `SN-DEMO-${userKey}-PC`,
        category: "PC",
        manufacturer: "Dell",
        model_name: pcModel,
        capacity_gb: "1024",
        serial_number: `SN-DEMO-${userKey}-PC`,
        purchase_date: "2026-01-10",
        purchase_price: pcModel === "개발용 PC" ? "2400000" : "1600000",
        components: "본체, 전원 케이블, 키보드, 마우스",
        memo: `${user.name} PC 할당`
      },
      {
        ...base,
        marker: `SN-DEMO-${userKey}-VR`,
        category: "VR 기기",
        manufacturer: "Meta",
        model_name: vrModel,
        capacity_gb: vrModel === "Quest 3" ? "512" : "128",
        serial_number: `SN-DEMO-${userKey}-VR`,
        purchase_date: "2026-02-04",
        purchase_price: vrModel === "Quest 3" ? "890000" : "520000",
        components: "본체, 컨트롤러 2개, 충전 케이블",
        memo: `${user.name} VR 장비 할당`
      },
      {
        ...base,
        marker: `SN-DEMO-${userKey}-MON`,
        category: "모니터",
        manufacturer: index % 2 ? "LG" : "Dell",
        model_name: monitorModel,
        capacity_gb: "",
        serial_number: `SN-DEMO-${userKey}-MON`,
        purchase_date: "2026-01-21",
        purchase_price: monitorModel.includes("32") ? "420000" : "280000",
        components: "모니터, 전원 케이블, HDMI 케이블",
        memo: `${user.name} 모니터 할당`
      },
      {
        ...base,
        marker: `SN-DEMO-${userKey}-GPU`,
        category: "그래픽카드",
        manufacturer: "NVIDIA",
        model_name: gpuModel,
        capacity_gb: "",
        serial_number: `SN-DEMO-${userKey}-GPU`,
        purchase_date: "2026-02-12",
        purchase_price: gpuModel.includes("4070") ? "920000" : gpuModel.includes("3070") ? "680000" : "420000",
        components: "그래픽카드 단품",
        memo: `${user.name} 그래픽카드 할당`
      },
      {
        ...base,
        marker: `SN-DEMO-${userKey}-STORAGE`,
        category: storageCategory,
        manufacturer: storageMaker,
        model_name: storageModel,
        capacity_gb: storageCapacity,
        serial_number: `SN-DEMO-${userKey}-STORAGE`,
        purchase_date: "2026-03-01",
        purchase_price: storageCategory === "SSD" ? "180000" : "140000",
        components: storageComponents,
        memo: `${user.name} 저장장치 할당`
      }
    ];
  });

  demoDevices.forEach((demoDevice) => {
    if ((data.Devices || []).some((device) => device.serial_number === demoDevice.marker)) return;
    const id = nextDeviceId(data, prefixForDevice(data, demoDevice.category, demoDevice.model_name));
    const device = rowFor("Devices", {
      ...demoDevice,
      device_id: id,
      device_name: deviceDisplayName(demoDevice.category, demoDevice.model_name),
      expected_return_at: "",
      last_returned_at: "",
      last_checked_at: "",
      main_photo_path: "",
      photo_paths: "",
      qr_code_path: publicQrPath(id),
      created_at: created,
      updated_at: created,
      is_deleted: false
    });
    data.Devices.push(device);
    transaction(data, {
      device_id: id,
      action_type: "RENT",
      user_name: demoDevice.current_borrower,
      user_department: demoDevice.borrower_department,
      user_contact: activeUsers(data).find((user) => user.name === demoDevice.current_borrower)?.contact || "",
      purpose: "더미 사용자 할당",
      rented_at: demoDevice.borrowed_at,
      before_status: "AVAILABLE",
      after_status: "RENTED",
      condition_status: "정상",
      handled_by: "admin",
      memo: "사용자 관리 샘플 할당"
    });
    changed = true;
  });

  return changed;
}

function prefixFor(category) {
  const value = text(category).toUpperCase();
  if (value.includes("VR")) return "VR";
  if (value === "PC" || value.includes("데스크톱") || value.includes("DESKTOP")) return "PC";
  if (value.includes("그래픽") || value.includes("GPU") || value.includes("GEFORCE")) return "GPU";
  if (value.includes("모니터") || value.includes("MONITOR")) return "MON";
  if (value.includes("SSD")) return "SSD";
  if (value.includes("외장") || value.includes("HDD") || value.includes("하드")) return "EXT";
  if (value.includes("태블릿") || value.includes("TAB") || value.includes("TABLET")) return "TAB";
  if (value.includes("노트북") || value.includes("LAP") || value.includes("LAPTOP")) return "LAP";
  if (value.includes("키오스크") || value.includes("부품") || value.includes("KIT")) return "KIT";
  if (value.includes("검사")) return "INS";
  return "EQ";
}

function normalizePrefix(value) {
  return text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function activeCategories(data) {
  return (data.Categories || []).filter((category) => !bool(category.is_deleted));
}

function activeDeviceTypes(data) {
  return (data.DeviceTypes || []).filter((type) => !bool(type.is_deleted));
}

function activeReasons(data) {
  return (data.Reasons || []).filter((reason) => !bool(reason.is_deleted));
}

function activeUserOptions(data) {
  return (data.UserOptions || []).filter((option) => !bool(option.is_deleted));
}

function activeNotifications(data) {
  return (data.Notifications || []).filter((notification) => !bool(notification.is_deleted));
}

function activeUsers(data) {
  return (data.Users || []).filter((user) => !bool(user.is_deleted));
}

function activeInstitutions(data) {
  return (data.Institutions || []).filter((institution) => !bool(institution.is_deleted));
}

function findUser(data, userId) {
  const id = text(userId);
  return activeUsers(data).find((user) => user.user_id === id);
}

function findInstitution(data, institutionId) {
  const id = text(institutionId);
  return activeInstitutions(data).find((institution) => institution.institution_id === id);
}

function findInstitutionByName(data, institutionName) {
  const name = text(institutionName);
  return activeInstitutions(data).find((institution) => text(institution.institution_name) === name);
}

function isAdminActor(data, userId) {
  const id = text(userId);
  const actor = findUser(data, id);
  return normalizeUserRole(actor?.role || (id === "admin" ? "ADMIN" : "USER")) === "ADMIN";
}

function contactDigits(value) {
  return text(value).replace(/[^\d]/g, "");
}

function formatPhoneNumber(value) {
  const digits = contactDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function findBorrowerUser(data, input = {}) {
  const userId = text(input.user_id || input.recipient_user_id);
  if (userId) return findUser(data, userId);
  const name = text(input.user_name);
  const department = text(input.user_department);
  const contact = contactDigits(input.user_contact);
  if (!name) return null;
  return (
    activeUsers(data).find((user) => {
      if (text(user.name) !== name) return false;
      if (department && text(user.department) !== department) return false;
      if (contact && contactDigits(user.contact) !== contact) return false;
      return true;
    }) ||
    activeUsers(data).find((user) => {
      if (text(user.name) !== name) return false;
      return !department || text(user.department) === department;
    }) ||
    null
  );
}

function assignedDevicesForUser(data, user) {
  if (!user) return [];
  const userName = text(user.name);
  const department = text(user.department);
  const rentLocations = latestRentLocations(data);
  const latestReturnByDevice = latestReturnTransactionsByDevice(data);
  const returnRequests = activeNotifications(data)
    .filter(
      (notification) =>
        notification.type === "RETURN_REQUEST" &&
        notification.recipient_user_id === user.user_id &&
        isLiveReturnRequestNotification(data, notification, latestReturnByDevice)
    )
    .sort((a, b) => text(b.created_at).localeCompare(text(a.created_at)));
  return activeDevices(data)
    .filter((device) => {
      if (!["RENTED", "DELIVERED"].includes(device.status)) return false;
      if (text(device.current_borrower) !== userName) return false;
      return !department || !text(device.borrower_department) || text(device.borrower_department) === department;
    })
    .map((device) => {
      const request = returnRequests.find((notification) => notification.device_id === device.device_id);
      return {
        ...device,
        rent_location: rentLocations.get(device.device_id) || "",
        return_request: request
          ? {
              notification_id: request.notification_id,
              message: request.message,
              created_at: request.created_at,
              is_read: bool(request.is_read)
            }
          : null
      };
    });
}

function attachUserSummary(data, user) {
  const assignedDevices = assignedDevicesForUser(data, user);
  return {
    ...user,
    role: normalizeUserRole(user.role),
    assigned_count: assignedDevices.length,
    assigned_devices: assignedDevices
  };
}

function findCategory(data, value) {
  const target = text(value);
  return activeCategories(data).find(
    (category) => category.category_id === target || category.category_name === target
  );
}

function sameCategoryForType(type, category, categoryValue) {
  const fallbackName = text(categoryValue);
  return (
    type.category_id === category?.category_id ||
    type.category_name === category?.category_name ||
    type.category_name === fallbackName
  );
}

function capacityMatches(actualValue, expectedValue) {
  const actual = normalizeCapacity(actualValue);
  const expected = normalizeCapacity(expectedValue);
  if (!expected) return true;
  if (!actual) return false;
  if (actual === expected) return true;
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  return Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) && actualNumber * 1024 === expectedNumber;
}

function findDeviceType(data, categoryValue, typeName, capacityGb = "") {
  const category = findCategory(data, categoryValue);
  const rawTypeName = text(typeName);
  const parsedTarget = splitCapacityFromModel(rawTypeName);
  const targetType = parsedTarget.modelName;
  const targetCapacity = normalizeCapacity(capacityGb) || parsedTarget.capacityGb;
  if (!rawTypeName && !targetType) return null;
  const candidates = activeDeviceTypes(data).filter((type) => sameCategoryForType(type, category, categoryValue));
  return (
    candidates.find((type) => type.type_name === rawTypeName) ||
    candidates.find((type) => {
      const parsedType = splitCapacityFromModel(type.type_name);
      if (parsedType.modelName !== targetType) return false;
      return capacityMatches(targetCapacity, parsedType.capacityGb);
    }) ||
    null
  );
}

function prefixForCategory(data, category) {
  const row = findCategory(data, category);
  return normalizePrefix(row?.prefix || prefixFor(category)) || "EQ";
}

function prefixForDevice(data, category, modelName, capacityGb = "") {
  const categoryPrefix = prefixForCategory(data, category);
  const typePrefix = normalizePrefix(findDeviceType(data, category, modelName, capacityGb)?.type_prefix || "");
  return [categoryPrefix, typePrefix].filter(Boolean).join("-");
}

function deviceDisplayName(category, modelName) {
  const categoryText = text(category);
  const modelText = splitCapacityFromModel(modelName).modelName;
  if (categoryText && modelText) return `${categoryText} (${modelText})`;
  return categoryText || modelText || "";
}

function nextId(rows, prefix, column) {
  const re = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`);
  const max = rows.reduce((result, row) => {
    const match = text(row[column]).match(re);
    return match ? Math.max(result, Number(match[1])) : result;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function nextDeviceId(data, prefix, reserved = new Set()) {
  const re = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`);
  const ids = [...activeDevices(data).map((device) => device.device_id), ...reserved];
  const usedNumbers = ids.reduce((result, id) => {
    const match = text(id).match(re);
    if (match) result.add(Number(match[1]));
    return result;
  }, new Set());
  let number = 1;
  let candidate = `${prefix}-${String(number).padStart(3, "0")}`;
  while (usedNumbers.has(number) || reserved.has(candidate)) {
    number += 1;
    candidate = `${prefix}-${String(number).padStart(3, "0")}`;
  }
  return candidate;
}

function nextTransactionId(data) {
  return nextId(data.Transactions, `TRX-${ymd()}`, "transaction_id");
}

function ensureTransactionNumbers(data) {
  let changed = false;
  const used = new Set();
  const rows = [...(data.Transactions || [])].sort((a, b) => {
    const dateCompare = text(a.created_at).localeCompare(text(b.created_at));
    if (dateCompare) return dateCompare;
    return text(a.transaction_id).localeCompare(text(b.transaction_id));
  });

  rows.forEach((row) => {
    const current = text(row.transaction_no);
    if (/^\d+$/.test(current) && !used.has(current.padStart(4, "0"))) {
      row.transaction_no = current.padStart(4, "0");
      used.add(row.transaction_no);
      return;
    }
    let next = used.size + 1;
    let candidate = String(next).padStart(4, "0");
    while (used.has(candidate)) {
      next += 1;
      candidate = String(next).padStart(4, "0");
    }
    row.transaction_no = candidate;
    used.add(candidate);
    changed = true;
  });

  return changed;
}

function nextTransactionNo(data) {
  ensureTransactionNumbers(data);
  const max = (data.Transactions || []).reduce((result, row) => {
    const number = Number(text(row.transaction_no));
    return Number.isFinite(number) ? Math.max(result, number) : result;
  }, 0);
  return String(max + 1).padStart(4, "0");
}

function nextMaintenanceId(data) {
  return nextId(data.Maintenance, `MNT-${ymd()}`, "maintenance_id");
}

function nextAuditId(data) {
  return nextId(data.AuditLogs, `LOG-${ymd()}`, "log_id");
}

function nextCategoryId(data) {
  return nextId(data.Categories || [], "CAT", "category_id");
}

function nextDeviceTypeId(data) {
  return nextId(data.DeviceTypes || [], "TYP", "type_id");
}

function nextReasonId(data) {
  return nextId(data.Reasons || [], "RSN", "reason_id");
}

function nextNotificationId(data) {
  return nextId(data.Notifications || [], `NTF-${ymd()}`, "notification_id");
}

function audit(data, options) {
  data.AuditLogs.push(
    rowFor("AuditLogs", {
      log_id: nextAuditId(data),
      user_id: options.userId || "admin",
      action: options.action,
      target_type: options.targetType,
      target_id: options.targetId,
      before_value: JSON.stringify(options.beforeValue ?? {}),
      after_value: JSON.stringify(options.afterValue ?? {}),
      ip_address: options.ipAddress || "",
      created_at: now()
    })
  );
}

function transaction(data, payload) {
  const row = rowFor("Transactions", {
    ...payload,
    transaction_id: nextTransactionId(data),
    transaction_no: payload.transaction_no || nextTransactionNo(data),
    photo_paths: Array.isArray(payload.photo_paths) ? payload.photo_paths.join(";") : payload.photo_paths || "",
    handled_by: payload.handled_by || "admin",
    created_at: now()
  });
  data.Transactions.push(row);
  return row;
}

const DEVICE_STATUS_LABELS = {
  AVAILABLE: "대여 가능",
  RENTED: "대여 중",
  DELIVERED: "납품",
  MAINTENANCE: "점검 중",
  BROKEN: "고장",
  LOST: "분실",
  DISPOSED: "폐기"
};

const DEVICE_PROCESS_ACTION_LABELS = {
  RENT: "대여",
  DELIVERY: "납품",
  RETURN: "반납",
  RECOVERY: "회수",
  RENTAL_UPDATE: "대여/납품정보 수정",
  BROKEN: "고장",
  LOST: "분실",
  LOST_FOUND: "찾음 처리",
  MAINTENANCE_START: "점검 시작",
  MAINTENANCE_COMPLETE: "점검 완료",
  MAINTENANCE: "점검",
  STATUS_CHANGE: "상태 변경",
  DISPOSE: "폐기",
  DELETE: "삭제"
};

function deviceStatusLabel(status) {
  const key = text(status).toUpperCase();
  return DEVICE_STATUS_LABELS[key] || text(status) || "-";
}

function deviceProcessActionLabel(actionType) {
  const key = text(actionType).toUpperCase();
  return DEVICE_PROCESS_ACTION_LABELS[key] || text(actionType) || "??";
}

function notifyAdminsOfUserDeviceProcess(data, { device = {}, before = {}, actionType = "", options = {}, details = [] } = {}) {
  const actorId = text(options.userId);
  if (!actorId || isAdminActor(data, actorId)) return [];

  const admins = activeUsers(data).filter((user) => normalizeUserRole(user.role) === "ADMIN" && user.user_id !== actorId);
  if (!admins.length) return [];

  const actor = findUser(data, actorId) || {};
  const actorName = actor.name || actorId || "사용자";
  const actionLabel = deviceProcessActionLabel(actionType);
  const targetDevice = { ...before, ...device };
  const displayName =
    deviceDisplayName(targetDevice.category, targetDevice.model_name) ||
    targetDevice.device_name ||
    "장비";
  const statusText = deviceStatusLabel(device.status || targetDevice.status || before.status);
  const detailText = details.map((value) => text(value)).filter(Boolean).join(" / ");
  const createdAt = now();
  const notificationIds = [];

  admins.forEach((admin) => {
    const row = rowFor("Notifications", {
      notification_id: nextNotificationId(data),
      recipient_user_id: admin.user_id,
      sender_user_id: actorId,
      type: "DEVICE_PROCESS",
      device_id: targetDevice.device_id,
      title: `사용자 ${actionLabel} 처리`,
      message: `${actorName}님이 ${targetDevice.device_id} ${displayName} 장비를 ${actionLabel} 처리했습니다. 현재 상태: ${statusText}${detailText ? ` / ${detailText}` : ""}`,
      is_read: false,
      created_at: createdAt,
      read_at: "",
      is_deleted: false
    });
    data.Notifications.push(row);
    notificationIds.push(row.notification_id);
  });

  if (notificationIds.length) {
    audit(data, {
      ...options,
      action: "CREATE_ADMIN_DEVICE_PROCESS_NOTIFICATION",
      targetType: "Device",
      targetId: targetDevice.device_id,
      beforeValue: {},
      afterValue: { action_type: text(actionType).toUpperCase(), notification_ids: notificationIds }
    });
  }

  return notificationIds;
}

const DEVICE_CHANGE_LABELS = {
  device_id: "장비번호",
  legacy_device_id: "기존 장비번호",
  category: "분류",
  manufacturer: "제조사",
  model_name: "모델명",
  capacity_gb: "용량",
  ram_capacity: "램 용량",
  storage_capacity: "저장장치 용량",
  cpu: "CPU",
  gpu: "GPU",
  windows_spec: "Windows 사양",
  serial_number: "시리얼번호",
  purchase_date: "구매일",
  purchase_price: "구매금액",
  department: "관리부서",
  manager: "담당자",
  location: "보관위치",
  components: "구성품",
  memo: "비고",
  photo_paths: "장비 사진"
};

function briefValue(value) {
  const source = text(value) || "미입력";
  return source.length > 28 ? `${source.slice(0, 28)}...` : source;
}

function deviceChangeMemo(before, after) {
  const fields = [
    "device_id",
    "legacy_device_id",
    "category",
    "manufacturer",
    "model_name",
    "capacity_gb",
    "ram_capacity",
    "storage_capacity",
    "cpu",
    "gpu",
    "windows_spec",
    "serial_number",
    "purchase_date",
    "purchase_price",
    "department",
    "manager",
    "location",
    "components",
    "memo"
  ];
  const changes = fields
    .filter((field) => text(before[field]) !== text(after[field]))
    .map((field) => `${DEVICE_CHANGE_LABELS[field]}: ${briefValue(before[field])} → ${briefValue(after[field])}`);

  const beforePhotos = splitPaths(before.photo_paths || before.main_photo_path);
  const afterPhotos = splitPaths(after.photo_paths || after.main_photo_path);
  if (beforePhotos.join(";") !== afterPhotos.join(";")) {
    changes.push(`${DEVICE_CHANGE_LABELS.photo_paths}: ${beforePhotos.length}장 → ${afterPhotos.length}장`);
  }

  return changes.length ? `수정 내역: ${changes.join(" / ")}` : "수정 내역 없음";
}

function updateDeviceReferences(data, oldId, newId) {
  data.Transactions.forEach((row) => {
    if (row.device_id === oldId) row.device_id = newId;
  });
  data.Maintenance.forEach((row) => {
    if (row.device_id === oldId) row.device_id = newId;
  });
  data.AuditLogs.forEach((row) => {
    if (row.target_type === "Device" && row.target_id === oldId) row.target_id = newId;
  });
}

function reassignDeviceNumbers(data, devices, updatedAt = now()) {
  const affected = new Set(devices.map((device) => device.device_id));
  const reserved = new Set(activeDevices(data).filter((device) => !affected.has(device.device_id)).map((device) => device.device_id));
  const changes = [];

  devices.forEach((device) => {
    const oldId = device.device_id;
    const prefix = prefixForDevice(data, device.category, device.model_name, device.capacity_gb);
    let nextIdValue = text(oldId).startsWith(`${prefix}-`) && !reserved.has(oldId) ? oldId : nextDeviceId(data, prefix, reserved);
    if (reserved.has(nextIdValue)) nextIdValue = nextDeviceId(data, prefix, reserved);
    reserved.add(nextIdValue);

    const nextName = deviceDisplayName(device.category, device.model_name) || [device.category, device.model_name, nextIdValue].filter(Boolean).join(" ");
    let touched = false;
    if (device.device_name !== nextName) {
      device.device_name = nextName;
      touched = true;
    }

    if (oldId !== nextIdValue) {
      device.device_id = nextIdValue;
      device.qr_code_path = publicQrPath(nextIdValue);
      updateDeviceReferences(data, oldId, nextIdValue);
      changes.push({ from: oldId, to: nextIdValue });
      touched = true;
    }
    if (touched) device.updated_at = updatedAt;
  });

  return changes;
}

function listDevices(filters = {}) {
  return readData().then((data) => {
    const keyword = text(filters.keyword).toLowerCase();
    const rentLocations = latestRentLocations(data);
    const transactionsByDevice = transactionsByDeviceDesc(data);
    const scopedUser = filters.assigned_to_user_id ? findUser(data, filters.assigned_to_user_id) : null;
    const scopedDeviceIds = filters.assigned_to_user_id
      ? new Set(assignedDevicesForUser(data, scopedUser).map((device) => device.device_id))
      : null;
    return activeDevices(data).filter((device) => {
      if (scopedDeviceIds && !scopedDeviceIds.has(device.device_id)) return false;
      if (filters.status && device.status !== filters.status) return false;
      if (filters.category && !text(device.category).includes(filters.category)) return false;
      if (filters.location && !text(device.location).includes(filters.location)) return false;
      return true;
    }).map((device) => {
      const statusRows = currentStatusRowsFromList(device, transactionsByDevice.get(device.device_id) || []);
      return {
        ...device,
        rent_location: ["RENTED", "DELIVERED"].includes(device.status) ? text(device.current_rent_location) || rentLocations.get(device.device_id) || "" : "",
        current_status_memo: ["RENTED", "DELIVERED"].includes(device.status) ? text(device.current_process_memo) || firstStatusMemo(statusRows) : firstStatusMemo(statusRows),
        current_status_purpose: ["RENTED", "DELIVERED"].includes(device.status) ? text(device.current_purpose) || firstStatusPurpose(statusRows) : firstStatusPurpose(statusRows)
      };
    }).filter((device) => {
      if (!keyword) return true;
      return [
        device.device_id,
        device.legacy_device_id,
        device.device_name,
        device.category,
        device.manufacturer,
        device.model_name,
        device.serial_number,
        device.department,
        device.manager,
        device.location,
        device.current_borrower,
        device.rent_location,
        device.current_status_memo,
        device.current_status_purpose
      ].some((field) => text(field).toLowerCase().includes(keyword));
    });
  });
}

function getDevice(id) {
  return readData().then((data) => findDevice(data, id) || null);
}

function getDeviceDetail(id) {
  return readData().then((data) => {
    const device = findDevice(data, id);
    if (!device) return null;
    const transactions = attachTransactions(
      [...(data.Transactions || [])]
        .filter((row) => row.device_id === id)
        .sort(compareTransactionsDesc),
      data
    );
    return { device, transactions };
  });
}

function getNextDeviceId(category, modelName = "", capacityGb = "") {
  return readData().then((data) => nextDeviceId(data, prefixForDevice(data, category, modelName, capacityGb)));
}

function createDevice(input, options = {}) {
  return withWrite((data) => {
    if (!text(input.category) || !text(input.location)) {
      throw Object.assign(new Error("분류와 보관위치는 필수입니다."), { statusCode: 400 });
    }
    const created = now();
    const isLaptop = isLaptopCategory(input.category);
    const parsedModel = isLaptop ? { modelName: text(input.model_name), capacityGb: "" } : splitCapacityFromModel(input.model_name);
    const modelName = parsedModel.modelName;
    const capacityGb = isLaptop ? "" : normalizeCapacity(input.capacity_gb) || parsedModel.capacityGb;
    const prefix = prefixForDevice(data, input.category, modelName || input.model_name, capacityGb);
    const requestedId = text(input.device_id);
    const id = requestedId && requestedId.startsWith(`${prefix}-`) ? requestedId : nextDeviceId(data, prefix);
    if (!id) throw Object.assign(new Error("장비번호는 필수입니다."), { statusCode: 400 });
    if (findDevice(data, id)) throw Object.assign(new Error("이미 등록된 장비번호입니다."), { statusCode: 409 });
    const deviceName = deviceDisplayName(input.category, modelName) || [input.category, modelName, id].filter(Boolean).join(" ");
    const photoPaths = options.photoPaths?.length ? options.photoPaths : splitPaths(options.photoPath);
    const row = rowFor("Devices", {
      ...input,
      device_id: id,
      model_name: modelName,
      capacity_gb: capacityGb,
      purchase_date: normalizeDateInput(input.purchase_date),
      device_name: deviceName,
      status: input.status || "AVAILABLE",
      main_photo_path: photoPaths[0] || "",
      photo_paths: photoPaths.join(";"),
      qr_code_path: options.qrPath || publicQrPath(id),
      created_at: created,
      updated_at: created,
      is_deleted: false
    });
    data.Devices.push(row);
    transaction(data, {
      device_id: id,
      action_type: "REGISTER",
      before_status: "",
      after_status: row.status,
      photo_paths: photoPaths,
      handled_by: options.userId,
      memo: "장비 등록"
    });
    audit(data, { ...options, action: "REGISTER", targetType: "Device", targetId: id, beforeValue: {}, afterValue: row });
    return row;
  });
}

function listCategories() {
  return readData().then((data) =>
    activeCategories(data).sort((a, b) => text(a.category_name).localeCompare(text(b.category_name), "ko"))
  );
}

function createCategory(input, options = {}) {
  return withWrite((data) => {
    const name = text(input.category_name);
    const prefix = normalizePrefix(input.prefix);
    if (!name || !prefix) throw Object.assign(new Error("분류명과 접두어는 필수입니다."), { statusCode: 400 });
    if (activeCategories(data).some((category) => category.category_name === name)) {
      throw Object.assign(new Error("이미 등록된 분류명입니다."), { statusCode: 409 });
    }
    if (activeCategories(data).some((category) => normalizePrefix(category.prefix) === prefix)) {
      throw Object.assign(new Error("이미 사용 중인 접두어입니다."), { statusCode: 409 });
    }
    const created = now();
    const row = rowFor("Categories", {
      category_id: nextCategoryId(data),
      category_name: name,
      prefix,
      memo: input.memo || "",
      created_at: created,
      updated_at: created,
      is_deleted: false
    });
    data.Categories.push(row);
    audit(data, { ...options, action: "CREATE_CATEGORY", targetType: "Category", targetId: row.category_id, beforeValue: {}, afterValue: row });
    return row;
  });
}

function updateCategory(id, changes, options = {}) {
  return withWrite((data) => {
    const row = data.Categories.find((category) => category.category_id === id && !bool(category.is_deleted));
    if (!row) throw Object.assign(new Error("분류를 찾을 수 없습니다."), { statusCode: 404 });
    const before = { ...row };
    const nextName = changes.category_name !== undefined ? text(changes.category_name) : row.category_name;
    const nextPrefix = changes.prefix !== undefined ? normalizePrefix(changes.prefix) : normalizePrefix(row.prefix);
    if (!nextName || !nextPrefix) throw Object.assign(new Error("분류명과 접두어는 필수입니다."), { statusCode: 400 });
    if (activeCategories(data).some((category) => category.category_id !== id && category.category_name === nextName)) {
      throw Object.assign(new Error("이미 등록된 분류명입니다."), { statusCode: 409 });
    }
    if (activeCategories(data).some((category) => category.category_id !== id && normalizePrefix(category.prefix) === nextPrefix)) {
      throw Object.assign(new Error("이미 사용 중인 접두어입니다."), { statusCode: 409 });
    }
    row.category_name = nextName;
    row.prefix = nextPrefix;
    row.memo = changes.memo !== undefined ? changes.memo : row.memo;
    row.updated_at = now();
    const affectedDevices = activeDevices(data).filter((device) => device.category === before.category_name);
    affectedDevices.forEach((device) => {
      device.category = nextName;
    });
    activeDeviceTypes(data)
      .filter((type) => type.category_id === id || type.category_name === before.category_name)
      .forEach((type) => {
        type.category_id = id;
        type.category_name = nextName;
        type.updated_at = row.updated_at;
      });
    const idChanges = reassignDeviceNumbers(data, affectedDevices, row.updated_at);
    audit(data, { ...options, action: "UPDATE_CATEGORY", targetType: "Category", targetId: id, beforeValue: before, afterValue: row });
    if (idChanges.length) {
      audit(data, { ...options, action: "RENUMBER_DEVICES", targetType: "Category", targetId: id, beforeValue: before, afterValue: { category: row, idChanges } });
    }
    return row;
  });
}

function deleteCategory(id, options = {}) {
  return withWrite((data) => {
    const row = data.Categories.find((category) => category.category_id === id && !bool(category.is_deleted));
    if (!row) throw Object.assign(new Error("분류를 찾을 수 없습니다."), { statusCode: 404 });
    if (activeDevices(data).some((device) => device.category === row.category_name)) {
      throw Object.assign(new Error("사용 중인 분류는 삭제할 수 없습니다. 장비 분류를 먼저 변경해주세요."), { statusCode: 400 });
    }
    if (activeDeviceTypes(data).some((type) => type.category_id === id || type.category_name === row.category_name)) {
      throw Object.assign(new Error("모델명이 연결된 분류는 삭제할 수 없습니다. 모델명을 먼저 삭제해주세요."), { statusCode: 400 });
    }
    const before = { ...row };
    row.is_deleted = true;
    row.updated_at = now();
    audit(data, { ...options, action: "DELETE_CATEGORY", targetType: "Category", targetId: id, beforeValue: before, afterValue: row });
    return row;
  });
}

function listDeviceTypes(filters = {}) {
  return readData().then((data) => {
    let rows = activeDeviceTypes(data);
    if (filters.category_id) rows = rows.filter((row) => row.category_id === filters.category_id);
    if (filters.category_name) rows = rows.filter((row) => row.category_name === filters.category_name);
    rows.sort((a, b) => `${a.category_name} ${a.type_name}`.localeCompare(`${b.category_name} ${b.type_name}`, "ko"));
    return rows;
  });
}

function createDeviceType(input, options = {}) {
  return withWrite((data) => {
    const category = findCategory(data, input.category_id || input.category_name);
    if (!category) throw Object.assign(new Error("분류를 먼저 선택해주세요."), { statusCode: 400 });
    const typeName = text(input.type_name);
    if (!typeName) throw Object.assign(new Error("모델명은 필수입니다."), { statusCode: 400 });
    if (activeDeviceTypes(data).some((row) => row.category_id === category.category_id && row.type_name === typeName)) {
      throw Object.assign(new Error("이미 등록된 모델명입니다."), { statusCode: 409 });
    }
    const typePrefix = normalizePrefix(input.type_prefix || "");
    if (typePrefix && activeDeviceTypes(data).some((row) => row.category_id === category.category_id && normalizePrefix(row.type_prefix) === typePrefix)) {
      throw Object.assign(new Error("같은 분류에서 이미 사용 중인 모델명 접두어입니다."), { statusCode: 409 });
    }
    const created = now();
    const row = rowFor("DeviceTypes", {
      type_id: nextDeviceTypeId(data),
      category_id: category.category_id,
      category_name: category.category_name,
      type_name: typeName,
      type_prefix: typePrefix,
      memo: input.memo || "",
      created_at: created,
      updated_at: created,
      is_deleted: false
    });
    data.DeviceTypes.push(row);
    audit(data, { ...options, action: "CREATE_DEVICE_TYPE", targetType: "DeviceType", targetId: row.type_id, beforeValue: {}, afterValue: row });
    return row;
  });
}

function updateDeviceType(id, changes, options = {}) {
  return withWrite((data) => {
    const row = data.DeviceTypes.find((type) => type.type_id === id && !bool(type.is_deleted));
    if (!row) throw Object.assign(new Error("모델명을 찾을 수 없습니다."), { statusCode: 404 });
    const before = { ...row };
    const category = findCategory(data, changes.category_id || changes.category_name || row.category_id || row.category_name);
    if (!category) throw Object.assign(new Error("분류를 먼저 선택해주세요."), { statusCode: 400 });
    const typeName = changes.type_name !== undefined ? text(changes.type_name) : row.type_name;
    if (!typeName) throw Object.assign(new Error("모델명은 필수입니다."), { statusCode: 400 });
    if (activeDeviceTypes(data).some((type) => type.type_id !== id && type.category_id === category.category_id && type.type_name === typeName)) {
      throw Object.assign(new Error("이미 등록된 모델명입니다."), { statusCode: 409 });
    }
    const typePrefix = changes.type_prefix !== undefined ? normalizePrefix(changes.type_prefix) : normalizePrefix(row.type_prefix);
    if (typePrefix && activeDeviceTypes(data).some((type) => type.type_id !== id && type.category_id === category.category_id && normalizePrefix(type.type_prefix) === typePrefix)) {
      throw Object.assign(new Error("같은 분류에서 이미 사용 중인 모델명 접두어입니다."), { statusCode: 409 });
    }
    row.category_id = category.category_id;
    row.category_name = category.category_name;
    row.type_name = typeName;
    row.type_prefix = typePrefix;
    row.memo = changes.memo !== undefined ? changes.memo : row.memo;
    row.updated_at = now();
    const affectedDevices = activeDevices(data).filter((device) => device.category === before.category_name && device.model_name === before.type_name);
    affectedDevices.forEach((device) => {
      device.category = row.category_name;
      device.model_name = row.type_name;
    });
    const idChanges = reassignDeviceNumbers(data, affectedDevices, row.updated_at);
    audit(data, { ...options, action: "UPDATE_DEVICE_TYPE", targetType: "DeviceType", targetId: id, beforeValue: before, afterValue: row });
    if (idChanges.length) {
      audit(data, { ...options, action: "RENUMBER_DEVICES", targetType: "DeviceType", targetId: id, beforeValue: before, afterValue: { deviceType: row, idChanges } });
    }
    return row;
  });
}

function deleteDeviceType(id, options = {}) {
  return withWrite((data) => {
    const row = data.DeviceTypes.find((type) => type.type_id === id && !bool(type.is_deleted));
    if (!row) throw Object.assign(new Error("모델명을 찾을 수 없습니다."), { statusCode: 404 });
    if (activeDevices(data).some((device) => device.category === row.category_name && device.model_name === row.type_name)) {
      throw Object.assign(new Error("사용 중인 모델명은 삭제할 수 없습니다. 장비 모델명을 먼저 변경해주세요."), { statusCode: 400 });
    }
    const before = { ...row };
    row.is_deleted = true;
    row.updated_at = now();
    audit(data, { ...options, action: "DELETE_DEVICE_TYPE", targetType: "DeviceType", targetId: id, beforeValue: before, afterValue: row });
    return row;
  });
}

function listReasons(filters = {}) {
  return readData().then((data) => {
    let rows = activeReasons(data);
    if (filters.reason_type) rows = rows.filter((row) => row.reason_type === text(filters.reason_type).toUpperCase());
    rows.sort((a, b) => `${a.reason_type} ${a.reason_id}`.localeCompare(`${b.reason_type} ${b.reason_id}`, "ko"));
    return rows;
  });
}

function createReason(input, options = {}) {
  return withWrite((data) => {
    const reasonType = text(input.reason_type).toUpperCase();
    const reasonText = text(input.reason_text);
    if (!["RENT", "DELIVERY", "RETURN", "RECOVERY"].includes(reasonType)) throw Object.assign(new Error("사유 유형은 RENT, DELIVERY, RETURN, RECOVERY 중 하나여야 합니다."), { statusCode: 400 });
    if (!reasonText) throw Object.assign(new Error("사유명은 필수입니다."), { statusCode: 400 });
    if (activeReasons(data).some((row) => row.reason_type === reasonType && row.reason_text === reasonText)) {
      throw Object.assign(new Error("이미 등록된 사유입니다."), { statusCode: 409 });
    }
    const created = now();
    const row = rowFor("Reasons", {
      reason_id: nextReasonId(data),
      reason_type: reasonType,
      reason_text: reasonText,
      memo: input.memo || "",
      created_at: created,
      updated_at: created,
      is_deleted: false
    });
    data.Reasons.push(row);
    audit(data, { ...options, action: "CREATE_REASON", targetType: "Reason", targetId: row.reason_id, beforeValue: {}, afterValue: row });
    return row;
  });
}

function updateReason(id, changes, options = {}) {
  return withWrite((data) => {
    const row = data.Reasons.find((reason) => reason.reason_id === id && !bool(reason.is_deleted));
    if (!row) throw Object.assign(new Error("사유를 찾을 수 없습니다."), { statusCode: 404 });
    const before = { ...row };
    const reasonType = changes.reason_type !== undefined ? text(changes.reason_type).toUpperCase() : row.reason_type;
    const reasonText = changes.reason_text !== undefined ? text(changes.reason_text) : row.reason_text;
    if (!["RENT", "DELIVERY", "RETURN", "RECOVERY"].includes(reasonType)) throw Object.assign(new Error("사유 유형은 RENT, DELIVERY, RETURN, RECOVERY 중 하나여야 합니다."), { statusCode: 400 });
    if (!reasonText) throw Object.assign(new Error("사유명은 필수입니다."), { statusCode: 400 });
    if (activeReasons(data).some((reason) => reason.reason_id !== id && reason.reason_type === reasonType && reason.reason_text === reasonText)) {
      throw Object.assign(new Error("이미 등록된 사유입니다."), { statusCode: 409 });
    }
    row.reason_type = reasonType;
    row.reason_text = reasonText;
    row.memo = changes.memo !== undefined ? changes.memo : row.memo;
    row.updated_at = now();
    audit(data, { ...options, action: "UPDATE_REASON", targetType: "Reason", targetId: id, beforeValue: before, afterValue: row });
    return row;
  });
}

function deleteReason(id, options = {}) {
  return withWrite((data) => {
    const row = data.Reasons.find((reason) => reason.reason_id === id && !bool(reason.is_deleted));
    if (!row) throw Object.assign(new Error("사유를 찾을 수 없습니다."), { statusCode: 404 });
    const before = { ...row };
    row.is_deleted = true;
    row.updated_at = now();
    audit(data, { ...options, action: "DELETE_REASON", targetType: "Reason", targetId: id, beforeValue: before, afterValue: row });
    return row;
  });
}

function updateDevice(id, changes, options = {}) {
  return withWrite((data) => {
    const device = findDevice(data, id);
    if (!device) throw Object.assign(new Error("장비를 찾을 수 없습니다."), { statusCode: 404 });
    const before = { ...device };
    const protectedColumns = new Set([
      "device_id",
      "created_at",
      "updated_at",
      "is_deleted",
      "status",
      "current_borrower",
      "borrower_department",
      "borrowed_at",
      "expected_return_at",
      "last_returned_at",
      "last_checked_at",
      "main_photo_path",
      "photo_paths",
      "qr_code_path"
    ]);
    SHEETS.Devices.forEach((column) => {
      if (!protectedColumns.has(column) && changes[column] !== undefined) {
        device[column] = column === "purchase_date" ? normalizeDateInput(changes[column]) : changes[column];
      }
    });
    const isLaptop = isLaptopCategory(device.category);
    const parsedModel = isLaptop ? { modelName: text(device.model_name), capacityGb: "" } : splitCapacityFromModel(device.model_name);
    device.model_name = parsedModel.modelName;
    device.capacity_gb = isLaptop ? "" : normalizeCapacity(device.capacity_gb) || parsedModel.capacityGb;
    device.device_name = deviceDisplayName(device.category, device.model_name) || device.device_name;
    if (changes.keep_photo_paths !== undefined || options.photoPaths?.length || options.photoPath) {
      const currentPhotos = splitPaths(device.photo_paths || device.main_photo_path);
      const keptPhotos = changes.keep_photo_paths !== undefined ? splitPaths(changes.keep_photo_paths) : currentPhotos;
      const newPhotos = options.photoPaths?.length ? options.photoPaths : splitPaths(options.photoPath);
      const nextPhotos = [...new Set([...keptPhotos, ...newPhotos].filter(Boolean))].slice(0, 10);
      device.main_photo_path = nextPhotos[0] || "";
      device.photo_paths = nextPhotos.join(";");
    }
    device.updated_at = now();
    const idChanges = reassignDeviceNumbers(data, [device], device.updated_at);
    transaction(data, {
      device_id: device.device_id,
      action_type: "UPDATE",
      before_status: before.status,
      after_status: device.status,
      photo_paths: options.photoPaths?.length ? options.photoPaths : [],
      handled_by: options.userId,
      memo: deviceChangeMemo(before, device)
    });
    audit(data, { ...options, action: "UPDATE", targetType: "Device", targetId: device.device_id, beforeValue: before, afterValue: device });
    if (idChanges.length) {
      audit(data, { ...options, action: "RENUMBER_DEVICE", targetType: "Device", targetId: device.device_id, beforeValue: before, afterValue: { device, idChanges } });
    }
    return device;
  });
}

function disposeDevice(id, options = {}) {
  return withWrite((data) => {
    const device = findDevice(data, id);
    if (!device) throw Object.assign(new Error("장비를 찾을 수 없습니다."), { statusCode: 404 });
    if (device.status === "DELIVERED") {
      throw Object.assign(new Error("납품 상태 장비는 회수 처리 후 폐기할 수 있습니다."), { statusCode: 400 });
    }
    const before = { ...device };
    device.status = "DISPOSED";
    clearCurrentCheckoutSnapshot(device);
    device.updated_at = now();
    const reason = text(options.reason);
    transaction(data, {
      device_id: id,
      action_type: "DISPOSE",
      before_status: before.status,
      after_status: "DISPOSED",
      handled_by: options.userId,
      memo: reason ? `폐기 사유: ${reason}` : "폐기 처리"
    });
    notifyAdminsOfUserDeviceProcess(data, {
      device,
      before,
      actionType: "DISPOSE",
      options,
      details: [reason ? `사유: ${reason}` : ""]
    });
    audit(data, { ...options, action: "DISPOSE", targetType: "Device", targetId: id, beforeValue: before, afterValue: device });
    return device;
  });
}

function changeDeviceStatus(id, input = {}, photoPaths = [], options = {}) {
  return withWrite((data) => {
    const device = findDevice(data, id);
    if (!device) throw Object.assign(new Error("장비를 찾을 수 없습니다."), { statusCode: 404 });
    const nextStatus = text(input.status);
    const allowedStatuses = new Set(["AVAILABLE", "MAINTENANCE", "BROKEN", "LOST"]);
    if (!allowedStatuses.has(nextStatus)) throw Object.assign(new Error("변경할 상태가 올바르지 않습니다."), { statusCode: 400 });
    if (device.status === "DISPOSED") throw Object.assign(new Error("폐기 처리된 장비는 상태를 변경할 수 없습니다."), { statusCode: 400 });

    const before = { ...device };
    const reason = text(input.reason || input.memo);
    const actionType = text(input.action_type) || "STATUS_CHANGE";
    const statusNames = {
      AVAILABLE: "대여 가능",
      RENTED: "대여 중",
      DELIVERED: "납품",
      MAINTENANCE: "점검 중",
      BROKEN: "고장",
      LOST: "분실",
      DISPOSED: "폐기"
    };

    device.status = nextStatus;
    if (nextStatus === "AVAILABLE") {
      clearCurrentCheckoutSnapshot(device);
    }
    device.updated_at = now();

    const memoLabel = actionType === "LOST_FOUND" ? "찾음 처리" : `${statusNames[nextStatus] || nextStatus} 사유`;
    const trx = transaction(data, {
      device_id: id,
      action_type: actionType,
      purpose: reason,
      before_status: before.status,
      after_status: nextStatus,
      condition_status: statusNames[nextStatus] || nextStatus,
      issue_description: reason,
      photo_paths: photoPaths,
      handled_by: options.userId,
      memo: reason ? `${memoLabel}: ${reason}` : `${statusNames[nextStatus] || nextStatus} 상태 변경`
    });
    notifyAdminsOfUserDeviceProcess(data, {
      device,
      before,
      actionType,
      options,
      details: [reason ? `${memoLabel}: ${reason}` : ""]
    });
    audit(data, { ...options, action: actionType, targetType: "Device", targetId: id, beforeValue: before, afterValue: device });
    return device;
  });
}

function deleteDevice(id, options = {}) {
  return withWrite((data) => {
    const device = findDevice(data, id);
    if (!device) throw Object.assign(new Error("장비를 찾을 수 없습니다."), { statusCode: 404 });
    if (device.status !== "DISPOSED") {
      throw Object.assign(new Error("폐기 처리된 장비만 삭제할 수 있습니다."), { statusCode: 400 });
    }
    const before = { ...device };
    device.is_deleted = true;
    device.updated_at = now();
    const reason = text(options.reason);
    transaction(data, {
      device_id: id,
      action_type: "DELETE",
      before_status: before.status,
      after_status: device.status,
      handled_by: options.userId,
      memo: reason ? `삭제 사유: ${reason}` : "장비 삭제"
    });
    notifyAdminsOfUserDeviceProcess(data, {
      device,
      before,
      actionType: "DELETE",
      options,
      details: [reason ? `사유: ${reason}` : ""]
    });
    audit(data, { ...options, action: "DELETE", targetType: "Device", targetId: id, beforeValue: before, afterValue: device });
    return device;
  });
}

function hardDeleteDevice(id, options = {}) {
  return withWrite((data) => {
    const index = data.Devices.findIndex((device) => device.device_id === id);
    if (index < 0) throw Object.assign(new Error("장비를 찾을 수 없습니다."), { statusCode: 404 });
    const removed = data.Devices.splice(index, 1)[0];
    audit(data, { ...options, action: "HARD_DELETE", targetType: "Device", targetId: id, beforeValue: removed, afterValue: {} });
    return removed;
  });
}

function rentDevice(id, input, photoPaths = [], options = {}) {
  return withWrite((data) => {
    const device = findDevice(data, id);
    if (!device) throw Object.assign(new Error("장비를 찾을 수 없습니다."), { statusCode: 404 });
    const before = { ...device };
    const actionType = text(input.action_type).toUpperCase() === "DELIVERY" ? "DELIVERY" : "RENT";
    if (device.status !== "AVAILABLE") {
      throw Object.assign(new Error(`${actionType === "DELIVERY" ? "납품" : "대여"} 가능한 상태의 장비만 ${actionType === "DELIVERY" ? "납품" : "대여"}할 수 있습니다.`), { statusCode: 400 });
    }
    const actionLabel = actionType === "DELIVERY" ? "납품" : "대여";
    const rentedAt = input.rented_at || today();
    const type = borrowerType(input);
    const institution = type === "INSTITUTION" ? findInstitution(data, input.institution_id) || findInstitutionByName(data, input.institution_name || input.user_name) : null;
    if (type === "INSTITUTION" && !institution) {
      throw Object.assign(new Error("등록된 기관을 선택해주세요."), { statusCode: 400 });
    }
    const nextStatus = actionType === "DELIVERY" ? "DELIVERED" : "RENTED";
    const expectedReturnAt = actionType === "DELIVERY" ? "" : input.expected_return_at || "";
    const borrowerUser = type === "PERSON" ? findBorrowerUser(data, input) : null;
    const borrowerName = type === "INSTITUTION" ? institution?.institution_name || input.institution_name || input.user_name || "" : input.user_name || "";
    const borrowerOrganization = type === "INSTITUTION" ? "기관" : borrowerUser?.organization || input.user_organization || "";
    const borrowerDepartment = type === "INSTITUTION" ? "기관" : input.user_department || "";
    const borrowerPosition = type === "INSTITUTION" ? input.user_position || institution?.contact_person || "" : input.user_position || borrowerUser?.position || "";
    const borrowerContact = type === "INSTITUTION" ? input.user_contact || institution?.contact || "" : input.user_contact || "";
    device.status = nextStatus;
    applyCurrentCheckoutSnapshot(device, {
      borrowerName,
      borrowerType: type,
      institutionId: type === "INSTITUTION" ? institution?.institution_id || input.institution_id || "" : "",
      institutionName: type === "INSTITUTION" ? borrowerName : "",
      userOrganization: borrowerOrganization,
      userDepartment: borrowerDepartment,
      userPosition: borrowerPosition,
      userContact: borrowerContact,
      purpose: input.purpose,
      rentLocation: input.rent_location,
      conditionStatus: input.condition_status || "정상",
      memo: input.memo,
      sourceActionType: actionType,
      rentedAt,
      expectedReturnAt
    });
    device.updated_at = now();
    const trx = transaction(data, {
      device_id: id,
      action_type: actionType,
      borrower_type: type,
      institution_id: type === "INSTITUTION" ? institution?.institution_id || input.institution_id || "" : "",
      institution_name: type === "INSTITUTION" ? borrowerName : "",
      user_name: borrowerName,
      user_organization: borrowerOrganization,
      user_department: borrowerDepartment,
      user_position: borrowerPosition,
      user_contact: borrowerContact,
      purpose: input.purpose,
      rented_at: rentedAt,
      expected_return_at: expectedReturnAt,
      before_status: before.status,
      after_status: nextStatus,
      condition_status: input.condition_status || "정상",
      photo_paths: photoPaths,
      handled_by: options.userId,
      memo: [input.rent_location ? `${actionLabel} 장소: ${input.rent_location}` : "", input.memo || ""].filter(Boolean).join(" / ")
    });
    const recipient = borrowerUser;
    const handler = findUser(data, options.userId);
    const handlerIsAdmin = normalizeUserRole(handler?.role || (options.userId === "admin" ? "ADMIN" : "USER")) === "ADMIN";
    if (recipient && handlerIsAdmin && recipient.user_id !== text(options.userId)) {
      const assignedAt = now();
      const displayName = deviceDisplayName(device.category, device.model_name) || device.device_name || "장비";
      const row = rowFor("Notifications", {
        notification_id: nextNotificationId(data),
        recipient_user_id: recipient.user_id,
        sender_user_id: options.userId || "admin",
        type: "DEVICE_ASSIGNED",
        device_id: device.device_id,
        title: actionType === "DELIVERY" ? "장비 납품 안내" : "장비 할당 안내",
        message:
          actionType === "DELIVERY"
            ? `관리자가 ${device.device_id} ${displayName} 장비를 ${recipient.name}님에게 납품 처리했습니다.`
            : `관리자가 ${device.device_id} ${displayName} 장비를 ${recipient.name}님에게 할당했습니다.`,
        is_read: false,
        created_at: assignedAt,
        read_at: "",
        is_deleted: false
      });
      data.Notifications.push(row);
      audit(data, {
        ...options,
        action: "CREATE_ASSIGNMENT_NOTIFICATION",
        targetType: "Notification",
        targetId: row.notification_id,
        beforeValue: {},
        afterValue: row
      });
    }
    notifyAdminsOfUserDeviceProcess(data, {
      device,
      before,
      actionType,
      options,
      details: [
        borrowerName ? `대상: ${borrowerName}` : "",
        type === "INSTITUTION" ? "대상 구분: 기관" : "대상 구분: 개인",
        input.purpose ? `목적/사유: ${input.purpose}` : "",
        input.rent_location ? `${actionLabel} 장소: ${input.rent_location}` : "",
        rentedAt ? `${actionLabel}일: ${rentedAt}` : ""
      ]
    });
    audit(data, { ...options, action: actionType, targetType: "Device", targetId: id, beforeValue: before, afterValue: device });
    return { device, transaction: trx };
  });
}

function deliverDevice(id, input, photoPaths = [], options = {}) {
  return rentDevice(id, { ...input, action_type: "DELIVERY" }, photoPaths, options);
}

function updateRentalInfo(id, input = {}, photoPaths = [], options = {}) {
  return withWrite((data) => {
    const device = findDevice(data, id);
    if (!device) throw Object.assign(new Error("장비를 찾을 수 없습니다."), { statusCode: 404 });
    if (!["RENTED", "DELIVERED"].includes(device.status)) {
      throw Object.assign(new Error("대여 중 또는 납품 상태인 장비만 정보를 수정할 수 있습니다."), { statusCode: 400 });
    }

    const before = { ...device };
    const type = borrowerType({
      ...input,
      borrower_type: input.borrower_type || (before.borrower_department === "기관" ? "INSTITUTION" : "PERSON")
    });
    const institution = type === "INSTITUTION" ? findInstitution(data, input.institution_id) || findInstitutionByName(data, input.institution_name || input.user_name || before.current_borrower) : null;
    if (type === "INSTITUTION" && !institution) {
      throw Object.assign(new Error("등록된 기관을 선택해주세요."), { statusCode: 400 });
    }
    const borrowerUser = type === "PERSON" ? findBorrowerUser(data, input) : null;
    const borrowerName = type === "INSTITUTION" ? institution?.institution_name || input.institution_name || input.user_name || before.current_borrower || "" : input.user_name || before.current_borrower || "";
    const borrowerOrganization = type === "INSTITUTION" ? "기관" : borrowerUser?.organization || input.user_organization || "";
    const borrowerDepartment = type === "INSTITUTION" ? "기관" : input.user_department || borrowerUser?.department || before.borrower_department || "";
    const borrowerPosition = type === "INSTITUTION" ? input.user_position || institution?.contact_person || "" : input.user_position || borrowerUser?.position || "";
    const borrowerContact = type === "INSTITUTION" ? input.user_contact || institution?.contact || "" : input.user_contact || "";
    const rentedAt = input.rented_at || before.borrowed_at || today();
    const latestCheckout = [...(data.Transactions || [])]
      .filter((row) => row.device_id === id && ["DELIVERY", "RENT"].includes(row.action_type))
      .sort(compareTransactionsDesc)[0];
    const isDeliveryInfo =
      before.status === "DELIVERED" ||
      device.status === "DELIVERED" ||
      text(input.source_action_type).toUpperCase() === "DELIVERY" ||
      latestCheckout?.action_type === "DELIVERY";
    const expectedReturnAt = isDeliveryInfo ? "" : input.expected_return_at || "";

    applyCurrentCheckoutSnapshot(device, {
      borrowerName,
      borrowerType: type,
      institutionId: type === "INSTITUTION" ? institution?.institution_id || input.institution_id || "" : "",
      institutionName: type === "INSTITUTION" ? borrowerName : "",
      userOrganization: borrowerOrganization,
      userDepartment: borrowerDepartment,
      userPosition: borrowerPosition,
      userContact: borrowerContact,
      purpose: input.purpose || "",
      rentLocation: input.rent_location,
      conditionStatus: input.condition_status || "",
      memo: input.memo,
      sourceActionType: isDeliveryInfo ? "DELIVERY" : "RENT",
      rentedAt,
      expectedReturnAt
    });
    device.updated_at = now();

    const memoPrefix = isDeliveryInfo ? "납품 장소" : "대여 장소";
    const flowLabel = memoPrefix === "납품 장소" ? "납품" : "대여";
    const trx = transaction(data, {
      device_id: id,
      action_type: "RENTAL_UPDATE",
      borrower_type: type,
      institution_id: type === "INSTITUTION" ? institution?.institution_id || input.institution_id || "" : "",
      institution_name: type === "INSTITUTION" ? borrowerName : "",
      user_name: borrowerName,
      user_organization: borrowerOrganization,
      user_department: borrowerDepartment,
      user_position: borrowerPosition,
      user_contact: borrowerContact,
      purpose: input.purpose || "",
      rented_at: rentedAt,
      expected_return_at: expectedReturnAt,
      before_status: before.status,
      after_status: device.status,
      condition_status: input.condition_status || "",
      photo_paths: photoPaths,
      handled_by: options.userId,
      memo: [
        input.rent_location ? `${memoPrefix}: ${input.rent_location}` : "",
        input.memo || ""
      ].filter(Boolean).join(" / ")
    });
    notifyAdminsOfUserDeviceProcess(data, {
      device,
      before,
      actionType: "RENTAL_UPDATE",
      options,
      details: [
        borrowerName ? `대상: ${borrowerName}` : "",
        input.purpose ? `목적/사유: ${input.purpose}` : "",
        input.rent_location ? `${flowLabel} 장소: ${input.rent_location}` : "",
        `${flowLabel} 정보 수정`
      ]
    });
    audit(data, { ...options, action: "RENTAL_UPDATE", targetType: "Device", targetId: id, beforeValue: before, afterValue: device });
    return { device, transaction: trx };
  });
}

function returnDevice(id, input, photoPaths = [], options = {}) {
  return withWrite((data) => {
    const device = findDevice(data, id);
    if (!device) throw Object.assign(new Error("장비를 찾을 수 없습니다."), { statusCode: 404 });
    if (!["RENTED", "DELIVERED"].includes(device.status)) {
      throw Object.assign(new Error("대여 중 또는 납품 상태인 장비만 반납/회수 처리할 수 있습니다."), { statusCode: 400 });
    }
    const before = { ...device };
    const isRecovery = text(input.action_type).toUpperCase() === "RECOVERY" || before.status === "DELIVERED";
    const actionType = isRecovery ? "RECOVERY" : "RETURN";
    const actionLabel = isRecovery ? "회수" : "반납";
    const condition = input.condition_status || "정상";
    let after = "AVAILABLE";
    if (bool(input.has_issue) || condition !== "정상") after = "MAINTENANCE";
    if (["파손", "작동 불량"].includes(condition)) after = "BROKEN";
    if (condition === "분실") after = "LOST";
    if (input.status_after) {
      const requestedAfter = text(input.status_after);
      if (!["AVAILABLE", "MAINTENANCE", "BROKEN", "LOST"].includes(requestedAfter)) {
        throw Object.assign(new Error("반납/회수 후 상태가 올바르지 않습니다."), { statusCode: 400 });
      }
      after = requestedAfter;
    }
    const returnedAt = input.returned_at || today();
    const type = borrowerType({
      ...input,
      borrower_type: input.borrower_type || (before.borrower_department === "기관" ? "INSTITUTION" : "PERSON")
    });
    const institution = type === "INSTITUTION" ? findInstitution(data, input.institution_id) || findInstitutionByName(data, input.institution_name || input.user_name || before.current_borrower) : null;
    const borrowerName = type === "INSTITUTION" ? institution?.institution_name || input.institution_name || input.user_name || before.current_borrower || "" : input.user_name || before.current_borrower || "";
    const borrowerDepartment = type === "INSTITUTION" ? "기관" : input.user_department || before.borrower_department || "";
    const borrowerContact = type === "INSTITUTION" ? input.user_contact || institution?.contact || "" : input.user_contact || "";
    const borrowerUser = findBorrowerUser(data, {
      ...input,
      user_name: type === "PERSON" ? borrowerName : "",
      user_department: type === "PERSON" ? borrowerDepartment : ""
    });
    const borrowerOrganization = type === "INSTITUTION" ? "기관" : borrowerUser?.organization || input.user_organization || "";
    const borrowerPosition = type === "INSTITUTION" ? input.user_position || institution?.contact_person || "" : input.user_position || borrowerUser?.position || "";
    const returnRequestClosedAt = now();
    const closedRequests = activeNotifications(data).filter((notification) => {
      if (notification.type !== "RETURN_REQUEST") return false;
      if (notification.device_id !== id) return false;
      return !borrowerUser || notification.recipient_user_id === borrowerUser.user_id;
    });
    closedRequests.forEach((notification) => {
      notification.is_deleted = true;
      notification.read_at = notification.read_at || returnRequestClosedAt;
    });
    device.status = after;
    clearCurrentCheckoutSnapshot(device);
    device.last_returned_at = returnedAt;
    device.updated_at = now();
    const trx = transaction(data, {
      device_id: id,
      action_type: actionType,
      borrower_type: type,
      institution_id: type === "INSTITUTION" ? institution?.institution_id || input.institution_id || "" : "",
      institution_name: type === "INSTITUTION" ? borrowerName : "",
      user_name: borrowerName,
      user_organization: borrowerOrganization,
      user_department: borrowerDepartment,
      user_position: borrowerPosition,
      user_contact: borrowerContact,
      purpose: input.return_reason || input.purpose || "",
      returned_at: returnedAt,
      before_status: before.status,
      after_status: after,
      condition_status: condition,
      issue_description: input.issue_description,
      photo_paths: photoPaths,
      handled_by: options.userId,
      memo: [input.return_location ? `${actionLabel} 장소: ${input.return_location}` : "", input.memo || ""].filter(Boolean).join(" / ")
    });
    const handler = findUser(data, options.userId);
    const handlerIsAdmin = normalizeUserRole(handler?.role || (options.userId === "admin" ? "ADMIN" : "USER")) === "ADMIN";
    if (!handlerIsAdmin) {
      const returnedAtText = returnedAt || today();
      const displayName = deviceDisplayName(before.category, before.model_name) || before.device_name || "장비";
      const senderName = handler?.name || input.user_name || before.current_borrower || options.userId || "사용자";
      const admins = activeUsers(data).filter((user) => normalizeUserRole(user.role) === "ADMIN");
      const createdNotificationIds = [];
      admins.forEach((admin) => {
        if (admin.user_id === options.userId) return;
        const row = rowFor("Notifications", {
          notification_id: nextNotificationId(data),
          recipient_user_id: admin.user_id,
          sender_user_id: options.userId || "",
          type: "RETURN_COMPLETE",
          device_id: device.device_id,
          title: isRecovery ? "장비 회수 완료" : "장비 반납 완료",
          message: `${senderName}님이 ${device.device_id} ${displayName} 장비를 ${actionLabel}했습니다. ${actionLabel}일: ${returnedAtText}${input.return_location ? ` / ${actionLabel} 장소: ${input.return_location}` : ""}`,
          is_read: false,
          created_at: now(),
          read_at: "",
          is_deleted: false
        });
        data.Notifications.push(row);
        createdNotificationIds.push(row.notification_id);
      });
      if (createdNotificationIds.length) {
        audit(data, {
          ...options,
          action: "CREATE_RETURN_COMPLETE_NOTIFICATION",
          targetType: "Device",
          targetId: device.device_id,
          beforeValue: {},
          afterValue: { notification_ids: createdNotificationIds }
        });
      }
    }
    if (closedRequests.length) {
      audit(data, {
        ...options,
        action: "CLOSE_RETURN_REQUEST_NOTIFICATIONS",
        targetType: "Device",
        targetId: device.device_id,
        beforeValue: {},
        afterValue: { notification_ids: closedRequests.map((notification) => notification.notification_id) }
      });
    }
    audit(data, { ...options, action: actionType, targetType: "Device", targetId: id, beforeValue: before, afterValue: device });
    return { device, transaction: trx };
  });
}

function recoverDevice(id, input, photoPaths = [], options = {}) {
  return returnDevice(id, { ...input, action_type: "RECOVERY" }, photoPaths, options);
}

function listTransactions(filters = {}) {
  return readData().then((data) => {
    let rows = [...data.Transactions];
    const keyword = text(filters.keyword).toLowerCase();
    const deviceIds = text(filters.device_ids || "")
      .split(",")
      .map((id) => text(id))
      .filter(Boolean);
    if (filters.device_id) rows = rows.filter((row) => row.device_id === filters.device_id);
    if (deviceIds.length) rows = rows.filter((row) => deviceIds.includes(row.device_id));
    if (filters.action_type) rows = rows.filter((row) => row.action_type === filters.action_type);
    if (filters.actions) {
      const actionSet = new Set(String(filters.actions).split(",").map((action) => text(action)).filter(Boolean));
      rows = rows.filter((row) => actionSet.has(row.action_type));
    }
    if (filters.exclude_actions) {
      const excludedActionSet = new Set(String(filters.exclude_actions).split(",").map((action) => text(action)).filter(Boolean));
      rows = rows.filter((row) => !excludedActionSet.has(row.action_type));
    }
    if (filters.borrower_type) rows = rows.filter((row) => borrowerType(row) === text(filters.borrower_type).toUpperCase());
    if (filters.institution_id) rows = rows.filter((row) => text(row.institution_id) === text(filters.institution_id));
    if (filters.institution_name) rows = rows.filter((row) => text(row.institution_name || row.user_name).includes(text(filters.institution_name)));
    if (filters.user_name) rows = rows.filter((row) => text(row.user_name).includes(filters.user_name));
    if (filters.from) rows = rows.filter((row) => text(row.created_at).slice(0, 10) >= filters.from);
    if (filters.to) rows = rows.filter((row) => text(row.created_at).slice(0, 10) <= filters.to);
    rows = attachTransactions(rows, data);
    if (keyword) {
      rows = rows.filter((row) => Object.values(row).some((value) => text(value).toLowerCase().includes(keyword)));
    }
    rows.sort(compareTransactionsDesc);
    return rows;
  });
}

function getDeviceTransactions(id) {
  return listTransactions({ device_id: id });
}

function deleteTransaction(id, options = {}) {
  return withWrite((data) => {
    if (!isAdminActor(data, options.userId)) {
      throw Object.assign(new Error("이력 삭제는 관리자만 가능합니다."), { statusCode: 403 });
    }
    const index = (data.Transactions || []).findIndex((row) => row.transaction_id === id);
    if (index < 0) throw Object.assign(new Error("이력을 찾을 수 없습니다."), { statusCode: 404 });
    const target = data.Transactions[index];
    const device = findDevice(data, target.device_id);
    if (device && ["RENTED", "DELIVERED"].includes(device.status)) {
      const statusRows = currentStatusRowsFromList(device, deviceTransactionsDesc(data, device.device_id));
      const primaryRow = currentStatusPrimaryRow(statusRows);
      if (primaryRow?.transaction_id === target.transaction_id) {
        const values = checkoutSnapshotValuesFromTransaction(data, device, target);
        mergeCurrentCheckoutSnapshot(device, values);
        device.updated_at = now();
      }
    }
    const removed = data.Transactions.splice(index, 1)[0];
    audit(data, {
      ...options,
      action: "DELETE_TRANSACTION",
      targetType: "Transaction",
      targetId: id,
      beforeValue: removed,
      afterValue: {}
    });
    return removed;
  });
}

function listMaintenance(filters = {}) {
  return readData().then((data) => {
    let rows = [...data.Maintenance];
    if (filters.device_id) rows = rows.filter((row) => row.device_id === filters.device_id);
    if (filters.maintenance_type) rows = rows.filter((row) => row.maintenance_type === filters.maintenance_type);
    rows.sort((a, b) => text(b.created_at).localeCompare(text(a.created_at)));
    return attachDevice(rows, data.Devices);
  });
}

function addMaintenance(id, input, photoPaths = [], options = {}) {
  return withWrite((data) => {
    const device = findDevice(data, id);
    if (!device) throw Object.assign(new Error("장비를 찾을 수 없습니다."), { statusCode: 404 });
    const before = { ...device };
    const checkedAt = input.checked_at || today();
    const statusAfter = text(input.status_after);
    if (statusAfter && !["AVAILABLE", "MAINTENANCE", "BROKEN", "LOST"].includes(statusAfter)) {
      throw Object.assign(new Error("점검 후 상태가 올바르지 않습니다."), { statusCode: 400 });
    }
    const row = rowFor("Maintenance", {
      maintenance_id: nextMaintenanceId(data),
      device_id: id,
      maintenance_type: input.maintenance_type || "정기점검",
      checked_by: input.checked_by || options.userId || "admin",
      checked_at: checkedAt,
      result: input.result,
      issue_level: input.issue_level,
      action_taken: input.action_taken,
      next_check_at: input.next_check_at,
      photo_paths: Array.isArray(photoPaths) ? photoPaths.join(";") : photoPaths || "",
      status_after: statusAfter || device.status,
      memo: input.memo,
      created_at: now()
    });
    data.Maintenance.push(row);
    device.last_checked_at = checkedAt;
    if (statusAfter) device.status = statusAfter;
    device.updated_at = now();
    const actionType = text(input.action_type) || "MAINTENANCE";
    const trx = transaction(data, {
      device_id: id,
      action_type: actionType,
      before_status: before.status,
      after_status: device.status,
      condition_status: input.result,
      issue_description: input.action_taken,
      photo_paths: photoPaths,
      handled_by: options.userId,
      memo: input.memo || input.maintenance_type || "점검 등록"
    });
    notifyAdminsOfUserDeviceProcess(data, {
      device,
      before,
      actionType,
      options,
      details: [
        input.maintenance_type ? `점검 유형: ${input.maintenance_type}` : "",
        input.result ? `결과: ${input.result}` : "",
        input.action_taken ? `조치: ${input.action_taken}` : "",
        statusAfter ? `점검 후 상태: ${deviceStatusLabel(statusAfter)}` : "",
        input.memo ? `메모: ${input.memo}` : ""
      ]
    });
    audit(data, { ...options, action: "MAINTENANCE", targetType: "Device", targetId: id, beforeValue: before, afterValue: device });
    return row;
  });
}

function updateMaintenance(id, changes, options = {}) {
  return withWrite((data) => {
    const row = data.Maintenance.find((item) => item.maintenance_id === id);
    if (!row) throw Object.assign(new Error("점검 이력을 찾을 수 없습니다."), { statusCode: 404 });
    const before = { ...row };
    SHEETS.Maintenance.forEach((column) => {
      if (!["maintenance_id", "created_at"].includes(column) && changes[column] !== undefined) row[column] = changes[column];
    });
    audit(data, { ...options, action: "UPDATE_MAINTENANCE", targetType: "Maintenance", targetId: id, beforeValue: before, afterValue: row });
    return row;
  });
}

function getDashboardSummary() {
  return readData().then((data) => {
    const devices = activeDevices(data);
    const live = devices.filter((device) => device.status !== "DISPOSED");
    return {
      total: live.length,
      available: live.filter((device) => device.status === "AVAILABLE").length,
      rented: live.filter((device) => device.status === "RENTED").length,
      delivered: live.filter((device) => device.status === "DELIVERED").length,
      maintenance: live.filter((device) => device.status === "MAINTENANCE").length,
      broken: live.filter((device) => device.status === "BROKEN").length,
      lost: live.filter((device) => device.status === "LOST").length,
      disposed: devices.filter((device) => device.status === "DISPOSED").length
    };
  });
}

function getRecentTransactions(limit = 10) {
  return listTransactions({ exclude_actions: "RETURN,RECOVERY" }).then((rows) => rows.slice(0, limit));
}

function searchDevices(keyword) {
  return listDevices({ keyword });
}

function listUserOptions(filters = {}) {
  return readData().then((data) => {
    let rows = activeUserOptions(data);
    if (filters.option_type) rows = rows.filter((row) => row.option_type === userOptionType(filters.option_type));
    rows.sort((a, b) => {
      const typeCompare = text(a.option_type).localeCompare(text(b.option_type));
      if (typeCompare) return typeCompare;
      if (a.option_type === "POSITION" && b.option_type === "POSITION") {
        const order = defaultPositionOptions();
        const aIndex = order.indexOf(a.option_text);
        const bIndex = order.indexOf(b.option_text);
        if (aIndex !== -1 || bIndex !== -1) {
          return (aIndex === -1 ? order.length : aIndex) - (bIndex === -1 ? order.length : bIndex);
        }
      }
      return text(a.option_text).localeCompare(text(b.option_text), "ko");
    });
    return rows;
  });
}

function createUserOption(input, options = {}) {
  return withWrite((data) => {
    const optionType = userOptionType(input.option_type);
    const optionText = text(input.option_text);
    if (!optionText) throw Object.assign(new Error("항목명은 필수입니다."), { statusCode: 400 });
    if (activeUserOptions(data).some((option) => option.option_type === optionType && option.option_text === optionText)) {
      throw Object.assign(new Error("이미 등록된 항목입니다."), { statusCode: 409 });
    }
    const created = now();
    const row = rowFor("UserOptions", {
      option_id: nextUserOptionId(data),
      option_type: optionType,
      option_text: optionText,
      memo: input.memo || "",
      created_at: created,
      updated_at: created,
      is_deleted: false
    });
    data.UserOptions.push(row);
    audit(data, { ...options, action: "CREATE_USER_OPTION", targetType: "UserOption", targetId: row.option_id, beforeValue: {}, afterValue: row });
    return row;
  });
}

function updateUserOption(id, changes, options = {}) {
  return withWrite((data) => {
    const row = data.UserOptions.find((option) => option.option_id === id && !bool(option.is_deleted));
    if (!row) throw Object.assign(new Error("사용자 항목을 찾을 수 없습니다."), { statusCode: 404 });
    const before = { ...row };
    const optionType = changes.option_type !== undefined ? userOptionType(changes.option_type) : row.option_type;
    const optionText = changes.option_text !== undefined ? text(changes.option_text) : row.option_text;
    if (!optionText) throw Object.assign(new Error("항목명은 필수입니다."), { statusCode: 400 });
    if (activeUserOptions(data).some((option) => option.option_id !== id && option.option_type === optionType && option.option_text === optionText)) {
      throw Object.assign(new Error("이미 등록된 항목입니다."), { statusCode: 409 });
    }
    row.option_type = optionType;
    row.option_text = optionText;
    row.memo = changes.memo !== undefined ? changes.memo : row.memo;
    row.updated_at = now();

    if (before.option_type === row.option_type && before.option_text !== row.option_text) {
      const field = row.option_type === "POSITION" ? "position" : row.option_type === "ORGANIZATION" ? "organization" : "department";
      activeUsers(data).forEach((user) => {
        if (user[field] === before.option_text) {
          user[field] = row.option_text;
          user.updated_at = row.updated_at;
        }
      });
    }

    audit(data, { ...options, action: "UPDATE_USER_OPTION", targetType: "UserOption", targetId: id, beforeValue: before, afterValue: row });
    return row;
  });
}

function deleteUserOption(id, options = {}) {
  return withWrite((data) => {
    const row = data.UserOptions.find((option) => option.option_id === id && !bool(option.is_deleted));
    if (!row) throw Object.assign(new Error("사용자 항목을 찾을 수 없습니다."), { statusCode: 404 });
    const field = row.option_type === "POSITION" ? "position" : row.option_type === "ORGANIZATION" ? "organization" : "department";
    if (activeUsers(data).some((user) => user[field] === row.option_text)) {
      throw Object.assign(new Error("사용 중인 항목은 삭제할 수 없습니다. 사용자 정보를 먼저 변경해주세요."), { statusCode: 400 });
    }
    const before = { ...row };
    row.is_deleted = true;
    row.updated_at = now();
    audit(data, { ...options, action: "DELETE_USER_OPTION", targetType: "UserOption", targetId: id, beforeValue: before, afterValue: row });
    return row;
  });
}

function listInstitutions(filters = {}) {
  return readData().then((data) => {
    const keyword = text(filters.keyword).toLowerCase();
    return activeInstitutions(data)
      .filter((institution) => {
        if (!keyword) return true;
        return [
          institution.institution_id,
          institution.institution_name,
          institution.contact_person,
          institution.contact,
          institution.email,
          institution.address,
          institution.memo
        ].some((field) => text(field).toLowerCase().includes(keyword));
      })
      .map((institution) => institutionSummary(data, institution))
      .sort((a, b) => text(a.institution_name).localeCompare(text(b.institution_name), "ko", { numeric: true }));
  });
}

function getInstitution(institutionId) {
  return readData().then((data) => {
    const institution = findInstitution(data, institutionId);
    if (!institution) return null;
    return institutionSummary(data, institution);
  });
}

function createInstitution(input, options = {}) {
  return withWrite((data) => {
    const institutionName = text(input.institution_name);
    if (!institutionName) {
      throw Object.assign(new Error("기관명을 입력해주세요."), { statusCode: 400 });
    }
    if (activeInstitutions(data).some((institution) => text(institution.institution_name) === institutionName)) {
      throw Object.assign(new Error("이미 등록된 기관명입니다."), { statusCode: 409 });
    }
    const created = now();
    const institution = rowFor("Institutions", {
      ...input,
      institution_id: nextInstitutionId(data),
      institution_name: institutionName,
      contact: formatPhoneNumber(input.contact || ""),
      created_at: created,
      updated_at: created,
      is_deleted: false
    });
    data.Institutions.push(institution);
    audit(data, { ...options, action: "CREATE_INSTITUTION", targetType: "Institution", targetId: institution.institution_id, beforeValue: {}, afterValue: institution });
    return institutionSummary(data, institution);
  });
}

function updateInstitution(institutionId, changes, options = {}) {
  return withWrite((data) => {
    const institution = findInstitution(data, institutionId);
    if (!institution) throw Object.assign(new Error("기관을 찾을 수 없습니다."), { statusCode: 404 });
    const before = { ...institution };
    const nextName = changes.institution_name !== undefined ? text(changes.institution_name) : text(institution.institution_name);
    if (!nextName) {
      throw Object.assign(new Error("기관명을 입력해주세요."), { statusCode: 400 });
    }
    if (activeInstitutions(data).some((row) => row.institution_id !== institution.institution_id && text(row.institution_name) === nextName)) {
      throw Object.assign(new Error("이미 등록된 기관명입니다."), { statusCode: 409 });
    }
    SHEETS.Institutions.forEach((column) => {
      if (["institution_id", "created_at", "is_deleted"].includes(column)) return;
      if (changes[column] === undefined) return;
      institution[column] = column === "contact" ? formatPhoneNumber(changes[column] || "") : changes[column];
    });
    institution.institution_name = nextName;
    institution.updated_at = now();

    const oldName = text(before.institution_name);
    if (oldName !== text(institution.institution_name)) {
      activeDevices(data).forEach((device) => {
        if (!["RENTED", "DELIVERED"].includes(device.status)) return;
        if (text(device.borrower_department) !== "기관") return;
        if (text(device.current_borrower) !== oldName) return;
        device.current_borrower = institution.institution_name;
        device.current_institution_id = institution.institution_id;
        device.current_institution_name = institution.institution_name;
        device.current_user_organization = "기관";
        device.current_user_position = device.current_user_position || institution.contact_person || "";
        device.current_user_contact = institution.contact || device.current_user_contact || "";
        device.updated_at = institution.updated_at;
      });
    }

    data.Transactions.forEach((row) => {
      const matchesId = text(row.institution_id) === institution.institution_id;
      const matchesName =
        borrowerType(row) === "INSTITUTION" &&
        (text(row.institution_name) === oldName || text(row.user_name) === oldName);
      if (!matchesId && !matchesName) return;
      row.institution_id = institution.institution_id;
      row.institution_name = institution.institution_name;
      row.user_name = institution.institution_name;
      row.user_organization = "기관";
      row.user_department = "기관";
      row.user_position = row.user_position || institution.contact_person || "";
      row.user_contact = institution.contact || row.user_contact || "";
    });

    audit(data, { ...options, action: "UPDATE_INSTITUTION", targetType: "Institution", targetId: institution.institution_id, beforeValue: before, afterValue: institution });
    return institutionSummary(data, institution);
  });
}

function deleteInstitution(institutionId, options = {}) {
  return withWrite((data) => {
    const institution = findInstitution(data, institutionId);
    if (!institution) throw Object.assign(new Error("기관을 찾을 수 없습니다."), { statusCode: 404 });
    const summary = institutionSummary(data, institution);
    if (summary.assigned_count > 0) {
      throw Object.assign(new Error("대여 중 또는 납품 상태인 장비가 있는 기관은 삭제할 수 없습니다. 먼저 반납/회수 처리해주세요."), { statusCode: 400 });
    }
    const before = { ...institution };
    institution.is_deleted = true;
    institution.updated_at = now();
    audit(data, { ...options, action: "DELETE_INSTITUTION", targetType: "Institution", targetId: institution.institution_id, beforeValue: before, afterValue: institution });
    return { success: true };
  });
}

function listUsers(filters = {}) {
  return readData().then((data) => {
    const keyword = text(filters.keyword).toLowerCase();
    return activeUsers(data)
      .filter((user) => {
        if (!keyword) return true;
        return [user.user_id, user.name, user.role, user.organization, user.department, user.position, user.contact, user.email]
          .some((field) => text(field).toLowerCase().includes(keyword));
      })
      .map((user) => {
        const summary = attachUserSummary(data, user);
        return { ...summary, password: "" };
      });
  });
}

function getUser(userId) {
  return readData().then((data) => {
    const user = findUser(data, userId);
    if (!user) return null;
    const transactions = data.Transactions
      .filter((row) => row.user_name === user.name || row.handled_by === user.user_id)
      .sort(compareTransactionsDesc);
    return {
      ...attachUserSummary(data, user),
      password: "",
      transactions: attachTransactions(transactions, data).slice(0, 20)
    };
  });
}

function attachNotificationSummary(rows, data) {
  const rentLocations = latestRentLocations(data);
  return rows.map((row) => {
    const device = findDevice(data, row.device_id) || (data.Devices || []).find((item) => item.device_id === row.device_id) || {};
    const sender = findUser(data, row.sender_user_id) || {};
    return {
      ...row,
      is_read: bool(row.is_read),
      sender_name: sender.name || row.sender_user_id || "",
      device_name: device.device_name || "",
      category: device.category || "",
      model_name: device.model_name || "",
      capacity_gb: device.capacity_gb || "",
      status: device.status || "",
      current_borrower: device.current_borrower || "",
      rent_location: rentLocations.get(row.device_id) || ""
    };
  });
}

function latestReturnTransaction(data, deviceId) {
  return (data.Transactions || [])
    .filter((row) => row.device_id === deviceId && row.action_type === "RETURN")
    .sort(compareTransactionsDesc)[0];
}

function latestReturnTransactionsByDevice(data) {
  const latest = new Map();
  (data.Transactions || [])
    .filter((row) => row.action_type === "RETURN")
    .sort(compareTransactionsDesc)
    .forEach((row) => {
      if (!latest.has(row.device_id)) latest.set(row.device_id, row);
    });
  return latest;
}

function isLiveReturnRequestNotification(data, notification, latestReturnByDevice = null) {
  if (notification.type !== "RETURN_REQUEST") return true;
  const device = findDevice(data, notification.device_id);
  if (!device || device.status !== "RENTED") return false;
  const latestReturn = latestReturnByDevice?.get(notification.device_id) || latestReturnTransaction(data, notification.device_id);
  if (latestReturn && text(notification.created_at) && text(notification.created_at) <= text(latestReturn.created_at)) return false;
  const recipient = findUser(data, notification.recipient_user_id);
  if (!recipient) return false;
  const borrowerName = text(device.current_borrower);
  if (borrowerName && borrowerName !== text(recipient.name)) return false;
  const borrowerDepartment = text(device.borrower_department);
  if (borrowerDepartment && text(recipient.department) && borrowerDepartment !== text(recipient.department)) return false;
  return true;
}

function canDeleteNotification(data, notification) {
  return notification.type !== "RETURN_REQUEST" || !isLiveReturnRequestNotification(data, notification);
}

function listNotifications(filters = {}) {
  return readData().then((data) => {
    const recipientUserId = text(filters.userId || filters.recipient_user_id);
    const dashboardScope = text(filters.scope) === "dashboard";
    const actor = findUser(data, recipientUserId);
    const actorIsAdmin = normalizeUserRole(actor?.role || (recipientUserId === "admin" ? "ADMIN" : "USER")) === "ADMIN";
    let rows = activeNotifications(data);
    if (dashboardScope && recipientUserId) {
      rows = rows.filter((row) => {
        if (row.recipient_user_id === recipientUserId) return true;
        if (!actorIsAdmin) return false;
        return row.type === "RETURN_REQUEST" && isAdminActor(data, row.sender_user_id);
      });
    } else if (recipientUserId) {
      rows = rows.filter((row) => row.recipient_user_id === recipientUserId);
    }
    const latestReturnByDevice = latestReturnTransactionsByDevice(data);
    rows = rows.filter((row) => isLiveReturnRequestNotification(data, row, latestReturnByDevice));
    if (bool(filters.unread_only)) rows = rows.filter((row) => !bool(row.is_read));
    rows.sort((a, b) => text(b.created_at).localeCompare(text(a.created_at)));
    return attachNotificationSummary(rows, data);
  });
}

function createReturnRequestNotification(input, options = {}) {
  return withWrite((data) => {
    const recipient = findUser(data, input.recipient_user_id);
    if (!recipient) throw Object.assign(new Error("사용자를 찾을 수 없습니다."), { statusCode: 404 });
    const device = findDevice(data, input.device_id);
    if (!device) throw Object.assign(new Error("장비를 찾을 수 없습니다."), { statusCode: 404 });
    if (device.status !== "RENTED") {
      throw Object.assign(new Error("대여 중인 장비에만 반납 요청을 보낼 수 있습니다."), { statusCode: 400 });
    }
    const borrowerName = text(device.current_borrower);
    const borrowerDepartment = text(device.borrower_department);
    if (borrowerName && borrowerName !== text(recipient.name)) {
      throw Object.assign(new Error("선택한 사용자에게 할당된 장비가 아닙니다."), { statusCode: 400 });
    }
    if (borrowerDepartment && text(recipient.department) && borrowerDepartment !== text(recipient.department)) {
      throw Object.assign(new Error("선택한 사용자의 부서와 장비 할당 부서가 다릅니다."), { statusCode: 400 });
    }

    const sender = findUser(data, options.userId) || {};
    const created = now();
    const message =
      text(input.message) ||
      `${device.device_id} ${deviceDisplayName(device)} 장비 반납을 요청드립니다. 확인 후 반납 절차를 진행해주세요.`;
    const row = rowFor("Notifications", {
      notification_id: nextNotificationId(data),
      recipient_user_id: recipient.user_id,
      sender_user_id: options.userId || "admin",
      type: "RETURN_REQUEST",
      device_id: device.device_id,
      title: "장비 반납 요청",
      message,
      is_read: false,
      created_at: created,
      read_at: "",
      is_deleted: false
    });
    data.Notifications.push(row);
    audit(data, {
      ...options,
      action: "CREATE_RETURN_REQUEST",
      targetType: "Notification",
      targetId: row.notification_id,
      beforeValue: {},
      afterValue: { ...row, sender_name: sender.name || options.userId || "admin" }
    });
    return attachNotificationSummary([row], data)[0];
  });
}

function cancelReturnRequestNotification(input, options = {}) {
  return withWrite((data) => {
    const recipient = findUser(data, input.recipient_user_id);
    if (!recipient) throw Object.assign(new Error("사용자를 찾을 수 없습니다."), { statusCode: 404 });
    const device = findDevice(data, input.device_id);
    if (!device) throw Object.assign(new Error("장비를 찾을 수 없습니다."), { statusCode: 404 });
    const rows = activeNotifications(data).filter(
      (notification) =>
        notification.type === "RETURN_REQUEST" &&
        notification.recipient_user_id === recipient.user_id &&
        notification.device_id === device.device_id
    );
    const cancelledAt = now();
    rows.forEach((row) => {
      row.is_deleted = true;
      row.read_at = row.read_at || cancelledAt;
    });
    audit(data, {
      ...options,
      action: "CANCEL_RETURN_REQUEST",
      targetType: "Device",
      targetId: device.device_id,
      beforeValue: {},
      afterValue: { recipient_user_id: recipient.user_id, count: rows.length }
    });
    return { success: true, count: rows.length };
  });
}

function markNotificationRead(notificationId, options = {}) {
  return withWrite((data) => {
    const id = text(notificationId);
    const row = activeNotifications(data).find((notification) => notification.notification_id === id);
    if (!row) throw Object.assign(new Error("알림을 찾을 수 없습니다."), { statusCode: 404 });
    row.is_read = true;
    row.read_at = row.read_at || now();
    audit(data, { ...options, action: "READ_NOTIFICATION", targetType: "Notification", targetId: id, beforeValue: {}, afterValue: row });
    return attachNotificationSummary([row], data)[0];
  });
}

function markNotificationsRead(userId, options = {}) {
  return withWrite((data) => {
    const targetUserId = text(userId);
    const readAt = now();
    const rows = activeNotifications(data).filter((row) => row.recipient_user_id === targetUserId && !bool(row.is_read));
    rows.forEach((row) => {
      row.is_read = true;
      row.read_at = row.read_at || readAt;
    });
    audit(data, { ...options, action: "READ_ALL_NOTIFICATIONS", targetType: "User", targetId: targetUserId, beforeValue: {}, afterValue: { count: rows.length } });
    return { success: true, count: rows.length };
  });
}

function deleteNotification(notificationId, options = {}) {
  return withWrite((data) => {
    const id = text(notificationId);
    const row = activeNotifications(data).find((notification) => notification.notification_id === id);
    if (!row) throw Object.assign(new Error("알림을 찾을 수 없습니다."), { statusCode: 404 });
    const actorId = text(options.userId);
    if (row.recipient_user_id !== actorId && !isAdminActor(data, actorId)) {
      throw Object.assign(new Error("알림을 삭제할 권한이 없습니다."), { statusCode: 403 });
    }
    if (!canDeleteNotification(data, row)) {
      throw Object.assign(new Error("처리되지 않은 요청 알림은 삭제할 수 없습니다."), { statusCode: 400 });
    }
    row.is_deleted = true;
    row.is_read = true;
    row.read_at = row.read_at || now();
    audit(data, { ...options, action: "DELETE_NOTIFICATION", targetType: "Notification", targetId: id, beforeValue: {}, afterValue: row });
    return { success: true, notification_id: id };
  });
}

function deleteDeletableNotifications(userId, options = {}) {
  return withWrite((data) => {
    const targetUserId = text(userId);
    const deletedAt = now();
    const rows = activeNotifications(data).filter(
      (row) => row.recipient_user_id === targetUserId && canDeleteNotification(data, row)
    );
    rows.forEach((row) => {
      row.is_deleted = true;
      row.is_read = true;
      row.read_at = row.read_at || deletedAt;
    });
    audit(data, {
      ...options,
      action: "DELETE_DELETABLE_NOTIFICATIONS",
      targetType: "User",
      targetId: targetUserId,
      beforeValue: {},
      afterValue: { count: rows.length, notification_ids: rows.map((row) => row.notification_id) }
    });
    return { success: true, count: rows.length };
  });
}

function createUser(input, options = {}) {
  return withWrite((data) => {
    const userId = text(input.user_id);
    if (!userId || !text(input.password) || !text(input.name)) {
      throw Object.assign(new Error("사용자 ID, 비밀번호, 이름은 필수입니다."), { statusCode: 400 });
    }
    if (activeUsers(data).some((user) => user.user_id === userId)) {
      throw Object.assign(new Error("이미 등록된 사용자 ID입니다."), { statusCode: 409 });
    }
    const requestedRole = normalizeUserRole(input.role || "USER");
    if (requestedRole === "ADMIN" && !isAdminActor(data, options.userId)) {
      throw Object.assign(new Error("권한 설정은 관리자만 변경할 수 있습니다."), { statusCode: 403 });
    }
    const created = now();
    const user = rowFor("Users", {
      ...input,
      user_id: userId,
      password: hashPassword(input.password),
      role: requestedRole,
      created_at: created,
      updated_at: created,
      is_deleted: false
    });
    data.Users.push(user);
    audit(data, { ...options, action: "CREATE_USER", targetType: "User", targetId: userId, beforeValue: {}, afterValue: { ...user, password: "" } });
    return { ...attachUserSummary(data, user), password: "" };
  });
}

function updateUser(userId, changes, options = {}) {
  return withWrite((data) => {
    const user = findUser(data, userId);
    if (!user) throw Object.assign(new Error("사용자를 찾을 수 없습니다."), { statusCode: 404 });
    const before = { ...user };
    const currentRole = normalizeUserRole(user.role);
    const requestedRole = changes.role !== undefined ? normalizeUserRole(changes.role) : currentRole;
    const roleWillChange = requestedRole !== currentRole;
    if (roleWillChange && !isAdminActor(data, options.userId)) {
      throw Object.assign(new Error("권한 설정은 관리자만 변경할 수 있습니다."), { statusCode: 403 });
    }
    if (user.user_id === "admin" && requestedRole !== "ADMIN") {
      throw Object.assign(new Error("기본 관리자(admin) 계정의 권한은 변경할 수 없습니다."), { statusCode: 400 });
    }
    if (currentRole === "ADMIN" && requestedRole !== "ADMIN") {
      const activeAdminCount = activeUsers(data).filter((row) => normalizeUserRole(row.role) === "ADMIN").length;
      if (activeAdminCount <= 1) {
        throw Object.assign(new Error("최소 한 명의 관리자는 반드시 유지되어야 합니다."), { statusCode: 400 });
      }
    }
    SHEETS.Users.forEach((column) => {
      if (["user_id", "created_at", "is_deleted"].includes(column)) return;
      if (changes[column] === undefined) return;
      if (column === "password" && !text(changes[column])) return;
      user[column] =
        column === "role"
          ? normalizeUserRole(changes[column])
          : column === "password"
          ? hashPassword(changes[column])
          : changes[column];
    });
    user.updated_at = now();

    if (before.name !== user.name || before.department !== user.department) {
      activeDevices(data).forEach((device) => {
        if (!["RENTED", "DELIVERED"].includes(device.status)) return;
        if (device.current_borrower !== before.name) return;
        if (before.department && device.borrower_department && device.borrower_department !== before.department) return;
        device.current_borrower = user.name;
        device.borrower_department = user.department;
        device.current_user_organization = user.organization || device.current_user_organization || "";
        device.current_user_position = user.position || device.current_user_position || "";
        device.current_user_contact = user.contact || device.current_user_contact || "";
        device.updated_at = user.updated_at;
      });
    }

    if (normalizeUserRole(before.role) !== normalizeUserRole(user.role)) {
      const created = now();
      const row = rowFor("Notifications", {
        notification_id: nextNotificationId(data),
        recipient_user_id: user.user_id,
        sender_user_id: options.userId || "admin",
        type: "ROLE_CHANGE",
        device_id: "",
        title: "권한 변경 안내",
        message: `계정 권한이 ${userRoleLabel(before.role)}에서 ${userRoleLabel(user.role)}(으)로 변경되었습니다.`,
        is_read: false,
        created_at: created,
        read_at: "",
        is_deleted: false
      });
      data.Notifications.push(row);
      audit(data, {
        ...options,
        action: "CREATE_ROLE_CHANGE_NOTIFICATION",
        targetType: "Notification",
        targetId: row.notification_id,
        beforeValue: {},
        afterValue: row
      });
    }

    audit(data, { ...options, action: "UPDATE_USER", targetType: "User", targetId: user.user_id, beforeValue: { ...before, password: "" }, afterValue: { ...user, password: "" } });
    return { ...attachUserSummary(data, user), password: "" };
  });
}

function deleteUser(userId, options = {}) {
  return withWrite((data) => {
    const user = findUser(data, userId);
    if (!user) throw Object.assign(new Error("사용자를 찾을 수 없습니다."), { statusCode: 404 });
    if (text(options.userId) && text(options.userId) === text(user.user_id)) {
      throw Object.assign(new Error("현재 로그인한 본인 계정은 삭제할 수 없습니다."), { statusCode: 400 });
    }
    if (user.user_id === "admin") throw Object.assign(new Error("기본 관리자 계정은 삭제할 수 없습니다."), { statusCode: 400 });
    const assignedDevices = assignedDevicesForUser(data, user);
    if (assignedDevices.length) {
      throw Object.assign(new Error("할당된 장비가 있는 사용자는 삭제할 수 없습니다. 장비 반납/회수 또는 사용자 변경 후 삭제해주세요."), { statusCode: 400 });
    }
    const before = { ...user };
    user.is_deleted = true;
    user.updated_at = now();
    audit(data, { ...options, action: "DELETE_USER", targetType: "User", targetId: user.user_id, beforeValue: { ...before, password: "" }, afterValue: { ...user, password: "" } });
    return { success: true };
  });
}

function authenticate(userId, password) {
  return readData().then((data) => {
    const id = text(userId);
    const user = activeUsers(data).find((row) => row.user_id === id && verifyPassword(password, row.password));
    return user
      ? {
          user_id: user.user_id,
          name: user.name,
          role: normalizeUserRole(user.role),
          organization: user.organization || "",
          department: user.department || "",
          position: user.position || "",
          profile_photo_path: user.profile_photo_path || ""
        }
      : null;
  });
}

function initializeWorkbook(options = {}) {
  if (!options.force && fs.existsSync(excelPath)) {
    ensureWorkbook();
    return Promise.resolve(readAll());
  }
  return withWrite((data) => {
    const fresh = initialData(options.sample !== false);
    Object.keys(SHEETS).forEach((sheet) => {
      data[sheet] = fresh[sheet];
    });
    return fresh;
  });
}

function backupWorkbook() {
  return readData().then(() => {
    const fileName = `devices-${fileStamp()}.xlsx`;
    const target = path.join(uploadsDir, "backups", fileName);
    fs.copyFileSync(excelPath, target);
    return { fileName, path: `/uploads/backups/${fileName}` };
  });
}

module.exports = {
  addMaintenance,
  authenticate,
  backupWorkbook,
  cancelReturnRequestNotification,
  createDevice,
  createCategory,
  createDeviceType,
  createInstitution,
  createReturnRequestNotification,
  deleteDeletableNotifications,
  createReason,
  createUserOption,
  createUser,
  deleteCategory,
  deleteDevice,
  deleteDeviceType,
  deliverDevice,
  deleteInstitution,
  deleteReason,
  deleteTransaction,
  deleteNotification,
  deleteUserOption,
  deleteUser,
  disposeDevice,
  changeDeviceStatus,
  excelPath,
  getDashboardSummary,
  getDevice,
  getDeviceDetail,
  getDeviceTransactions,
  getInstitution,
  getNextDeviceId,
  getRecentTransactions,
  getUser,
  hardDeleteDevice,
  initializeWorkbook,
  listCategories,
  listDeviceTypes,
  listDevices,
  listInstitutions,
  listMaintenance,
  listNotifications,
  listReasons,
  listTransactions,
  listUserOptions,
  listUsers,
  markNotificationRead,
  markNotificationsRead,
  readData,
  recoverDevice,
  rentDevice,
  returnDevice,
  searchDevices,
  updateCategory,
  updateDevice,
  updateDeviceType,
  updateInstitution,
  updateMaintenance,
  updateRentalInfo,
  updateReason,
  updateUserOption,
  updateUser
};
