// ===== ShiftBuilder Repository ここから =====


// ===== Spreadsheet取得ここから =====
function getAccountSpreadsheet_() {
  return SpreadsheetApp.openById(ACCOUNT_SPREADSHEET_ID);
}

function getShiftBuilderSpreadsheet_() {
  return SpreadsheetApp.openById(SHIFTBUILDER_SPREADSHEET_ID);
}

function getOrderCaseSpreadsheet_() {
  if (!ORDERCASE_SPREADSHEET_ID) {
    throw new Error("ORDERCASE_SPREADSHEET_ID が未設定です");
  }

  return SpreadsheetApp.openById(ORDERCASE_SPREADSHEET_ID);
}

function getPmoSpreadsheet_() {
  if (!PMO_SPREADSHEET_ID) {
    throw new Error("PMO_SPREADSHEET_ID が未設定です");
  }

  return SpreadsheetApp.openById(PMO_SPREADSHEET_ID);
}
// ===== Spreadsheet取得ここまで =====


// ===== Sheet取得ここから =====
function getRequiredSheet_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(sheetName + " シートが見つかりません");
  }

  return sheet;
}

function getUsersMasterSheet_() {
  return getRequiredSheet_(getAccountSpreadsheet_(), USERS_MASTER_SHEET_NAME);
}

function getShiftMonthsSheet_() {
  return getRequiredSheet_(getShiftBuilderSpreadsheet_(), SHIFT_MONTHS_SHEET_NAME);
}

function getShiftAssignmentsSheet_() {
  return getRequiredSheet_(getShiftBuilderSpreadsheet_(), SHIFT_ASSIGNMENTS_SHEET_NAME);
}

function getAvailabilityEventsSheet_() {
  return getRequiredSheet_(getShiftBuilderSpreadsheet_(), AVAILABILITY_EVENTS_SHEET_NAME);
}

function getShiftDayDetailsSheet_() {
  return getRequiredSheet_(getShiftBuilderSpreadsheet_(), SHIFT_DAY_DETAILS_SHEET_NAME);
}

function getShiftInternalEventsSheet_() {
  return getRequiredSheet_(getShiftBuilderSpreadsheet_(), SHIFT_INTERNAL_EVENTS_SHEET_NAME);
}

function getShiftConfirmationsSheet_() {
  return getRequiredSheet_(getShiftBuilderSpreadsheet_(), SHIFT_CONFIRMATIONS_SHEET_NAME);
}

function getShiftAuditLogsSheet_() {
  return getRequiredSheet_(getShiftBuilderSpreadsheet_(), SHIFT_AUDIT_LOGS_SHEET_NAME);
}

function getOrderCaseCasesSheet_() {
  return getRequiredSheet_(getOrderCaseSpreadsheet_(), ORDERCASE_CASES_SHEET_NAME);
}

function getOrderCaseCaseDatesSheet_() {
  return getRequiredSheet_(getOrderCaseSpreadsheet_(), ORDERCASE_CASE_DATES_SHEET_NAME);
}

function getOrderCaseStoresMasterSheet_() {
  return getRequiredSheet_(getOrderCaseSpreadsheet_(), ORDERCASE_STORES_MASTER_SHEET_NAME);
}

function getPmoRequestsSheet_() {
  return getRequiredSheet_(getPmoSpreadsheet_(), PMO_REQUESTS_SHEET_NAME);
}
// ===== Sheet取得ここまで =====


// ===== users_master 読み取りここから =====
function getUsersMasterRows_() {
  return getSheetObjects_(getUsersMasterSheet_());
}

function getActiveShiftBuilderUsers_() {
  return getUsersMasterRows_()
    .filter(function(user) {
      return isShiftBuilderAssignableUser_(user);
    });
}

function findUserByInternalUserId_(internalUserId) {
  const targetId = normalizeText(internalUserId);

  if (!targetId) {
    return null;
  }

  const users = getUsersMasterRows_();

  for (let i = 0; i < users.length; i++) {
    if (normalizeText(users[i].internal_user_id) === targetId) {
      return users[i];
    }
  }

  return null;
}

function findUserByEmail_(email) {
  const targetEmail = normalizeLowerText(email);

  if (!targetEmail) {
    return null;
  }

  const users = getUsersMasterRows_();

  for (let i = 0; i < users.length; i++) {
    if (normalizeLowerText(users[i].email) === targetEmail) {
      return users[i];
    }
  }

  return null;
}
// ===== users_master 読み取りここまで =====


// ===== shift_months 読み取り・作成ここから =====
function getShiftMonthRows_() {
  return getSheetObjects_(getShiftMonthsSheet_());
}

function findShiftMonth_(targetMonth, area) {
  const normalizedTargetMonth = normalizeMonth(targetMonth);
  const normalizedArea = normalizeText(area);
  const rows = getShiftMonthRows_();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (
      normalizeMonth(row.target_month) === normalizedTargetMonth &&
      normalizeText(row.area) === normalizedArea &&
      normalizeLowerText(row.archived) !== "true"
    ) {
      return row;
    }
  }

  return null;
}

function getOrCreateShiftMonth_(targetMonth, area, operator) {
  const existing = findShiftMonth_(targetMonth, area);

  if (existing) {
    return existing;
  }

  const sheet = getShiftMonthsSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function(header) {
      return normalizeText(header);
    });

  const now = getNowIsoStringJst();
  const shiftMonth = {};

  headers.forEach(function(header) {
    shiftMonth[header] = "";
  });

  setIfHeaderExists_(shiftMonth, headers, "shift_month_id", generateShiftMonthId_());
  setIfHeaderExists_(shiftMonth, headers, "target_month", normalizeMonth(targetMonth));
  setIfHeaderExists_(shiftMonth, headers, "area", normalizeText(area));
  setIfHeaderExists_(shiftMonth, headers, "status", SHIFT_MONTH_STATUS.DRAFT);
  setIfHeaderExists_(shiftMonth, headers, "version", "1");
  setIfHeaderExists_(shiftMonth, headers, "memo", "");
  setIfHeaderExists_(shiftMonth, headers, "created_at", now);
  setIfHeaderExists_(shiftMonth, headers, "created_by", normalizeText(operator.email));
  setIfHeaderExists_(shiftMonth, headers, "updated_at", now);
  setIfHeaderExists_(shiftMonth, headers, "updated_by", normalizeText(operator.email));
  setIfHeaderExists_(shiftMonth, headers, "archived", "");

  const row = headers.map(function(header) {
    return shiftMonth[header] == null ? "" : shiftMonth[header];
  });

  sheet.appendRow(row);

  return shiftMonth;
}
// ===== shift_months 読み取り・作成ここまで =====


// ===== shift_assignments 読み取りここから =====
function getShiftAssignmentRows_() {
  return getSheetObjects_(getShiftAssignmentsSheet_());
}

function getShiftAssignmentsByMonthArea_(targetMonth, area) {
  const normalizedTargetMonth = normalizeMonth(targetMonth);
  const normalizedArea = normalizeText(area);
  const assignments = getShiftAssignmentRows_()
    .filter(function(assignment) {
      return normalizeMonth(assignment.target_month) === normalizedTargetMonth;
    })
    .filter(function(assignment) {
      return normalizeText(assignment.area) === normalizedArea;
    })
    .filter(function(assignment) {
      return normalizeLowerText(assignment.archived) !== "true";
    })
    .filter(function(assignment) {
      const status = normalizeText(assignment.assignment_status);

      return status !== ASSIGNMENT_STATUS.ARCHIVED &&
        status !== ASSIGNMENT_STATUS.CANCELLED;
    });

  return filterShiftAssignmentsByAssignableOrderCases_(assignments);
}

function getAssignmentsByCaseDate_(targetMonth, area, caseId, caseDateId, workDate) {
  const normalizedCaseId = normalizeText(caseId);
  const normalizedCaseDateId = normalizeText(caseDateId);
  const normalizedWorkDate = normalizeDateString(workDate);

  return getShiftAssignmentsByMonthArea_(targetMonth, area)
    .filter(function(assignment) {
      return normalizeText(assignment.case_id) === normalizedCaseId;
    })
    .filter(function(assignment) {
      return normalizeText(assignment.case_date_id) === normalizedCaseDateId;
    })
    .filter(function(assignment) {
      return normalizeDateString(assignment.work_date) === normalizedWorkDate;
    });
}

function hasSameDayAssignment_(targetMonth, area, internalUserId, workDate) {
  const normalizedUserId = normalizeText(internalUserId);
  const normalizedWorkDate = normalizeDateString(workDate);

  return getShiftAssignmentsByMonthArea_(targetMonth, area)
    .some(function(assignment) {
      return normalizeText(assignment.internal_user_id) === normalizedUserId &&
        normalizeDateString(assignment.work_date) === normalizedWorkDate;
    });
}

function countMonthlyAssignmentsByUser_(targetMonth, area) {
  const counts = {};

  getShiftAssignmentsByMonthArea_(targetMonth, area).forEach(function(assignment) {
    const userId = normalizeText(assignment.internal_user_id);

    if (!userId) {
      return;
    }

    counts[userId] = (counts[userId] || 0) + 1;
  });

  return counts;
}
// ===== shift_assignments 読み取りここまで =====


// ===== shift_assignments 書き込みここから =====
function appendShiftAssignment_(params) {
  const sheet = getShiftAssignmentsSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function(header) {
      return normalizeText(header);
    });

  const now = getNowIsoStringJst();
  const assignment = {};

  headers.forEach(function(header) {
    assignment[header] = "";
  });

  setIfHeaderExists_(assignment, headers, "assignment_id", params.assignment_id || generateAssignmentId_());
  setIfHeaderExists_(assignment, headers, "shift_month_id", normalizeText(params.shift_month_id));
  setIfHeaderExists_(assignment, headers, "target_month", normalizeMonth(params.target_month));
  setIfHeaderExists_(assignment, headers, "area", normalizeText(params.area));
  setIfHeaderExists_(assignment, headers, "case_id", normalizeText(params.case_id));
  setIfHeaderExists_(assignment, headers, "case_date_id", normalizeText(params.case_date_id));
  setIfHeaderExists_(assignment, headers, "work_date", normalizeDateString(params.work_date));
  setIfHeaderExists_(assignment, headers, "internal_user_id", normalizeText(params.internal_user_id));
  setIfHeaderExists_(assignment, headers, "account_code", normalizeText(params.account_code));
  setIfHeaderExists_(assignment, headers, "display_name", normalizeText(params.display_name));
  setIfHeaderExists_(assignment, headers, "person_type", normalizeText(params.person_type));
  setIfHeaderExists_(assignment, headers, "contract_type", normalizeText(params.contract_type));
  setIfHeaderExists_(assignment, headers, "assignment_status", normalizeText(params.assignment_status || ASSIGNMENT_STATUS.DRAFT));
  setIfHeaderExists_(assignment, headers, "replacement_status", normalizeText(params.replacement_status || REPLACEMENT_STATUS.NONE));
  setIfHeaderExists_(assignment, headers, "start_time", normalizeText(params.start_time));
  setIfHeaderExists_(assignment, headers, "end_time", normalizeText(params.end_time));
  setIfHeaderExists_(assignment, headers, "time_slot", normalizeText(params.time_slot || DEFAULT_TIME_SLOT));
  setIfHeaderExists_(assignment, headers, "assignment_note", normalizeText(params.assignment_note));
  setIfHeaderExists_(assignment, headers, "change_reason_type", normalizeText(params.change_reason_type));
  setIfHeaderExists_(assignment, headers, "change_memo", normalizeText(params.change_memo));
  setIfHeaderExists_(assignment, headers, "created_at", now);
  setIfHeaderExists_(assignment, headers, "created_by", normalizeText(params.created_by));
  setIfHeaderExists_(assignment, headers, "updated_at", now);
  setIfHeaderExists_(assignment, headers, "updated_by", normalizeText(params.updated_by));
  setIfHeaderExists_(assignment, headers, "archived", "");

  const row = headers.map(function(header) {
    return assignment[header] == null ? "" : assignment[header];
  });

  sheet.appendRow(row);

  return assignment;
}

function archiveShiftAssignment_(assignmentId, operator, options) {
  const targetAssignmentId = normalizeText(assignmentId);

  if (!targetAssignmentId) {
    throw new Error("assignment_id が必要です");
  }

  const sheet = getShiftAssignmentsSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("アサインが見つかりません");
  }

  const headers = values[0].map(function(header) {
    return normalizeText(header);
  });
  const requiredHeaders = [
    "assignment_id",
    "assignment_status",
    "updated_at",
    "updated_by",
    "archived"
  ];
  const indexes = {};

  requiredHeaders.forEach(function(header) {
    const index = headers.indexOf(header);

    if (index === -1) {
      throw new Error(
        "shift_assignments に必須列がありません: " + header
      );
    }

    indexes[header] = index;
  });

  indexes.change_reason_type = headers.indexOf("change_reason_type");
  indexes.change_memo = headers.indexOf("change_memo");

  const archiveOptions = options || {};
  let rowNumber = 0;

  for (let i = 1; i < values.length; i++) {
    if (normalizeText(values[i][indexes.assignment_id]) === targetAssignmentId) {
      rowNumber = i + 1;
      break;
    }
  }

  if (!rowNumber) {
    throw new Error("対象のアサインが見つかりません");
  }

  sheet.getRange(rowNumber, indexes.updated_at + 1)
    .setValue(getNowIsoStringJst());
  sheet.getRange(rowNumber, indexes.updated_by + 1)
    .setValue(normalizeText(operator.email));

  if (normalizeText(archiveOptions.reason_type)) {
    if (indexes.change_reason_type === -1) {
      console.warn(
        "[ShiftBuilder] change_reason_type 列がないため解除理由を保存できません"
      );
    } else {
      sheet.getRange(rowNumber, indexes.change_reason_type + 1)
        .setValue(normalizeText(archiveOptions.reason_type));
    }
  }

  if (normalizeText(archiveOptions.change_memo)) {
    if (indexes.change_memo === -1) {
      console.warn(
        "[ShiftBuilder] change_memo 列がないため解除メモを保存できません"
      );
    } else {
      sheet.getRange(rowNumber, indexes.change_memo + 1)
        .setValue(normalizeText(archiveOptions.change_memo));
    }
  }

  sheet.getRange(rowNumber, indexes.assignment_status + 1)
    .setValue(ASSIGNMENT_STATUS.ARCHIVED);
  sheet.getRange(rowNumber, indexes.archived + 1)
    .setValue(true);

  SpreadsheetApp.flush();

  const verifiedRow = sheet
    .getRange(rowNumber, 1, 1, headers.length)
    .getValues()[0];
  const verifiedArchived =
    verifiedRow[indexes.archived] === true ||
    normalizeLowerText(verifiedRow[indexes.archived]) === "true";
  const verifiedStatus = normalizeText(
    verifiedRow[indexes.assignment_status]
  );

  if (
    !verifiedArchived ||
    verifiedStatus !== ASSIGNMENT_STATUS.ARCHIVED
  ) {
    throw new Error(
      "アサイン解除後の保存確認に失敗しました: " + targetAssignmentId
    );
  }

  return true;
}
// ===== shift_assignments 書き込みここまで =====


// ===== PickMyOff 希望休読み取りここから =====
function parsePmoOffDates_(value) {
  return normalizeText(value)
    .split(",")
    .map(function(item) {
      return normalizeDateString(item);
    })
    .filter(function(item) {
      return !!item;
    });
}

function getLatestPmoRequestsByUserForMonth_(targetMonth) {
  const normalizedTargetMonth = normalizeMonthValue_(targetMonth);
  const latestByUserId = {};

  getSheetObjects_(getPmoRequestsSheet_()).forEach(function(request) {
    const userId = normalizeText(request.user_id);
    const requestMonth = normalizeMonthValue_(request.target_year_month);
    const isLatest = normalizeLowerText(request.is_latest);

    if (
      !userId ||
      requestMonth !== normalizedTargetMonth ||
      (isLatest !== "true" && isLatest !== "1")
    ) {
      return;
    }

    latestByUserId[userId] = {
      requested_off_dates: parsePmoOffDates_(request.off_dates),
      requested_off_memo: normalizeText(request.memo),
      submit_type: normalizeText(request.submit_type),
      application_id: normalizeText(request.application_id)
    };
  });

  return latestByUserId;
}

function validateRequestedOffAssignment_(internalUserId, targetMonth, workDate, requestedOffConfirmed) {
  const userId = normalizeText(internalUserId);
  const normalizedWorkDate = normalizeDateString(workDate);
  const requestsByUserId = getLatestPmoRequestsByUserForMonth_(targetMonth);
  const request = requestsByUserId[userId];

  if (
    request &&
    request.requested_off_dates.indexOf(normalizedWorkDate) !== -1
  ) {
    if (requestedOffConfirmed !== true) {
      throw new Error("希望休へのアサインは本人への相談・了承確認が必要です: " + normalizedWorkDate);
    }
    return true;
  }

  return false;
}
// ===== PickMyOff 希望休読み取りここまで =====


// ===== OrderCase 読み取りここから =====
function getOrderCaseRows_() {
  return getSheetObjects_(getOrderCaseCasesSheet_());
}

function getOrderCaseDateRows_() {
  return getSheetObjects_(getOrderCaseCaseDatesSheet_());
}

function getOrderCaseStoreRows_() {
  return getSheetObjects_(getOrderCaseStoresMasterSheet_());
}
// ===== OrderCase 読み取りここまで =====

// ===== OrderCase → ShiftBuilder 月次データ変換ここから =====
function buildShiftBuilderMonthData_(targetMonth, area) {
  const normalizedTargetMonth = normalizeMonthValue_(targetMonth);
  const normalizedArea = normalizeText(area) || "all";

  const dates = buildMonthDateItems_(normalizedTargetMonth);
  const orderCases = getOrderCaseRows_();
  const orderCaseDates = getOrderCaseDateRows_();
  const storesById = {};
  getOrderCaseStoreRows_().forEach(function(store) {
    storesById[normalizeText(store.store_id)] = store;
  });
  const assignments = getShiftAssignmentsForMonthAreaView_(
    normalizedTargetMonth,
    normalizedArea,
    orderCases,
    orderCaseDates
  );
  const usersById = buildUsersById_();

  const datesByCaseId = groupOrderCaseDatesByCaseId_(orderCaseDates, normalizedTargetMonth);
  const assignmentsByCaseDate = groupShiftAssignmentsByCaseDate_(assignments);

  const activeCases = orderCases
    .filter(function(caseRow) {
      const caseId = normalizeText(caseRow.case_id);

      if (!caseId) {
        return false;
      }

      const caseTargetMonth = normalizeMonthValue_(caseRow.target_month);
      const hasCaseDateInTargetMonth =
        datesByCaseId[caseId] &&
        datesByCaseId[caseId].length > 0;

      return caseTargetMonth === normalizedTargetMonth || hasCaseDateInTargetMonth;
    })
    .filter(function(caseRow) {
      return isOrderCaseVisibleInShiftBuilder_(caseRow);
    })
    .filter(function(caseRow) {
      if (normalizedArea === "all") {
        return true;
      }

      const caseArea =
        normalizeText(caseRow.work_area) ||
        normalizeText(caseRow.store_area) ||
        DEFAULT_AREA;

      return caseArea === normalizedArea;
    });

  const shiftCases = activeCases
    .map(function(caseRow) {
      const caseId = normalizeText(caseRow.case_id);

      return buildShiftBuilderCaseFromOrderCase_(
        caseRow,
        datesByCaseId[caseId] || [],
        dates,
        assignmentsByCaseDate,
        usersById,
        storesById[normalizeText(caseRow.store_id)] || {}
      );
    })
    .filter(function(caseItem) {
      return caseItem !== null;
    });

  return {
    month: normalizedTargetMonth,
    area: normalizedArea,
    dates: dates,
    cases: shiftCases
  };
}

function isOrderCaseVisibleInShiftBuilder_(caseRow) {
  if (!caseRow) {
    return false;
  }

  if (normalizeLowerText(caseRow.archived) === "true") {
    return false;
  }

  const status = normalizeLowerText(caseRow.status);

  if (status === "cancelled" || status === "archived") {
    return false;
  }

  const forShiftBuilder = normalizeLowerText(caseRow.for_shift_builder);

  if (
    forShiftBuilder === "false" ||
    forShiftBuilder === "no" ||
    forShiftBuilder === "0"
  ) {
    return false;
  }

  return true;
}

function isValidShiftBuilderWorkDate_(value) {
  const dateText = normalizeDateString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false;

  const parts = dateText.split("-").map(Number);
  const parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return parsed.getUTCFullYear() === parts[0] &&
    parsed.getUTCMonth() === parts[1] - 1 &&
    parsed.getUTCDate() === parts[2];
}

function parseStoreMemberRuleIds_(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\s,、]+/);
  const seen = {};
  return source.map(function(item) {
    return normalizeLowerText(item);
  }).filter(function(item) {
    if (!item || seen[item]) return false;
    seen[item] = true;
    return true;
  });
}

function getStoreMemberRule_(caseRow, stores) {
  const storeId = normalizeText(caseRow && caseRow.store_id);
  const targetStore = (stores || []).find(function(store) {
    return normalizeText(store.store_id) === storeId;
  }) || {};

  return {
    preferred_member_ids: parseStoreMemberRuleIds_(targetStore.preferred_member_ids),
    ng_member_ids: parseStoreMemberRuleIds_(targetStore.ng_member_ids)
  };
}

function memberMatchesStoreRule_(params, memberIds) {
  const identifiers = [params && params.internal_user_id, params && params.account_code]
    .map(function(value) { return normalizeLowerText(value); })
    .filter(Boolean);
  return identifiers.some(function(identifier) {
    return memberIds.indexOf(identifier) !== -1;
  });
}

function resolveShiftBuilderAssignmentContract_(params, orderCases, orderCaseDates, orderCaseStores, options) {
  const caseId = normalizeText(params && params.case_id);
  const caseDateId = normalizeText(params && params.case_date_id);
  const workDate = normalizeDateString(params && params.work_date);
  const targetMonth = normalizeMonthValue_(params && params.target_month);
  const area = normalizeText(params && params.area);
  const sourceCases = Array.isArray(orderCases) ? orderCases : getOrderCaseRows_();
  const sourceCaseDates = Array.isArray(orderCaseDates)
    ? orderCaseDates
    : getOrderCaseDateRows_();
  const targetCase = sourceCases.find(function(caseRow) {
    return normalizeText(caseRow.case_id) === caseId;
  });

  if (!caseId || !targetCase) {
    throw new Error("対象案件が見つかりません: " + caseId);
  }

  const enforceMemberRules = !options || options.enforceMemberRules !== false;
  const sourceStores = Array.isArray(orderCaseStores)
    ? orderCaseStores
    : enforceMemberRules && normalizeText(targetCase.store_id)
      ? getOrderCaseStoreRows_()
      : [];

  if (!isOrderCaseVisibleInShiftBuilder_(targetCase)) {
    throw new Error("Shift対象外または無効な案件にはアサインできません: " + caseId);
  }

  const inputMode = normalizeText(targetCase.input_mode) || "dates";
  if (inputMode !== "dates" && inputMode !== "days") {
    throw new Error("案件のinput_modeが不正です: " + inputMode);
  }

  if (!isValidShiftBuilderWorkDate_(workDate)) {
    throw new Error("work_dateが不正です: " + workDate);
  }

  if (!targetMonth || normalizeMonthFromDate_(workDate) !== targetMonth) {
    throw new Error("target_monthとwork_dateが一致しません: " + targetMonth + " / " + workDate);
  }

  const caseArea = normalizeText(targetCase.work_area) ||
    normalizeText(targetCase.store_area) ||
    DEFAULT_AREA;
  if (!area || area === "all" || area !== caseArea) {
    throw new Error("案件エリアとアサイン先エリアが一致しません: " + caseArea + " / " + area);
  }

  const memberRule = getStoreMemberRule_(targetCase, sourceStores);
  if (enforceMemberRules && memberMatchesStoreRule_(params, memberRule.ng_member_ids)) {
    throw new Error("この店舗のNGメンバーはアサインできません: " + normalizeText(params.internal_user_id));
  }

  if (inputMode === "days") {
    if (caseDateId) {
      throw new Error("日数指定案件にcase_date_idは指定できません: " + caseDateId);
    }

    if (normalizeMonthValue_(targetCase.target_month) !== targetMonth) {
      throw new Error("日数指定案件の対象月が一致しません: " + targetMonth);
    }

    const requestedDays = toNumber_(targetCase.requested_days);
    if (!(requestedDays > 0) || Math.floor(requestedDays) !== requestedDays) {
      throw new Error("日数指定案件の依頼日数が設定されていません: " + caseId);
    }

    return {
      case_row: targetCase,
      case_date_row: null,
      input_mode: inputMode,
      required_total: requestedDays,
      member_rule: memberRule
    };
  }

  if (!caseDateId) {
    throw new Error("日付指定案件にはcase_date_idが必要です: " + caseId);
  }

  const targetCaseDate = sourceCaseDates.find(function(dateRow) {
    return normalizeText(dateRow.case_id) === caseId &&
      normalizeText(dateRow.case_date_id) === caseDateId &&
      normalizeDateString(dateRow.work_date) === workDate;
  });
  if (!targetCaseDate) {
    throw new Error("案件日とcase_date_idの組み合わせが不正です: " + caseId + " / " + workDate);
  }

  const requiredPeople = toNumber_(targetCaseDate.required_people) ||
    toNumber_(targetCase.required_people) ||
    0;
  if (!(requiredPeople > 0) || Math.floor(requiredPeople) !== requiredPeople) {
    throw new Error("案件日の必要人数が設定されていません: " + caseId + " / " + workDate);
  }

  return {
    case_row: targetCase,
    case_date_row: targetCaseDate,
    input_mode: inputMode,
    required_total: requiredPeople,
    member_rule: memberRule
  };
}

function getShiftBuilderContractTimeRange_(assignmentContract) {
  const safeContract = assignmentContract || {};
  const caseRow = safeContract.case_row || {};
  const caseDateRow = safeContract.case_date_row || {};
  const startTime = normalizeTimeString(caseDateRow.work_start_time) ||
    normalizeTimeString(caseRow.work_start_time);
  const endTime = normalizeTimeString(caseDateRow.work_end_time) ||
    normalizeTimeString(caseRow.work_end_time);

  if (!startTime && !endTime) {
    return { start_time: "", end_time: "", ends_next_day: false };
  }

  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(startTime) || !timePattern.test(endTime) || startTime === endTime) {
    throw new Error("案件の稼働開始・終了時刻が不正です");
  }

  return {
    start_time: startTime,
    end_time: endTime,
    ends_next_day: endTime < startTime
  };
}

function filterShiftAssignmentsByAssignableOrderCases_(
  assignments,
  orderCases,
  orderCaseDates
) {
  const sourceAssignments = Array.isArray(assignments) ? assignments : [];
  const sourceCases = Array.isArray(orderCases)
    ? orderCases
    : getOrderCaseRows_();
  const sourceCaseDates = Array.isArray(orderCaseDates)
    ? orderCaseDates
    : getOrderCaseDateRows_();
  return sourceAssignments.filter(function(assignment) {
    try {
      resolveShiftBuilderAssignmentContract_(
        assignment,
        sourceCases,
        sourceCaseDates,
        undefined,
        { enforceMemberRules: false }
      );
      return true;
    } catch (error) {
      return false;
    }
  });
}

function getShiftAssignmentsForMonthAreaView_(
  targetMonth,
  area,
  orderCases,
  orderCaseDates
) {
  const normalizedTargetMonth = normalizeMonthValue_(targetMonth);
  const normalizedArea = normalizeText(area) || "all";
  const assignments = getShiftAssignmentRows_()
    .filter(function(assignment) {
      return normalizeMonthValue_(assignment.target_month) === normalizedTargetMonth ||
        normalizeMonthFromDate_(assignment.work_date) === normalizedTargetMonth;
    })
    .filter(function(assignment) {
      if (normalizedArea === "all") {
        return true;
      }

      return normalizeText(assignment.area) === normalizedArea;
    })
    .filter(function(assignment) {
      return normalizeLowerText(assignment.archived) !== "true";
    })
    .filter(function(assignment) {
      const status = normalizeText(assignment.assignment_status);

      return status !== ASSIGNMENT_STATUS.ARCHIVED &&
        status !== ASSIGNMENT_STATUS.CANCELLED;
    });

  return filterShiftAssignmentsByAssignableOrderCases_(
    assignments,
    orderCases,
    orderCaseDates
  );
}

function groupShiftAssignmentsByCaseDate_(assignments) {
  const grouped = {};

  assignments.forEach(function(assignment) {
    const caseId = normalizeText(assignment.case_id);
    const caseDateId = normalizeText(assignment.case_date_id);
    const workDate = normalizeDateString(assignment.work_date);

    if (!caseId || !workDate) {
      return;
    }

    const exactKey = buildAssignmentLookupKey_(caseId, caseDateId, workDate);
    const fallbackKey = buildAssignmentLookupKey_(caseId, "", workDate);

    if (caseDateId) {
      if (!grouped[exactKey]) {
        grouped[exactKey] = [];
      }

      grouped[exactKey].push(assignment);
    }

    if (!grouped[fallbackKey]) {
      grouped[fallbackKey] = [];
    }

    grouped[fallbackKey].push(assignment);
  });

  return grouped;
}

function getAssignmentsForCaseDate_(assignmentsByCaseDate, caseId, caseDateId, workDate) {
  const normalizedCaseId = normalizeText(caseId);
  const normalizedCaseDateId = normalizeText(caseDateId);
  const normalizedWorkDate = normalizeDateString(workDate);

  const exactKey = buildAssignmentLookupKey_(
    normalizedCaseId,
    normalizedCaseDateId,
    normalizedWorkDate
  );

  const fallbackKey = buildAssignmentLookupKey_(
    normalizedCaseId,
    "",
    normalizedWorkDate
  );

  if (normalizedCaseDateId && assignmentsByCaseDate[exactKey]) {
    return assignmentsByCaseDate[exactKey];
  }

  return assignmentsByCaseDate[fallbackKey] || [];
}

function buildAssignmentLookupKey_(caseId, caseDateId, workDate) {
  return [
    normalizeText(caseId),
    normalizeText(caseDateId),
    normalizeDateString(workDate)
  ].join("__");
}

function buildUsersById_() {
  const usersById = {};

  getUsersMasterRows_().forEach(function(user) {
    usersById[normalizeText(user.internal_user_id)] = user;
  });

  return usersById;
}

function buildAssignedMembers_(assignments, usersById) {
  const safeUsersById = usersById || {};

  return assignments.filter(function(assignment) {
    const user = safeUsersById[normalizeText(assignment.internal_user_id)] || {};
    return normalizeLowerText(user.role) !== "developer";
  }).map(function(assignment) {
    const internalUserId = normalizeText(assignment.internal_user_id);
    const user = safeUsersById[internalUserId] || {};
    const familyName = normalizeText(user.family_name);
    const givenName = normalizeText(user.given_name);
    const displayName =
      normalizeText(assignment.display_name) ||
      normalizeText(assignment.account_code) ||
      normalizeText(assignment.internal_user_id) ||
      "氏名未設定";

    return {
      assignment_id: normalizeText(assignment.assignment_id),
      internal_user_id: internalUserId,
      account_code: normalizeText(assignment.account_code),
      family_name: familyName,
      familyName: familyName,
      given_name: givenName,
      givenName: givenName,

      // フロント側の既存描画差異を吸収するため、複数の名前キーを持たせる
      display_name: displayName,
      displayName: displayName,
      name: displayName,

      person_type: normalizeText(assignment.person_type),
      contract_type: normalizeText(assignment.contract_type),
      assignment_status: normalizeText(assignment.assignment_status),
      replacement_status: normalizeText(assignment.replacement_status),
      start_time: normalizeTimeString(assignment.start_time),
      end_time: normalizeTimeString(assignment.end_time),
      time_slot: normalizeText(assignment.time_slot || DEFAULT_TIME_SLOT),
      assignment_note: normalizeText(assignment.assignment_note)
    };
  });
}

function groupOrderCaseDatesByCaseId_(orderCaseDates, targetMonth) {
  const grouped = {};
  const normalizedTargetMonth = normalizeMonthValue_(targetMonth);

  orderCaseDates
    .filter(function(dateRow) {
      return normalizeMonthFromDate_(dateRow.work_date) === normalizedTargetMonth;
    })
    .forEach(function(dateRow) {
      const caseId = normalizeText(dateRow.case_id);

      if (!caseId) {
        return;
      }

      if (!grouped[caseId]) {
        grouped[caseId] = [];
      }

      grouped[caseId].push(dateRow);
    });

  return grouped;
}

function buildShiftBuilderCaseFromOrderCase_(caseRow, caseDateRows, monthDates, assignmentsByCaseDate, usersById, storeRow) {
  const caseId = normalizeText(caseRow.case_id);

  if (!caseId) {
    return null;
  }

  const inputMode = normalizeText(caseRow.input_mode);
  const isDaysMode = inputMode === "days";

  const caseTitle =
    normalizeText(caseRow.store_name) ||
    normalizeText(caseRow.work_location) ||
    normalizeText(caseRow.case_type) ||
    caseId;
  const safeStoreRow = storeRow || {};
  const storeMemberRule = {
    preferred_member_ids: parseStoreMemberRuleIds_(safeStoreRow.preferred_member_ids),
    ng_member_ids: parseStoreMemberRuleIds_(safeStoreRow.ng_member_ids)
  };
  const effectiveAddress = normalizeText(caseRow.work_address) || normalizeText(safeStoreRow.address);
  const effectiveNearestStation = normalizeText(caseRow.work_nearest_station) || normalizeText(safeStoreRow.nearest_station);

  const client =
    normalizeText(caseRow.agency_name) ||
    normalizeText(caseRow.agency_id) ||
    "代理店未設定";

  const area =
    normalizeText(caseRow.work_area) ||
    normalizeText(caseRow.store_area) ||
    DEFAULT_AREA;

  const caseRequiredPeople = toNumber_(caseRow.required_people) || 0;
  const caseRequiredLines = toNumber_(caseRow.required_lines) || 0;
  const casePeoplePerLine = toNumber_(caseRow.people_per_line) || 0;
  const requestedDays = toNumber_(caseRow.requested_days) || 0;

  const cells = {};

  monthDates.forEach(function(dateItem) {
    const workDate = normalizeDateString(dateItem.date);
    const assignments = isDaysMode
      ? getAssignmentsForCaseDate_(
          assignmentsByCaseDate,
          caseId,
          "",
          workDate
        )
      : [];

    cells[dateItem.date] = {
      required: isDaysMode ? 1 : 0,
      assigned: buildAssignedMembers_(assignments, usersById),
      candidates: [],
      case_date_id: "",
      memo: "",
      required_lines: isDaysMode ? 1 : 0,
      people_per_line: isDaysMode ? 1 : 0,
      start_time: normalizeTimeString(caseRow.work_start_time),
      end_time: normalizeTimeString(caseRow.work_end_time),
      time_slot: DEFAULT_TIME_SLOT,

      input_mode: inputMode,
      is_days_mode: isDaysMode,
      flexible_assignment: isDaysMode,
      assignable_without_case_date: isDaysMode,
      requested_days: requestedDays,
      case_required_people: caseRequiredPeople,
      case_required_lines: caseRequiredLines,
      case_people_per_line: casePeoplePerLine
    };
  });

  caseDateRows.forEach(function(dateRow) {
    const workDate = normalizeDateString(dateRow.work_date);

    if (!workDate || !cells[workDate]) {
      return;
    }

    const caseDateId = normalizeText(dateRow.case_date_id);
    const assignments = getAssignmentsForCaseDate_(
      assignmentsByCaseDate,
      caseId,
      caseDateId,
      workDate
    );

    cells[workDate] = {
      required: toNumber_(dateRow.required_people) || caseRequiredPeople || 0,
      assigned: buildAssignedMembers_(assignments, usersById),
      candidates: [],
      case_date_id: caseDateId,
      memo: normalizeText(dateRow.memo),
      required_lines: toNumber_(dateRow.required_lines) || caseRequiredLines || 0,
      people_per_line: toNumber_(dateRow.people_per_line) || casePeoplePerLine || 0,
      start_time: normalizeTimeString(dateRow.work_start_time) || normalizeTimeString(caseRow.work_start_time),
      end_time: normalizeTimeString(dateRow.work_end_time) || normalizeTimeString(caseRow.work_end_time),
      time_slot: DEFAULT_TIME_SLOT,

      input_mode: inputMode,
      is_days_mode: isDaysMode,
      flexible_assignment: false,
      assignable_without_case_date: false,
      requested_days: requestedDays,
      case_required_people: caseRequiredPeople,
      case_required_lines: caseRequiredLines,
      case_people_per_line: casePeoplePerLine
    };
  });

  const fulfillment = buildShiftBuilderCaseFulfillment_(
    inputMode,
    cells,
    requestedDays
  );

  return {
    caseId: caseId,
    title: caseTitle,
    shiftcore_display_name: normalizeText(caseRow.shiftcore_display_name) || normalizeText(safeStoreRow.store_short_name),
    client: client,
    area: area,
    status: normalizeText(caseRow.status),
    caseType: normalizeText(caseRow.case_type),
    inputMode: inputMode,
    input_mode: inputMode,
    requestedDays: requestedDays,
    requested_days: requestedDays,
    requiredPeople: caseRequiredPeople,
    required_people: caseRequiredPeople,
    preferredMemberIds: storeMemberRule.preferred_member_ids,
    preferred_member_ids: storeMemberRule.preferred_member_ids,
    ngMemberIds: storeMemberRule.ng_member_ids,
    ng_member_ids: storeMemberRule.ng_member_ids,

    fulfillmentStatus: fulfillment.status,
    fulfillment_status: fulfillment.status,
    fulfillmentBadgeLabel: fulfillment.badge_label,
    fulfillment_badge_label: fulfillment.badge_label,
    fulfillmentLabel: fulfillment.label,
    fulfillment_label: fulfillment.label,
    requiredTotal: fulfillment.required_total,
    required_total: fulfillment.required_total,
    assignedTotal: fulfillment.assigned_total,
    assigned_total: fulfillment.assigned_total,
    remainingTotal: fulfillment.remaining_total,
    remaining_total: fulfillment.remaining_total,
    overTotal: fulfillment.over_total,
    over_total: fulfillment.over_total,
    sameDayOverTotal: fulfillment.same_day_over_total,
    same_day_over_total: fulfillment.same_day_over_total,

    workLocation: normalizeText(caseRow.work_location),
    workAddress: effectiveAddress,
    nearestStation: effectiveNearestStation,
    storeShortName: normalizeText(safeStoreRow.store_short_name),
    workArea: area,
    startTime: normalizeTimeString(caseRow.work_start_time),
    endTime: normalizeTimeString(caseRow.work_end_time),
    requiredSkill: normalizeText(caseRow.required_skill),
    cells: cells
  };
}

function buildShiftBuilderCaseFulfillment_(inputMode, cells, requestedDays) {
  const normalizedInputMode = normalizeText(inputMode);
  const isDaysMode = normalizedInputMode === "days";

  if (isDaysMode) {
    return buildDaysModeCaseFulfillment_(cells, requestedDays);
  }

  return buildDatesModeCaseFulfillment_(cells);
}

function buildDaysModeCaseFulfillment_(cells, requestedDays) {
  const requiredTotal = toNumber_(requestedDays);
  let assignedDateCount = 0;
  let sameDayOverTotal = 0;

  Object.keys(cells || {}).forEach(function(dateKey) {
    const cell = cells[dateKey] || {};
    const assignedCount = Array.isArray(cell.assigned) ? cell.assigned.length : 0;

    if (assignedCount > 0) {
      assignedDateCount++;
    }

    if (assignedCount > 1) {
      sameDayOverTotal += assignedCount - 1;
    }
  });

  const remainingTotal = Math.max(requiredTotal - assignedDateCount, 0);
  const overDaysTotal = Math.max(assignedDateCount - requiredTotal, 0);
  const overTotal = overDaysTotal + sameDayOverTotal;

  let status = "unfilled";
  let badgeLabel = "あと" + remainingTotal + "日";

  if (requiredTotal <= 0) {
    status = "unfilled";
    badgeLabel = "日数未設定";
  } else if (sameDayOverTotal > 0) {
    status = "overfilled";
    badgeLabel = "同日超過" + sameDayOverTotal;
  } else if (overDaysTotal > 0) {
    status = "overfilled";
    badgeLabel = "超過" + overDaysTotal + "日";
  } else if (remainingTotal === 0) {
    status = "fulfilled";
    badgeLabel = "充足";
  }

  return {
    status: status,
    badge_label: badgeLabel,
    label: "日数指定：" + assignedDateCount + "/" + requiredTotal + "日",
    required_total: requiredTotal,
    assigned_total: assignedDateCount,
    remaining_total: remainingTotal,
    over_total: overTotal,
    same_day_over_total: sameDayOverTotal
  };
}

function buildDatesModeCaseFulfillment_(cells) {
  let requiredTotal = 0;
  let assignedTotal = 0;

  Object.keys(cells || {}).forEach(function(dateKey) {
    const cell = cells[dateKey] || {};
    const requiredCount = toNumber_(cell.required);
    const assignedCount = Array.isArray(cell.assigned) ? cell.assigned.length : 0;

    requiredTotal += requiredCount;
    assignedTotal += assignedCount;
  });

  const remainingTotal = Math.max(requiredTotal - assignedTotal, 0);
  const overTotal = Math.max(assignedTotal - requiredTotal, 0);

  let status = "unfilled";
  let badgeLabel = "あと" + remainingTotal + "枠";

  if (requiredTotal <= 0) {
    status = "unfilled";
    badgeLabel = "必要数未設定";
  } else if (overTotal > 0) {
    status = "overfilled";
    badgeLabel = "超過" + overTotal + "枠";
  } else if (remainingTotal === 0) {
    status = "fulfilled";
    badgeLabel = "充足";
  }

  return {
    status: status,
    badge_label: badgeLabel,
    label: "日付指定：" + assignedTotal + "/" + requiredTotal + "枠",
    required_total: requiredTotal,
    assigned_total: assignedTotal,
    remaining_total: remainingTotal,
    over_total: overTotal,
    same_day_over_total: 0
  };
}

function normalizeMonthFromDate_(value) {
  const dateText = normalizeDateString(value);

  if (!dateText || dateText.length < 7) {
    return "";
  }

  return dateText.slice(0, 7);
}

function normalizeMonthValue_(value) {
  if (!value) {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return String(value.getFullYear()) + "-" + String(value.getMonth() + 1).padStart(2, "0");
  }

  const text = normalizeText(value);

  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 7);
  }

  if (/^\d{4}\/\d{1,2}/.test(text)) {
    const parts = text.split("/");
    return String(parts[0]) + "-" + String(parts[1]).padStart(2, "0");
  }

  const parsedDate = new Date(text);

  if (!isNaN(parsedDate.getTime())) {
    return String(parsedDate.getFullYear()) + "-" + String(parsedDate.getMonth() + 1).padStart(2, "0");
  }

  return normalizeMonth(text);
}

function toNumber_(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return 0;
  }

  const number = Number(normalized);

  if (isNaN(number)) {
    return 0;
  }

  return number;
}
// ===== OrderCase → ShiftBuilder 月次データ変換ここまで =====


// ===== ShiftBuilder Repository ここまで =====
