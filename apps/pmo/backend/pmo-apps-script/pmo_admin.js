// =========================
// PMO管理ロール判定ここから
// =========================
function canManagePmoByRole_(role) {
  const normalizedRole = normalizeText(role).toLowerCase();
  return normalizedRole === "admin" || normalizedRole === "developer";
}
// =========================
// PMO管理ロール判定ここまで
// =========================


// =========================
// 利用可能な月一覧取得ここから
// 希望休一覧_YYYYMM を抽出して YYYY-MM 配列で返す
// =========================
function getAvailableMonthlyYearMonths_() {
  const ss = getSpreadsheet_();
  const sheets = ss.getSheets();
  const prefix = SETTINGS.MONTHLY_SHEET_PREFIX;
  const months = [];

  sheets.forEach(function(sheet) {
    const name = sheet.getName();

    if (!name.startsWith(prefix)) {
      return;
    }

    const suffix = name.slice(prefix.length);

    if (!/^\d{6}$/.test(suffix)) {
      return;
    }

    const ym = suffix.slice(0, 4) + "-" + suffix.slice(4, 6);
    months.push(ym);
  });

  months.sort(function(a, b) {
    return a < b ? 1 : -1;
  });

  return months;
}
// =========================
// 利用可能な月一覧取得ここまで
// =========================


// =========================
// シートURL生成ここから
// =========================
function buildSheetUrl_(sheet) {
  const ss = getSpreadsheet_();
  return ss.getUrl() + "#gid=" + sheet.getSheetId();
}
// =========================
// シートURL生成ここまで
// =========================


// =========================
// CSV用エスケープここから
// =========================
function escapeCsvValue_(value) {
  const str = String(value == null ? "" : value);

  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }

  return str;
}
// =========================
// CSV用エスケープここまで
// =========================


// =========================
// PMO管理メタ取得ここから
// =========================
function getPmoAdminMeta(targetYearMonth, role) {
  try {
    if (!canManagePmoByRole_(role)) {
      return {
        success: false,
        message: "このアカウントには管理権限がありません"
      };
    }

    const months = getAvailableMonthlyYearMonths_();
    const requestSheet = getOrCreateRequestSheet();

    let selectedYearMonth = normalizeText(targetYearMonth);

    if (!selectedYearMonth || months.indexOf(selectedYearMonth) === -1) {
      selectedYearMonth = months.length > 0 ? months[0] : "";
    }

    let monthlySheetUrl = "";
    let monthlySheetExists = false;

    if (selectedYearMonth && monthlySheetExists_(selectedYearMonth)) {
      const monthlySheet = getMonthlyRequestSheet(selectedYearMonth);
      monthlySheetUrl = buildSheetUrl_(monthlySheet);
      monthlySheetExists = true;
    }

    return {
      success: true,
      months: months,
      selectedYearMonth: selectedYearMonth,
      monthlySheetExists: monthlySheetExists,
      monthlySheetUrl: monthlySheetUrl,
      requestSheetUrl: buildSheetUrl_(requestSheet)
    };

  } catch (error) {
    return {
      success: false,
      message: "PMO管理メタ取得中にエラーが発生しました: " + error.message
    };
  }
}
// =========================
// PMO管理メタ取得ここまで
// =========================

// =========================
// ExcelエクスポートURL生成ここから
// =========================
function buildSpreadsheetExcelExportUrl_(spreadsheetId) {
  return "https://docs.google.com/spreadsheets/d/" + spreadsheetId + "/export?format=xlsx";
}
// =========================
// ExcelエクスポートURL生成ここまで
// =========================


// =========================
// 一時Excelファイル取得ここから
// 対象シートだけの一時スプシを作って xlsx 化
// =========================
function exportMonthlyExcel(targetYearMonth, role) {
  let tempSpreadsheet = null;
  let tempFile = null;

  try {
    if (!canManagePmoByRole_(role)) {
      return {
        success: false,
        message: "このアカウントには管理権限がありません"
      };
    }

    const ym = normalizeText(targetYearMonth);

    if (!ym || !isValidYearMonth(ym)) {
      return {
        success: false,
        message: "targetYearMonth が不正です"
      };
    }

    if (!monthlySheetExists_(ym)) {
      return {
        success: false,
        message: "対象月の希望休一覧が存在しません"
      };
    }

    const sourceSheet = getMonthlyRequestSheet(ym);
    const sourceSpreadsheet = getSpreadsheet_();

    tempSpreadsheet = SpreadsheetApp.create(buildMonthlySheetName(ym) + "_export_temp");
    tempFile = DriveApp.getFileById(tempSpreadsheet.getId());

    const copiedSheet = sourceSheet.copyTo(tempSpreadsheet);
    copiedSheet.setName(sourceSheet.getName());

    const sheets = tempSpreadsheet.getSheets();
    sheets.forEach(function(sheet) {
      if (sheet.getSheetId() !== copiedSheet.getSheetId()) {
        tempSpreadsheet.deleteSheet(sheet);
      }
    });

    const exportUrl = buildSpreadsheetExcelExportUrl_(tempSpreadsheet.getId());
    const token = ScriptApp.getOAuthToken();

    const response = UrlFetchApp.fetch(exportUrl, {
      method: "get",
      headers: {
        Authorization: "Bearer " + token
      },
      muteHttpExceptions: true
    });

    const responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      throw new Error("Excelエクスポートに失敗しました: HTTP " + responseCode);
    }

    const blob = response.getBlob();
    const bytes = blob.getBytes();
    const base64Data = Utilities.base64Encode(bytes);

    return {
      success: true,
      fileName: buildMonthlySheetName(ym) + ".xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64Data: base64Data
    };

  } catch (error) {
    return {
      success: false,
      message: "Excel出力中にエラーが発生しました: " + error.message
    };
  } finally {
    if (tempFile) {
      try {
        tempFile.setTrashed(true);
      } catch (e) {}
    }
  }
}
// =========================
// 一時Excelファイル取得ここまで
// =========================