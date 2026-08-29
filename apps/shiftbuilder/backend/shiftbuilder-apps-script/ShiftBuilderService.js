// ===== ShiftBuilder Service ここから =====

// ===== ICSメール送信ここから =====
function getShiftBuilderMailUsersById_() {
  const sheet = getRequiredSheet_(getAccountSpreadsheet_(), USERS_MASTER_SHEET_NAME);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return {};
  const headers = values[0].map(function(value) { return normalizeText(value); });
  const findIndex = function(names) {
    for (let i = 0; i < names.length; i += 1) {
      const index = headers.indexOf(names[i]);
      if (index >= 0) return index;
    }
    return -1;
  };
  const idIndex = findIndex(["internal_user_id", "internalUserId", "user_id", "userId"]);
  const emailIndex = findIndex(["email", "gmail", "mail"]);
  const displayNameIndex = findIndex(["display_name", "displayName", "name", "full_name"]);
  const familyNameIndex = findIndex(["family_name", "familyName"]);
  const givenNameIndex = findIndex(["given_name", "givenName"]);
  if (idIndex < 0 || emailIndex < 0) {
    throw new Error("users_master に internal_user_id または email 列がありません");
  }
  const usersById = {};
  values.slice(1).forEach(function(row) {
    const id = normalizeText(row[idIndex]);
    if (!id) return;
    const separatedName = [
      familyNameIndex >= 0 ? normalizeText(row[familyNameIndex]) : "",
      givenNameIndex >= 0 ? normalizeText(row[givenNameIndex]) : ""
    ].filter(Boolean).join(" ");
    usersById[id] = {
      internalUserId: id,
      email: normalizeText(row[emailIndex]),
      displayName: separatedName || (displayNameIndex >= 0 ? normalizeText(row[displayNameIndex]) : "") || id
    };
  });
  return usersById;
}

function shiftBuilderSendPersonnelIcs(body) {
  const operator = requireShiftBuilderOperator_(body);
  if (!canEditShiftBuilder_(operator)) {
    return ng_("ICSメール送信の権限がありません", "FORBIDDEN");
  }
  const targetMonth = normalizeText(body.targetMonth);
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    return ng_("targetMonth の形式が不正です", "INVALID_TARGET_MONTH");
  }
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];
  if (!recipients.length || recipients.length > 100) {
    return ng_("recipients は1〜100件で指定してください", "INVALID_RECIPIENTS");
  }
  const usersById = getShiftBuilderMailUsersById_();
  const remainingQuota = MailApp.getRemainingDailyQuota();
  const sent = [];
  const skipped = [];
  const seen = {};
  recipients.forEach(function(recipient) {
    const internalUserId = normalizeText(recipient.internalUserId);
    if (!internalUserId || seen[internalUserId]) {
      skipped.push({ internalUserId: internalUserId, reason: "ID未設定または重複" });
      return;
    }
    seen[internalUserId] = true;
    const user = usersById[internalUserId];
    if (!user || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user.email)) {
      skipped.push({ internalUserId: internalUserId, reason: "登録メールアドレスなし" });
      return;
    }
    if (sent.length >= remainingQuota) {
      skipped.push({ internalUserId: internalUserId, reason: "メール日次送信枠不足" });
      return;
    }
    const icsContent = String(recipient.icsContent || "");
    if (icsContent.length > 500000 || icsContent.indexOf("BEGIN:VCALENDAR") !== 0 || icsContent.indexOf("END:VCALENDAR") < 0) {
      skipped.push({ internalUserId: internalUserId, reason: "ICS形式不正" });
      return;
    }
    const safeFilename = normalizeText(recipient.filename || "AnotherPortal_" + targetMonth + ".ics")
      .replace(/[\\/:*?"<>|]/g, "_");
    const subject = "【Another Portal】" + targetMonth + " シフトのお知らせ";
    const message = user.displayName + " 様\n\n" + targetMonth + "のシフトをお送りします。\n添付のICSファイルをGoogleカレンダー等へ取り込んでください。\n\nAnother Portal";
    try {
      MailApp.sendEmail({
        to: user.email,
        subject: subject,
        body: message,
        name: "Another Portal",
        attachments: [Utilities.newBlob(icsContent, "text/calendar", safeFilename)]
      });
      sent.push({ internalUserId: internalUserId, email: user.email });
    } catch (error) {
      skipped.push({ internalUserId: internalUserId, reason: "送信エラー: " + String(error && error.message || error) });
    }
  });
  console.log("[ShiftBuilder] ICS mail operator=" + normalizeText(operator.email) + " month=" + targetMonth + " sent=" + sent.length + " skipped=" + skipped.length);
  return ok_({
    targetMonth: targetMonth,
    sentCount: sent.length,
    skippedCount: skipped.length,
    sent: sent,
    skipped: skipped,
    remainingDailyQuota: Math.max(0, remainingQuota - sent.length)
  });
}
// ===== ICSメール送信ここまで =====



// ===== 疎通確認ここから =====
function shiftBuilderPing(body) {
  return ok_({
    message: "pong",
    service: "ShiftBuilder_API",
    timestamp: getNowIsoStringJst()
  });
}
// ===== 疎通確認ここまで =====


// ===== 現在ユーザー取得ここから =====
function shiftBuilderGetCurrentUser(body) {
  const operator = requireShiftBuilderOperator_(body);

  return ok_({
    user: buildShiftBuilderUser_(operator),
    canUseShiftBuilder: true,
    canEditShiftBuilder: canEditShiftBuilder_(operator)
  });
}
// ===== 現在ユーザー取得ここまで =====


// ===== 月次シフトデータ取得ここから =====
function shiftBuilderGetMonthData(body) {
  const operator = requireShiftBuilderOperator_(body);

  const targetMonth = normalizeText(body.targetMonth);
  const area = normalizeText(body.area) || "all";

  if (!targetMonth) {
    return ng_("targetMonth が必要です", "MISSING_TARGET_MONTH");
  }

  const data = buildShiftBuilderMonthData_(targetMonth, area);

  return ok_({
    user: buildShiftBuilderUser_(operator),
    canUseShiftBuilder: true,
    canEditShiftBuilder: canEditShiftBuilder_(operator),
    data: data
  });
}

function buildEmptyShiftBuilderMonthData_(targetMonth, area) {
  return {
    month: targetMonth,
    area: area || "all",
    dates: buildMonthDateItems_(targetMonth),
    cases: []
  };
}

function buildMonthDateItems_(targetMonth) {
  const parts = normalizeText(targetMonth).split("-");

  if (parts.length !== 2) {
    throw new Error("targetMonth は YYYY-MM 形式で指定してください");
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);

  if (!year || !month || month < 1 || month > 12) {
    throw new Error("targetMonth が不正です: " + targetMonth);
  }

  const lastDate = new Date(year, month, 0).getDate();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const dates = [];

  for (let day = 1; day <= lastDate; day++) {
    const date = new Date(year, month - 1, day);

    const dateText =
      String(year) +
      "-" +
      String(month).padStart(2, "0") +
      "-" +
      String(day).padStart(2, "0");

    dates.push({
      date: dateText,
      label: String(month) + "/" + String(day),
      weekday: weekdays[date.getDay()]
    });
  }

  return dates;
}
// ===== 月次シフトデータ取得ここまで =====


// ===== アサイン作成ここから =====
function shiftBuilderCreateAssignment(body) {
  const operator = requireShiftBuilderEditorOperator_(body);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const params = buildCreateAssignmentParams_(body, operator);
    const assignment = createShiftBuilderAssignment_(params, operator);

    return ok_({
      assignment: assignment,
      message: "アサインを作成しました"
    });
  } finally {
    lock.releaseLock();
  }
}

function buildCreateAssignmentParams_(body, operator) {
  const targetMonth = normalizeMonth(body.targetMonth);
  const area = normalizeText(body.area);
  const caseId = normalizeText(body.caseId || body.case_id);
  const caseDateId = normalizeText(body.caseDateId || body.case_date_id);
  const workDate = normalizeDateString(body.workDate || body.work_date);
  const internalUserId = normalizeText(body.internalUserId || body.internal_user_id);

  if (!targetMonth) {
    throw new Error("targetMonth が必要です");
  }

  if (!area) {
    throw new Error("area が必要です");
  }

  if (!caseId) {
    throw new Error("case_id が必要です");
  }

  if (!workDate) {
    throw new Error("work_date が必要です");
  }

  if (!internalUserId) {
    throw new Error("internal_user_id が必要です");
  }

  const targetUser = findUserByInternalUserId_(internalUserId);

  if (!targetUser) {
    throw new Error("アサイン対象ユーザーが見つかりません: " + internalUserId);
  }

  // developer は配置対象の人員ではない。候補一覧と配置済み表示から除外するだけでは
  // internal_user_id を直接指定したリクエストで配置できてしまうため、書込み側でも拒否する。
  // 作成と入替の両方がこの関数を通るので、ここが唯一の防御点になる。
  if (normalizeLowerText(targetUser.role) === "developer") {
    throw new Error("開発者アカウントはシフトへ配置できません: " + internalUserId);
  }

  return {
    target_month: targetMonth,
    area: area,
    case_id: caseId,
    case_date_id: caseDateId,
    work_date: workDate,
    internal_user_id: internalUserId,
    account_code: normalizeText(targetUser.employee_code || targetUser.account_code),
    display_name: normalizeText(targetUser.display_name || targetUser.name || targetUser.email),
    person_type: normalizeText(targetUser.person_type),
    contract_type: normalizeText(targetUser.contract_type),
    start_time: normalizeText(body.startTime || body.start_time),
    end_time: normalizeText(body.endTime || body.end_time),
    time_slot: normalizeText(body.timeSlot || body.time_slot || DEFAULT_TIME_SLOT),
    assignment_note: normalizeText(body.assignmentNote || body.assignment_note),
    requested_off_confirmed:
      body.requestedOffConfirmed === true || body.requested_off_confirmed === true,
    created_by: normalizeText(operator.email),
    updated_by: normalizeText(operator.email)
  };
}

function createShiftBuilderAssignment_(params, operator) {
  validateShiftBuilderAssignableOrderCase_(params.case_id);
  const requestedOff = validateRequestedOffAssignment_(
    params.internal_user_id,
    params.target_month,
    params.work_date,
    params.requested_off_confirmed
  );
  if (requestedOff) {
    params.assignment_note = [params.assignment_note, "希望休・本人相談了承済み"]
      .filter(Boolean)
      .join(" / ");
  }
  validateNoDuplicateShiftAssignment_(params);
  validateNoSameDayShiftAssignment_(params);

  const shiftMonth = getOrCreateShiftMonth_(
    params.target_month,
    params.area,
    operator
  );

  const assignment = appendShiftAssignment_({
    shift_month_id: normalizeText(shiftMonth.shift_month_id),
    target_month: params.target_month,
    area: params.area,
    case_id: params.case_id,
    case_date_id: params.case_date_id,
    work_date: params.work_date,
    internal_user_id: params.internal_user_id,
    account_code: params.account_code,
    display_name: params.display_name,
    person_type: params.person_type,
    contract_type: params.contract_type,
    assignment_status: ASSIGNMENT_STATUS.DRAFT,
    replacement_status: REPLACEMENT_STATUS.NONE,
    start_time: params.start_time,
    end_time: params.end_time,
    time_slot: params.time_slot,
    assignment_note: params.assignment_note,
    created_by: params.created_by,
    updated_by: params.updated_by
  });

  SpreadsheetApp.flush();

  try {
    // 別projectのOrderCase取消と競合しても、作成後検査で孤児化を防ぐ。
    validateShiftBuilderAssignableOrderCase_(params.case_id);
  } catch (error) {
    try {
      archiveShiftAssignment_(assignment.assignment_id, operator, {
        reason_type: "case_cancelled_during_assignment",
        change_memo: "案件状態の作成後検査により自動解除"
      });
    } catch (rollbackError) {
      console.error(
        "[ShiftBuilder] cancelled case assignment rollback error:",
        rollbackError
      );

      throw new Error(
        (error && error.message ? error.message : String(error)) +
        " / 作成済みアサインの自動解除にも失敗しました"
      );
    }

    throw error;
  }

  return assignment;
}

function getActiveShiftAssignments_() {
  const assignments = getShiftAssignmentRows_()
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

function validateNoDuplicateShiftAssignment_(params) {
  const caseId = normalizeText(params.case_id);
  const caseDateId = normalizeText(params.case_date_id);
  const workDate = normalizeDateString(params.work_date);
  const internalUserId = normalizeText(params.internal_user_id);

  const duplicatedAssignments = getActiveShiftAssignments_()
    .filter(function(assignment) {
      return normalizeText(assignment.case_id) === caseId;
    })
    .filter(function(assignment) {
      return normalizeDateString(assignment.work_date) === workDate;
    })
    .filter(function(assignment) {
      return normalizeText(assignment.internal_user_id) === internalUserId;
    })
    .filter(function(assignment) {
      const existingCaseDateId = normalizeText(assignment.case_date_id);

      // case_date_id が両方ある場合は完全一致。
      // 片方でも空なら、case_id + work_date + user 一致で重複扱い。
      if (caseDateId && existingCaseDateId) {
        return existingCaseDateId === caseDateId;
      }

      return true;
    });

  if (duplicatedAssignments.length > 0) {
    throw new Error(
      "このユーザーはすでに同じ案件・同じ日付にアサイン済みです: " +
      internalUserId +
      " / " +
      caseId +
      " / " +
      workDate
    );
  }
}

function validateNoSameDayShiftAssignment_(params) {
  const caseId = normalizeText(params.case_id);
  const workDate = normalizeDateString(params.work_date);
  const internalUserId = normalizeText(params.internal_user_id);

  const sameDayAssignments = getActiveShiftAssignments_()
    .filter(function(assignment) {
      return normalizeDateString(assignment.work_date) === workDate;
    })
    .filter(function(assignment) {
      return normalizeText(assignment.internal_user_id) === internalUserId;
    })
    .filter(function(assignment) {
      return normalizeText(assignment.case_id) !== caseId;
    });

  if (sameDayAssignments.length > 0) {
    const existing = sameDayAssignments[0];

    throw new Error(
      "このユーザーは同日に別案件へアサイン済みです: " +
      internalUserId +
      " / existing_case_id=" +
      normalizeText(existing.case_id) +
      " / work_date=" +
      workDate
    );
  }
}

function validateShiftBuilderAssignableOrderCase_(caseId) {
  const normalizedCaseId = normalizeText(caseId);

  if (!normalizedCaseId) {
    throw new Error("case_id が必要です");
  }

  const targetCase = getOrderCaseRows_().find(function(caseRow) {
    return normalizeText(caseRow.case_id) === normalizedCaseId;
  });

  if (!targetCase) {
    throw new Error("対象案件が見つかりません: " + normalizedCaseId);
  }

  if (!isOrderCaseVisibleInShiftBuilder_(targetCase)) {
    throw new Error(
      "キャンセルまたはアーカイブ済みの案件にはアサインできません: " +
      normalizedCaseId
    );
  }
}
// ===== アサイン作成ここまで =====

// ===== アサイン解除ここから =====
function shiftBuilderArchiveAssignment(body) {
  const operator = requireShiftBuilderEditorOperator_(body);
  const assignmentId = normalizeText(body.assignmentId || body.assignment_id);

  if (!assignmentId) {
    throw new Error("assignment_id が必要です");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    archiveShiftAssignment_(assignmentId, operator);

    return ok_({
      assignment_id: assignmentId,
      message: "アサインを解除しました"
    });
  } finally {
    lock.releaseLock();
  }
}
// ===== アサイン解除ここまで =====

// ===== アサイン入れ替えここから =====
function shiftBuilderReplaceAssignment(body) {
  const operator = requireShiftBuilderEditorOperator_(body);
  const lock = LockService.getScriptLock();

  lock.waitLock(10000);

  try {
    const replaceAssignmentId = normalizeText(
      body.replaceAssignmentId ||
      body.replace_assignment_id ||
      body.assignmentId ||
      body.assignment_id
    );

    if (!replaceAssignmentId) {
      throw new Error("replace_assignment_id が必要です");
    }

    const existingAssignment = findActiveShiftAssignmentById_(replaceAssignmentId);

    if (!existingAssignment) {
      throw new Error("入れ替え元のアサインが見つかりません: " + replaceAssignmentId);
    }

    const params = buildCreateAssignmentParams_(body, operator);

    validateReplaceAssignmentTarget_(existingAssignment, params);

    let newAssignment = null;

    try {
      newAssignment = createShiftBuilderAssignment_(params, operator);

      archiveShiftAssignment_(replaceAssignmentId, operator);

      // 新規作成後から旧アサイン解除までの間に案件が無効化されていないか再確認する。
      validateShiftBuilderAssignableOrderCase_(params.case_id);

      return ok_({
        assignment: newAssignment,
        replaced_assignment_id: replaceAssignmentId,
        message: "アサインを入れ替えました"
      });
    } catch (error) {
      if (newAssignment && newAssignment.assignment_id) {
        try {
          archiveShiftAssignment_(newAssignment.assignment_id, operator);
        } catch (rollbackError) {
          console.error("[ShiftBuilder] replace rollback error:", rollbackError);
        }
      }

      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

function findActiveShiftAssignmentById_(assignmentId) {
  const targetAssignmentId = normalizeText(assignmentId);

  if (!targetAssignmentId) {
    return null;
  }

  const assignments = getActiveShiftAssignments_();

  for (let i = 0; i < assignments.length; i++) {
    if (normalizeText(assignments[i].assignment_id) === targetAssignmentId) {
      return assignments[i];
    }
  }

  return null;
}

function validateReplaceAssignmentTarget_(existingAssignment, params) {
  const existingCaseId = normalizeText(existingAssignment.case_id);
  const existingCaseDateId = normalizeText(existingAssignment.case_date_id);
  const existingWorkDate = normalizeDateString(existingAssignment.work_date);
  const existingUserId = normalizeText(existingAssignment.internal_user_id);

  const nextCaseId = normalizeText(params.case_id);
  const nextCaseDateId = normalizeText(params.case_date_id);
  const nextWorkDate = normalizeDateString(params.work_date);
  const nextUserId = normalizeText(params.internal_user_id);

  if (existingCaseId !== nextCaseId) {
    throw new Error(
      "入れ替え元と入れ替え先の案件が一致しません: " +
      existingCaseId +
      " / " +
      nextCaseId
    );
  }

  if (existingWorkDate !== nextWorkDate) {
    throw new Error(
      "入れ替え元と入れ替え先の日付が一致しません: " +
      existingWorkDate +
      " / " +
      nextWorkDate
    );
  }

  if (existingCaseDateId && nextCaseDateId && existingCaseDateId !== nextCaseDateId) {
    throw new Error(
      "入れ替え元と入れ替え先の case_date_id が一致しません: " +
      existingCaseDateId +
      " / " +
      nextCaseDateId
    );
  }

  if (existingUserId === nextUserId) {
    throw new Error("同じユーザーには入れ替えできません: " + nextUserId);
  }
}
// ===== アサイン入れ替えここまで =====

// ===== アサイン候補者取得ここから =====
function shiftBuilderGetAssignmentCandidates(body) {
  const operator = requireShiftBuilderOperator_(body);

  const targetMonth = normalizeMonth(body.targetMonth);
  const area = normalizeText(body.area) || "all";

  if (!targetMonth) {
    throw new Error("targetMonth が必要です");
  }

  const candidates = buildShiftBuilderAssignmentCandidates_(targetMonth, area);

  return ok_({
    user: buildShiftBuilderUser_(operator),
    target_month: targetMonth,
    area: area,
    candidates: candidates
  });
}

function buildShiftBuilderAssignmentCandidates_(targetMonth, area) {
  const normalizedTargetMonth = normalizeMonth(targetMonth);
  const normalizedArea = normalizeText(area) || "all";

  const pmoRequestsByUserId = getLatestPmoRequestsByUserForMonth_(normalizedTargetMonth);

  return getUsersMasterRows_()
    .filter(function(user) {
      return normalizeLowerText(user.status) === "active";
    })
    .filter(function(user) {
      return normalizeLowerText(user.role) !== "developer";
    })
    .filter(function(user) {
      return includesCsvValue(user.allowed_modules, SHIFTBUILDER_MODULE_KEY);
    })
    .filter(function(user) {
      const engagementStatus = normalizeLowerText(user.engagement_status);

      return !engagementStatus || engagementStatus === "active";
    })
    .map(function(user) {
      const displayName =
        normalizeText(user.display_name) ||
        normalizeText(user.name) ||
        normalizeText(user.email) ||
        normalizeText(user.internal_user_id) ||
        "氏名未設定";

      return {
        internal_user_id: normalizeText(user.internal_user_id),
        account_code: normalizeText(user.employee_code || user.account_code),
        employee_code: normalizeText(user.employee_code),
        family_name: normalizeText(user.family_name),
        familyName: normalizeText(user.family_name),
        given_name: normalizeText(user.given_name),
        givenName: normalizeText(user.given_name),
        display_name: displayName,
        displayName: displayName,
        name: displayName,
        email: normalizeLowerText(user.email),
        role: normalizeText(user.role),
        organization_id: normalizeText(user.organization_id),
        department: normalizeText(user.department),
        position: normalizeText(user.position),
        base_area: normalizeText(user.base_area),
        person_type: normalizeText(user.person_type),
        contract_type: normalizeText(user.contract_type),
        engagement_status: normalizeText(user.engagement_status),
        shiftbuilder_permission: normalizeText(user.shiftbuilder_permission),
        requested_off_dates: (pmoRequestsByUserId[normalizeText(user.internal_user_id)] || {}).requested_off_dates || [],
        requested_off_memo: (pmoRequestsByUserId[normalizeText(user.internal_user_id)] || {}).requested_off_memo || "",
        target_month: normalizedTargetMonth,
        area: normalizedArea
      };
    })
    .filter(function(candidate) {
      return candidate.internal_user_id;
    })
    .sort(function(a, b) {
      const aKey = a.display_name || a.internal_user_id;
      const bKey = b.display_name || b.internal_user_id;

      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      return 0;
    });
}
// ===== アサイン候補者取得ここまで =====

// ===== ShiftBuilder 操作者確認ここから =====
function requireShiftBuilderOperator_(body) {
  const idToken = normalizeText(body.idToken);

  if (!idToken) {
    throw new Error("idToken が必要です");
  }

  const resolved = resolveCurrentUserByIdToken(idToken);

  if (!resolved || resolved.ok !== true || !resolved.user) {
    throw new Error("ログインユーザーを確認できません");
  }

  const user = resolved.user;

  requireShiftBuilderUser_(user);

  return user;
}

function requireShiftBuilderEditorOperator_(body) {
  const operator = requireShiftBuilderOperator_(body);

  requireShiftBuilderEditor_(operator);

  return operator;
}
// ===== ShiftBuilder 操作者確認ここまで =====

// ===== ShiftBuilder用ユーザー整形ここから =====
function buildShiftBuilderUser_(user) {
  return {
    internal_user_id: normalizeText(user.internal_user_id),
    employee_code: normalizeText(user.employee_code),
    account_code: normalizeText(user.employee_code),
    email: normalizeLowerText(user.email),
    family_name: normalizeText(user.family_name),
    given_name: normalizeText(user.given_name),
    name: normalizeText(user.name),
    display_name: normalizeText(user.display_name || user.name),
    role: normalizeText(user.role),
    organization_id: normalizeText(user.organization_id),
    department: normalizeText(user.department),
    position: normalizeText(user.position),
    base_area: normalizeText(user.base_area),
    status: normalizeText(user.status),
    allowed_modules: normalizeText(user.allowed_modules),
    shiftbuilder_permission: normalizeText(user.shiftbuilder_permission),
    person_type: normalizeText(user.person_type),
    contract_type: normalizeText(user.contract_type),
    engagement_status: normalizeText(user.engagement_status),
    can_edit_shiftbuilder: canEditShiftBuilder_(user)
  };
}
// ===== ShiftBuilder用ユーザー整形ここまで =====


// ===== ShiftBuilder Service ここまで =====
