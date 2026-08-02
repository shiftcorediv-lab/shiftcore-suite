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
  getApprovalSummary,
  showMessage
} from "./ui.js?v=20260802-signup-auth-1";
import { canUseSignupAdmin, goToAccountPortal } from "./navigation.js?v=20260802-signup-auth-1";
import { fetchSignupRequests, approveSignupRequest, rejectSignupRequest } from "./api.js?v=20260802-signup-auth-1";
import { requireAuthenticatedSession } from "../common/auth-session.js?v=20260802-signup-auth-1";

const params = getQueryParams();
const currentUser = buildCurrentUserFromQuery(params);

sessionStorage.setItem("shiftcore_portal_user", JSON.stringify(currentUser));

const canUse = canUseSignupAdmin(currentUser);

let selectedRequest = null;

setupShiftCoreEntryBanner(params);
renderAccountInfo(currentUser);
setActionButtonsEnabled(false);

async function getFreshIdToken() {
  const session = await requireAuthenticatedSession();

  if (!session.ok) {
    throw new Error(session.message || "ログイン状態を確認できません");
  }

  return session.idToken;
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

    renderRequestList(result.requests || [], (request) => {
      selectedRequest = request;
      renderRequestDetail(request);
      applyApprovalDefaults(request);
      setActionButtonsEnabled(true);
      showMessage("申請詳細を表示しました", "success");
    });

    showMessage("申請一覧を読み込みました", "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "申請一覧の取得に失敗しました", "error");
  }
}

approveBtn.addEventListener("click", async () => {
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
    showMessage("承認しました", "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "承認に失敗しました", "error");
  }
});

rejectBtn.addEventListener("click", async () => {
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

await loadRequests();
