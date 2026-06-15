// ===== ShiftBuilder constants.js ここから =====

export const SHIFTBUILDER_PERMISSIONS = {
  ALL: "all",
  MANAGER: "manager",
  EDIT: "edit",
  VIEW: "view",
  SELF: "self"
};

export const SHIFTBUILDER_PERMISSION_LABELS = {
  [SHIFTBUILDER_PERMISSIONS.ALL]: "全管理",
  [SHIFTBUILDER_PERMISSIONS.MANAGER]: "確定・公開管理",
  [SHIFTBUILDER_PERMISSIONS.EDIT]: "作成・編集",
  [SHIFTBUILDER_PERMISSIONS.VIEW]: "閲覧のみ",
  [SHIFTBUILDER_PERMISSIONS.SELF]: "自分の予定のみ"
};

export const EDITABLE_SHIFTBUILDER_PERMISSIONS = [
  SHIFTBUILDER_PERMISSIONS.ALL,
  SHIFTBUILDER_PERMISSIONS.MANAGER,
  SHIFTBUILDER_PERMISSIONS.EDIT
];

export const SHIFT_CELL_STATUS = {
  UNASSIGNED: "unassigned",
  SHORTAGE: "shortage",
  COMPLETED: "completed",
  OVER: "over"
};

export const SHIFT_CELL_STATUS_LABELS = {
  [SHIFT_CELL_STATUS.UNASSIGNED]: "未アサイン",
  [SHIFT_CELL_STATUS.SHORTAGE]: "不足",
  [SHIFT_CELL_STATUS.COMPLETED]: "アサイン完了",
  [SHIFT_CELL_STATUS.OVER]: "超過"
};

export const CANDIDATE_GROUPS = {
  AVAILABLE: "追加できる候補",
  WARNING: "注意あり候補",
  UNAVAILABLE: "追加不可"
};

export const CANDIDATE_GROUP_CLASSES = {
  [CANDIDATE_GROUPS.AVAILABLE]: "candidate-available",
  [CANDIDATE_GROUPS.WARNING]: "candidate-warning",
  [CANDIDATE_GROUPS.UNAVAILABLE]: "candidate-unavailable"
};

export const EMPTY_CELL = {
  required: 0,
  assigned: [],
  candidates: []
};

// ===== ShiftBuilder constants.js ここまで =====
