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

export async function onRequest(context) {
  try {
    if (context.request.method === "OPTIONS") return emptyResponse(204);

    const url = new URL(context.request.url);
    const path = apiPath(url.pathname);

    if (path === "/admin/seed" && context.request.method === "POST") {
      return seedState(context);
    }
    if (path === "/admin/reencrypt" && context.request.method === "POST") {
      return reencryptState(context);
    }
    if (context.request.method === "GET" && /^\/devices\/[^/]+\/qrcode$/.test(path)) {
      return serveQrCode(context, path);
    }

    const state = await loadState(context);
    if (!isPublicApi(path)) requireSession(state, context.request);
    const body = await readBody(context.request);
    const result = await route(context, state, path, body);

    if (result.save) await saveState(context.env, state);
    if (result.response) return result.response;
    return json(result.data, result.status || 200);
  } catch (error) {
    console.error(error);
    return json({ message: error.message || "Request failed" }, error.statusCode || 500);
  }
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
  await db.exec(
    "CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)"
  );
}

async function loadState(context) {
  await ensureDb(context.env.DB);
  const row = await context.env.DB.prepare("SELECT value FROM app_state WHERE key = ?").bind(STATE_KEY).first();
  if (row?.value) return decryptStateForRuntime(context.env, normalizeState(JSON.parse(row.value)));
  return normalizeState();
}

async function saveState(env, state) {
  await ensureDb(env.DB);
  const storageState = await encryptStateForStorage(env, state);
  const jsonState = JSON.stringify(storageState);
  await env.DB
    .prepare(
      "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(STATE_KEY, jsonState, now())
    .run();
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

  if (path === "/login" && method === "POST") return { data: await authenticate(context, state, body), save: true };
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

function requireSession(state, request) {
  const url = new URL(request.url);
  const userId = request.headers.get("x-user-id") || url.searchParams.get("user_id") || "";
  const token = request.headers.get("x-session-token") || url.searchParams.get("session_token") || "";
  const user = findUser(state, userId, true);
  if (!user || isDeleted(user) || !token || user.session_token !== token) {
    throw Object.assign(new Error("Login required"), { statusCode: 401 });
  }
  return user;
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
      updateDevice(device, body);
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
    device_name: input.device_name || [input.category, input.model_name].filter(Boolean).join(" "),
    status: input.status || "AVAILABLE",
    qr_code_path: input.qr_code_path || `/uploads/qrcodes/${safeSegment(deviceId)}.png`,
    main_photo_path: input.main_photo_path || firstPath(input.photo_paths),
    created_at: created,
    updated_at: created,
    is_deleted: false
  };
  state.Devices.push(row);
  addTransaction(state, row, "REGISTER", { memo: "Device registered", photo_paths: row.photo_paths || "" }, userId, "", row.status);
  return row;
}

function updateDevice(device, input) {
  const protectedFields = new Set(["device_id", "created_at", "is_deleted"]);
  Object.entries(input || {}).forEach(([key, value]) => {
    if (!protectedFields.has(key)) device[key] = value;
  });
  if (!device.main_photo_path) device.main_photo_path = firstPath(device.photo_paths);
  device.updated_at = now();
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

function listDevices(state, params = new URLSearchParams()) {
  const keyword = lower(params.get("keyword"));
  const status = params.get("status") || "";
  const category = params.get("category") || "";
  return active(state.Devices)
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
  return active(state.Transactions)
    .filter((row) => !actions.length || actions.includes(row.action_type))
    .filter((row) => !excluded.length || !excluded.includes(row.action_type))
    .filter((row) => !params.get("device_id") || row.device_id === params.get("device_id"))
    .filter((row) => !keyword || searchable(row).includes(keyword) || searchable(findDevice(state, row.device_id) || {}).includes(keyword))
    .sort(descCreated)
    .map((row) => attachTransaction(state, row));
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
  return active(state.Maintenance)
    .filter((row) => !params.get("device_id") || row.device_id === params.get("device_id"))
    .filter((row) => !keyword || searchable(row).includes(keyword))
    .sort(descCreated)
    .map((row) => ({ ...row, device: findDevice(state, row.device_id) || null }));
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
    assigned_devices: active(state.Devices).filter((device) => device.current_borrower === user.name).map((device) => attachDevice(state, device, false)),
    transactions: listTransactions(state, new URLSearchParams()).filter((row) => row.user_name === user.name || row.handled_by === user.user_id).slice(0, 30)
  };
}

function attachUserSummary(state, user) {
  const assigned = active(state.Devices).filter((device) => device.current_borrower === user.name);
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
  user.session_token = randomToken();
  user.session_token_created_at = now();
  return { user: sanitizeUser(user, true) };
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
  const actor = findUser(state, userId, true);
  const isAdmin = normalizeRole(actor?.role || (userId === "admin" ? "ADMIN" : "USER")) === "ADMIN";
  return active(state.Notifications)
    .filter((row) => {
      if (scope === "dashboard" && isAdmin) return true;
      return !userId || row.recipient_user_id === userId;
    })
    .sort(descCreated)
    .map((row) => attachNotification(state, row));
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

function nextDeviceId(state, category, modelName, capacityGb) {
  const categoryRow = active(state.Categories).find((row) => row.category_name === category);
  const typeRow = active(state.DeviceTypes).find(
    (row) => row.category_name === category && (!modelName || row.type_name === modelName)
  );
  const categoryPrefix = categoryRow?.prefix || `MAI-${slug(category || "EQ")}`;
  const typePrefix = typeRow?.type_prefix || "";
  const capacity = capacityGb ? slug(`${capacityGb}GB`) : "";
  const base = [categoryPrefix, typePrefix, capacity].filter(Boolean).join("-");
  const seq = active(state.Devices).filter((row) => String(row.device_id || "").startsWith(base)).length + 1;
  return `${base}-${String(seq).padStart(3, "0")}`;
}

function slug(value) {
  return text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16) || "EQ";
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
  const fileName = `${safeSegment(decodeURIComponent(deviceId))}${style === "label" ? "-label.svg" : ".png"}`;
  const assetPath = `/uploads/qrcodes/${fileName}`;
  const response = await assetFetch(context, assetPath);
  if (!response.ok) return json({ message: "QR image not found" }, 404);
  const headers = new Headers(response.headers);
  if (style === "label") headers.set("content-type", "image/svg+xml");
  else headers.set("content-type", "image/png");
  if (["1", "true"].includes(url.searchParams.get("download") || "")) {
    headers.set("content-disposition", `attachment; filename="${fileName}"`);
  }
  return new Response(response.body, { status: 200, headers });
}

async function assetFetch(context, assetPath) {
  const request = new Request(new URL(assetPath, context.request.url).toString(), { method: "GET" });
  return context.env.ASSETS ? context.env.ASSETS.fetch(request) : fetch(request);
}
