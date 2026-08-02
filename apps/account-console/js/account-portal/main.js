import { getQueryParams, buildCurrentUserFromQuery } from "./query.js";
import { goSignupAdminBtn, backToDashboardBtn } from "./dom.js";
import { renderAccountInfo, setupShiftCoreEntryBanner, updatePortalState, showMessage } from "./ui.js?v=20260802-xss-1";
import { canUseAccountPortal, buildSignupAdminUrl, goToDashboard } from "./navigation.js?v=20260802-modules-1";

const params = getQueryParams();
const currentUser = buildCurrentUserFromQuery(params);

sessionStorage.setItem("shiftcore_portal_user", JSON.stringify(currentUser));

setupShiftCoreEntryBanner(params);
renderAccountInfo(currentUser);

const canUse = canUseAccountPortal(currentUser);
updatePortalState(canUse);

goSignupAdminBtn.addEventListener("click", () => {
  if (!canUse) {
    showMessage("このアカウントには利用権限がありません", "error");
    return;
  }

  window.location.href = buildSignupAdminUrl(currentUser);
});

backToDashboardBtn.addEventListener("click", () => {
  goToDashboard();
});
