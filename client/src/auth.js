const USER_STORAGE_KEY = "deviceManagerUser";
let memoryUser = null;

function browserStorage(name) {
  try {
    return window[name] || null;
  } catch {
    return null;
  }
}

function readStorage(storage) {
  if (!storage) return null;
  try {
    return JSON.parse(storage.getItem(USER_STORAGE_KEY) || "null") || null;
  } catch {
    return null;
  }
}

function writeStorage(storage, user) {
  if (!storage) return false;
  try {
    storage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    return true;
  } catch {
    return false;
  }
}

function removeStorage(storage) {
  if (!storage) return;
  try {
    storage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Ignore storage restrictions.
  }
}

export function getCurrentUser() {
  return memoryUser || readStorage(browserStorage("localStorage")) || readStorage(browserStorage("sessionStorage"));
}

export function setCurrentUser(user) {
  const previous = getCurrentUser();
  const nextUser =
    user && previous?.user_id === user.user_id
      ? {
          ...user,
          session_token: user.session_token || previous.session_token,
          session_token_created_at: user.session_token_created_at || previous.session_token_created_at
        }
      : user || null;
  memoryUser = nextUser;
  if (nextUser) {
    const saved = writeStorage(browserStorage("localStorage"), nextUser) || writeStorage(browserStorage("sessionStorage"), nextUser);
    window.dispatchEvent(new Event("deviceManagerUserChanged"));
    return saved;
  }
  removeStorage(browserStorage("localStorage"));
  removeStorage(browserStorage("sessionStorage"));
  window.dispatchEvent(new Event("deviceManagerUserChanged"));
  return true;
}

export function clearCurrentUser() {
  memoryUser = null;
  removeStorage(browserStorage("localStorage"));
  removeStorage(browserStorage("sessionStorage"));
  window.dispatchEvent(new Event("deviceManagerUserChanged"));
}

export function isAdminUser(user = getCurrentUser()) {
  return user?.role === "ADMIN";
}

export function roleLabel(role) {
  return role === "ADMIN" ? "관리자" : "사용자";
}
