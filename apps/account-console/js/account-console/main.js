import { DASHBOARD_URL, SIGNUP_ADMIN_URL } from "./config.js";
import { requireAccountConsoleSession } from "./auth.js";
import {
  getCurrentAccountConsoleUser,
  listAccountUsers,
  createAccountUser,
  updateAccountUser,
  getAccountLogs
} from "./api.js";
import {
  dashboardBtn,
  signupAdminBtn,
  reloadBtn,
  newUserBtn,
  searchInput,
  userForm,
  clearFormBtn,
  loadLogsBtn,
  saveUserBtn
} from "./dom.js";
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
  showLoading,
  hideLoading,
  setLogsLoading
} from "./ui.js";

// ===== 状態ここから =====
let session = null;
let idToken = "";
let allUsers = [];
let selectedUser = null;
let currentUser = null;
// ===== 状態ここまで =====


// ===== API結果判定ここから =====
function isOkResult(result) {
  return result && (result.ok === true || result.success === true);
}
// ===== API結果判定ここまで =====


// ===== 操作ボタン制御ここから =====
function setSaveDisabled(disabled) {
  saveUserBtn.disabled = disabled;
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

    showLoading("Account Console権限を確認中...");
    setStatus("Account Console権限を確認中...");

    const currentResult = await getCurrentAccountConsoleUser(idToken);

    if (!isOkResult(currentResult)) {
      setPermissionError(currentResult.message || "Account Consoleの利用権限がありません");
      setStatus(JSON.stringify(currentResult, null, 2));
      hideLoading();
      return;
    }

    currentUser = currentResult.user;
    setOperator(currentResult.user);
    renderCurrentUserPermission(currentResult.user);

    await Promise.all([
      loadUsers("ユーザー名簿を取得中..."),
      loadLogs("変更履歴を取得中...")
    ]);

    clearUserForm();
    setStatus("Account Consoleを読み込みました");

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
  showLoading(loadingMessage);
  setStatus(loadingMessage);

  const result = await listAccountUsers(idToken);

  if (!isOkResult(result)) {
    throw new Error(result.message || "ユーザー一覧の取得に失敗しました");
  }

  allUsers = Array.isArray(result.users) ? result.users : [];

  renderCurrentUsers();
  setStatus("ユーザー名簿を取得しました");
}

function renderCurrentUsers() {
  const filtered = filterUsers(allUsers, searchInput.value);
  const selectedId = selectedUser ? selectedUser.internal_user_id : "";

  renderUsers(filtered, selectedId, (user) => {
    selectedUser = user;
    fillUserForm(user);
    renderCurrentUsers();

    loadLogsForSelectedUser("選択中アカウントの変更履歴を取得中...")
      .catch((error) => {
        setStatus("履歴取得エラー\n\n" + error.message);
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


// ===== 保存ここから =====
async function saveUser(event) {
  event.preventDefault();

  const beforeUser = selectedUser ? { ...selectedUser } : null;
  const user = collectUserForm();

  try {
    if (!user.name) {
      throw new Error("氏名を入力してください");
    }

    if (!user.email) {
      throw new Error("メールを入力してください");
    }

    const confirmMessage = buildSaveConfirmMessage(beforeUser, user);
    const confirmed = window.confirm(confirmMessage);

    if (!confirmed) {
      setStatus("保存をキャンセルしました");
      return;
    }

    setSaveDisabled(true);
    showLoading("保存中...");
    setStatus("保存中...");

    let result;

    if (user.internal_user_id) {
      result = await updateAccountUser(idToken, user);
    } else {
      result = await createAccountUser(idToken, user);
    }

    if (!isOkResult(result)) {
      throw new Error(result.message || "保存に失敗しました");
    }

    const savedUserId =
      result.user?.internal_user_id ||
      user.internal_user_id ||
      "";

    // 保存後の一覧再取得は保存処理とは分ける。
    // ここで失敗しても「保存そのもの」が失敗したとは限らないため、エラー文を分ける。
    try {
      await loadUsers("保存後のアカウント一覧を再取得中...");
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
      await loadLogsForSelectedUser("保存後の変更履歴を取得中...");
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
  setLogsLoading(true, loadingMessage);

  try {
    const result = await getAccountLogs(idToken, "");

    if (!isOkResult(result)) {
      throw new Error(result.message || "変更履歴の取得に失敗しました");
    }

    renderLogs(Array.isArray(result.logs) ? result.logs : []);
  } finally {
    setLogsLoading(false);
  }
}

async function loadLogsForSelectedUser(loadingMessage = "変更履歴を取得中...") {
  setLogsLoading(true, loadingMessage);

  try {
    if (!selectedUser || !selectedUser.internal_user_id) {
      await loadLogs(loadingMessage);
      return;
    }

    const result = await getAccountLogs(idToken, selectedUser.internal_user_id);

    if (!isOkResult(result)) {
      throw new Error(result.message || "変更履歴の取得に失敗しました");
    }

    renderLogs(Array.isArray(result.logs) ? result.logs : []);
  } finally {
    setLogsLoading(false);
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
    await loadUsers("再読み込み中...");
    await loadLogsForSelectedUser("変更履歴を再取得中...");
    setStatus("再読み込みしました");
  } catch (error) {
    setStatus("再読み込みエラー\n\n" + error.message);
  } finally {
    hideLoading();
  }
});

newUserBtn.addEventListener("click", () => {
  selectedUser = null;
  clearUserForm();
  renderCurrentUsers();

  loadLogs("変更履歴を取得中...")
    .catch((error) => {
      setStatus("履歴取得エラー\n\n" + error.message);
    });
});

clearFormBtn.addEventListener("click", () => {
  selectedUser = null;
  clearUserForm();
  renderCurrentUsers();
  setStatus("新規入力に戻しました");
});

searchInput.addEventListener("input", () => {
  renderCurrentUsers();
});

userForm.addEventListener("submit", saveUser);

loadLogsBtn.addEventListener("click", async () => {
  try {
    await loadLogsForSelectedUser("変更履歴を更新中...");
    setStatus("変更履歴を更新しました");
  } catch (error) {
    setStatus("履歴取得エラー\n\n" + error.message);
  }
});
// ===== イベントここまで =====


init();
