import { DASHBOARD_URL, SIGNUP_ADMIN_URL } from "./config.js?v=20260802-modules-2";
import { requireAccountConsoleSession } from "./auth.js";
import { compareUsersBySortOrder } from "./sort.js?v=20260802-modules-2";
import { planSortOrderUpdates } from "./reorder.js?v=20260802-reorder-1";
import {
  getAccountConsoleBootstrap,
  listAccountUsers,
  createAccountUser,
  updateAccountUser,
  getOrganizationAssignment,
  updateOrganizationAssignment,
  getAccountLogs
} from "./api.js?v=20260810-org-shadow-1";
import {
  dashboardBtn,
  signupAdminBtn,
  reloadBtn,
  newUserBtn,
  searchInput,
  userForm,
  organizationAuthorityFieldset,
  contractTypeInput,
  organizationLevelInput,
  saveOrganizationBtn,
  clearFormBtn,
  loadLogsBtn,
  saveUserBtn
} from "./dom.js?v=20260810-org-shadow-1";
import {
  setStatus,
  setOperator,
  setPermissionError,
  renderCurrentUserPermission,
  filterUsers,
  renderUsers,
  renderSummary,
  clearUserForm,
  fillUserForm,
  collectUserForm,
  renderLogs,
  buildSaveConfirmMessage,
  updateClassificationMigrationHint,
  resetOrganizationAssignment,
  renderOrganizationAssignment,
  renderOrganizationCandidateOptions,
  collectOrganizationAssignment,
  showLoading,
  hideLoading,
  setLogsLoading
} from "./ui.js?v=20260902-account-write-auth-1";
import { createResponseGeneration } from "../../../common/response-generation.js?v=20260902-response-1";

// ===== 状態ここから =====
let session = null;
let idToken = "";
let allUsers = [];
let selectedUser = null;
let currentUser = null;
let organizationCandidates = [];
let canEditUsers = false;
const userLoadGeneration = createResponseGeneration();
const organizationLoadGeneration = createResponseGeneration();
const logLoadGeneration = createResponseGeneration();
// ===== 状態ここまで =====


// ===== API結果判定ここから =====
function isOkResult(result) {
  return result && (result.ok === true || result.success === true);
}
// ===== API結果判定ここまで =====


// ===== 操作ボタン制御ここから =====
function setSaveDisabled(disabled) {
  saveUserBtn.disabled = disabled || !canEditUsers;
}

function applyUserEditingMode() {
  newUserBtn.disabled = !canEditUsers;
  clearFormBtn.disabled = !canEditUsers;
  Array.from(userForm.elements).forEach((control) => {
    if (control === organizationAuthorityFieldset || organizationAuthorityFieldset.contains(control)) return;
    control.disabled = !canEditUsers;
  });
  setSaveDisabled(false);
}
// ===== 操作ボタン制御ここまで =====


// ===== 初期化ここから =====
async function init() {
  try {
    showLoading("ログイン状態を確認中...");
    setStatus("ログイン状態を確認中...");

    session = await requireAccountConsoleSession();

    if (!session) {
      hideLoading();
      return;
    }

    idToken = session.idToken;

    showLoading("人員マスターを読み込み中...");
    setStatus("人員マスターを読み込み中...");

    const bootstrapResult = await getAccountConsoleBootstrap(idToken);

    if (!isOkResult(bootstrapResult)) {
      setPermissionError(bootstrapResult.message || "人員マスターの利用権限がありません");
      setStatus(JSON.stringify(bootstrapResult, null, 2));
      hideLoading();
      return;
    }

    currentUser = bootstrapResult.user;
    canEditUsers = bootstrapResult.canEditUsers === true;
    allUsers = Array.isArray(bootstrapResult.users) ? bootstrapResult.users : [];
    setOperator(currentUser, canEditUsers);
    renderCurrentUserPermission(currentUser);
    renderCurrentUsers();
    renderLogs(Array.isArray(bootstrapResult.logs) ? bootstrapResult.logs : []);

    clearUserForm();
    applyUserEditingMode();
    setStatus(canEditUsers ? "人員マスターを読み込みました" : "人員マスターを閲覧モードで読み込みました");

  } catch (error) {
    setPermissionError(error.message);
    setStatus("初期化エラー\n\n" + error.message);
  } finally {
    hideLoading();
  }
}
// ===== 初期化ここまで =====


// ===== ユーザー一覧読み込みここから =====
async function loadUsers(loadingMessage = "ユーザー名簿を取得中...") {
  const generation = userLoadGeneration.begin();
  showLoading(loadingMessage);
  setStatus(loadingMessage);

  let result;
  try {
    result = await listAccountUsers(idToken);
  } catch (error) {
    if (!userLoadGeneration.isCurrent(generation)) return false;
    throw error;
  }
  if (!userLoadGeneration.isCurrent(generation)) return false;

  if (!isOkResult(result)) {
    throw new Error(result.message || "ユーザー一覧の取得に失敗しました");
  }

  allUsers = Array.isArray(result.users) ? result.users : [];

  renderCurrentUsers();
  setStatus("ユーザー名簿を取得しました");
  return true;
}

function renderCurrentUsers() {
  const filtered = filterUsers(allUsers, searchInput.value).slice().sort(compareUsersBySortOrder);
  const selectedId = selectedUser ? selectedUser.internal_user_id : "";

  renderUsers(filtered, selectedId, (user) => {
    selectedUser = user;
    fillUserForm(user);
    renderCurrentUsers();

    loadLogsForSelectedUser("選択中アカウントの変更履歴を取得中...")
      .catch((error) => {
        setStatus("履歴取得エラー\n\n" + error.message);
      });

    loadOrganizationForSelectedUser()
      .catch((error) => {
        resetOrganizationAssignment(error.message || "組織設定を取得できませんでした");
      });
  });

  renderSummary(filtered, allUsers);
}

function findUserById(userId) {
  return allUsers.find((user) => {
    return String(user.internal_user_id || "").trim() === String(userId || "").trim();
  }) || null;
}
// ===== ユーザー一覧読み込みここまで =====

async function loadOrganizationForSelectedUser() {
  if (!selectedUser?.internal_user_id) {
    organizationCandidates = [];
    resetOrganizationAssignment();
    return true;
  }

  const selectedUserId = selectedUser.internal_user_id;
  const generation = organizationLoadGeneration.begin();
  let result;
  try {
    result = await getOrganizationAssignment(idToken, selectedUserId);
  } catch (error) {
    if (!organizationLoadGeneration.isCurrent(generation) || selectedUser?.internal_user_id !== selectedUserId) return false;
    throw error;
  }
  if (!organizationLoadGeneration.isCurrent(generation) || selectedUser?.internal_user_id !== selectedUserId) return false;
  if (!isOkResult(result)) {
    throw new Error(result.message || result.code || "組織設定の取得に失敗しました");
  }

  organizationCandidates = Array.isArray(result.candidates) ? result.candidates : [];
  renderOrganizationAssignment(
    result.organization || {},
    organizationCandidates,
    result.editable === true,
    result.self_bootstrap === true ? result.allowed_organization_levels : []
  );
  return true;
}

async function saveOrganizationAssignment() {
  const organization = collectOrganizationAssignment();
  if (!organization.target_internal_user_id) {
    setStatus("先に既存アカウントを選択してください");
    return;
  }
  if (!organization.organization_level) {
    setStatus("組織階層を選択してください");
    return;
  }
  if (organization.organization_level === "executive") {
    organization.direct_manager_user_id = "";
    if (!organization.executive_reviewer_user_id) {
      setStatus("役員申請の承認者を選択してください");
      return;
    }
  } else {
    organization.executive_reviewer_user_id = "";
    if (!organization.direct_manager_user_id) {
      setStatus("直属管理者を選択してください");
      return;
    }
  }
  if (!organization.reason) {
    setStatus("組織設定の変更理由を入力してください");
    return;
  }

  const confirmed = window.confirm(
    "組織階層と直属管理者を保存します。\n\n" +
    "この情報は申請承認と閲覧範囲の判定に使用されます。よろしいですか？"
  );
  if (!confirmed) return;

  saveOrganizationBtn.disabled = true;
  showLoading("組織設定を保存中...");
  try {
    const result = await updateOrganizationAssignment(idToken, organization);
    if (!isOkResult(result)) {
      throw new Error(result.message || result.code || "組織設定の保存に失敗しました");
    }
    if (!await loadUsers("組織設定の保存後に一覧を再取得中...")) return;
    selectedUser = findUserById(organization.target_internal_user_id) || selectedUser;
    if (selectedUser) fillUserForm(selectedUser);
    if (!await loadOrganizationForSelectedUser()) return;
    setStatus("組織設定を保存しました");
  } catch (error) {
    setStatus("組織設定の保存エラー\n\n" + error.message);
  } finally {
    saveOrganizationBtn.disabled = false;
    hideLoading();
  }
}


// ===== 保存ここから =====
async function saveUser(event) {
  event.preventDefault();

  if (!canEditUsers) {
    setStatus("このアカウントは人員マスターを閲覧できますが、利用者の追加・更新はできません");
    return;
  }

  const user = collectUserForm();

  try {
    const hasFamilyName = Boolean(user.family_name);
    const hasGivenName = Boolean(user.given_name);

    if (hasFamilyName !== hasGivenName) {
      throw new Error("姓と名は両方入力してください");
    }

    if (!user.name && hasFamilyName && hasGivenName) {
      user.name = `${user.family_name}${user.given_name}`;
    }

    if (!user.name) {
      throw new Error("氏名、または姓と名を入力してください");
    }

    if (!user.email) {
      throw new Error("メールを入力してください");
    }

    const modules = String(user.allowed_modules || "").split(",").map(value => value.trim()).filter(Boolean);
    if (modules.includes("ordercase") && !user.ordercase_permission) {
      throw new Error("Orderを許可する場合は、Order権限を選択してください");
    }
    if (modules.includes("shift") && !user.shiftbuilder_permission) {
      throw new Error("Shiftを許可する場合は、Shift権限を選択してください");
    }
    if (!modules.includes("ordercase")) user.ordercase_permission = "";
    if (!modules.includes("shift")) user.shiftbuilder_permission = "";

    const previousOrder = selectedUser?.internal_user_id === user.internal_user_id
      ? selectedUser.sort_order ?? selectedUser.sortOrder
      : "";
    const reorderUpdates = planSortOrderUpdates(
      allUsers,
      user.internal_user_id,
      previousOrder,
      user.sort_order
    );
    const reorderNotice = reorderUpdates.length
      ? `\n\n並び順の変更に伴い、ほかの${reorderUpdates.length}件を自動で繰り上げ・繰り下げます。`
      : "";
    const confirmMessage = buildSaveConfirmMessage(user) + reorderNotice;
    const confirmed = window.confirm(confirmMessage);

    if (!confirmed) {
      setStatus("保存をキャンセルしました");
      return;
    }

    setSaveDisabled(true);
    showLoading("保存中...");
    setStatus("保存中...");

    let result;
    const appliedUpdates = [];

    try {
      for (const update of reorderUpdates) {
        const shiftedUser = {
          ...update.user,
          sortOrder: String(update.to),
          sort_order: String(update.to)
        };
        const shiftedResult = await updateAccountUser(idToken, shiftedUser);
        if (!isOkResult(shiftedResult)) {
          throw new Error(shiftedResult.message || "並び順の繰り下げに失敗しました");
        }
        appliedUpdates.push(update);
      }

      if (user.internal_user_id) {
        result = await updateAccountUser(idToken, user);
      } else {
        result = await createAccountUser(idToken, user);
      }

      if (!isOkResult(result)) {
        throw new Error(result.message || "保存に失敗しました");
      }
    } catch (saveError) {
      for (const update of appliedUpdates.reverse()) {
        const rollbackUser = {
          ...update.user,
          sortOrder: String(update.from),
          sort_order: String(update.from)
        };
        await updateAccountUser(idToken, rollbackUser).catch(() => null);
      }
      throw saveError;
    }

    const savedUserId =
      result.user?.internal_user_id ||
      user.internal_user_id ||
      "";

    // 保存後の一覧再取得は保存処理とは分ける。
    // ここで失敗しても「保存そのもの」が失敗したとは限らないため、エラー文を分ける。
    try {
      if (!await loadUsers("保存後のアカウント一覧を再取得中...")) return;
      selectedUser = findUserById(savedUserId) || result.user || selectedUser;

      if (selectedUser) {
        fillUserForm(selectedUser);
      }
    } catch (reloadError) {
      setStatus(
        "保存は完了した可能性がありますが、一覧の再取得に失敗しました。\n\n" +
        reloadError.message +
        "\n\n再読み込みボタンで確認してください。"
      );
      return;
    }

    try {
      if (!await loadLogsForSelectedUser("保存後の変更履歴を取得中...")) return;
    } catch (logError) {
      setStatus(
        (result.message || "保存しました") +
        "\n\nただし、変更履歴の取得に失敗しました。\n" +
        logError.message
      );
      return;
    }

    setStatus(result.message || "保存しました");

  } catch (error) {
    setStatus("保存エラー\n\n" + error.message);
  } finally {
    setSaveDisabled(false);
    hideLoading();
  }
}
// ===== 保存ここまで =====


// ===== 履歴ここから =====
async function loadLogs(loadingMessage = "変更履歴を取得中...") {
  const generation = logLoadGeneration.begin();
  setLogsLoading(true, loadingMessage);

  try {
    const result = await getAccountLogs(idToken, "");
    if (!logLoadGeneration.isCurrent(generation)) return false;

    if (!isOkResult(result)) {
      throw new Error(result.message || "変更履歴の取得に失敗しました");
    }

    renderLogs(Array.isArray(result.logs) ? result.logs : []);
    return true;
  } catch (error) {
    if (!logLoadGeneration.isCurrent(generation)) return false;
    throw error;
  } finally {
    if (logLoadGeneration.isCurrent(generation)) setLogsLoading(false);
  }
}

async function loadLogsForSelectedUser(loadingMessage = "変更履歴を取得中...") {
  if (!selectedUser || !selectedUser.internal_user_id) return loadLogs(loadingMessage);
  const selectedUserId = selectedUser.internal_user_id;
  const generation = logLoadGeneration.begin();
  setLogsLoading(true, loadingMessage);

  try {
    const result = await getAccountLogs(idToken, selectedUserId);
    if (!logLoadGeneration.isCurrent(generation) || selectedUser?.internal_user_id !== selectedUserId) return false;

    if (!isOkResult(result)) {
      throw new Error(result.message || "変更履歴の取得に失敗しました");
    }

    renderLogs(Array.isArray(result.logs) ? result.logs : []);
    return true;
  } catch (error) {
    if (!logLoadGeneration.isCurrent(generation) || selectedUser?.internal_user_id !== selectedUserId) return false;
    throw error;
  } finally {
    if (logLoadGeneration.isCurrent(generation)) setLogsLoading(false);
  }
}
// ===== 履歴ここまで =====


// ===== イベントここから =====
dashboardBtn.addEventListener("click", () => {
  window.location.href = DASHBOARD_URL;
});

signupAdminBtn.addEventListener("click", () => {
  const url = new URL(SIGNUP_ADMIN_URL, window.location.href);

  url.searchParams.set("from", "shiftcore");
  url.searchParams.set("module", "account");
  url.searchParams.set("userId", currentUser?.internal_user_id || currentUser?.userId || "");
  url.searchParams.set("displayName", currentUser?.displayName || currentUser?.display_name || currentUser?.name || "");
  url.searchParams.set("employeeCode", currentUser?.employeeCode || currentUser?.employee_code || "");
  url.searchParams.set("role", currentUser?.role || "");
  url.searchParams.set("workStatus", currentUser?.workStatus || currentUser?.work_status || "");

  window.location.href = url.toString();
});

reloadBtn.addEventListener("click", async () => {
  try {
    showLoading("再読み込み中...");
    if (!await loadUsers("再読み込み中...")) return;
    if (!await loadLogsForSelectedUser("変更履歴を再取得中...")) return;
    setStatus("再読み込みしました");
  } catch (error) {
    setStatus("再読み込みエラー\n\n" + error.message);
  } finally {
    hideLoading();
  }
});

newUserBtn.addEventListener("click", () => {
  if (!canEditUsers) return;
  selectedUser = null;
  clearUserForm();
  renderCurrentUsers();

  loadLogs("変更履歴を取得中...")
    .catch((error) => {
      setStatus("履歴取得エラー\n\n" + error.message);
    });
});

clearFormBtn.addEventListener("click", () => {
  if (!canEditUsers) return;
  selectedUser = null;
  clearUserForm();
  renderCurrentUsers();
  setStatus("新規入力に戻しました");
});

searchInput.addEventListener("input", () => {
  renderCurrentUsers();
});

contractTypeInput.addEventListener("change", () => {
  updateClassificationMigrationHint();
});

organizationLevelInput.addEventListener("change", () => {
  renderOrganizationCandidateOptions(organizationCandidates);
});

saveOrganizationBtn.addEventListener("click", saveOrganizationAssignment);

userForm.addEventListener("submit", saveUser);

loadLogsBtn.addEventListener("click", async () => {
  try {
    if (!await loadLogsForSelectedUser("変更履歴を更新中...")) return;
    setStatus("変更履歴を更新しました");
  } catch (error) {
    setStatus("履歴取得エラー\n\n" + error.message);
  }
});
// ===== イベントここまで =====


init();
