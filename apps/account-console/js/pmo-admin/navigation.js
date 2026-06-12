import { DASHBOARD_URL, MANAGE_ALLOWED_ROLES } from "./config.js";

export function canManagePmo(currentUser) {
  const role = String(currentUser?.role || "").trim().toLowerCase();
  return MANAGE_ALLOWED_ROLES.includes(role);
}

export function goToDashboard() {
  window.location.href = DASHBOARD_URL;
}

export function openUrl(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function downloadExcelFile(fileName, base64Data, mimeType) {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const blob = new Blob([bytes], {
    type: mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(blobUrl);
}
