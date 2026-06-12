import QRCode from "qrcode/lib/browser.js";

const STATE_KEY = "workbook-v1";

const SHEETS = [
  "Devices",
  "Transactions",
  "Maintenance",
  "Users",
  "Institutions",
  "UserOptions",
  "Notifications",
  "AuditLogs",
  "Categories",
  "DeviceTypes",
  "Reasons"
];

const RESOURCE_CONFIG = {
  categories: { sheet: "Categories", id: "category_id", prefix: "CAT", search: ["category_name", "prefix", "memo"] },
  "device-types": { sheet: "DeviceTypes", id: "type_id", prefix: "TYP", search: ["category_name", "type_name", "type_prefix", "memo"] },
  reasons: { sheet: "Reasons", id: "reason_id", prefix: "RSN", search: ["reason_type", "reason_text", "memo"] },
  "user-options": { sheet: "UserOptions", id: "option_id", prefix: "UOPT", search: ["option_type", "option_text", "memo"] },
  institutions: { sheet: "Institutions", id: "institution_id", prefix: "ORG", search: ["institution_name", "contact_person", "contact", "email", "address", "memo"] }
};

const STATUS_KEYS = ["AVAILABLE", "RENTED", "DELIVERED", "MAINTENANCE", "BROKEN", "LOST", "DISPOSED"];
const ENCRYPTION_PREFIX = "enc:v1:";
const SESSION_TOKEN_PREFIX = "dm1";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const STATE_CACHE_TTL_MS = 1000 * 15;
const STATE_DIRTY_FLAG = "__deviceManagerDirty";
const ENCRYPTED_FIELDS = {
  Devices: [
    "serial_number",
    "purchase_price",
    "department",
    "manager",
    "location",
    "current_borrower",
    "current_institution_id",
    "current_institution_name",
    "current_user_organization",
    "current_user_position",
    "current_user_contact",
    "current_purpose",
    "current_rent_location",
    "current_condition_status",
    "current_process_memo",
    "borrower_department",
    "memo"
  ],
  Transactions: [
    "institution_id",
    "institution_name",
    "user_name",
    "user_organization",
    "user_department",
    "user_position",
    "user_contact",
    "purpose",
    "condition_status",
    "issue_description",
    "handled_by",
    "memo"
  ],
  Maintenance: ["checked_by", "result", "action_taken", "memo"],
  Users: [
    "user_id",
    "password",
    "name",
    "organization",
    "department",
    "position",
    "contact",
    "email",
    "profile_photo_path",
    "memo",
    "session_token",
    "session_token_created_at"
  ],
  Institutions: ["institution_id", "institution_name", "contact_person", "contact", "email", "address", "memo"],
  UserOptions: ["memo"],
  Notifications: ["recipient_user_id", "sender_user_id", "title", "message", "read_at"],
  AuditLogs: ["user_id", "target_id", "before_value", "after_value", "ip_address"],
  Categories: ["memo"],
  DeviceTypes: ["memo"],
  Reasons: ["memo"]
};

let cachedEncryptionSecret = "";
let cachedEncryptionKey = null;
let cachedSessionSecret = "";
let cachedSessionKey = null;
let cachedState = null;
let cachedStateExpiresAt = 0;
let pendingStateLoad = null;
let pendingEnsureDb = null;

export async function onRequest(context) {
  const requestId = crypto.randomUUID();
  const method = context.request.method;
  let path = "";
  try {
    if (method === "OPTIONS") return emptyResponse(204);

    const url = new URL(context.request.url);
    path = apiPath(url.pathname);

    if (path === "/admin/seed" && method === "POST") {
      return seedState(context);
    }
    if (path === "/admin/reencrypt" && method === "POST") {
      return reencryptState(context);
    }
    if (method === "GET" && /^\/devices\/[^/]+\/qrcode$/.test(path)) {
      return serveQrCode(context, path);
    }

    const state = await loadState(context);
    if (!isPublicApi(path)) await requireSession(context.env, state, context.request);
    const body = await readBody(context.request);
    const result = await route(context, state, path, body);

    if (result.save || isStateDirty(state)) await saveState(context.env, state);
    if (result.response) return result.response;
    return json(result.data, result.status || 200);
  } catch (error) {
    const status = errorStatus(error);
    console.error("[Device Manager API] request failed", {
      requestId,
      method,
      path,
      status,
      message: errorMessage(error),
      stack: error?.stack
    });
    return json({ message: errorResponseMessage(error, status), request_id: requestId }, status);
  }
}

const D1_RETRY_DELAYS_MS = [120, 300, 700];
const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error) {
  return String(error?.message || error || "");
}

function errorStatus(error) {
  const status = Number(error?.statusCode || error?.status || error?.cause?.status || 0);
  if (status >= 400 && status <= 599) return status;
  return isTransientDataError(error) ? 503 : 500;
}

function errorResponseMessage(error, status) {
  if (status === 503) return "서버 데이터 연결이 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요.";
  return errorMessage(error) || "Request failed";
}

function isTransientDataError(error) {
  const status = Number(error?.statusCode || error?.status || error?.cause?.status || 0);
  const message = errorMessage(error);
  return (
    TRANSIENT_STATUS_CODES.has(status) ||
    /D1|database is locked|busy|temporar|timeout|timed out|network|fetch failed|unavailable|internal error|rate limit/i.test(message)
  );
}

async function withD1Retry(label, operation) {
  let lastError;
  for (let attempt = 0; attempt <= D1_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDataError(error) || attempt === D1_RETRY_DELAYS_MS.length) throw error;
      const delayMs = D1_RETRY_DELAYS_MS[attempt];
      console.warn("[Device Manager API] retrying D1 operation", {
        label,
        attempt: attempt + 1,
        delayMs,
        message: errorMessage(error)
      });
      await wait(delayMs);
    }
  }
  throw lastError;
}

function emptyResponse(status) {
  return new Response(null, { status, headers: commonHeaders() });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data ?? null), {
    status,
    headers: { ...commonHeaders(), "content-type": "application/json; charset=utf-8" }
  });
}

function commonHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-user-id,x-session-token"
  };
}

function apiPath(pathname) {
  const path = pathname.replace(/^\/api/, "") || "/";
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function segments(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
}

async function ensureDb(db) {
  if (!db) throw Object.assign(new Error("Cloudflare D1 binding DB is not configured."), { statusCode: 500 });
  if (!pendingEnsureDb) {
    pendingEnsureDb = withD1Retry("ensureDb", () =>
      db.exec("CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)")
    ).catch((error) => {
      pendingEnsureDb = null;
      throw error;
    });
  }
  await pendingEnsureDb;
}

async function loadState(context) {
  await ensureDb(context.env.DB);

  const sourceState = await getCachedState(context);
  const state = needsMutableState(context.request.method) ? cloneState(sourceState) : sourceState;
  if (state !== sourceState && isStateDirty(sourceState)) markStateDirty(state);
  return state;
}

async function saveState(env, state) {
  await ensureDb(env.DB);
  const storageState = await encryptStateForStorage(env, state);
  const jsonState = JSON.stringify(storageState);
  const updatedAt = now();
  await withD1Retry("saveState", () =>
    env.DB
      .prepare(
        "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      )
      .bind(STATE_KEY, jsonState, updatedAt)
      .run()
  );
  clearStateDirty(state);
  rememberState(state);
}

async function getCachedState(context) {
  const current = Date.now();
  if (cachedState && current < cachedStateExpiresAt) return cachedState;

  if (!pendingStateLoad) {
    pendingStateLoad = loadStateFromD1(context)
      .then((state) => rememberState(state))
      .finally(() => {
        pendingStateLoad = null;
      });
  }

  return pendingStateLoad;
}

async function loadStateFromD1(context) {
  const row = await withD1Retry("loadState", () =>
    context.env.DB.prepare("SELECT value FROM app_state WHERE key = ?").bind(STATE_KEY).first()
  );
  const state = row?.value ? await decryptStateForRuntime(context.env, normalizeState(JSON.parse(row.value))) : normalizeState();
  const repair = repairDeviceIdentities(state);
  if (repair.touched) {
    markStateDirty(state);
    console.log("[Device Manager API] repaired device identities", {
      touched: repair.touched,
      idChanges: repair.idChanges.length
    });
  }
  return state;
}

function rememberState(state) {
  cachedState = state;
  cachedStateExpiresAt = Date.now() + STATE_CACHE_TTL_MS;
  return cachedState;
}

function needsMutableState(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(normalizeState(state)));
}

function markStateDirty(state) {
  Object.defineProperty(state, STATE_DIRTY_FLAG, {
    value: true,
    enumerable: false,
    configurable: true,
    writable: true
  });
}

function clearStateDirty(state) {
  if (!state || !Object.prototype.hasOwnProperty.call(state, STATE_DIRTY_FLAG)) return;
  Object.defineProperty(state, STATE_DIRTY_FLAG, {
    value: false,
    enumerable: false,
    configurable: true,
    writable: true
  });
}

function isStateDirty(state) {
  return Boolean(state?.[STATE_DIRTY_FLAG]);
}

async function encryptStateForStorage(env, state) {
  const clone = JSON.parse(JSON.stringify(normalizeState(state)));
  return transformProtectedFields(env, clone, encryptText);
}

async function decryptStateForRuntime(env, state) {
  return transformProtectedFields(env, state, decryptText);
}

async function transformProtectedFields(env, state, transform) {
  for (const [sheet, fields] of Object.entries(ENCRYPTED_FIELDS)) {
    for (const row of state[sheet] || []) {
      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(row, field)) {
          row[field] = await transform(env, row[field]);
        }
      }
    }
  }
  return state;
}

async function encryptionKey(env) {
  const secret = text(env.APP_ENCRYPTION_KEY);
  if (!secret) {
    throw Object.assign(new Error("APP_ENCRYPTION_KEY secret is required for encrypted Cloudflare storage."), {
      statusCode: 500
    });
  }
  if (cachedEncryptionKey && cachedEncryptionSecret === secret) return cachedEncryptionKey;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  cachedEncryptionSecret = secret;
  cachedEncryptionKey = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
  return cachedEncryptionKey;
}

async function encryptText(env, value) {
  if (value === undefined || value === null || value === "") return value ?? "";
  const plain = String(value);
  if (plain.startsWith(ENCRYPTION_PREFIX)) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), new TextEncoder().encode(plain))
  );
  return `${ENCRYPTION_PREFIX}${bytesToBase64Url(iv)}:${bytesToBase64Url(cipher)}`;
}

async function decryptText(env, value) {
  if (typeof value !== "string" || !value.startsWith(ENCRYPTION_PREFIX)) return value;
  const [, ivText, cipherText] = value.match(/^enc:v1:([^:]+):(.+)$/) || [];
  if (!ivText || !cipherText) {
    throw Object.assign(new Error("Encrypted data is malformed."), { statusCode: 500 });
  }
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(ivText) },
      await encryptionKey(env),
      base64UrlToBytes(cipherText)
    );
    return new TextDecoder().decode(plain);
  } catch (error) {
    console.error("Failed to decrypt D1 app_state field", error);
    throw Object.assign(new Error("Encrypted data could not be decrypted. Check APP_ENCRYPTION_KEY."), {
      statusCode: 500
    });
  }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function jsonToBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlToJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

function sessionSecret(env) {
  const secret = text(env.SESSION_SECRET || env.APP_ENCRYPTION_KEY || env.ADMIN_PASSWORD);
  if (!secret) {
    throw Object.assign(new Error("SESSION_SECRET or APP_ENCRYPTION_KEY is required for session signing."), {
      statusCode: 500
    });
  }
  return secret;
}

async function sessionSigningKey(env) {
  const secret = sessionSecret(env);
  if (cachedSessionKey && cachedSessionSecret === secret) return cachedSessionKey;
  cachedSessionSecret = secret;
  cachedSessionKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return cachedSessionKey;
}

async function signSessionPayload(env, payload) {
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", await sessionSigningKey(env), new TextEncoder().encode(payload))
  );
  return bytesToBase64Url(signature);
}

async function createSessionToken(env, user) {
  const payload = jsonToBase64Url({
    sub: user.user_id,
    iat: Date.now(),
    nonce: randomToken()
  });
  return `${SESSION_TOKEN_PREFIX}.${payload}.${await signSessionPayload(env, payload)}`;
}

async function verifySessionToken(env, userId, token) {
  try {
    const [prefix, payload, signature] = String(token || "").split(".");
    if (prefix !== SESSION_TOKEN_PREFIX || !payload || !signature) return false;
    const expected = await signSessionPayload(env, payload);
    if (!constantTimeEqual(expected, signature)) return false;
    const decoded = base64UrlToJson(payload);
    const issuedAt = Number(decoded.iat || 0);
    if (decoded.sub !== userId || !Number.isFinite(issuedAt)) return false;
    if (issuedAt > Date.now() + 1000 * 60 * 5) return false;
    return Date.now() - issuedAt <= SESSION_TTL_MS;
  } catch {
    return false;
  }
}

function normalizeState(input = {}) {
  const state = {};
  SHEETS.forEach((sheet) => {
    state[sheet] = Array.isArray(input[sheet]) ? input[sheet] : [];
  });
  return state;
}

async function readBody(request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return {};
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }
  if (contentType.includes("form-data")) {
    const form = await request.formData();
    const body = {};
    for (const [key, value] of form.entries()) {
      if (isFileLike(value)) {
        body[`${key}_data_url`] = await fileToDataUrl(value);
        body[`${key}_name`] = value.name || "";
        continue;
      }
      if (body[key] === undefined) body[key] = String(value);
      else body[key] = `${body[key]};${String(value)}`;
    }
    return body;
  }
  return {};
}

function isFileLike(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && "name" in value;
}

async function fileToDataUrl(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

async function route(context, state, path, body) {
  const url = new URL(context.request.url);
  const method = context.request.method;
  const parts = segments(path);
  const userId = currentUser(context.request);

  if (path === "/login" && method === "POST") return { data: await authenticate(context, state, body) };
  if (path === "/logout" && method === "POST") return { data: { ok: true } };
  if (path === "/me" && method === "GET") return { data: { user: sanitizeUser(findUser(state, userId) || findUser(state, "admin") || {}) } };

  if (path === "/dashboard/summary" && method === "GET") return { data: dashboardSummary(state) };
  if (path === "/dashboard/recent-transactions" && method === "GET") {
    const limit = Number(url.searchParams.get("limit") || 10);
    return { data: listTransactions(state, url.searchParams).slice(0, limit) };
  }

  if (parts[0] === "devices") return handleDevices(context, state, parts, url.searchParams, body);
  if (parts[0] === "transactions") return handleTransactions(state, parts, url.searchParams, body, method);
  if (parts[0] === "maintenance") return handleMaintenance(state, parts, url.searchParams, body, method, userId);
  if (parts[0] === "users") return handleUsers(context, state, parts, url.searchParams, body, method);
  if (parts[0] === "institutions") return handleInstitutions(state, parts, url.searchParams, body, method);
  if (parts[0] === "notifications") return handleNotifications(state, parts, url.searchParams, body, method, userId);
  if (parts[0] === "search" && method === "GET") return { data: searchDevices(state, url.searchParams.get("keyword") || "") };

  if (RESOURCE_CONFIG[parts[0]]) return handleResource(state, parts, url.searchParams, body, method, RESOURCE_CONFIG[parts[0]]);

  if (path === "/settings/paths" && method === "GET") {
    return { data: { excelPath: "Cloudflare D1", uploadsPath: "/uploads", backupsPath: "Cloudflare D1 app_state" } };
  }
  if (path === "/excel/backup" && method === "POST") {
    return { data: { fileName: `devices-${fileStamp()}.json`, path: "Cloudflare D1 app_state" } };
  }
  if (path === "/excel/download" && method === "GET") {
    return { response: stateDownload(state) };
  }
  if (path === "/excel/init" && method === "POST") {
    throw Object.assign(new Error("Cloudflare Pages data must be reset with npm run seed:pages."), { statusCode: 400 });
  }

  throw Object.assign(new Error("API endpoint not found"), { statusCode: 404 });
}

async function seedState(context) {
  requireSeedToken(context);
  const body = await readBody(context.request);
  const state = normalizeState(body);
  await saveState(context.env, state);
  return json({ ok: true, devices: state.Devices.length, users: state.Users.length, seeded_at: now() });
}

async function reencryptState(context) {
  requireSeedToken(context);
  const state = await loadState(context);
  await saveState(context.env, state);
  return json({
    ok: true,
    devices: state.Devices.length,
    users: state.Users.length,
    encrypted_fields: Object.values(ENCRYPTED_FIELDS).reduce((count, fields) => count + fields.length, 0),
    reencrypted_at: now()
  });
}

function requireSeedToken(context) {
  const expected = context.env.SEED_TOKEN || "";
  const received =
    context.request.headers.get("x-seed-token") ||
    context.request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!expected || received !== expected) {
    throw Object.assign(new Error("Invalid seed token"), { statusCode: 401 });
  }
}

function isPublicApi(path) {
  return path === "/login" || path === "/logout";
}

async function requireSession(env, state, request) {
  const url = new URL(request.url);
  const userId = request.headers.get("x-user-id") || url.searchParams.get("user_id") || "";
  const token = request.headers.get("x-session-token") || url.searchParams.get("session_token") || "";
  const user = findUser(state, userId, true);
  if (!user || isDeleted(user) || !token) {
    throw Object.assign(new Error("Login required"), { statusCode: 401 });
  }
  const validStoredToken = user.session_token && user.session_token === token;
  const validSignedToken = await verifySessionToken(env, user.user_id, token);
  if (validStoredToken || validSignedToken) return user;
  throw Object.assign(new Error("Login required"), { statusCode: 401 });
}

async function handleDevices(context, state, parts, params, body) {
  const method = context.request.method;
  const userId = currentUser(context.request);

  if (parts[1] === "next-id" && method === "GET") {
    return { data: { device_id: nextDeviceId(state, params.get("category") || "", params.get("model_name") || "", params.get("capacity_gb") || "") } };
  }

  if (parts.length === 1) {
    if (method === "GET") return { data: listDevices(state, params) };
    if (method === "POST") {
      const created = createDevice(state, body, userId);
      return { data: attachDevice(state, created, true), status: 201, save: true };
    }
  }

  const deviceId = parts[1];
  const device = findDevice(state, deviceId);
  if (!device) throw Object.assign(new Error("Device not found"), { statusCode: 404 });

  if (parts.length === 2) {
    if (method === "GET") return { data: attachDevice(state, device, true) };
    if (method === "PUT") {
      updateDevice(state, device, body);
      addTransaction(state, device, "UPDATE", body, userId, device.status, device.status);
      return { data: attachDevice(state, device, true), save: true };
    }
    if (method === "DELETE") {
      const hardDelete = ["true", "1"].includes(params.get("delete") || params.get("remove") || params.get("hard") || "");
      if (hardDelete) {
        device.is_deleted = true;
      } else {
        const before = device.status;
        device.status = "DISPOSED";
        device.updated_at = now();
        addTransaction(state, device, "DISPOSE", body, userId, before, "DISPOSED");
      }
      return { data: attachDevice(state, device, true), save: true };
    }
  }

  if (parts[2] === "detail" && method === "GET") {
    return {
      data: {
        device: attachDevice(state, device, true),
        transactions: transactionsForDevice(state, deviceId)
      }
    };
  }
  if (parts[2] === "transactions" && method === "GET") return { data: transactionsForDevice(state, deviceId) };

  if (["rent", "delivery", "return", "recover", "rental-info", "status"].includes(parts[2])) {
    return mutateDeviceProcess(state, device, parts[2], body, userId, method);
  }

  if (parts[2] === "maintenance" && method === "POST") {
    const row = addMaintenance(state, device, body, userId);
    return { data: row, status: 201, save: true };
  }

  throw Object.assign(new Error("Device endpoint not found"), { statusCode: 404 });
}

function createDevice(state, input, userId) {
  const created = now();
  const deviceId = input.device_id || nextDeviceId(state, input.category || "", input.model_name || "", input.capacity_gb || "");
  const row = {
    ...input,
    device_id: deviceId,
    device_name: input.device_name || deviceDisplayName(input.category, input.model_name) || [input.category, input.model_name].filter(Boolean).join(" "),
    status: input.status || "AVAILABLE",
    qr_code_path: input.qr_code_path || qrPathForDeviceId(deviceId),
    main_photo_path: input.main_photo_path || firstPath(input.photo_paths),
    created_at: created,
    updated_at: created,
    is_deleted: false
  };
  state.Devices.push(row);
  addTransaction(state, row, "REGISTER", { memo: "Device registered", photo_paths: row.photo_paths || "" }, userId, "", row.status);
  return row;
}

function updateDevice(state, device, input) {
  const previousDeviceId = device.device_id;
  const protectedFields = new Set(["device_id", "created_at", "is_deleted"]);
  Object.entries(input || {}).forEach(([key, value]) => {
    if (!protectedFields.has(key)) device[key] = value;
  });
  reassignDeviceId(state, device, previousDeviceId);
  if (!device.main_photo_path) device.main_photo_path = firstPath(device.photo_paths);
  device.updated_at = now();
}

function reassignDeviceId(state, device, previousDeviceId = device.device_id) {
  reassignDeviceNumbers(state, [device], now(), new Set([text(previousDeviceId)]));
}

function updateDeviceReferences(state, previousDeviceId, nextDeviceIdValue) {
  if (!previousDeviceId || !nextDeviceIdValue || previousDeviceId === nextDeviceIdValue) return;
  ["Transactions", "Maintenance", "Notifications"].forEach((sheet) => {
    (state[sheet] || []).forEach((row) => {
      if (row.device_id === previousDeviceId) row.device_id = nextDeviceIdValue;
    });
  });
  (state.AuditLogs || []).forEach((row) => {
    if (row.target_type === "Device" && row.target_id === previousDeviceId) row.target_id = nextDeviceIdValue;
  });
}

function reassignDeviceNumbers(state, devices, updatedAt = now(), extraAffectedIds = new Set()) {
  const affected = devices.filter(Boolean);
  const affectedIds = new Set([...extraAffectedIds, ...affected.map((device) => text(device.device_id)).filter(Boolean)]);
  const reserved = new Set(
    active(state.Devices)
      .map((device) => text(device.device_id))
      .filter((deviceId) => deviceId && !affectedIds.has(deviceId))
  );
  const result = { idChanges: [], touched: 0 };

  affected.forEach((device) => {
    const base = deviceIdBase(state, device.category || "", device.model_name || "", device.capacity_gb || "");
    if (!base) return;

    const previousDeviceId = text(device.device_id);
    const nextName = deviceDisplayName(device.category, device.model_name);
    const keepExistingId = previousDeviceId && previousDeviceId.startsWith(`${base}-`) && !reserved.has(previousDeviceId);
    const nextDeviceIdValue = keepExistingId ? previousDeviceId : nextDeviceIdFromReserved(base, reserved);
    let touched = false;

    if (nextName && device.device_name !== nextName) {
      device.device_name = nextName;
      touched = true;
    }

    if (previousDeviceId !== nextDeviceIdValue) {
      device.device_id = nextDeviceIdValue;
      device.qr_code_path = qrPathForDeviceId(nextDeviceIdValue);
      updateDeviceReferences(state, previousDeviceId, nextDeviceIdValue);
      result.idChanges.push({ from: previousDeviceId, to: nextDeviceIdValue });
      touched = true;
    } else if (nextDeviceIdValue && text(device.qr_code_path) !== qrPathForDeviceId(nextDeviceIdValue)) {
      device.qr_code_path = qrPathForDeviceId(nextDeviceIdValue);
      touched = true;
    }

    if (nextDeviceIdValue) reserved.add(nextDeviceIdValue);
    if (touched) {
      device.updated_at = updatedAt;
      result.touched += 1;
    }
  });

  return result;
}

function repairDeviceIdentities(state) {
  const catalogRepair = repairDeviceCatalogLinks(state);
  const candidates = active(state.Devices).filter((device) => {
    const base = deviceIdBase(state, device.category || "", device.model_name || "", device.capacity_gb || "");
    const deviceId = text(device.device_id);
    const nextName = deviceDisplayName(device.category, device.model_name);
    if (!base) return false;
    if (!deviceId || !deviceId.startsWith(`${base}-`)) return true;
    if (nextName && device.device_name !== nextName) return true;
    return text(device.qr_code_path) !== qrPathForDeviceId(deviceId);
  });
  const identityRepair = candidates.length ? reassignDeviceNumbers(state, candidates) : { idChanges: [], touched: 0 };
  return {
    idChanges: identityRepair.idChanges,
    touched: catalogRepair.touched + identityRepair.touched
  };
}

function repairDeviceCatalogLinks(state) {
  const updatedAt = now();
  let touched = 0;

  active(state.DeviceTypes).forEach((type) => {
    const category = type.category_id ? active(state.Categories).find((row) => row.category_id === type.category_id) : null;
    if (!category) return;

    const previousCategoryName = text(type.category_name);
    const nextCategoryName = text(category.category_name);
    if (!nextCategoryName || previousCategoryName === nextCategoryName) return;

    type.category_name = nextCategoryName;
    type.updated_at = updatedAt;
    touched += 1;

    active(state.Devices)
      .filter((device) => text(device.category) === previousCategoryName && text(device.model_name) === text(type.type_name))
      .forEach((device) => {
        device.category = nextCategoryName;
        device.updated_at = updatedAt;
        touched += 1;
      });
  });

  return { touched };
}

function mutateDeviceProcess(state, device, action, body, userId, method) {
  if (action === "rental-info" && method !== "PUT") throw Object.assign(new Error("Method not allowed"), { statusCode: 405 });
  if (action !== "rental-info" && method !== "POST") throw Object.assign(new Error("Method not allowed"), { statusCode: 405 });

  const before = device.status || "";
  if (action === "rent" || action === "delivery") {
    const after = action === "delivery" ? "DELIVERED" : "RENTED";
    device.status = after;
    applyCheckoutSnapshot(device, body, action === "delivery" ? "DELIVERY" : "RENT");
    device.updated_at = now();
    addTransaction(state, device, action === "delivery" ? "DELIVERY" : "RENT", body, userId, before, after);
  } else if (action === "rental-info") {
    applyCheckoutSnapshot(device, body, device.current_source_action_type || (device.status === "DELIVERED" ? "DELIVERY" : "RENT"));
    device.updated_at = now();
    addTransaction(state, device, "RENTAL_UPDATE", body, userId, before, device.status);
  } else if (action === "return" || action === "recover") {
    device.status = "AVAILABLE";
    device.last_returned_at = body.returned_at || today();
    clearCheckoutSnapshot(device);
    device.updated_at = now();
    addTransaction(state, device, action === "recover" ? "RECOVERY" : "RETURN", body, userId, before, "AVAILABLE");
  } else if (action === "status") {
    const after = body.status || before;
    device.status = after;
    if (after === "AVAILABLE") clearCheckoutSnapshot(device);
    device.updated_at = now();
    addTransaction(state, device, body.action_type || "STATUS_CHANGE", body, userId, before, after);
  }
  return { data: attachDevice(state, device, true), save: true };
}

function applyCheckoutSnapshot(device, input, sourceActionType) {
  const borrowerType = input.borrower_type || input.borrowerType || "";
  const institutionName = input.institution_name || input.institutionName || "";
  const userName = input.user_name || input.borrowerName || "";
  device.current_borrower_type = borrowerType || (institutionName ? "INSTITUTION" : "PERSON");
  device.current_institution_id = input.institution_id || input.institutionId || "";
  device.current_institution_name = institutionName;
  device.current_borrower = institutionName || userName;
  device.current_user_organization = input.user_organization || "";
  device.borrower_department = input.user_department || (institutionName ? "기관" : "");
  device.current_user_position = input.user_position || "";
  device.current_user_contact = input.user_contact || "";
  device.current_purpose = input.purpose || "";
  device.current_rent_location = input.rent_location || "";
  device.current_condition_status = input.condition_status || "";
  device.current_process_memo = input.memo || "";
  device.current_source_action_type = sourceActionType;
  device.borrowed_at = input.rented_at || device.borrowed_at || today();
  device.expected_return_at = input.expected_return_at || "";
}

function clearCheckoutSnapshot(device) {
  [
    "current_borrower",
    "current_borrower_type",
    "current_institution_id",
    "current_institution_name",
    "current_user_organization",
    "borrower_department",
    "current_user_position",
    "current_user_contact",
    "current_purpose",
    "current_rent_location",
    "current_condition_status",
    "current_process_memo",
    "current_source_action_type",
    "borrowed_at",
    "expected_return_at"
  ].forEach((key) => {
    device[key] = "";
  });
}

function handleTransactions(state, parts, params, body, method) {
  if (parts.length === 1 && method === "GET") return { data: listTransactions(state, params) };
  if (parts.length === 2 && method === "DELETE") {
    const row = state.Transactions.find((item) => item.transaction_id === parts[1]);
    if (!row) throw Object.assign(new Error("Transaction not found"), { statusCode: 404 });
    row.is_deleted = true;
    return { data: { success: true }, save: true };
  }
  throw Object.assign(new Error("Transaction endpoint not found"), { statusCode: 404 });
}

function handleMaintenance(state, parts, params, body, method, userId) {
  if (parts.length === 1 && method === "GET") return { data: listMaintenance(state, params) };
  if (parts.length === 2 && method === "PUT") {
    const row = state.Maintenance.find((item) => item.maintenance_id === parts[1]);
    if (!row) throw Object.assign(new Error("Maintenance not found"), { statusCode: 404 });
    Object.assign(row, body, { updated_at: now() });
    const device = findDevice(state, row.device_id);
    if (device && body.status_after) {
      const before = device.status;
      device.status = body.status_after;
      device.updated_at = now();
      addTransaction(state, device, "MAINTENANCE_COMPLETE", body, userId, before, body.status_after);
    }
    return { data: row, save: true };
  }
  throw Object.assign(new Error("Maintenance endpoint not found"), { statusCode: 404 });
}

async function handleUsers(context, state, parts, params, body, method) {
  if (parts.length === 1) {
    if (method === "GET") return { data: listUsers(state, params) };
    if (method === "POST") {
      const row = await createUser(state, body);
      return { data: attachUserSummary(state, row), status: 201, save: true };
    }
  }

  const user = findUser(state, parts[1], true);
  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

  if (parts.length === 2) {
    if (method === "GET") return { data: getUserDetail(state, user) };
    if (method === "PUT") {
      await updateUser(user, body);
      return { data: getUserDetail(state, user), save: true };
    }
    if (method === "DELETE") {
      user.is_deleted = true;
      user.updated_at = now();
      return { data: { success: true }, save: true };
    }
  }

  if (parts[2] === "profile-photo" && method === "POST") {
    if (!body.photo_data_url) throw Object.assign(new Error("Profile photo is required"), { statusCode: 400 });
    if (body.photo_data_url.length > 512 * 1024) {
      throw Object.assign(new Error("Profile photo is too large after compression"), { statusCode: 400 });
    }
    user.profile_photo_path = body.photo_data_url;
    user.updated_at = now();
    return { data: getUserDetail(state, user), save: true };
  }

  throw Object.assign(new Error("User endpoint not found"), { statusCode: 404 });
}

function handleInstitutions(state, parts, params, body, method) {
  if (parts.length === 1) {
    if (method === "GET") return { data: listInstitutions(state, params) };
    if (method === "POST") {
      const row = createInstitution(state, body);
      return { data: institutionSummary(state, row), status: 201, save: true };
    }
  }

  const institution = findInstitution(state, parts[1], true);
  if (!institution || isDeleted(institution)) {
    throw Object.assign(new Error("Institution not found"), { statusCode: 404 });
  }

  if (method === "GET") return { data: institutionSummary(state, institution) };
  if (method === "PUT") {
    updateInstitution(state, institution, body);
    return { data: institutionSummary(state, institution), save: true };
  }
  if (method === "DELETE") {
    const summary = institutionSummary(state, institution);
    if (summary.assigned_count > 0) {
      throw Object.assign(new Error("Assigned devices must be returned or recovered before deleting this institution."), {
        statusCode: 400
      });
    }
    institution.is_deleted = true;
    institution.updated_at = now();
    return { data: { success: true }, save: true };
  }

  throw Object.assign(new Error("Institution endpoint not found"), { statusCode: 404 });
}

function handleNotifications(state, parts, params, body, method, userId) {
  if (parts.length === 1 && method === "GET") return { data: listNotifications(state, params, userId) };

  if (parts[1] === "return-request" && parts.length === 2 && method === "POST") {
    const row = createReturnRequest(state, body, userId);
    return { data: attachNotification(state, row), status: 201, save: true };
  }
  if (parts[1] === "return-request" && parts[2] === "cancel" && method === "POST") {
    const rows = active(state.Notifications).filter(
      (row) => row.type === "RETURN_REQUEST" && row.recipient_user_id === body.recipient_user_id && row.device_id === body.device_id
    );
    rows.forEach((row) => {
      row.is_deleted = true;
      row.is_read = true;
      row.read_at = now();
    });
    return { data: { success: true, count: rows.length }, save: true };
  }
  if (parts[1] === "read-all" && method === "PUT") {
    active(state.Notifications)
      .filter((row) => row.recipient_user_id === userId)
      .forEach((row) => {
        row.is_read = true;
        row.read_at = row.read_at || now();
      });
    return { data: { success: true }, save: true };
  }
  if (parts[1] === "deletable" && method === "DELETE") {
    active(state.Notifications)
      .filter((row) => row.recipient_user_id === userId)
      .forEach((row) => {
        row.is_deleted = true;
      });
    return { data: { success: true }, save: true };
  }

  const notification = state.Notifications.find((row) => row.notification_id === parts[1]);
  if (!notification) throw Object.assign(new Error("Notification not found"), { statusCode: 404 });

  if (parts[2] === "read" && method === "PUT") {
    notification.is_read = true;
    notification.read_at = notification.read_at || now();
    return { data: attachNotification(state, notification), save: true };
  }
  if (parts.length === 2 && method === "DELETE") {
    notification.is_deleted = true;
    return { data: { success: true }, save: true };
  }

  throw Object.assign(new Error("Notification endpoint not found"), { statusCode: 404 });
}

function handleResource(state, parts, params, body, method, config) {
  const rows = state[config.sheet];
  if (parts.length === 1) {
    if (method === "GET") return { data: filterResourceRows(rows, params, config) };
    if (method === "POST") {
      const created = {
        ...body,
        [config.id]: body[config.id] || nextId(rows, config.id, config.prefix),
        created_at: now(),
        updated_at: now(),
        is_deleted: false
      };
      rows.push(created);
      return { data: created, status: 201, save: true };
    }
  }
  const row = rows.find((item) => item[config.id] === parts[1]);
  if (!row || isDeleted(row)) throw Object.assign(new Error("Resource not found"), { statusCode: 404 });
  if (method === "GET") return { data: row };
  if (method === "PUT") {
    if (config.sheet === "Categories") return updateCategoryResource(state, row, body);
    if (config.sheet === "DeviceTypes") return updateDeviceTypeResource(state, row, body);
    Object.assign(row, body, { [config.id]: row[config.id], updated_at: now() });
    return { data: row, save: true };
  }
  if (method === "DELETE") {
    row.is_deleted = true;
    row.updated_at = now();
    return { data: { success: true }, save: true };
  }
  throw Object.assign(new Error("Method not allowed"), { statusCode: 405 });
}

function updateCategoryResource(state, row, input = {}) {
  const before = { ...row };
  const categoryId = row.category_id;
  const nextName = input.category_name !== undefined ? text(input.category_name) : text(row.category_name);
  const nextPrefix = input.prefix !== undefined ? normalizePrefix(input.prefix) : normalizePrefix(row.prefix);

  if (!nextName || !nextPrefix) {
    throw Object.assign(new Error("Category name and prefix are required"), { statusCode: 400 });
  }
  if (active(state.Categories).some((category) => category.category_id !== categoryId && text(category.category_name) === nextName)) {
    throw Object.assign(new Error("Category name already exists"), { statusCode: 409 });
  }
  if (active(state.Categories).some((category) => category.category_id !== categoryId && normalizePrefix(category.prefix) === nextPrefix)) {
    throw Object.assign(new Error("Category prefix already exists"), { statusCode: 409 });
  }

  row.category_name = nextName;
  row.prefix = nextPrefix;
  row.memo = input.memo !== undefined ? input.memo : row.memo;
  row.updated_at = now();

  const affectedDevices = active(state.Devices).filter((device) => text(device.category) === text(before.category_name));
  affectedDevices.forEach((device) => {
    device.category = nextName;
  });

  active(state.DeviceTypes)
    .filter((type) => type.category_id === categoryId || text(type.category_name) === text(before.category_name))
    .forEach((type) => {
      type.category_id = categoryId;
      type.category_name = nextName;
      type.updated_at = row.updated_at;
    });

  reassignDeviceNumbers(state, affectedDevices, row.updated_at);
  return { data: row, save: true };
}

function updateDeviceTypeResource(state, row, input = {}) {
  const before = { ...row };
  const category = findCategoryResource(state, input.category_id || input.category_name || row.category_id || row.category_name);
  if (!category) throw Object.assign(new Error("Category is required"), { statusCode: 400 });

  const nextTypeName = input.type_name !== undefined ? text(input.type_name) : text(row.type_name);
  const nextTypePrefix = input.type_prefix !== undefined ? normalizePrefix(input.type_prefix) : normalizePrefix(row.type_prefix);
  if (!nextTypeName) throw Object.assign(new Error("Device item name is required"), { statusCode: 400 });
  if (
    active(state.DeviceTypes).some(
      (type) => type.type_id !== row.type_id && type.category_id === category.category_id && text(type.type_name) === nextTypeName
    )
  ) {
    throw Object.assign(new Error("Device item already exists in this category"), { statusCode: 409 });
  }
  if (
    nextTypePrefix &&
    active(state.DeviceTypes).some(
      (type) =>
        type.type_id !== row.type_id &&
        type.category_id === category.category_id &&
        normalizePrefix(type.type_prefix) === nextTypePrefix
    )
  ) {
    throw Object.assign(new Error("Device item prefix already exists in this category"), { statusCode: 409 });
  }

  row.category_id = category.category_id;
  row.category_name = category.category_name;
  row.type_name = nextTypeName;
  row.type_prefix = nextTypePrefix;
  row.memo = input.memo !== undefined ? input.memo : row.memo;
  row.updated_at = now();

  const affectedDevices = active(state.Devices).filter(
    (device) => text(device.category) === text(before.category_name) && text(device.model_name) === text(before.type_name)
  );
  affectedDevices.forEach((device) => {
    device.category = row.category_name;
    device.model_name = row.type_name;
  });

  reassignDeviceNumbers(state, affectedDevices, row.updated_at);
  return { data: row, save: true };
}

function listDevices(state, params = new URLSearchParams()) {
  const keyword = lower(params.get("keyword"));
  const status = params.get("status") || "";
  const category = params.get("category") || "";
  const assignedToUserId = params.get("assigned_to_user_id") || "";
  const assignedUser = assignedToUserId ? findUser(state, assignedToUserId) : null;
  const assignedDeviceIds = assignedToUserId
    ? new Set(assignedDevicesForUser(state, assignedUser).map((device) => device.device_id))
    : null;
  return active(state.Devices)
    .filter((device) => !assignedDeviceIds || assignedDeviceIds.has(device.device_id))
    .filter((device) => !status || device.status === status)
    .filter((device) => !category || device.category === category)
    .filter((device) => !keyword || searchable(device).includes(keyword))
    .sort((a, b) => text(b.updated_at || b.created_at).localeCompare(text(a.updated_at || a.created_at)))
    .map((device) => attachDevice(state, device, false));
}

function searchDevices(state, keyword) {
  const params = new URLSearchParams();
  params.set("keyword", keyword);
  return listDevices(state, params).slice(0, 20);
}

function attachDevice(state, device, includeDetail = false) {
  const row = { ...device };
  row.main_photo_path = row.main_photo_path || firstPath(row.photo_paths);
  row.current_transactions = transactionsForDevice(state, row.device_id).filter((item) => ["RENT", "DELIVERY", "RENTAL_UPDATE"].includes(item.action_type));
  row.return_request = active(state.Notifications)
    .filter((notification) => notification.type === "RETURN_REQUEST" && notification.device_id === row.device_id)
    .sort(descCreated)[0] || null;
  if (includeDetail) {
    row.transactions = transactionsForDevice(state, row.device_id);
    row.maintenance = listMaintenance(state, new URLSearchParams([["device_id", row.device_id]]));
  }
  return row;
}

function listTransactions(state, params = new URLSearchParams()) {
  const actions = splitCsv(params.get("actions"));
  const excluded = splitCsv(params.get("exclude_actions"));
  const keyword = lower(params.get("keyword"));
  const deviceId = text(params.get("device_id"));
  const deviceIds = splitCsv(params.get("device_ids"));
  const actionType = text(params.get("action_type"));
  const borrowerTypeFilter = text(params.get("borrower_type")).toUpperCase();
  const institutionId = text(params.get("institution_id"));
  const institutionName = lower(params.get("institution_name"));
  const userName = lower(params.get("user_name"));
  const from = text(params.get("from") || params.get("date_from"));
  const to = text(params.get("to") || params.get("date_to"));

  return active(state.Transactions)
    .filter((row) => !actions.length || actions.includes(row.action_type))
    .filter((row) => !excluded.length || !excluded.includes(row.action_type))
    .filter((row) => !actionType || row.action_type === actionType)
    .filter((row) => !deviceId || row.device_id === deviceId)
    .filter((row) => !deviceIds.length || deviceIds.includes(row.device_id))
    .filter((row) => !borrowerTypeFilter || borrowerType(row) === borrowerTypeFilter)
    .filter((row) => !institutionId || text(row.institution_id) === institutionId)
    .filter((row) => !institutionName || lower(row.institution_name || row.user_name).includes(institutionName))
    .filter((row) => !userName || lower(row.user_name).includes(userName))
    .filter((row) => !from || text(row.created_at).slice(0, 10) >= from)
    .filter((row) => !to || text(row.created_at).slice(0, 10) <= to)
    .sort(descCreated)
    .map((row) => attachTransaction(state, row))
    .filter((row) => !keyword || searchable(row).includes(keyword));
}

function transactionsForDevice(state, deviceId) {
  const params = new URLSearchParams();
  params.set("device_id", deviceId);
  return listTransactions(state, params);
}

function attachTransaction(state, row) {
  const device = findDevice(state, row.device_id, true) || {};
  const handler = findUser(state, row.handled_by, true) || {};
  return {
    ...row,
    device_name: device.device_name || "",
    device_category: device.category || "",
    device_model_name: device.model_name || "",
    device_capacity_gb: device.capacity_gb || "",
    category: device.category || row.category || "",
    model_name: device.model_name || row.model_name || "",
    capacity_gb: device.capacity_gb || row.capacity_gb || "",
    handled_by_name: handler.name || "",
    handled_by_display: handler.name ? `${handler.name} (${handler.user_id})` : row.handled_by || ""
  };
}

function addTransaction(state, device, actionType, input, userId, beforeStatus, afterStatus) {
  const created = now();
  const seq = nextSequence(state.Transactions, "transaction_no");
  const row = {
    transaction_id: `TRX-${ymd()}-${String(seq).padStart(4, "0")}`,
    transaction_no: String(seq).padStart(4, "0"),
    device_id: device.device_id,
    action_type: actionType,
    borrower_type: input.borrower_type || "",
    institution_id: input.institution_id || "",
    institution_name: input.institution_name || "",
    user_name: input.user_name || input.institution_name || device.current_borrower || "",
    user_organization: input.user_organization || "",
    user_department: input.user_department || device.borrower_department || "",
    user_position: input.user_position || "",
    user_contact: input.user_contact || "",
    purpose: input.purpose || input.reason || "",
    rented_at: input.rented_at || (["RENT", "DELIVERY", "RENTAL_UPDATE"].includes(actionType) ? today() : ""),
    expected_return_at: input.expected_return_at || "",
    returned_at: input.returned_at || (["RETURN", "RECOVERY"].includes(actionType) ? today() : ""),
    before_status: beforeStatus || "",
    after_status: afterStatus || "",
    condition_status: input.condition_status || "",
    issue_description: input.issue_description || input.result || "",
    photo_paths: input.photo_paths || "",
    handled_by: userId || "admin",
    memo: input.memo || input.reason || "",
    created_at: created,
    is_deleted: false
  };
  state.Transactions.push(row);
  return row;
}

function addMaintenance(state, device, input, userId) {
  const before = device.status;
  const row = {
    maintenance_id: nextId(state.Maintenance, "maintenance_id", "MNT"),
    device_id: device.device_id,
    maintenance_type: input.maintenance_type || "MAINTENANCE",
    checked_by: input.checked_by || userId || "admin",
    checked_at: input.checked_at || today(),
    result: input.result || "",
    issue_level: input.issue_level || "",
    action_taken: input.action_taken || "",
    next_check_at: input.next_check_at || "",
    photo_paths: input.photo_paths || "",
    status_after: input.status_after || device.status,
    memo: input.memo || "",
    created_at: now(),
    is_deleted: false
  };
  state.Maintenance.push(row);
  if (input.status_after) {
    device.status = input.status_after;
    device.updated_at = now();
    if (input.status_after === "AVAILABLE") clearCheckoutSnapshot(device);
  }
  addTransaction(state, device, input.action_type || "MAINTENANCE", input, userId, before, device.status);
  return row;
}

function listMaintenance(state, params = new URLSearchParams()) {
  const keyword = lower(params.get("keyword"));
  const deviceId = text(params.get("device_id"));
  const maintenanceType = text(params.get("maintenance_type"));
  return active(state.Maintenance)
    .filter((row) => !deviceId || row.device_id === deviceId)
    .filter((row) => !maintenanceType || row.maintenance_type === maintenanceType)
    .sort(descCreated)
    .map((row) => attachMaintenance(state, row))
    .filter((row) => !keyword || searchable(row).includes(keyword));
}

function attachMaintenance(state, row) {
  const device = findDevice(state, row.device_id, true) || {};
  return {
    ...row,
    device,
    device_name: device.device_name || "",
    device_category: device.category || "",
    device_model_name: device.model_name || "",
    category: device.category || row.category || "",
    model_name: device.model_name || row.model_name || "",
    status: device.status || "",
    current_borrower: device.current_borrower || ""
  };
}

function borrowerType(row = {}) {
  const explicit = text(row.borrower_type || row.current_borrower_type).toUpperCase();
  if (explicit) return explicit;
  return isInstitutionAssignment(row) ? "INSTITUTION" : "PERSON";
}

function dashboardSummary(state) {
  const rows = active(state.Devices);
  const summary = Object.fromEntries(STATUS_KEYS.map((key) => [key.toLowerCase(), rows.filter((row) => row.status === key).length]));
  return { total: rows.length, ...summary };
}

function listInstitutions(state, params = new URLSearchParams()) {
  const keyword = lower(params.get("keyword"));
  return active(state.Institutions)
    .filter((institution) => !keyword || searchable(institution).includes(keyword))
    .map((institution) => institutionSummary(state, institution))
    .sort((a, b) => text(a.institution_name).localeCompare(text(b.institution_name), "ko", { numeric: true }));
}

function institutionSummary(state, institution) {
  const institutionId = text(institution.institution_id);
  const institutionName = text(institution.institution_name);
  const assignedDevices = active(state.Devices).filter((device) => {
    if (!["RENTED", "DELIVERED"].includes(device.status)) return false;
    if (institutionId && text(device.current_institution_id) === institutionId) return true;
    return isInstitutionAssignment(device) && text(device.current_institution_name || device.current_borrower) === institutionName;
  });
  const transactions = active(state.Transactions)
    .filter((row) => {
      if (institutionId && text(row.institution_id) === institutionId) return true;
      return isInstitutionAssignment(row) && text(row.institution_name || row.user_name) === institutionName;
    })
    .sort(descCreated);

  return {
    ...institution,
    assigned_count: assignedDevices.length,
    transaction_count: transactions.length,
    assigned_devices: assignedDevices.map((device) => ({
      ...attachDevice(state, device, false),
      rent_location: device.current_rent_location || ""
    })),
    transactions: transactions.map((row) => attachTransaction(state, row)).slice(0, 30)
  };
}

function createInstitution(state, input = {}) {
  const institutionName = text(input.institution_name);
  if (!institutionName) throw Object.assign(new Error("Institution name is required"), { statusCode: 400 });
  if (active(state.Institutions).some((row) => text(row.institution_name) === institutionName)) {
    throw Object.assign(new Error("Institution already exists"), { statusCode: 409 });
  }
  const created = now();
  const row = {
    ...input,
    institution_id: input.institution_id || nextId(state.Institutions, "institution_id", "ORG"),
    institution_name: institutionName,
    created_at: created,
    updated_at: created,
    is_deleted: false
  };
  state.Institutions.push(row);
  return row;
}

function updateInstitution(state, institution, input = {}) {
  const beforeName = text(institution.institution_name);
  const nextName = input.institution_name !== undefined ? text(input.institution_name) : beforeName;
  if (!nextName) throw Object.assign(new Error("Institution name is required"), { statusCode: 400 });
  if (
    active(state.Institutions).some(
      (row) => row.institution_id !== institution.institution_id && text(row.institution_name) === nextName
    )
  ) {
    throw Object.assign(new Error("Institution already exists"), { statusCode: 409 });
  }

  const protectedFields = new Set(["institution_id", "created_at", "is_deleted"]);
  Object.entries(input).forEach(([key, value]) => {
    if (!protectedFields.has(key)) institution[key] = value;
  });
  institution.institution_name = nextName;
  institution.updated_at = now();

  active(state.Devices).forEach((device) => {
    if (!["RENTED", "DELIVERED"].includes(device.status)) return;
    const matchesId = text(device.current_institution_id) === institution.institution_id;
    const matchesName = isInstitutionAssignment(device) && text(device.current_institution_name || device.current_borrower) === beforeName;
    if (!matchesId && !matchesName) return;
    device.current_borrower_type = "INSTITUTION";
    device.current_borrower = institution.institution_name;
    device.current_institution_id = institution.institution_id;
    device.current_institution_name = institution.institution_name;
    device.current_user_organization = "기관";
    device.borrower_department = "기관";
    device.current_user_position = device.current_user_position || institution.contact_person || "";
    device.current_user_contact = institution.contact || device.current_user_contact || "";
    device.updated_at = institution.updated_at;
  });

  state.Transactions.forEach((row) => {
    const matchesId = text(row.institution_id) === institution.institution_id;
    const matchesName = isInstitutionAssignment(row) && text(row.institution_name || row.user_name) === beforeName;
    if (!matchesId && !matchesName) return;
    row.borrower_type = "INSTITUTION";
    row.institution_id = institution.institution_id;
    row.institution_name = institution.institution_name;
    row.user_name = institution.institution_name;
    row.user_organization = "기관";
    row.user_department = "기관";
    row.user_position = row.user_position || institution.contact_person || "";
    row.user_contact = institution.contact || row.user_contact || "";
  });
}

function isInstitutionAssignment(row = {}) {
  return (
    text(row.borrower_type || row.current_borrower_type).toUpperCase() === "INSTITUTION" ||
    text(row.user_department || row.borrower_department || row.current_user_organization) === "기관"
  );
}

function assignedDevicesForUser(state, user) {
  if (!user) return [];
  const userName = text(user.name);
  const department = text(user.department);
  if (!userName) return [];
  return active(state.Devices).filter((device) => {
    if (!["RENTED", "DELIVERED"].includes(device.status)) return false;
    if (text(device.current_borrower) !== userName) return false;
    return !department || !text(device.borrower_department) || text(device.borrower_department) === department;
  });
}

function listUsers(state, params = new URLSearchParams()) {
  const keyword = lower(params.get("keyword"));
  return active(state.Users)
    .filter((row) => !keyword || searchable(row).includes(keyword))
    .sort((a, b) => text(a.name || a.user_id).localeCompare(text(b.name || b.user_id)))
    .map((row) => attachUserSummary(state, row));
}

function getUserDetail(state, user) {
  const summary = attachUserSummary(state, user);
  return {
    ...summary,
    assigned_devices: assignedDevicesForUser(state, user).map((device) => attachDevice(state, device, false)),
    transactions: listTransactions(state, new URLSearchParams()).filter((row) => row.user_name === user.name || row.handled_by === user.user_id).slice(0, 30)
  };
}

function attachUserSummary(state, user) {
  const assigned = assignedDevicesForUser(state, user);
  return { ...sanitizeUser(user), assigned_count: assigned.length };
}

async function createUser(state, input) {
  if (!input.user_id || !input.name) throw Object.assign(new Error("user_id and name are required"), { statusCode: 400 });
  if (findUser(state, input.user_id, true)) throw Object.assign(new Error("User already exists"), { statusCode: 409 });
  const created = now();
  const user = {
    ...input,
    password: await hashPassword(input.password || "user123!"),
    role: normalizeRole(input.role),
    created_at: created,
    updated_at: created,
    is_deleted: false
  };
  state.Users.push(user);
  return user;
}

async function updateUser(user, input) {
  const protectedFields = new Set(["user_id", "created_at", "is_deleted"]);
  for (const [key, value] of Object.entries(input || {})) {
    if (protectedFields.has(key)) continue;
    if (key === "password") {
      if (value) user.password = await hashPassword(value);
      continue;
    }
    user[key] = key === "role" ? normalizeRole(value) : value;
  }
  user.updated_at = now();
}

async function authenticate(context, state, input) {
  const user = findUser(state, input.user_id || "", true);
  if (!user || isDeleted(user)) throw Object.assign(new Error("Invalid user ID or password"), { statusCode: 401 });

  const adminPassword = context.env.ADMIN_PASSWORD || "";
  const password = text(input.password);
  const valid =
    (user.user_id === "admin" && adminPassword && password === adminPassword) ||
    (user.user_id === "admin" && !adminPassword && password === "admin123!") ||
    (await verifyPassword(password, user.password));

  if (!valid) throw Object.assign(new Error("Invalid user ID or password"), { statusCode: 401 });
  return { user: { ...sanitizeUser(user), session_token: await createSessionToken(context.env, user) } };
}

function sanitizeUser(user = {}, includeToken = false) {
  const { password, session_token, session_token_created_at, ...rest } = user;
  return {
    ...rest,
    role: normalizeRole(rest.role),
    ...(includeToken && session_token ? { session_token } : {})
  };
}

function normalizeRole(role) {
  return String(role || "").toUpperCase() === "ADMIN" ? "ADMIN" : "USER";
}

function listNotifications(state, params = new URLSearchParams(), userId = "admin") {
  const scope = params.get("scope") || "";
  const unreadOnly = ["1", "true", "yes"].includes(String(params.get("unread_only") || "").toLowerCase());
  const keyword = lower(params.get("keyword"));
  const actor = findUser(state, userId, true);
  const isAdmin = normalizeRole(actor?.role || (userId === "admin" ? "ADMIN" : "USER")) === "ADMIN";
  return active(state.Notifications)
    .filter((row) => {
      if (scope === "dashboard" && isAdmin) return true;
      return !userId || row.recipient_user_id === userId;
    })
    .filter((row) => !unreadOnly || !bool(row.is_read))
    .sort(descCreated)
    .map((row) => attachNotification(state, row))
    .filter((row) => !keyword || searchable(row).includes(keyword));
}

function attachNotification(state, row) {
  const device = findDevice(state, row.device_id, true) || {};
  const sender = findUser(state, row.sender_user_id, true) || {};
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
    rent_location: device.current_rent_location || ""
  };
}

function createReturnRequest(state, input, userId) {
  const recipient = findUser(state, input.recipient_user_id, true);
  const device = findDevice(state, input.device_id);
  if (!recipient || !device) throw Object.assign(new Error("Recipient or device not found"), { statusCode: 404 });
  const row = {
    notification_id: `NTF-${ymd()}-${String(nextSequence(state.Notifications, "notification_id")).padStart(4, "0")}`,
    recipient_user_id: recipient.user_id,
    sender_user_id: userId || "admin",
    type: "RETURN_REQUEST",
    device_id: device.device_id,
    title: "Return request",
    message: input.message || `${device.device_id} return requested.`,
    is_read: false,
    created_at: now(),
    read_at: "",
    is_deleted: false
  };
  state.Notifications.push(row);
  return row;
}

function filterResourceRows(rows, params, config) {
  const keyword = lower(params.get("keyword"));
  return active(rows)
    .filter((row) => !params.get("reason_type") || row.reason_type === params.get("reason_type"))
    .filter((row) => !params.get("option_type") || row.option_type === params.get("option_type"))
    .filter((row) => !params.get("category") || row.category_name === params.get("category"))
    .filter((row) => !keyword || config.search.some((field) => lower(row[field]).includes(keyword)))
    .sort((a, b) => text(a[config.id]).localeCompare(text(b[config.id])));
}

function findDevice(state, deviceId, includeDeleted = false) {
  return state.Devices.find((row) => row.device_id === deviceId && (includeDeleted || !isDeleted(row)));
}

function findUser(state, userId, includeDeleted = false) {
  return state.Users.find((row) => row.user_id === userId && (includeDeleted || !isDeleted(row)));
}

function findInstitution(state, institutionId, includeDeleted = false) {
  return state.Institutions.find((row) => row.institution_id === institutionId && (includeDeleted || !isDeleted(row)));
}

function findCategoryResource(state, value) {
  const target = text(value);
  return active(state.Categories).find((row) => row.category_id === target || text(row.category_name) === target);
}

function sameCategoryForType(type, category, categoryValue) {
  const fallbackName = text(categoryValue);
  return (
    type.category_id === category?.category_id ||
    text(type.category_name) === text(category?.category_name) ||
    text(type.category_name) === fallbackName
  );
}

function findDeviceTypeResource(state, categoryValue, typeName, capacityGb = "") {
  const category = findCategoryResource(state, categoryValue);
  const rawTypeName = text(typeName);
  const parsedTarget = splitCapacityFromModel(rawTypeName);
  const targetType = parsedTarget.modelName;
  const targetCapacity = normalizeCapacity(capacityGb) || parsedTarget.capacityGb;
  if (!rawTypeName && !targetType) return null;

  const candidates = active(state.DeviceTypes).filter((type) => sameCategoryForType(type, category, categoryValue));
  return (
    candidates.find((type) => text(type.type_name) === rawTypeName) ||
    candidates.find((type) => {
      const parsedType = splitCapacityFromModel(type.type_name);
      if (parsedType.modelName !== targetType) return false;
      return capacityMatches(targetCapacity, parsedType.capacityGb);
    }) ||
    null
  );
}

function active(rows = []) {
  return rows.filter((row) => !isDeleted(row));
}

function isDeleted(row = {}) {
  return bool(row.is_deleted);
}

function bool(value) {
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes"].includes(String(value || "").toLowerCase());
}

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function searchable(row = {}) {
  return lower(Object.values(row).join(" "));
}

function splitCsv(value) {
  return text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
  const source = text(value);
  const number = Number(source.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return "";
  const multiplier = /TB/i.test(source) ? 1024 : 1;
  const capacityGb = number * multiplier;
  return Number.isInteger(capacityGb) ? String(capacityGb) : String(capacityGb);
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

function firstPath(value) {
  return text(value).split(";").map((item) => item.trim()).filter(Boolean)[0] || "";
}

function descCreated(a, b) {
  return text(b.created_at).localeCompare(text(a.created_at));
}

function currentUser(request) {
  return request.headers.get("x-user-id") || "";
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

function nextId(rows, field, prefix) {
  const next = nextSequence(rows, field);
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

function nextSequence(rows, field) {
  const max = rows.reduce((current, row) => {
    const digits = String(row[field] || "").match(/(\d+)(?!.*\d)/);
    const value = digits ? Number(digits[1]) : 0;
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 0);
  return max + 1;
}

function deviceIdBase(state, category, modelName, capacityGb) {
  const categoryRow = findCategoryResource(state, category);
  const typeRow = findDeviceTypeResource(state, category, modelName, capacityGb);
  const categoryPrefix = normalizePrefix(categoryRow?.prefix || `MAI-${slug(category || "EQ")}`);
  const typePrefix = normalizePrefix(typeRow?.type_prefix || "");
  return [categoryPrefix, typePrefix].filter(Boolean).join("-");
}

function nextDeviceId(state, category, modelName, capacityGb, excludeDeviceId = "") {
  const base = deviceIdBase(state, category, modelName, capacityGb);
  const max = active(state.Devices)
    .filter((row) => row.device_id !== excludeDeviceId)
    .filter((row) => String(row.device_id || "").startsWith(`${base}-`))
    .reduce((current, row) => {
      const match = String(row.device_id || "").match(/-(\d+)$/);
      const value = match ? Number(match[1]) : 0;
      return Number.isFinite(value) ? Math.max(current, value) : current;
    }, 0);
  const seq = max + 1;
  return `${base}-${String(seq).padStart(3, "0")}`;
}

function nextDeviceIdFromReserved(base, reserved = new Set()) {
  const re = new RegExp(`^${escapeRegExp(base)}-(\\d+)$`);
  const usedNumbers = [...reserved].reduce((result, deviceId) => {
    const match = text(deviceId).match(re);
    if (match) result.add(Number(match[1]));
    return result;
  }, new Set());
  let number = 1;
  let candidate = `${base}-${String(number).padStart(3, "0")}`;
  while (usedNumbers.has(number) || reserved.has(candidate)) {
    number += 1;
    candidate = `${base}-${String(number).padStart(3, "0")}`;
  }
  return candidate;
}

function qrPathForDeviceId(deviceId) {
  return `/uploads/qrcodes/${safeSegment(deviceId)}.png`;
}

function deviceDisplayName(category, modelName) {
  const categoryText = text(category);
  const modelText = splitCapacityFromModel(modelName).modelName;
  if (categoryText && modelText) return `${categoryText}(${modelText})`;
  return categoryText || modelText || "";
}

function slug(value) {
  return text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16) || "EQ";
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

function safeSegment(value) {
  return text(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function two(value) {
  return String(value).padStart(2, "0");
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function now() {
  const date = new Date();
  return `${today()}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

function ymd() {
  const date = new Date();
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}`;
}

function fileStamp() {
  return now().replace(/[-:T]/g, "");
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(text(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return `pbkdf2$1$${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password, storedPassword) {
  const stored = text(storedPassword);
  if (!password || !stored) return false;
  if (!stored.includes("$")) return stored === password;
  const parts = stored.split("$");
  if (parts[0] !== "pbkdf2" || parts.length !== 4) return false;
  const salt = fromHex(parts[2]);
  const expected = parts[3];
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return constantTimeEqual(toHex(new Uint8Array(bits)), expected);
}

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function stateDownload(state) {
  return new Response(JSON.stringify(normalizeState(state), null, 2), {
    status: 200,
    headers: {
      ...commonHeaders(),
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="devices-${fileStamp()}.json"`
    }
  });
}

async function serveQrCode(context, path) {
  const [, deviceId] = path.match(/^\/devices\/([^/]+)\/qrcode$/) || [];
  if (!deviceId) return json({ message: "QR path not found" }, 404);
  const url = new URL(context.request.url);
  const style = url.searchParams.get("style") === "label" ? "label" : "plain";
  const decodedDeviceId = decodeURIComponent(deviceId);
  const fileName = `${safeSegment(decodedDeviceId)}${style === "label" ? "-qr-label.svg" : "-qr.svg"}`;
  const svg = style === "label" ? await qrLabelSvg(decodedDeviceId) : await qrSvg(decodedDeviceId, 720, 2);
  const headers = new Headers({
    ...commonHeaders(),
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=3600"
  });
  if (["1", "true"].includes(url.searchParams.get("download") || "")) {
    headers.set("content-disposition", `attachment; filename="${fileName}"`);
  }
  return new Response(svg, { status: 200, headers });
}

async function qrSvg(deviceId, width = 720, margin = 2) {
  return QRCode.toString(text(deviceId), {
    type: "svg",
    width,
    margin,
    color: { dark: "#172033", light: "#ffffff" }
  });
}

async function qrLabelSvg(deviceId) {
  const qr = await qrSvg(deviceId, 660, 1);
  const encodedQr = bytesToBase64(new TextEncoder().encode(qr));
  const idText = escapeXml(deviceId);
  const idFontSize = Math.max(34, Math.min(58, Math.floor(720 / Math.max(String(deviceId).length * 0.62, 10))));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900" viewBox="0 0 720 900" role="img" aria-label="${idText} QR code">
  <rect width="720" height="900" fill="#000000"/>
  <rect x="24" y="24" width="672" height="672" fill="#ffffff"/>
  <image href="data:image/svg+xml;base64,${encodedQr}" x="30" y="30" width="660" height="660"/>
  <text x="360" y="770" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="400">Device No.</text>
  <text x="360" y="842" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${idFontSize}" font-weight="800">${idText}</text>
</svg>
`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
