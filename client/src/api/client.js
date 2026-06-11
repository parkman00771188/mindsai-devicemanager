const API_BASE = "/api";

function authHeaders() {
  try {
    const user = JSON.parse(localStorage.getItem("deviceManagerUser") || "null");
    if (!user?.user_id) return {};
    return {
      "x-user-id": user.user_id,
      ...(user.session_token ? { "x-session-token": user.session_token } : {})
    };
  } catch {
    return {};
  }
}

function clearStoredUser() {
  try {
    localStorage.removeItem("deviceManagerUser");
    window.dispatchEvent(new Event("deviceManagerUserChanged"));
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
    let message = "요청 처리 중 오류가 발생했습니다.";
    try {
      const body = await response.json();
      message = body.message || message;
    } catch {
      message = response.statusText || message;
    }
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
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body:
      options.body && !(options.body instanceof FormData) && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body
  });
  return parseResponse(response, path);
}

export function downloadUrl(path) {
  return `${API_BASE}${path}`;
}
