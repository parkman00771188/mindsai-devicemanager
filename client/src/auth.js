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
  memoryUser = user || null;
  if (user) {
    const saved = writeStorage(browserStorage("localStorage"), user) || writeStorage(browserStorage("sessionStorage"), user);
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
