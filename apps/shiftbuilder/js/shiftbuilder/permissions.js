// ===== ShiftBuilder permissions.js ここから =====

export function getPermissionLabel(permission) {
  const labels = {
    all: "全管理",
    manager: "確定・公開管理",
    edit: "作成・編集",
    view: "閲覧のみ",
    self: "自分の予定のみ"
  };

  return labels[permission] || "権限なし";
}

export function canEdit(permission) {
  return ["all", "manager", "edit"].includes(permission);
}

// ===== ShiftBuilder permissions.js ここまで =====
