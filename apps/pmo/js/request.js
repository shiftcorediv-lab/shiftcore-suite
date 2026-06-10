import { noteInput, messageBox } from "./dom.js";
import {
  currentUser,
  selectedDates,
  noHolidayRequested,
  clearSelectedDates,
  setNoHolidayRequested,
  addSelectedDate
} from "./state.js";
import { apiGet, apiPost } from "./api.js";
import {
  renderCalendar,
  renderSelectedDates,
  updateSubmitButtonState,
  getTargetYearMonth
} from "./calendar.js";
import { showMessage, showMainMessage } from "./ui.js";

export function buildSubmitPayload() {
  return {
    userId: currentUser.userId,
    displayName: currentUser.displayName,
    employeeCode: currentUser.employeeCode,
    targetYearMonth: getTargetYearMonth(),
    offDates: noHolidayRequested ? [] : Array.from(selectedDates).sort(),
    memo: noteInput.value.trim(),
    submitType: noHolidayRequested ? "希望休なし" : "希望休あり"
  };
}

export function buildConfirmMessage(payload) {
  const holidayText = payload.submitType === "希望休なし"
    ? "希望休なし"
    : payload.offDates.join(", ");

  return (
    "この内容で送信しますか？\n\n" +
    "【氏名】\n" + payload.displayName + "\n\n" +
    "【社員コード】\n" + payload.employeeCode + "\n\n" +
    "【対象年月】\n" + payload.targetYearMonth + "\n\n" +
    "【希望休】\n" + holidayText + "\n\n" +
    "【メモ】\n" + (payload.memo || "なし")
  );
}

export function applyExistingRequest(result) {
  clearSelectedDates();
  setNoHolidayRequested(false);
  noteInput.value = "";

  if (!result || !result.exists) {
    renderCalendar();
    renderSelectedDates();
    updateSubmitButtonState();
    return;
  }

  const offDates = Array.isArray(result.offDates) ? result.offDates : [];
offDates.forEach((dateStr) => addSelectedDate(dateStr));
  noteInput.value = result.memo || "";
  setNoHolidayRequested(result.submitType === "希望休なし");

  renderCalendar();
  renderSelectedDates();
  updateSubmitButtonState();
}

export async function loadLatestRequest() {
  if (!currentUser.userId) {
    showMainMessage("ShiftCoreユーザー情報を取得できませんでした", "error");
    return;
  }

  showMainMessage("提出済み内容を確認中...", "");

  try {
    const result = await apiGet("getLatestShiftRequest", {
      userId: currentUser.userId,
      targetYearMonth: getTargetYearMonth()
    });

    if (result.success) {
      applyExistingRequest(result);
      showMainMessage(
        result.exists ? "この月の提出済み内容を読み込みました" : "この月の提出データはまだありません",
        result.exists ? "success" : ""
      );
    } else {
      showMainMessage(result.message || "提出済み内容の取得に失敗しました", "error");
    }
  } catch (error) {
    console.error(error);
    showMainMessage("提出済み内容の取得に失敗しました", "error");
  }
}

export function validateBeforeSubmit(isUserInactive) {
  showMessage(messageBox, "", "");

  if (isUserInactive()) {
    showMainMessage("このアカウントは提出対象外です", "error");
    return false;
  }

  if (!currentUser.userId || !currentUser.displayName || !currentUser.employeeCode) {
    showMainMessage("ShiftCoreユーザー情報が不足しています", "error");
    return false;
  }

  if (!noHolidayRequested && selectedDates.size === 0) {
    showMainMessage("希望休を1日以上選択するか、「希望休なし」を選んでください", "error");
    return false;
  }

  return true;
}

export async function submitRequest(payload, submitBtn, onSuccess, onFinally) {
  try {
    const result = await apiPost("submitShiftRequest", {
      payload
    });

    if (result.success) {
      onSuccess();
    } else {
      showMainMessage(result.message || "保存に失敗しました", "error");
    }
  } catch (error) {
    console.error(error);
    showMainMessage("送信中にエラーが発生しました", "error");
  } finally {
    onFinally();
  }
}
