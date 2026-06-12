export function getStoredUser() {
  const raw = sessionStorage.getItem("shiftcore_user");

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

export function clearStoredUser() {
  sessionStorage.removeItem("shiftcore_user");
}
