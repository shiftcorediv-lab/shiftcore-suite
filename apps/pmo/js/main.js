import {
  noHolidayBtn,
  clearSelectionBtn,
  backToFormBtn,
  submitBtn,
  lineWarningBanner
} from "./dom.js";
import {
  currentUser,
  setCurrentUser,
  clearSelectedDates,
  setNoHolidayRequested
} from "./state.js";
import { getQueryParams, buildCurrentUserFromQuery, isLineInAppBrowser } from "./query.js";
import {
  renderAccountInfo,
  setupShiftCoreEntryBanner,
  showCompleteScreen,
  backToFormView,
  isUserInactive,
  showMainMessage
} from "./ui.js";
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
} from "./request.js";

window.addEventListener("DOMContentLoaded", async () => {
  if (isLineInAppBrowser()) {
    lineWarningBanner.style.display = "block";
  }

  const params = getQueryParams();
  setCurrentUser(buildCurrentUserFromQuery(params));

  setupShiftCoreEntryBanner(params);
  renderAccountInfo();
  renderCalendar();
  renderSelectedDates();
  updateSubmitButtonState();

  if (currentUser.userId && currentUser.displayName && currentUser.employeeCode) {
    await loadLatestRequest();
  } else {
    showMainMessage("ShiftCoreから必要なユーザー情報を受け取れていません", "error");
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

submitBtn.addEventListener("click", async () => {
  if (!validateBeforeSubmit(isUserInactive)) {
    return;
  }

  const payload = buildSubmitPayload();
  const ok = window.confirm(buildConfirmMessage(payload));
  if (!ok) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "送信中...";

  await submitRequest(
    payload,
    submitBtn,
    () => {
      submitBtn.disabled = false;
      submitBtn.textContent = "希望休を送信";
      showCompleteScreen(payload);
    },
    () => {
      submitBtn.disabled = false;
      submitBtn.textContent = "希望休を送信";
      updateSubmitButtonState();
    }
  );
});
