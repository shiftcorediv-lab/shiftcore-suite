// ===== ShiftBuilder Tests ここから =====


// ===== 基本疎通テストここから =====
function testShiftBuilderPing() {
  const result = shiftBuilderPing({});

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}
// ===== 基本疎通テストここまで =====


// ===== 日付生成テストここから =====
function testBuildMonthDateItems() {
  const result = buildMonthDateItems_("2026-07");

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

function testBuildEmptyShiftBuilderMonthData() {
  const result = buildEmptyShiftBuilderMonthData_("2026-07", "all");

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}
// ===== 日付生成テストここまで =====


// ===== OrderCase連携テストここから =====
function testBuildShiftBuilderMonthDataFromOrderCase() {
  const result = buildShiftBuilderMonthData_("2026-07", "all");

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

function testBuildShiftBuilderMonthDataAssignmentSummary() {
  const result = buildShiftBuilderMonthData_("2026-07", "all");

  let requiredTotal = 0;
  let assignedTotal = 0;
  const assignedCells = [];

  result.cases.forEach(function(caseItem) {
    Object.keys(caseItem.cells).forEach(function(date) {
      const cell = caseItem.cells[date];
      const required = toNumber_(cell.required);
      const assignedCount = Array.isArray(cell.assigned) ? cell.assigned.length : 0;

      requiredTotal += required;
      assignedTotal += assignedCount;

      if (assignedCount > 0) {
        assignedCells.push({
          caseId: caseItem.caseId,
          title: caseItem.title,
          date: date,
          required: required,
          assignedCount: assignedCount,
          assigned: cell.assigned
        });
      }
    });
  });

  const summary = {
    month: result.month,
    area: result.area,
    cases: result.cases.length,
    requiredTotal: requiredTotal,
    assignedTotal: assignedTotal,
    assignedCells: assignedCells
  };

  Logger.log(JSON.stringify(summary, null, 2));

  return summary;
}

function testDebugOrderCaseRowsForShiftBuilder() {
  const targetMonth = "2026-07";

  const cases = getOrderCaseRows_();
  const caseDates = getOrderCaseDateRows_();

  const caseSummary = cases.map(function(row) {
    return {
      case_id: normalizeText(row.case_id),
      target_month: normalizeText(row.target_month),
      status: normalizeText(row.status),
      archived: normalizeText(row.archived),
      for_shift_builder: normalizeText(row.for_shift_builder),
      agency_name: normalizeText(row.agency_name),
      store_name: normalizeText(row.store_name),
      work_area: normalizeText(row.work_area),
      store_area: normalizeText(row.store_area),
      required_people: normalizeText(row.required_people)
    };
  });

  const matchedByTargetMonth = caseSummary.filter(function(row) {
    return normalizeMonthValue_(row.target_month) === targetMonth;
  });

  const matchedNotArchived = matchedByTargetMonth.filter(function(row) {
    return normalizeLowerText(row.archived) !== "true";
  });

  const matchedNotStatusArchived = matchedNotArchived.filter(function(row) {
    return normalizeText(row.status) !== "archived";
  });

  const matchedForShiftBuilder = matchedNotStatusArchived.filter(function(row) {
    const value = normalizeLowerText(row.for_shift_builder);

    return value !== "false" &&
      value !== "no" &&
      value !== "0";
  });

  const dateSummary = caseDates.map(function(row) {
    return {
      case_date_id: normalizeText(row.case_date_id),
      case_id: normalizeText(row.case_id),
      work_date: normalizeDateString(row.work_date),
      work_month: normalizeMonthFromDate_(row.work_date),
      required_people: normalizeText(row.required_people)
    };
  });

  const matchedCaseDates = dateSummary.filter(function(row) {
    return row.work_month === targetMonth;
  });

  const result = {
    targetMonth: targetMonth,
    totalCases: cases.length,
    totalCaseDates: caseDates.length,
    matchedByTargetMonth: matchedByTargetMonth.length,
    matchedNotArchived: matchedNotArchived.length,
    matchedNotStatusArchived: matchedNotStatusArchived.length,
    matchedForShiftBuilder: matchedForShiftBuilder.length,
    matchedCaseDates: matchedCaseDates.length,
    sampleCases: caseSummary.slice(0, 10),
    sampleMatchedCases: matchedForShiftBuilder.slice(0, 10),
    sampleCaseDates: dateSummary.slice(0, 10),
    sampleMatchedCaseDates: matchedCaseDates.slice(0, 10)
  };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}
// ===== OrderCase連携テストここまで =====


// ===== アサイン作成テストここから =====
function testCreateShiftBuilderAssignmentManual() {
  const operator = {
    email: "shiftcore.div@gmail.com"
  };

  const params = {
    target_month: "2026-07",
    area: "関西",
    case_id: "CASE-202607-0002",
    case_date_id: "CD-202607-000001",
    work_date: "2026-07-04",
    internal_user_id: "U0024",
    account_code: "AN9999",
    display_name: "細見(memberテスト用)",
    person_type: "internal",
    contract_type: "outsourced",
    start_time: "",
    end_time: "",
    time_slot: DEFAULT_TIME_SLOT,
    assignment_note: "GAS手動テストで作成",
    created_by: "shiftcore.div@gmail.com",
    updated_by: "shiftcore.div@gmail.com"
  };

  const assignment = createShiftBuilderAssignment_(params, operator);

  Logger.log(JSON.stringify(assignment, null, 2));

  return assignment;
}
// ===== アサイン作成テストここまで =====

function testCreateShiftBuilderAssignmentDuplicateBlocked() {
  const operator = {
    email: "shiftcore.div@gmail.com"
  };

  const params = {
    target_month: "2026-07",
    area: "関西",
    case_id: "CASE-202607-0002",
    case_date_id: "CD-202607-000001",
    work_date: "2026-07-04",
    internal_user_id: "U0024",
    account_code: "AN9999",
    display_name: "細見(memberテスト用)",
    person_type: "internal",
    contract_type: "outsourced",
    start_time: "",
    end_time: "",
    time_slot: DEFAULT_TIME_SLOT,
    assignment_note: "重複チェックテスト",
    created_by: "shiftcore.div@gmail.com",
    updated_by: "shiftcore.div@gmail.com"
  };

  try {
    const assignment = createShiftBuilderAssignment_(params, operator);

    Logger.log("ERROR: 重複チェックを通過してしまいました");
    Logger.log(JSON.stringify(assignment, null, 2));

    return {
      success: false,
      message: "重複チェックを通過してしまいました",
      assignment: assignment
    };
  } catch (error) {
    Logger.log("OK: 重複アサインをブロックしました");
    Logger.log(error.message);

    return {
      success: true,
      message: error.message
    };
  }
}

function testArchiveDuplicatedAssignmentCreatedByFailedDuplicateTest() {
  const operator = {
    email: "shiftcore.div@gmail.com"
  };

  const result = archiveShiftAssignment_(
    "SA-20260621184341-722571",
    operator
  );

  Logger.log(JSON.stringify({
    success: result,
    archived_assignment_id: "SA-20260621184341-722571"
  }, null, 2));

  return result;
}

function testArchiveShiftBuilderAssignmentManualByRepository() {
  const operator = {
    email: "shiftcore.div@gmail.com"
  };

  const result = archiveShiftAssignment_(
    "SA-ここに解除したいassignment_id",
    operator
  );

  Logger.log(JSON.stringify({
    success: result
  }, null, 2));

  return result;
}
function testGetShiftBuilderAssignmentCandidates() {
  const operator = {
    email: "shiftcore.div@gmail.com"
  };

  const result = buildShiftBuilderAssignmentCandidates_("2026-07", "all");

  const summary = {
    count: result.length,
    sample: result.slice(0, 10)
  };

  Logger.log(JSON.stringify(summary, null, 2));

  return summary;
}
// ===== ShiftBuilder Tests ここまで =====

function testFilterShiftAssignmentsByAssignableOrderCases() {
  const assignments = [
    { assignment_id: "A1", case_id: "CASE-A", case_date_id: "D1", work_date: "2026-08-01" },
    { assignment_id: "A2", case_id: "CASE-B", case_date_id: "D2", work_date: "2026-08-01" },
    { assignment_id: "A3", case_id: "CASE-C", case_date_id: "", work_date: "2026-08-02" },
    { assignment_id: "A4", case_id: "CASE-MISSING", case_date_id: "", work_date: "2026-08-02" },
    { assignment_id: "A5", case_id: "CASE-A", case_date_id: "D1", work_date: "2026-08-03" }
  ];
  const orderCases = [
    { case_id: "CASE-A", status: "confirmed", input_mode: "dates", for_shift_builder: true, archived: false },
    { case_id: "CASE-B", status: "cancelled", input_mode: "dates", for_shift_builder: true, archived: false },
    { case_id: "CASE-C", status: "confirmed", input_mode: "days", for_shift_builder: true, archived: false }
  ];
  const orderCaseDates = [
    { case_id: "CASE-A", case_date_id: "D1", work_date: "2026-08-01" },
    { case_id: "CASE-B", case_date_id: "D2", work_date: "2026-08-01" }
  ];
  const actual = filterShiftAssignmentsByAssignableOrderCases_(
    assignments,
    orderCases,
    orderCaseDates
  ).map(function(assignment) {
    return assignment.assignment_id;
  });
  const expected = ["A1", "A3"];

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      "参照整合性ガードが不正です: " + JSON.stringify(actual)
    );
  }

  console.log(JSON.stringify(actual));
}


function auditShiftAssignmentEligibilityDryRun() {
  const activeAssignments = getShiftAssignmentRows_()
    .filter(function(assignment) {
      return normalizeLowerText(assignment.archived) !== "true";
    })
    .filter(function(assignment) {
      const status = normalizeText(assignment.assignment_status);

      return status !== ASSIGNMENT_STATUS.ARCHIVED &&
        status !== ASSIGNMENT_STATUS.CANCELLED;
    });
  const eligibleAssignments = filterShiftAssignmentsByAssignableOrderCases_(
    activeAssignments
  );
  const eligibleIds = {};

  eligibleAssignments.forEach(function(assignment) {
    eligibleIds[normalizeText(assignment.assignment_id)] = true;
  });

  const excludedAssignmentIds = activeAssignments
    .map(function(assignment) {
      return normalizeText(assignment.assignment_id);
    })
    .filter(function(assignmentId) {
      return assignmentId && !eligibleIds[assignmentId];
    });
  const result = {
    active_assignment_count: activeAssignments.length,
    eligible_assignment_count: eligibleAssignments.length,
    excluded_assignment_count: excludedAssignmentIds.length,
    excluded_assignment_ids: excludedAssignmentIds
  };

  console.log(JSON.stringify(result));
  return result;
}
