// =========================
// payload検証ここから
// =========================
function validateShiftRequestPayload(payload) {
  const userId = normalizeText(payload.userId);
  const displayName = normalizeText(payload.displayName);
  const employeeCode = normalizeText(payload.employeeCode).toUpperCase();
  const targetYearMonth = normalizeText(payload.targetYearMonth);
  const memo = normalizeText(payload.memo);
  const submitType = normalizeText(payload.submitType);
  const offDates = Array.isArray(payload.offDates) ? payload.offDates : [];

  if (!userId) {
    return { ok: false, message: "userId がありません" };
  }

  if (!displayName) {
    return { ok: false, message: "displayName がありません" };
  }

  if (!employeeCode) {
    return { ok: false, message: "employeeCode がありません" };
  }

  if (!targetYearMonth || !isValidYearMonth(targetYearMonth)) {
    return { ok: false, message: "targetYearMonth が不正です" };
  }

  if (submitType !== "希望休あり" && submitType !== "希望休なし") {
    return { ok: false, message: "submitType が不正です" };
  }

  if (!isValidDateArray(offDates, targetYearMonth)) {
    return { ok: false, message: "offDates が不正です" };
  }

  if (submitType === "希望休あり" && offDates.length === 0) {
    return { ok: false, message: "希望休ありの場合は offDates が1件以上必要です" };
  }

  if (submitType === "希望休なし" && offDates.length > 0) {
    return { ok: false, message: "希望休なしの場合は offDates を空にしてください" };
  }

  return {
    ok: true,
    normalized: {
      userId: userId,
      displayName: displayName,
      employeeCode: employeeCode,
      targetYearMonth: targetYearMonth,
      offDates: offDates.map(function(dateStr) {
        return normalizeText(dateStr);
      }).sort(),
      memo: memo,
      submitType: submitType
    }
  };
}
// =========================
// payload検証ここまで
// =========================


// =========================
// application_id発番ここから
// =========================
function generateApplicationId(targetYearMonth, userId) {
  return "PMO-" + normalizeText(targetYearMonth) + "-" + normalizeText(userId) + "-" + getNowCompactTimestamp();
}
// =========================
// application_id発番ここまで
// =========================


// =========================
// 最新申請検索ここから
// user_id + target_year_month + is_latest=TRUE
// =========================
function findLatestRequestRow(userId, targetYearMonth) {
  const sheet = getOrCreateRequestSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, SETTINGS.REQUEST_HEADER.length).getDisplayValues();

  for (let i = values.length - 1; i >= 0; i--) {
    const rowUserId = normalizeText(values[i][2]);
    const rowTargetYearMonth = normalizeText(values[i][1]);
    const rowIsLatest = normalizeText(values[i][7]).toUpperCase();

    if (
      rowUserId === normalizeText(userId) &&
      rowTargetYearMonth === normalizeText(targetYearMonth) &&
      rowIsLatest === "TRUE"
    ) {
      return i + 2;
    }
  }

  return 0;
}
// =========================
// 最新申請検索ここまで
// =========================


// =========================
// 旧最新FALSE化ここから
// =========================
function markOldRequestsNotLatest(userId, targetYearMonth) {
  const sheet = getOrCreateRequestSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, SETTINGS.REQUEST_HEADER.length).getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    const rowUserId = normalizeText(values[i][2]);
    const rowTargetYearMonth = normalizeText(values[i][1]);
    const rowIsLatest = normalizeText(values[i][7]).toUpperCase();

    if (
      rowUserId === normalizeText(userId) &&
      rowTargetYearMonth === normalizeText(targetYearMonth) &&
      rowIsLatest === "TRUE"
    ) {
      sheet.getRange(i + 2, 8).setValue(false);
    }
  }
}
// =========================
// 旧最新FALSE化ここまで
// =========================


// =========================
// 希望休原本保存ここから
// 常に新規行追加
// =========================
function saveShiftRequest(payload) {
  const sheet = getOrCreateRequestSheet();

  markOldRequestsNotLatest(payload.userId, payload.targetYearMonth);

  const submittedAt = getNowIsoStringJst();
  const applicationId = generateApplicationId(payload.targetYearMonth, payload.userId);
  const offDatesString = payload.offDates.join(",");

  const targetRow = Math.max(sheet.getLastRow() + 1, 2);

  sheet.getRange(targetRow, 1, 1, SETTINGS.REQUEST_HEADER.length).setValues([[
    submittedAt,
    payload.targetYearMonth,
    payload.userId,
    payload.displayName,
    offDatesString,
    payload.memo,
    applicationId,
    true,
    false,
    "",
    payload.submitType,
    payload.employeeCode
  ]]);

  return {
    row: targetRow,
    submittedAt: submittedAt,
    applicationId: applicationId,
    targetYearMonth: payload.targetYearMonth,
    userId: payload.userId,
    displayName: payload.displayName,
    employeeCode: payload.employeeCode,
    offDates: payload.offDates,
    memo: payload.memo,
    submitType: payload.submitType
  };
}
// =========================
// 希望休原本保存ここまで
// =========================


// =========================
// 希望休提出ここから
// 月次シートが無ければ自動生成してから保存
// =========================
function submitShiftRequest(payload) {
  const validation = validateShiftRequestPayload(payload);

  if (!validation.ok) {
    return {
      success: false,
      message: validation.message
    };
  }

  const normalized = validation.normalized;

  ensureMonthlySheetExists_(normalized.targetYearMonth);

  const savedRequest = saveShiftRequest(normalized);
  reflectShiftRequestToMonthlySheet(savedRequest);

  writeLatestRequestIndex_(savedRequest.userId, savedRequest.targetYearMonth, {
    success: true,
    exists: true,
    offDates: savedRequest.offDates,
    memo: savedRequest.memo,
    submitType: savedRequest.submitType,
    applicationId: savedRequest.applicationId,
    employeeCode: savedRequest.employeeCode,
    displayName: savedRequest.displayName
  });

  return {
    success: true,
    message: "希望休を保存し、月次一覧へ反映しました",
    applicationId: savedRequest.applicationId,
    submittedAt: savedRequest.submittedAt
  };
}
// =========================
// 希望休提出ここまで
// =========================


// =========================
// 最新提出インデックスここから
// 期限切れのないScript Propertiesを使い、通常起動時の全行走査を避ける。
// =========================
function getLatestRequestIndexKey_(userId, targetYearMonth) {
  return "PMO_LATEST_REQUEST_" + normalizeText(targetYearMonth) + "_" + normalizeText(userId);
}

function readLatestRequestIndex_(userId, targetYearMonth) {
  const raw = PropertiesService.getScriptProperties()
    .getProperty(getLatestRequestIndexKey_(userId, targetYearMonth));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function writeLatestRequestIndex_(userId, targetYearMonth, result) {
  PropertiesService.getScriptProperties().setProperty(
    getLatestRequestIndexKey_(userId, targetYearMonth),
    JSON.stringify(result)
  );
}
// =========================
// 最新提出インデックスここまで
// =========================


// =========================
// 最新提出取得ここから
// =========================
function getLatestShiftRequest(userId, targetYearMonth) {
  try {
    const targetUserId = normalizeText(userId);
    const ym = normalizeText(targetYearMonth);

    if (!targetUserId) {
      return {
        success: false,
        message: "userId が未指定です"
      };
    }

    if (!ym || !isValidYearMonth(ym)) {
      return {
        success: false,
        message: "targetYearMonth が不正です"
      };
    }

    const indexedResult = readLatestRequestIndex_(targetUserId, ym);

    if (indexedResult) {
      return indexedResult;
    }

    const row = findLatestRequestRow(targetUserId, ym);

    if (!row) {
      const emptyResult = {
        success: true,
        exists: false,
        offDates: [],
        memo: "",
        submitType: ""
      };

      writeLatestRequestIndex_(targetUserId, ym, emptyResult);
      return emptyResult;
    }

    const sheet = getOrCreateRequestSheet();
    const values = sheet.getRange(row, 1, 1, SETTINGS.REQUEST_HEADER.length).getDisplayValues()[0];

    const offDatesString = normalizeText(values[4]);
    const offDates = offDatesString
      ? offDatesString.split(",").map(function(item) {
          return normalizeText(item);
        }).filter(function(item) {
          return !!item;
        })
      : [];

    const result = {
      success: true,
      exists: true,
      offDates: offDates,
      memo: normalizeText(values[5]),
      submitType: normalizeText(values[10]),
      applicationId: normalizeText(values[6]),
      employeeCode: normalizeText(values[11]),
      displayName: normalizeText(values[3])
    };

    writeLatestRequestIndex_(targetUserId, ym, result);
    return result;

  } catch (error) {
    return {
      success: false,
      message: "最新提出取得中にエラーが発生しました: " + error.message
    };
  }
}
// =========================
// 最新提出取得ここまで
// =========================