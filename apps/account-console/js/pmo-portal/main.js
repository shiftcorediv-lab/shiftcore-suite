import { getQueryParams, buildCurrentUserFromQuery } from "./query.js";
import { mountDeadline } from "../../../pmo/js/deadline-widget.js";
const currentMonth = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date());
const [deadlineYear, deadlineMonth] = currentMonth.split('-').map(Number);
mountDeadline(document.getElementById('pmoDeadline')).load(new Date(Date.UTC(deadlineYear, deadlineMonth, 1)).toISOString().slice(0,7));
import { goApplyBtn, goManageBtn, backToDashboardBtn } from "./dom.js";
import { renderAccountInfo, renderDeveloperMeta, updateManageButtonState, showMessage } from "./ui.js?v=20260906-display-labels-1";
import { buildPmoApplyUrl, buildPmoAdminUrl, canManagePmo, goToDashboard } from "./navigation.js?v=20260803-role-1";

const params = getQueryParams();
const currentUser = buildCurrentUserFromQuery(params);

renderAccountInfo(currentUser);
renderDeveloperMeta(params, currentUser);

const canManage = canManagePmo(currentUser);
updateManageButtonState(canManage);

goApplyBtn.addEventListener("click", () => {
  if (!currentUser.userId || !currentUser.displayName || !currentUser.employeeCode) {
    showMessage("Another Portalから必要なユーザー情報を受け取れていません", "error");
    return;
  }

  window.location.href = buildPmoApplyUrl(currentUser);
});

goManageBtn.addEventListener("click", () => {
  if (!canManage) {
    showMessage("このアカウントには管理権限がありません", "error");
    return;
  }

  window.location.href = buildPmoAdminUrl(currentUser);
});

backToDashboardBtn.addEventListener("click", () => {
  goToDashboard();
});
