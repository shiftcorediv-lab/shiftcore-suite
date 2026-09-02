import {
  noHolidayBtn,
  clearSelectionBtn,
  backToFormBtn,
  submitBtn,
  lineWarningBanner,
  dashboardBtn
} from "./dom.js";
import { DASHBOARD_URL } from "./config.js";
import { apiPost } from "./api.js";
import { requireAuthenticatedSession } from "../../account-console/js/common/auth-session.js";
import { setActivity } from "../../account-console/js/common/activity.js";
import {
  currentUser,
  setCurrentUser,
  clearSelectedDates,
  setNoHolidayRequested
} from "./state.js";
import { getQueryParams, isLineInAppBrowser } from "./query.js";
import {
  renderAccountInfo,
  setupShiftCoreEntryBanner,
  showCompleteScreen,
  backToFormView,
  isUserInactive,
  showMainMessage
} from "./ui.js?v=20260903-loading-1";
import {
  renderCalendar,
  renderSelectedDates,
  updateSubmitButtonState
} from "./calendar.js";
import {
  buildSubmitPayload,
  buildConfirmMessage,
  loadLatestRequest,
  validateBeforeSubmit,
  submitRequest
} from "./request.js?v=20260903-loading-1";

let currentIdToken = "";

window.addEventListener("DOMContentLoaded", async () => {
  if (isLineInAppBrowser()) {
    lineWarningBanner.style.display = "block";
  }

  const params = getQueryParams();
  setupShiftCoreEntryBanner(params);
  renderCalendar();
  renderSelectedDates();
  updateSubmitButtonState();

  showMainMessage("ログインユーザーを確認中...", "", true);

  try {
    const session = await requireAuthenticatedSession();
    if (!session.ok) {
      renderAccountInfo();
      showMainMessage("ログインが必要です。Dashboardから開き直してください", "error");
      return;
    }

    currentIdToken = session.idToken;
    const result = await apiPost("getPmoCurrentUserSecure", { idToken: currentIdToken });
    if (!result.success || !result.user) {
      renderAccountInfo();
      showMainMessage(result.message || "本人情報を確認できませんでした", "error");
      return;
    }

    setCurrentUser(result.user);
    renderAccountInfo();
    updateSubmitButtonState();
    await loadLatestRequest(currentIdToken);
  } catch (error) {
    console.error(error);
    renderAccountInfo();
    showMainMessage("本人情報の確認に失敗しました。時間をおいて再読込してください", "error");
  }
});

noHolidayBtn.addEventListener("click", () => {
  if (isUserInactive()) return;

  clearSelectedDates();
  setNoHolidayRequested(true);
  renderCalendar();
  renderSelectedDates();
  showMainMessage("この月は「希望休なし」で送信できます", "success");
  updateSubmitButtonState();
});

clearSelectionBtn.addEventListener("click", () => {
  if (isUserInactive()) return;

  clearSelectedDates();
  setNoHolidayRequested(false);
  renderCalendar();
  renderSelectedDates();
  showMainMessage("選択をクリアしました", "");
  updateSubmitButtonState();
});

backToFormBtn.addEventListener("click", () => {
  backToFormView();
  showMainMessage("", "");
  updateSubmitButtonState();
});

dashboardBtn.addEventListener("click", () => {
  window.location.href = DASHBOARD_URL;
});

submitBtn.addEventListener("click", async () => {
  if (!validateBeforeSubmit(isUserInactive)) {
    return;
  }

  const payload = buildSubmitPayload();
  const ok = window.confirm(buildConfirmMessage(payload));
  if (!ok) return;

  submitBtn.disabled = true;
  setActivity(submitBtn, true, "希望休を送信中...");

  try {
    const session = await requireAuthenticatedSession();
    if (!session.ok) {
      showMainMessage("ログイン状態を確認できません。Dashboardから開き直してください", "error");
      submitBtn.disabled = false;
      setActivity(submitBtn, false, "希望休を送信");
      updateSubmitButtonState();
      return;
    }
    currentIdToken = session.idToken;
  } catch (error) {
    console.error(error);
    showMainMessage("ログイン状態の更新に失敗しました。もう一度お試しください", "error");
    submitBtn.disabled = false;
    setActivity(submitBtn, false, "希望休を送信");
    updateSubmitButtonState();
    return;
  }

  await submitRequest(
    payload,
    currentIdToken,
    submitBtn,
    () => {
      submitBtn.disabled = false;
      setActivity(submitBtn, false, "希望休を送信");
      showCompleteScreen(payload);
    },
    () => {
      submitBtn.disabled = false;
      setActivity(submitBtn, false, "希望休を送信");
      updateSubmitButtonState();
    }
  );
});
