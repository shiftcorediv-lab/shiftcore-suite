import {
  operatorText,
  permissionBadge,
  currentUserPermissionText,
  visibleCountText,
  totalCountText,
  statusSummaryText,
  userTableBody,
  editorTitle,
  selectedUserIdText,
  internalUserIdInput,
  nameInput,
  displayNameInput,
  employeeCodeInput,
  emailInput,
  phoneInput,
  roleInput,
  organizationInput,
  departmentInput,
  positionInput,
  baseAreaInput,
  statusInput,
  workStatusInput,
  sortOrderInput,
  ordercasePermissionInput,
  shiftbuilderPermissionInput,
  memoInput,
  authProviderText,
  authUidText,
  createdAtText,
  updatedAtText,
  updatedByText,
  logsList,
  statusBox
} from "./dom.js";


// ===== 表示ラベル定義ここから =====
const ROLE_LABELS = {
  member: "弊社内人員",
  employee: "弊社内人員",
  internal: "弊社内人員",
  admin: "管理者",
  dev: "開発管理者",
  developer: "開発管理者",
  partner_individual: "アライアンス個人",
  alliance_individual: "アライアンス個人",
  partner_company: "アライアンス法人",
  partner_company_admin: "アライアンス法人 管理者",
  alliance_company: "アライアンス法人",
  alliance_company_admin: "アライアンス法人 管理者",
  agency: "代理店"
};

const STATUS_LABELS = {
  active: "有効",
  inactive: "停止",
  pending: "確認待ち",
  pending_approval: "承認待ち"
};

const WORK_STATUS_LABELS = {
  on: "稼働対象",
  off: "稼働対象外",
  active: "稼働対象",
  inactive: "稼働対象外",
  available: "稼働対象",
  unavailable: "稼働対象外"
};

const MODULE_LABELS = {
  account: "アカウント基盤",
  account_console: "Account Console",
  pmo: "希望休 / 稼働不可日申請",
  ordercase: "OrderCase",
  manual: "取扱説明書",
  shift: "ShiftBuilder",
  dashboard: "Dashboard"
};

const ORDERCASE_PERMISSION_LABELS = {
  all: "全操作可能",
  edit: "登録・編集可能",
  view: "閲覧のみ 金額表示あり",
  view_without_amount: "閲覧のみ 金額非表示"
};

const SHIFTBUILDER_PERMISSION_LABELS = {
  all: "全管理",
  manager: "確定・公開管理",
  edit: "作成・編集",
  view: "閲覧のみ",
  self: "自分の予定のみ"
};

const FIELD_LABELS = {
  internal_user_id: "内部ユーザーID",
  name: "氏名 / 登録名",
  display_name: "表示名",
  employee_code: "アカウントコード",
  email: "メール",
  phone: "電話番号",
  role: "アカウント種別",
  organization_id: "所属ID / 所属名",
  department: "部署",
  position: "役職",
  base_area: "担当エリア",
  status: "アカウント状態",
  work_status: "稼働対象状態",
  workStatus: "稼働対象状態",
  sort_order: "並び順",
  sortOrder: "並び順",
  allowed_modules: "利用可能機能",
  ordercase_permission: "OrderCase権限",
  shiftbuilder_permission: "ShiftBuilder権限",
  memo: "メモ",
  auth_provider: "認証プロバイダ",
  auth_uid: "認証UID"
};
// ===== 表示ラベル定義ここまで =====


// ===== 状態表示ここから =====
export function setStatus(message) {
  statusBox.textContent = message;
}

export function setOperator(user) {
  operatorText.textContent = `${user.name || user.display_name || "-"} / ${user.email || "-"}`;
  permissionBadge.textContent = "Account Console 使用可";
  permissionBadge.className = "badge ok";
}

export function setPermissionError(message) {
  permissionBadge.textContent = "権限なし";
  permissionBadge.className = "badge ng";
  operatorText.textContent = message;

  if (currentUserPermissionText) {
    currentUserPermissionText.textContent = "-";
  }
}

export function renderCurrentUserPermission(user) {
  if (!currentUserPermissionText) {
    return;
  }

  const modules = modulesTextForDisplay(user.allowed_modules);
  const ordercasePermission = labelFromMap(user.ordercase_permission, ORDERCASE_PERMISSION_LABELS, "なし");
  const shiftbuilderPermission = labelFromMap(user.shiftbuilder_permission, SHIFTBUILDER_PERMISSION_LABELS, "なし");
  const role = labelFromMap(user.role, ROLE_LABELS, "-");
  const status = labelFromMap(user.status, STATUS_LABELS, "-");
  const workStatus = labelFromMap(user.work_status || user.workStatus, WORK_STATUS_LABELS, "-");

  currentUserPermissionText.textContent =
    `アカウント種別：${role} / アカウント状態：${status} / 稼働対象状態：${workStatus} / 利用可能機能：${modules || "-"} / OrderCase：${ordercasePermission} / ShiftBuilder：${shiftbuilderPermission}`;
}
// ===== 状態表示ここまで =====


// ===== テキスト整形ここから =====
function text(value) {
  return String(value == null ? "" : value).trim();
}

function labelFromMap(value, map, fallback = "未設定") {
  const key = text(value);

  if (!key) {
    return fallback;
  }

  return map[key] || key;
}

function modulesArray(value) {
  return text(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function modulesTextForDisplay(value) {
  return modulesArray(value)
    .map((item) => MODULE_LABELS[item] || item)
    .join(", ");
}

function displayValueByField(field, value) {
  const key = text(field);
  const raw = text(value);

  if (!raw) {
    return "";
  }

  if (key === "role") {
    return labelFromMap(raw, ROLE_LABELS, raw);
  }

  if (key === "status") {
    return labelFromMap(raw, STATUS_LABELS, raw);
  }

  if (key === "work_status" || key === "workStatus") {
    return labelFromMap(raw, WORK_STATUS_LABELS, raw);
  }

  if (key === "allowed_modules") {
    return modulesTextForDisplay(raw);
  }

  if (key === "ordercase_permission") {
    return labelFromMap(raw, ORDERCASE_PERMISSION_LABELS, raw);
  }

  if (key === "shiftbuilder_permission") {
    return labelFromMap(raw, SHIFTBUILDER_PERMISSION_LABELS, raw);
  }

  return raw;
}

function makeTd(value) {
  const td = document.createElement("td");
  td.textContent = text(value) || "-";
  return td;
}
// ===== テキスト整形ここまで =====


// ===== ユーザー絞り込みここから =====
export function filterUsers(users, keyword) {
  const q = text(keyword).toLowerCase();

  if (!q) {
    return users;
  }

  return users.filter((user) => {
    const haystack = [
      user.name,
      user.display_name,
      user.employee_code,
      user.email,
      user.phone,
      user.role,
      labelFromMap(user.role, ROLE_LABELS, ""),
      user.organization_id,
      user.department,
      user.position,
      user.base_area,
      user.status,
      labelFromMap(user.status, STATUS_LABELS, ""),
      user.work_status,
      user.workStatus,
      labelFromMap(user.work_status || user.workStatus, WORK_STATUS_LABELS, ""),
      user.allowed_modules,
      modulesTextForDisplay(user.allowed_modules),
      user.ordercase_permission,
      labelFromMap(user.ordercase_permission, ORDERCASE_PERMISSION_LABELS, ""),
      user.shiftbuilder_permission,
      labelFromMap(user.shiftbuilder_permission, SHIFTBUILDER_PERMISSION_LABELS, ""),
      user.memo
    ].map((value) => text(value).toLowerCase()).join(" ");

    return haystack.includes(q);
  });
}
// ===== ユーザー絞り込みここまで =====


// ===== ユーザー一覧描画ここから =====
export function renderUsers(users, selectedUserId, onSelectUser) {
  userTableBody.innerHTML = "";

  if (!users.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 12;
    td.textContent = "表示できるアカウントがありません";
    tr.appendChild(td);
    userTableBody.appendChild(tr);
    return;
  }

  users.forEach((user) => {
    const tr = document.createElement("tr");

    if (text(user.internal_user_id) === text(selectedUserId)) {
      tr.classList.add("selected");
    }

    tr.appendChild(makeTd(user.name));
    tr.appendChild(makeTd(user.display_name));
    tr.appendChild(makeTd(user.employee_code));
    tr.appendChild(makeTd(user.email));
    tr.appendChild(makeTd(labelFromMap(user.role, ROLE_LABELS, "-")));
    tr.appendChild(makeTd(user.department));
    tr.appendChild(makeTd(user.position));
    tr.appendChild(makeTd(user.base_area));

    const statusTd = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "status-pill " + text(user.status).toLowerCase();
    pill.textContent = labelFromMap(user.status, STATUS_LABELS, "-");
    statusTd.appendChild(pill);
    tr.appendChild(statusTd);

    tr.appendChild(makeTd(modulesTextForDisplay(user.allowed_modules)));
    tr.appendChild(makeTd(labelFromMap(user.ordercase_permission, ORDERCASE_PERMISSION_LABELS, "なし")));
    tr.appendChild(makeTd(labelFromMap(user.shiftbuilder_permission, SHIFTBUILDER_PERMISSION_LABELS, "なし")));

    tr.addEventListener("click", () => onSelectUser(user));
    userTableBody.appendChild(tr);
  });
}
// ===== ユーザー一覧描画ここまで =====


// ===== 集計表示ここから =====
export function renderSummary(filteredUsers, allUsers) {
  visibleCountText.textContent = String(filteredUsers.length);
  totalCountText.textContent = String(allUsers.length);

  const activeCount = allUsers.filter((user) => text(user.status) === "active").length;
  const inactiveCount = allUsers.filter((user) => text(user.status) === "inactive").length;

  statusSummaryText.textContent = `有効 ${activeCount} / 停止 ${inactiveCount}`;
}
// ===== 集計表示ここまで =====


// ===== フォーム操作ここから =====
export function clearUserForm() {
  editorTitle.textContent = "アカウント追加";
  selectedUserIdText.textContent = "新規作成";

  internalUserIdInput.value = "";
  nameInput.value = "";
  displayNameInput.value = "";
  employeeCodeInput.value = "";
  emailInput.value = "";
  phoneInput.value = "";
  roleInput.value = "member";
  organizationInput.value = "";
  departmentInput.value = "";
  positionInput.value = "";
  baseAreaInput.value = "";
  statusInput.value = "active";
  workStatusInput.value = "off";
  sortOrderInput.value = "";
  ordercasePermissionInput.value = "";
  shiftbuilderPermissionInput.value = "";
  memoInput.value = "";

  document.querySelectorAll("input[name='module']").forEach((checkbox) => {
    checkbox.checked = false;
  });

  authProviderText.textContent = "-";
  authUidText.textContent = "-";
  createdAtText.textContent = "-";
  updatedAtText.textContent = "-";
  updatedByText.textContent = "-";
}

export function fillUserForm(user) {
  editorTitle.textContent = "アカウント編集";
  selectedUserIdText.textContent = text(user.internal_user_id) || "IDなし";

  internalUserIdInput.value = text(user.internal_user_id);
  nameInput.value = text(user.name);
  displayNameInput.value = text(user.display_name);
  employeeCodeInput.value = text(user.employee_code);
  emailInput.value = text(user.email);
  phoneInput.value = text(user.phone);
  roleInput.value = text(user.role) || "member";
  organizationInput.value = text(user.organization_id);
  departmentInput.value = text(user.department);
  positionInput.value = text(user.position);
  baseAreaInput.value = text(user.base_area);
  statusInput.value = text(user.status) || "active";
  workStatusInput.value = text(user.work_status || user.workStatus) || "off";
  sortOrderInput.value = text(user.sort_order || user.sortOrder);
  ordercasePermissionInput.value = text(user.ordercase_permission);
  shiftbuilderPermissionInput.value = text(user.shiftbuilder_permission);
  memoInput.value = text(user.memo);

  const modules = modulesArray(user.allowed_modules);

  document.querySelectorAll("input[name='module']").forEach((checkbox) => {
    checkbox.checked = modules.includes(checkbox.value);
  });

  authProviderText.textContent = text(user.auth_provider) || "-";
  authUidText.textContent = text(user.auth_uid) || "-";
  createdAtText.textContent = text(user.created_at) || "-";
  updatedAtText.textContent = text(user.updated_at) || "-";
  updatedByText.textContent = text(user.updated_by) || "-";
}

export function collectUserForm() {
  const modules = Array.from(document.querySelectorAll("input[name='module']:checked"))
    .map((checkbox) => checkbox.value);

  return {
    internal_user_id: text(internalUserIdInput.value),
    name: text(nameInput.value),
    display_name: text(displayNameInput.value),
    employee_code: text(employeeCodeInput.value),
    email: text(emailInput.value),
    phone: text(phoneInput.value),
    role: text(roleInput.value),
    organization_id: text(organizationInput.value),
    department: text(departmentInput.value),
    position: text(positionInput.value),
    base_area: text(baseAreaInput.value),
    status: text(statusInput.value),
    workStatus: text(workStatusInput.value),
    sortOrder: text(sortOrderInput.value),
    allowed_modules: modules.join(","),
    ordercase_permission: text(ordercasePermissionInput.value),
    shiftbuilder_permission: text(shiftbuilderPermissionInput.value),
    memo: text(memoInput.value)
  };
}
// ===== フォーム操作ここまで =====


// ===== 変更履歴描画ここから =====
export function renderLogs(logs) {
  logsList.innerHTML = "";

  if (!logs.length) {
    logsList.textContent = "変更履歴はありません";
    return;
  }

  logs.forEach((log) => {
    const item = document.createElement("div");
    item.className = "log-item";

    const meta = document.createElement("div");
    meta.className = "log-meta";
    meta.textContent = `${log.changed_at || "-"} / ${log.changed_by || "-"} / ${log.target_email || "-"}`;

    const field = text(log.field);
    const fieldLabel = FIELD_LABELS[field] || field || "-";

    const beforeValue = displayValueByField(field, log.before_value);
    const afterValue = displayValueByField(field, log.after_value);

    const body = document.createElement("div");
    body.textContent = `${fieldLabel}：${beforeValue || ""} → ${afterValue || ""}`;

    const memo = document.createElement("div");
    memo.className = "log-meta";
    memo.textContent = log.memo || "";

    item.appendChild(meta);
    item.appendChild(body);
    item.appendChild(memo);

    logsList.appendChild(item);
  });
}
// ===== 変更履歴描画ここまで =====

// ===== 保存確認メッセージここから =====
export function buildSaveConfirmMessage(user) {
  const name = user?.name || user?.display_name || "このアカウント";
  const email = user?.email || "-";
  const employeeCode = user?.employee_code || user?.employeeCode || "-";

  const allowedModules = user?.allowed_modules || "-";
  const ordercasePermission = user?.ordercase_permission || "なし";
  const shiftbuilderPermission = user?.shiftbuilder_permission || "なし";

  return [
    "以下の内容で保存します。",
    "",
    `氏名：${name}`,
    `メール：${email}`,
    `アカウントコード：${employeeCode}`,
    `利用可能機能：${allowedModules}`,
    `OrderCase権限：${ordercasePermission}`,
    `ShiftBuilder権限：${shiftbuilderPermission}`,
    "",
    "保存してよろしいですか？"
  ].join("\n");
}
// ===== 保存確認メッセージここまで =====

// ===== ローディング表示ここから =====
let loadingOverlayEl = null;

function ensureLoadingOverlay() {
  if (loadingOverlayEl) {
    return loadingOverlayEl;
  }

  loadingOverlayEl = document.createElement("div");
  loadingOverlayEl.id = "loadingOverlay";
  loadingOverlayEl.className = "loading-overlay";
  loadingOverlayEl.innerHTML = `
    <div class="loading-card">
      <div class="loading-spinner" aria-hidden="true"></div>
      <div class="loading-text">読み込み中...</div>
    </div>
  `;

  document.body.appendChild(loadingOverlayEl);
  return loadingOverlayEl;
}

export function showLoading(message = "読み込み中...") {
  const overlay = ensureLoadingOverlay();
  const messageEl = overlay.querySelector(".loading-text");

  if (messageEl) {
    messageEl.textContent = message;
  }

  overlay.classList.add("show");

  if (statusBox) {
    statusBox.textContent = message;
    statusBox.classList.add("loading");
  }
}

export function hideLoading(message = "") {
  const overlay = ensureLoadingOverlay();

  overlay.classList.remove("show");

  if (statusBox) {
    statusBox.classList.remove("loading");

    if (message) {
      statusBox.textContent = message;
    }
  }
}
// ===== ローディング表示ここまで =====

// ===== 変更履歴ローディング表示ここから =====
export function setLogsLoading(isLoading, message = "変更履歴を読み込み中...") {
  if (!logsList) {
    return;
  }

  if (isLoading) {
    logsList.classList.add("logs-loading");
    logsList.innerHTML = `
      <div class="logs-loading-box">
        <div class="logs-spinner" aria-hidden="true"></div>
        <div>${message}</div>
      </div>
    `;
    return;
  }

  logsList.classList.remove("logs-loading");
}
// ===== 変更履歴ローディング表示ここまで =====
