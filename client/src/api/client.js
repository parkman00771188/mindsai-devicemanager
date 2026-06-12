import { clearCurrentUser, getCurrentUser } from "../auth.js";

const API_BASE = "/api";
const API_RETRY_DELAYS_MS = [250, 800];
const RETRY_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestMethod(options = {}) {
  return String(options.method || "GET").toUpperCase();
}

function canRetryRequest(path, options = {}) {
  const method = requestMethod(options);
  return method === "GET" || (method === "POST" && path === "/login");
}

function authHeaders() {
  const user = getCurrentUser();
  if (!user?.user_id) return {};
  return {
    "x-user-id": user.user_id,
    ...(user.session_token
      ? {
          "x-session-token": user.session_token,
          Authorization: `Bearer ${user.session_token}`
        }
      : {})
  };
}

function clearStoredUser() {
  try {
    clearCurrentUser();
    if (window.location.pathname !== "/login") {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    }
  } catch {
    // Ignore storage errors in non-browser contexts.
  }
}

async function parseResponse(response, path) {
  if (!response.ok) {
    let body = null;
    let message = "요청 처리 중 오류가 발생했습니다.";
    try {
      body = await response.json();
      message = body.message || message;
    } catch {
      message = response.statusText || message;
    }

    console.error("[Device Manager API]", {
      path,
      status: response.status,
      statusText: response.statusText,
      message,
      body
    });

    if (response.status === 401 && path !== "/login") clearStoredUser();
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response;
}

export function queryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function api(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...authHeaders(),
    ...(options.headers || {})
  };

  const retryable = canRetryRequest(path, options);
  for (let attempt = 0; attempt <= API_RETRY_DELAYS_MS.length; attempt += 1) {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        body:
          options.body && !(options.body instanceof FormData) && typeof options.body !== "string"
            ? JSON.stringify(options.body)
            : options.body
      });
    } catch (error) {
      if (retryable && attempt < API_RETRY_DELAYS_MS.length) {
        const delayMs = API_RETRY_DELAYS_MS[attempt];
        console.warn("[Device Manager API] Network error, retrying", { path, attempt: attempt + 1, delayMs, error });
        await wait(delayMs);
        continue;
      }
      console.error("[Device Manager API] Network error", { path, error });
      throw error;
    }

    if (retryable && RETRY_STATUS_CODES.has(response.status) && attempt < API_RETRY_DELAYS_MS.length) {
      const delayMs = API_RETRY_DELAYS_MS[attempt];
      console.warn("[Device Manager API] Transient response, retrying", {
        path,
        status: response.status,
        statusText: response.statusText,
        attempt: attempt + 1,
        delayMs
      });
      await wait(delayMs);
      continue;
    }

    return parseResponse(response, path);
  }
}

export function downloadUrl(path) {
  const user = getCurrentUser();
  if (!user?.user_id || !user?.session_token) return `${API_BASE}${path}`;

  const [pathname, query = ""] = path.split("?");
  const search = new URLSearchParams(query);
  search.set("user_id", user.user_id);
  search.set("session_token", user.session_token);
  return `${API_BASE}${pathname}?${search.toString()}`;
}
