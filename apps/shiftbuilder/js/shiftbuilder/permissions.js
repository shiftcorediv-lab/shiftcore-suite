// ===== ShiftBuilder permissions.js ここから =====

import {
  SHIFTBUILDER_PERMISSION_LABELS,
  EDITABLE_SHIFTBUILDER_PERMISSIONS
} from "./constants.js?v=20260801-hardening-1";

export function getPermissionLabel(permission) {
  return SHIFTBUILDER_PERMISSION_LABELS[permission] || "権限なし";
}

export function canEdit(permission) {
  return EDITABLE_SHIFTBUILDER_PERMISSIONS.includes(permission);
}

// ===== ShiftBuilder permissions.js ここまで =====
