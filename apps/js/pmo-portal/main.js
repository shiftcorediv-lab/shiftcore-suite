import { getQueryParams, buildCurrentUserFromQuery } from "./query.js";
import { goApplyBtn, goManageBtn, backToDashboardBtn } from "./dom.js";
import { renderAccountInfo, renderDeveloperMeta, updateManageButtonState, showMessage } from "./ui.js";
import { buildPmoApplyUrl, buildPmoAdminUrl, canManagePmo, goToDashboard } from "./navigation.js";

const params = getQueryParams();
const currentUser = buildCurrentUserFromQuery(params);

renderAccountInfo(currentUser);
renderDeveloperMeta(params, currentUser);

const canManage = canManagePmo(currentUser);
updateManageButtonState(canManage);

goApplyBtn.addEventListener("click", () => {
  if (!currentUser.userId || !currentUser.displayName || !currentUser.employeeCode) {
    showMessage("ShiftCoreから必要なユーザー情報を受け取れていません", "error");
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
