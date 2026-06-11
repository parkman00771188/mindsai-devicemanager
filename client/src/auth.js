export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("deviceManagerUser") || "null") || null;
  } catch {
    return null;
  }
}

export function isAdminUser(user = getCurrentUser()) {
  return user?.role === "ADMIN";
}

export function roleLabel(role) {
  return role === "ADMIN" ? "관리자" : "사용자";
}
