import { showLoading, hideLoading, waitForNextPaint } from "../common/loading.js";
import { getQueryParams } from "./query.js";
import {
  monthSelect,
  openMonthlyBtn,
  openRequestBtn,
  downloadCsvBtn,
  refreshTableBtn,
  backToDashboardBtn
} from "./dom.js";
import {
  renderAccountInfo,
  setupShiftCoreEntryBanner,
  renderMonthOptions,
  updateManageState,
  renderEmptyTable,
  renderMonthlyTable,
  showMessage
} from "./ui.js";
import {
  canManagePmo,
  goToDashboard,
  openUrl,
  downloadExcelFile
} from "./navigation.js";
import {
  fetchPmoAdminMeta,
  fetchMonthlyExcel,
  fetchPmoMonthlyTable
} from "./api.js";
import { requireAuthenticatedSession } from "../common/auth-session.js";

const params = getQueryParams();

let currentUser = null;
let currentIdToken = "";
let canManage = false;
let currentMeta = null;

setupShiftCoreEntryBanner(params);
renderEmptyTable("認証確認後に一覧を表示します。");

async function initializePage() {
  showLoading("認証確認中...");
  await waitForNextPaint();

  try {
    const sessionResult = await requireAuthenticatedSession();

    if (!sessionResult.ok) {
      renderEmptyTable("認証確認に失敗しました。");
      showMessage(sessionResult.message || "認証確認に失敗しました", "error");
      return;
    }

    currentIdToken = sessionResult.idToken || "";

    await loadMeta("");
  } catch (error) {
    console.error(error);
    renderEmptyTable("認証確認に失敗しました。");
    showMessage("認証確認に失敗しました", "error");
  } finally {
    hideLoading();
  }
}

async function loadMeta(targetYearMonth = "") {
  if (!currentIdToken) {
    showMessage("認証情報を取得できませんでした", "error");
    return;
  }

  showLoading("管理情報を取得中...");
  await waitForNextPaint();
  showMessage("管理情報を取得中...");

  try {
    const result = await fetchPmoAdminMeta(targetYearMonth, currentIdToken);

    if (!result.success) {
      renderEmptyTable("管理情報の取得に失敗しました。");
      showMessage(result.message || "管理情報の取得に失敗しました", "error");
      return;
    }

    currentMeta = result;
    currentUser = result.currentUser || null;
    canManage = canManagePmo(currentUser);

    if (currentUser) {
      renderAccountInfo(currentUser);
    }

    updateManageState(canManage, currentUser);

    if (!canManage) {
      renderEmptyTable("このアカウントには管理権限がありません。");
      showMessage("このアカウントには管理権限がありません", "error");
      return;
    }

    renderMonthOptions(result.months || [], result.selectedYearMonth || "");

    const initialHeaders = result.initialTable?.headers || [];
    const initialRows = result.initialTable?.rows || [];

    if (initialHeaders.length > 0) {
      renderMonthlyTable({
        headers: initialHeaders,
        rows: initialRows
      });
      showMessage("管理情報を読み込みました", "success");
      return;
    }

    const effectiveYearMonth = result.selectedYearMonth || monthSelect.value || "";

    if (effectiveYearMonth) {
      await loadMonthlyTable(effectiveYearMonth);
    } else {
      renderEmptyTable("表示できる月がありません。");
      showMessage("管理情報を読み込みました", "success");
    }
  } catch (error) {
    console.error(error);
    renderEmptyTable("管理情報の取得に失敗しました。");
    showMessage("管理情報の取得に失敗しました", "error");
  } finally {
    hideLoading();
  }
}

async function loadMonthlyTable(targetYearMonth = "") {
  if (!canManage || !currentUser || !currentIdToken) {
    renderEmptyTable("このアカウントには管理権限がありません。");
    return;
  }

  const selectedYearMonth = String(targetYearMonth || monthSelect.value || "").trim();

  if (!selectedYearMonth) {
    renderEmptyTable("対象月を選択してください。");
    showMessage("対象月が選択されていません", "error");
    return;
  }

  showLoading("一覧を読み込み中...");
  await waitForNextPaint();
  showMessage("一覧を更新中...");

  try {
    const result = await fetchPmoMonthlyTable(selectedYearMonth, currentIdToken);

    if (!result.success) {
      renderEmptyTable("一覧データの取得に失敗しました。");
      showMessage(result.message || "一覧データの取得に失敗しました", "error");
      return;
    }

    renderMonthlyTable({
      headers: result.headers || [],
      rows: result.rows || []
    });

    showMessage("一覧を更新しました", "success");
  } catch (error) {
    console.error(error);
    renderEmptyTable("一覧データの取得に失敗しました。");
    showMessage("一覧データの取得に失敗しました", "error");
  } finally {
    hideLoading();
  }
}

monthSelect.addEventListener("change", async () => {
  await loadMonthlyTable(monthSelect.value);
});

refreshTableBtn.addEventListener("click", async () => {
  await loadMonthlyTable(monthSelect.value);
});

openMonthlyBtn.addEventListener("click", () => {
  if (!currentMeta || !currentMeta.monthlySheetUrl) {
    showMessage("対象月の希望休一覧URLを取得できていません", "error");
    return;
  }

  openUrl(currentMeta.monthlySheetUrl);
});

openRequestBtn.addEventListener("click", () => {
  if (!currentMeta || !currentMeta.requestSheetUrl) {
    showMessage("申請原本URLを取得できていません", "error");
    return;
  }

  openUrl(currentMeta.requestSheetUrl);
});

downloadCsvBtn.addEventListener("click", async () => {
  const selectedYearMonth = String(
    (currentMeta && currentMeta.selectedYearMonth) || monthSelect.value || ""
  ).trim();

  if (!selectedYearMonth || !currentIdToken) {
    showMessage("対象月が選択されていません", "error");
    return;
  }

  showLoading("Excelを準備中...");
  await waitForNextPaint();
  showMessage("Excelを生成中...");

  try {
    const result = await fetchMonthlyExcel(selectedYearMonth, currentIdToken);

    if (!result.success) {
      showMessage(result.message || "Excel出力に失敗しました", "error");
      return;
    }

    downloadExcelFile(result.fileName, result.base64Data, result.mimeType);
    showMessage("Excelをダウンロードしました", "success");
  } catch (error) {
    console.error(error);
    showMessage("Excel出力に失敗しました", "error");
  } finally {
    hideLoading();
  }
});

backToDashboardBtn.addEventListener("click", () => {
  goToDashboard();
});

await initializePage();
