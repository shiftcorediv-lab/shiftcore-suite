// =========================
// 月次シート名取得ここから
// 2026-05 -> 希望休一覧_202605
// =========================
function buildMonthlySheetName(targetYearMonth) {
  const ym = normalizeText(targetYearMonth);

  if (!isValidYearMonth(ym)) {
    throw new Error("対象年月が不正です: " + targetYearMonth);
  }

  return SETTINGS.MONTHLY_SHEET_PREFIX + ym.replace("-", "");
}
// =========================
// 月次シート名取得ここまで
// =========================


// =========================
// 月次ヘッダー生成ここから
// =========================
function buildMonthlyHeader(targetYearMonth) {
  const lastDay = getLastDayOfMonth(targetYearMonth);
  const header = ["提出状況", "スタッフ名", "employee_code", "メモ"];

  for (let day = 1; day <= lastDay; day++) {
    header.push(day + "日");
  }

  return header;
}
// =========================
// 月次ヘッダー生成ここまで
// =========================


// =========================
// 月次シート存在確認ここから
// =========================
function monthlySheetExists_(targetYearMonth) {
  const ss = getSpreadsheet_();
  const sheetName = buildMonthlySheetName(targetYearMonth);
  const sheet = ss.getSheetByName(sheetName);
  return !!sheet;
}
// =========================
// 月次シート存在確認ここまで
// =========================


// =========================
// 必要なら月次シート自動生成ここから
// 初回申請時の自動生成用
// =========================
function ensureMonthlySheetExists_(targetYearMonth) {
  if (monthlySheetExists_(targetYearMonth)) {
    return {
      success: true,
      mode: "exists"
    };
  }

  const roster = fetchRosterFromShiftCore_();
  return createMonthlyRequestSheet(targetYearMonth, roster);
}
// =========================
// 必要なら月次シート自動生成ここまで
// =========================


// =========================
// 月次シート自動生成ここから
// roster を受け取って生成する
// 既に存在する場合はそのまま返す
// =========================
function createMonthlyRequestSheet(targetYearMonth, roster) {
  const ym = normalizeText(targetYearMonth);

  if (!isValidYearMonth(ym)) {
    throw new Error("targetYearMonth が不正です: " + targetYearMonth);
  }

  const normalizedRoster = normalizeRoster(roster);
  const ss = getSpreadsheet_();
  const sheetName = buildMonthlySheetName(ym);

  let sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    return {
      success: true,
      mode: "exists",
      sheetName: sheetName,
      rowCount: Math.max(sheet.getLastRow() - 1, 0)
    };
  }

  sheet = ss.insertSheet(sheetName);

  const header = buildMonthlyHeader(ym);
  sheet.getRange(1, 1, 1, header.length).setValues([header]);

  const body = normalizedRoster.map(function(item) {
    return [
      "未提出",
      item.displayName,
      item.employeeCode,
      ""
    ];
  });

  if (body.length > 0) {
    sheet.getRange(2, 1, body.length, 4).setValues(body);
  }

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4);

  applyMonthlySheetStyle(sheet, ym);

  return {
    success: true,
    mode: "create",
    sheetName: sheetName,
    rowCount: body.length
  };
}
// =========================
// 月次シート自動生成ここまで
// =========================


// =========================
// 月次シート装飾ここから
// =========================
function applyMonthlySheetStyle(sheet, targetYearMonth) {
  const lastDay = getLastDayOfMonth(targetYearMonth);
  const lastColumn = SETTINGS.MONTHLY_DAY_START_COLUMN + lastDay - 1;

  sheet.getRange(1, 1, 1, lastColumn)
    .setFontWeight("bold")
    .setBackground("#f3f4f6")
    .setHorizontalAlignment("center");

  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, SETTINGS.MONTHLY_STATUS_COLUMN, sheet.getLastRow() - 1, 1)
      .setHorizontalAlignment("center");

    sheet.getRange(2, SETTINGS.MONTHLY_NAME_COLUMN, sheet.getLastRow() - 1, 1)
      .setHorizontalAlignment("left");

    sheet.getRange(2, SETTINGS.MONTHLY_CODE_COLUMN, sheet.getLastRow() - 1, 1)
      .setHorizontalAlignment("center");

    sheet.getRange(2, 4, sheet.getLastRow() - 1, 1)
      .setHorizontalAlignment("left");

    sheet.getRange(2, SETTINGS.MONTHLY_DAY_START_COLUMN, sheet.getLastRow() - 1, lastDay)
      .setHorizontalAlignment("center");
  }

  sheet.setColumnWidth(SETTINGS.MONTHLY_STATUS_COLUMN, 110);
  sheet.setColumnWidth(SETTINGS.MONTHLY_NAME_COLUMN, 160);
  sheet.setColumnWidth(SETTINGS.MONTHLY_CODE_COLUMN, 110);
  sheet.setColumnWidth(4, 220);

  for (let day = 1; day <= lastDay; day++) {
    sheet.setColumnWidth(SETTINGS.MONTHLY_DAY_START_COLUMN + day - 1, 45);
  }

  const parts = normalizeText(targetYearMonth).split("-");
  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]) - 1;

  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, monthIndex, day);
    const weekday = date.getDay();
    const col = SETTINGS.MONTHLY_DAY_START_COLUMN + day - 1;

    if (weekday === 0) {
      sheet.getRange(1, col).setFontColor("#c62828");
    } else if (weekday === 6) {
      sheet.getRange(1, col).setFontColor("#1565c0");
    }
  }
}
// =========================
// 月次シート装飾ここまで
// =========================


// =========================
// 月次シート取得ここから
// =========================
function getMonthlyRequestSheet(targetYearMonth) {
  const ss = getSpreadsheet_();
  const sheetName = buildMonthlySheetName(targetYearMonth);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error("月次シートが見つかりません: " + sheetName);
  }

  return sheet;
}
// =========================
// 月次シート取得ここまで
// =========================

// =========================
// PMO管理用 月次一覧取得ここから
// pmo-admin.html 表示用
// =========================
function getPmoMonthlyTable(targetYearMonth, role) {
  try {
    const ym = normalizeText(targetYearMonth);
    const normalizedRole = normalizeText(role).toLowerCase();

    if (!ym || !isValidYearMonth(ym)) {
      return {
        success: false,
        message: "targetYearMonth が不正です"
      };
    }

    if (normalizedRole !== "admin" && normalizedRole !== "developer") {
      return {
        success: false,
        message: "このアカウントには管理権限がありません"
      };
    }

    const sheet = getMonthlyRequestSheet(ym);
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();

    if (lastColumn < 1) {
      return {
        success: true,
        headers: [],
        rows: []
      };
    }

    const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];

    if (lastRow < 2) {
      return {
        success: true,
        headers: headers,
        rows: []
      };
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getDisplayValues();

    return {
      success: true,
      headers: headers,
      rows: rows,
      sheetName: sheet.getName()
    };

  } catch (error) {
    return {
      success: false,
      message: "月次一覧取得中にエラーが発生しました: " + error.message
    };
  }
}
// =========================
// PMO管理用 月次一覧取得ここまで
// =========================


// =========================
// PMO管理用 月一覧取得ここから
// =========================
function getAvailableMonthlySheets_() {
  const ss = getSpreadsheet_();
  const sheets = ss.getSheets();
  const prefix = SETTINGS.MONTHLY_SHEET_PREFIX;
  const months = [];

  sheets.forEach(function(sheet) {
    const name = String(sheet.getName() || "").trim();

    if (!name.startsWith(prefix)) {
      return;
    }

    const suffix = name.slice(prefix.length); // 例: 202606

    if (!/^\d{6}$/.test(suffix)) {
      return;
    }

    const value = suffix.slice(0, 4) + "-" + suffix.slice(4, 6); // 2026-06
    const label = suffix.slice(0, 4) + "年" + Number(suffix.slice(4, 6)) + "月";

    months.push({
      value: value,
      label: label,
      sheetName: name,
      sheetId: sheet.getSheetId()
    });
  });

  months.sort(function(a, b) {
    return a.value < b.value ? 1 : -1;
  });

  return months;
}
// =========================
// PMO管理用 月一覧取得ここまで
// =========================


// =========================
// PMO管理メタ取得 secure ここから
// 初回表示用の一覧データもまとめて返す
// =========================
function getPmoAdminMetaSecure(targetYearMonth, idToken) {
  const auth = requirePmoAdminUser_(idToken);

  if (!auth.success) {
    return auth;
  }

  const meta = getPmoAdminMeta(targetYearMonth, auth.user.role);

  if (!meta.success) {
    return meta;
  }

  const effectiveYearMonth = normalizeText(meta.selectedYearMonth);

  if (!effectiveYearMonth) {
    return {
      success: true,
      months: meta.months || [],
      selectedYearMonth: "",
      monthlySheetUrl: meta.monthlySheetUrl || "",
      requestSheetUrl: meta.requestSheetUrl || "",
      initialTable: {
        headers: [],
        rows: []
      }
    };
  }

  const table = buildPmoMonthlyTableData_(effectiveYearMonth, auth.user.role);

  if (!table.success) {
    return {
      success: true,
      months: meta.months || [],
      selectedYearMonth: effectiveYearMonth,
      monthlySheetUrl: meta.monthlySheetUrl || "",
      requestSheetUrl: meta.requestSheetUrl || "",
      initialTable: {
        headers: [],
        rows: []
      }
    };
  }

  return {
    success: true,
    months: meta.months || [],
    selectedYearMonth: effectiveYearMonth,
    monthlySheetUrl: meta.monthlySheetUrl || "",
    requestSheetUrl: meta.requestSheetUrl || "",
    initialTable: {
      headers: table.headers || [],
      rows: table.rows || []
    }
  };
}
// =========================
// PMO管理メタ取得 secure ここまで
// =========================


// =========================
// 月次スタッフ行検索ここから
// C列 employee_code で探す
// =========================
function findEmployeeRowInMonthlySheet(sheet, employeeCode) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const values = sheet.getRange(2, SETTINGS.MONTHLY_CODE_COLUMN, lastRow - 1, 1).getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    const rowCode = normalizeText(values[i][0]).toUpperCase();

    if (rowCode && rowCode === normalizeText(employeeCode).toUpperCase()) {
      return i + 2;
    }
  }

  return 0;
}
// =========================
// 月次スタッフ行検索ここまで
// =========================

// =========================
// employee_code 数値部取得ここから
// AN0007 -> 7
// 数値化できない場合は大きい値に逃がす
// =========================
function getEmployeeCodeOrderValue_(employeeCode) {
  const code = normalizeText(employeeCode).toUpperCase();
  const match = code.match(/^AN(\d+)$/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(match[1]);
}
// =========================
// employee_code 数値部取得ここまで
// =========================


// =========================
// 月次スタッフ挿入位置取得ここから
// employee_code 昇順で入るべき行番号を返す
// =========================
function findInsertRowInMonthlySheet_(sheet, employeeCode) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 2;
  }

  const values = sheet.getRange(2, SETTINGS.MONTHLY_CODE_COLUMN, lastRow - 1, 1).getDisplayValues();
  const newOrder = getEmployeeCodeOrderValue_(employeeCode);

  for (let i = 0; i < values.length; i++) {
    const rowCode = normalizeText(values[i][0]).toUpperCase();

    if (!rowCode) {
      return i + 2;
    }

    const currentOrder = getEmployeeCodeOrderValue_(rowCode);

    if (newOrder < currentOrder) {
      return i + 2;
    }
  }

  return lastRow + 1;
}
// =========================
// 月次スタッフ挿入位置取得ここまで
// =========================


// =========================
// 月次スタッフ行追加ここから
// 無ければ employee_code 昇順の位置に1行追加
// =========================
function appendEmployeeRowToMonthlySheet_(sheet, savedRequest) {
  const lastDay = getLastDayOfMonth(savedRequest.targetYearMonth);
  const insertRow = findInsertRowInMonthlySheet_(sheet, savedRequest.employeeCode);

  if (insertRow <= sheet.getLastRow()) {
    sheet.insertRowsBefore(insertRow, 1);
  }

  const targetRow = insertRow > sheet.getLastRow() ? sheet.getLastRow() + 1 : insertRow;

  const rowValues = [[
    "未提出",
    savedRequest.displayName,
    normalizeText(savedRequest.employeeCode).toUpperCase(),
    savedRequest.memo || ""
  ]];

  sheet.getRange(targetRow, 1, 1, 4).setValues(rowValues);

  if (lastDay > 0) {
    const blankDays = [Array(lastDay).fill("")];
    sheet.getRange(targetRow, SETTINGS.MONTHLY_DAY_START_COLUMN, 1, lastDay).setValues(blankDays);
  }

  sheet.getRange(targetRow, SETTINGS.MONTHLY_STATUS_COLUMN).setHorizontalAlignment("center");
  sheet.getRange(targetRow, SETTINGS.MONTHLY_NAME_COLUMN).setHorizontalAlignment("left");
  sheet.getRange(targetRow, SETTINGS.MONTHLY_CODE_COLUMN).setHorizontalAlignment("center");
  sheet.getRange(targetRow, 4).setHorizontalAlignment("left");

  if (lastDay > 0) {
    sheet.getRange(targetRow, SETTINGS.MONTHLY_DAY_START_COLUMN, 1, lastDay).setHorizontalAlignment("center");
  }

  return targetRow;
}
// =========================
// 月次スタッフ行追加ここまで
// =========================


// =========================
// 月次スタッフ行確保ここから
// 無ければ自動追加して行番号を返す
// =========================
function ensureEmployeeRowInMonthlySheet_(sheet, savedRequest) {
  let row = findEmployeeRowInMonthlySheet(sheet, savedRequest.employeeCode);

  if (row) {
    return row;
  }

  return appendEmployeeRowToMonthlySheet_(sheet, savedRequest);
}
// =========================
// 月次スタッフ行確保ここまで
// =========================
// =========================
// 月次反映ここから
// =========================
function writeRequestToMonthlySheet(sheet, row, savedRequest) {
  const lastDay = getLastDayOfMonth(savedRequest.targetYearMonth);

  sheet.getRange(row, SETTINGS.MONTHLY_DAY_START_COLUMN, 1, lastDay).clearContent();
  sheet.getRange(row, SETTINGS.MONTHLY_STATUS_COLUMN).setValue(savedRequest.submitType);
  sheet.getRange(row, 4).setValue(savedRequest.memo || "");

  if (savedRequest.submitType === "希望休あり") {
    for (let i = 0; i < savedRequest.offDates.length; i++) {
      const dateStr = normalizeText(savedRequest.offDates[i]);
      const parts = dateStr.split("-");

      if (parts.length !== 3) {
        continue;
      }

      const yearMonth = parts[0] + "-" + parts[1];
      const day = Number(parts[2]);

      if (yearMonth !== savedRequest.targetYearMonth) {
        continue;
      }

      if (day < 1 || day > lastDay) {
        continue;
      }

      const col = SETTINGS.MONTHLY_DAY_START_COLUMN + day - 1;
      sheet.getRange(row, col).setValue("×");
    }
  }
}
// =========================
// 月次反映ここまで
// =========================


// =========================
// 原本反映済み更新ここから
// =========================
function markRequestReflected(row) {
  const sheet = getOrCreateRequestSheet();

  sheet.getRange(row, 9).setValue(true);
  sheet.getRange(row, 10).setValue(getNowIsoStringJst());
}
// =========================
// 原本反映済み更新ここまで
// =========================


// =========================
// 原本を月次へ反映ここから
// =========================
function reflectShiftRequestToMonthlySheet(savedRequest) {
  const sheet = getMonthlyRequestSheet(savedRequest.targetYearMonth);
  const row = ensureEmployeeRowInMonthlySheet_(sheet, savedRequest);

  writeRequestToMonthlySheet(sheet, row, savedRequest);
  markRequestReflected(savedRequest.row);

  return {
    success: true,
    sheetName: sheet.getName(),
    row: row
  };
}
// =========================
// 原本を月次へ反映ここまで
// =========================

// =========================
// PMO管理メタ取得 secure ここから
// 初回表示用の一覧データと currentUser もまとめて返す
// =========================
function getPmoAdminMetaSecure(targetYearMonth, idToken) {
  const auth = requirePmoAdminUser_(idToken);

  if (!auth.success) {
    return auth;
  }

  const meta = getPmoAdminMeta(targetYearMonth, auth.user.role);

  if (!meta.success) {
    return meta;
  }

  const effectiveYearMonth = normalizeText(meta.selectedYearMonth);

  if (!effectiveYearMonth) {
    return {
      success: true,
      currentUser: auth.user,
      months: meta.months || [],
      selectedYearMonth: "",
      monthlySheetUrl: meta.monthlySheetUrl || "",
      requestSheetUrl: meta.requestSheetUrl || "",
      initialTable: {
        headers: [],
        rows: []
      }
    };
  }

  const table = buildPmoMonthlyTableData_(effectiveYearMonth, auth.user.role);

  if (!table.success) {
    return {
      success: true,
      currentUser: auth.user,
      months: meta.months || [],
      selectedYearMonth: effectiveYearMonth,
      monthlySheetUrl: meta.monthlySheetUrl || "",
      requestSheetUrl: meta.requestSheetUrl || "",
      initialTable: {
        headers: [],
        rows: []
      }
    };
  }

  return {
    success: true,
    currentUser: auth.user,
    months: meta.months || [],
    selectedYearMonth: effectiveYearMonth,
    monthlySheetUrl: meta.monthlySheetUrl || "",
    requestSheetUrl: meta.requestSheetUrl || "",
    initialTable: {
      headers: table.headers || [],
      rows: table.rows || []
    }
  };
}
// =========================
// PMO管理メタ取得 secure ここまで
// =========================


// =========================
// PMO管理一覧取得 secure ここから
// =========================
function getPmoMonthlyTableSecure(targetYearMonth, idToken) {
  const auth = requirePmoAdminUser_(idToken);

  if (!auth.success) {
    return auth;
  }

  return getPmoMonthlyTable(targetYearMonth, auth.user.role);
}
// =========================
// PMO管理一覧取得 secure ここまで
// =========================

// =========================
// PMO管理用 初期テーブル取得ここから
// getPmoAdminMetaSecure から使う内部関数
// =========================
function buildPmoMonthlyTableData_(targetYearMonth, role) {
  const result = getPmoMonthlyTable(targetYearMonth, role);

  if (!result.success) {
    return {
      success: false,
      message: result.message || "一覧データの取得に失敗しました"
    };
  }

  return {
    success: true,
    headers: result.headers || [],
    rows: result.rows || []
  };
}
// =========================
// PMO管理用 初期テーブル取得ここまで
// =========================

// =========================
// PMO管理Excel出力 secure ここから
// =========================
function exportMonthlyExcelSecure(targetYearMonth, idToken) {
  const auth = requirePmoAdminUser_(idToken);

  if (!auth.success) {
    return auth;
  }

  return exportMonthlyExcel(targetYearMonth, auth.user.role);
}
// =========================
// PMO管理Excel出力 secure ここまで
// =========================