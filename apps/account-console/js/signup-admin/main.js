import { getQueryParams, buildCurrentUserFromQuery } from "./query.js?v=20260802-signup-auth-1";
import {
  backToAccountPortalBtn,
  approveBtn,
  rejectBtn,
  roleSelect,
  organizationIdInput,
  allowedModulesInput,
  statusSelect,
  workStatusSelect,
} from "./dom.js?v=20260802-signup-auth-1";
import {
  renderAccountInfo,
  setupShiftCoreEntryBanner,
  renderRequestList,
  renderRequestDetail,
  applyApprovalDefaults,
  setActionButtonsEnabled,
  setApprovalFormEditable,
  getApprovalSummary,
  showMessage
} from "./ui.js?v=20260902-account-write-auth-1";
import { canUseSignupAdmin, goToAccountPortal } from "./navigation.js?v=20260812-developer-1";
import { fetchSignupRequests, approveSignupRequest, rejectSignupRequest } from "./api.js?v=20260806-permission-2";
import { requireAuthenticatedSession } from "../common/auth-session.js?v=20260802-signup-auth-1";
import { resolveCurrentUserWithGasByIdToken } from "../login/api.js?v=20260803-logintoken-1";

const params = getQueryParams();
let currentUser = buildCurrentUserFromQuery(params);
let canUse = false;
let canEditRequests = false;

let selectedRequest = null;

setupShiftCoreEntryBanner(params);
setActionButtonsEnabled(false);
setApprovalFormEditable(false);

async function getFreshIdToken() {
  const session = await requireAuthenticatedSession();

  if (!session.ok) {
    throw new Error(session.message || "ログイン状態を確認できません");
  }

  return session.idToken;
}

async function resolveSecureCurrentUser() {
  const idToken = await getFreshIdToken();
  const result = await resolveCurrentUserWithGasByIdToken(idToken);

  if (!result?.ok || !result.user) {
    throw new Error(result?.message || "ログインユーザーを確認できません");
  }

  return result.user;
}

async function loadRequests() {
  if (!canUse) {
    showMessage("このアカウントには登録申請管理の利用権限がありません", "error");
    return;
  }

  showMessage("申請一覧を取得中...");

  try {
    const idToken = await getFreshIdToken();
    const result = await fetchSignupRequests("pending_approval", idToken);

    if (!result.success) {
      showMessage(result.message || "申請一覧の取得に失敗しました", "error");
      return;
    }

    canEditRequests = result.canEditRequests === true;
    setApprovalFormEditable(canEditRequests);

    renderRequestList(result.requests || [], (request) => {
      selectedRequest = request;
      renderRequestDetail(request);
      applyApprovalDefaults(request);
      setActionButtonsEnabled(canEditRequests);
      showMessage(
        canEditRequests ? "申請詳細を表示しました" : "申請詳細を閲覧モードで表示しました",
        "success"
      );
    });

    showMessage(
      canEditRequests ? "申請一覧を読み込みました" : "申請一覧を閲覧モードで読み込みました",
      "success"
    );
  } catch (error) {
    console.error(error);
    showMessage(error.message || "申請一覧の取得に失敗しました", "error");
  }
}

approveBtn.addEventListener("click", async () => {
  if (!canEditRequests) {
    showMessage("このアカウントは申請を閲覧できますが、承認はできません", "error");
    return;
  }
  if (!selectedRequest) {
    showMessage("承認対象の申請を選択してください", "error");
    return;
  }

  if (!roleSelect.value || !organizationIdInput.value.trim() || !allowedModulesInput.value.trim() || !statusSelect.value || !workStatusSelect.value) {
    showMessage("承認に必要な項目を入力してください", "error");
    return;
  }

  const confirmed = window.confirm(
    "この内容で承認します。よろしいですか？\n\n" + getApprovalSummary()
  );

  if (!confirmed) {
    showMessage("承認をキャンセルしました");
    return;
  }

  showMessage("承認処理中...");

  try {
    const idToken = await getFreshIdToken();
    const result = await approveSignupRequest(
      selectedRequest.request_id,
      {
        role: roleSelect.value,
        organizationId: organizationIdInput.value.trim(),
        allowedModules: allowedModulesInput.value.trim().split(",").map(v => v.trim()).filter(Boolean),
        status: statusSelect.value,
        workStatus: workStatusSelect.value,
      },
      idToken
    );

    if (!result.success) {
      showMessage(result.message || "承認に失敗しました", "error");
      return;
    }

    selectedRequest = null;
    renderRequestDetail(null);
    setActionButtonsEnabled(false);
    await loadRequests();
    showMessage(
      result.message || "承認しました",
      result.notificationSent === false ? "error" : "success"
    );
  } catch (error) {
    console.error(error);
    showMessage(error.message || "承認に失敗しました", "error");
  }
});

rejectBtn.addEventListener("click", async () => {
  if (!canEditRequests) {
    showMessage("このアカウントは申請を閲覧できますが、却下はできません", "error");
    return;
  }
  if (!selectedRequest) {
    showMessage("却下対象の申請を選択してください", "error");
    return;
  }

  showMessage("却下処理中...");

  try {
    const idToken = await getFreshIdToken();
    const result = await rejectSignupRequest(
      selectedRequest.request_id,
      idToken
    );

    if (!result.success) {
      showMessage(result.message || "却下に失敗しました", "error");
      return;
    }

    selectedRequest = null;
    renderRequestDetail(null);
    setActionButtonsEnabled(false);
    await loadRequests();
    showMessage("却下しました", "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "却下に失敗しました", "error");
  }
});

backToAccountPortalBtn.addEventListener("click", () => {
  goToAccountPortal(currentUser);
});

try {
  currentUser = await resolveSecureCurrentUser();
  canUse = canUseSignupAdmin(currentUser);
  sessionStorage.setItem("shiftcore_portal_user", JSON.stringify(currentUser));
  renderAccountInfo(currentUser);
  await loadRequests();
} catch (error) {
  showMessage(error.message || "ログインユーザーを確認できません", "error");
}
