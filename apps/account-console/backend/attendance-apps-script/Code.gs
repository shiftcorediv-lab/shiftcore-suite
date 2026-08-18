const LOGIN_PROXY_URL = "https://shiftcore-login-proxy.shiftcore-div.workers.dev/";
const ACCOUNT_APPROVAL_API_URL = "https://script.google.com/macros/s/AKfycbx83rAzXDfQPJUEu9tX4dpULH4QHYUoqfaTnfzzySkW3KjGVbcH4tnq9PKCCvfuEx6eRA/exec";
const SHIFTBUILDER_API_URL = "https://script.google.com/macros/s/AKfycbxlWX3iPy6b1LDjKDc91G7jvBHeee4b5kr7o2wBYy859Uv_R-XI9tLzB2Xu6fz4_-5X/exec";
const TZ = "Asia/Tokyo";

const SHEETS = {
  records: "勤怠記録",
  requests: "修正・予定外申請",
  notifications: "通知",
  settings: "設定",
  schedules: "稼働予定",
  reports: "実績報告"
};

const HEADERS = {
  reports: ["report_id", "record_id", "開発予定ID", "開発予定名", "報告者メール", "報告者氏名", "実績内容", "課題・申し送り", "報告日時"],
  requests: ["request_id", "record_id", "種別", "申請者メール", "申請者氏名", "実勤務日", "申請開始", "申請終了", "理由区分", "理由詳細", "状態", "承認者メール", "承認者氏名", "承認理由", "申請日時", "処理日時"],
  requestContract: ["applicant_internal_user_id", "request_version", "approval_reviewer_internal_user_id", "applicant_organization_version"]
};

function doGet(e) {
  return jsonOutput_({ ok: true, service: "shiftcore-attendance", now: nowIso_() });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const user = resolveUser_(body.idToken);
    const action = String(body.action || "");
    const payload = body.payload || {};

    if (action === "getDashboardData") return jsonOutput_(getDashboardData_(user));
    if (action === "refreshDashboardData") return jsonOutput_(getDashboardData_(user, getSchedules_(body.idToken)));
    if (action === "clockIn") return jsonOutput_(clockIn_(user, payload, body.idToken));
    if (action === "clockOut") return jsonOutput_(clockOut_(user, payload, body.idToken));
    if (action === "submitCorrection") return jsonOutput_(submitCorrection_(user, payload, body.idToken));
    if (action === "submitReport") return jsonOutput_(submitReport_(user, payload));
    if (action === "markNotificationRead") return jsonOutput_(markNotificationRead_(user, payload));
    if (action === "getAdminDashboard") return jsonOutput_(getAdminDashboard_(user, body.idToken));
    if (action === "reviewRequest") return jsonOutput_(reviewRequest_(user, payload, body.idToken));
    if (action === "updateEndWarningTime") return jsonOutput_(updateEndWarningTime_(user, payload));
    throw apiError_("UNKNOWN_ACTION", "未対応の操作です。");
  } catch (error) {
    return jsonOutput_({ ok: false, code: error.code || "SERVER_ERROR", message: error.message || String(error) });
  }
}

function resolveUser_(idToken) {
  if (!idToken) throw apiError_("AUTH_REQUIRED", "ログイン情報がありません。");
  const response = UrlFetchApp.fetch(LOGIN_PROXY_URL, {
    method: "post",
    contentType: "text/plain;charset=utf-8",
    payload: JSON.stringify({ action: "resolveCurrentUserByIdToken", idToken: idToken }),
    muteHttpExceptions: true
  });
  const data = JSON.parse(response.getContentText() || "{}");
  if (!data.ok || !data.user || !data.user.email) throw apiError_("AUTH_INVALID", "ログイン情報を確認できませんでした。");
  return data.user;
}

function getDashboardData_(user, sourceSchedules) {
  ensureReportSheet_();
  const today = today_();
  const schedules = (sourceSchedules || rows_(SHEETS.schedules)).filter(r => matchesUser_(r, user));
  const todaySchedules = schedules.filter(r => dateKey_(r["勤務日"]) === today);
  const upcoming = schedules.filter(r => dateKey_(r["勤務日"]) >= today).sort((a, b) => dateKey_(a["勤務日"]).localeCompare(dateKey_(b["勤務日"]))).slice(0, 5);
  const records = rows_(SHEETS.records).filter(r => normalizeEmail_(r.email) === normalizeEmail_(user.email) && dateKey_(r["勤務日"]) === today);
  const notifications = rows_(SHEETS.notifications).filter(r => normalizeEmail_(r["宛先メール"]) === normalizeEmail_(user.email)).sort((a, b) => String(b["作成日時"]).localeCompare(String(a["作成日時"]))).slice(0, 20);
  const settings = settings_();
  return {
    ok: true,
    serverNow: nowIso_(),
    today,
    settings,
    user: publicUser_(user),
    schedule: todaySchedules[0] || null,
    schedules: todaySchedules,
    upcoming,
    record: records[0] || null,
    notifications,
    adminAccess: isAdmin_(user) || hasApprovalReviewAccess_(user),
    preciseLocationAccess: canViewPreciseLocation_(user)
  };
}

function clockIn_(user, payload, idToken) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const settings = settings_();
    const now = new Date();
    const today = today_();
    const existing = findRecord_(user.email, today);
    if (existing && existing["実開始"]) return { ok: true, duplicate: true, record: existing };
    const current = timeKey_(now);
    if (current >= settings.start_limit_time) throw apiError_("CORRECTION_REQUIRED", "10:00以降の開始は修正申請が必要です。");
    if (current >= settings.start_warning_time && !String(payload.reason || "").trim()) throw apiError_("REASON_REQUIRED", "9:30以降は未押下理由を入力してください。");

    const schedule = findSchedule_(user, today, payload.scheduleId, idToken);
    if (!schedule && !payload.unplanned) throw apiError_("UNPLANNED_REQUIRED", "本日の予定がないため、予定外稼働として理由を入力してください。");
    if (!schedule && !String(payload.reason || "").trim()) throw apiError_("REASON_REQUIRED", "予定外稼働の理由を入力してください。");

    const recordId = Utilities.getUuid();
    const location = saveLocation_(user, recordId, payload.location || {}, schedule && schedule["稼働場所"]);
    const row = [
      recordId, user.organization_id || "", user.employee_code || "", user.email, user.name || "", today,
      schedule && schedule["予定開始"] || "", schedule && schedule["予定終了"] || "", schedule && schedule["稼働場所"] || payload.workLocation || "",
      schedule && schedule["開発予定ID"] || payload.planId || "", user.employment_type || user.contract_type || "", current >= settings.start_warning_time ? "開始遅延" : "稼働中",
      now, now, payload.reason || "", "", "", !schedule, location.status, location.id || "", "", "", now, now
    ];
    append_(SHEETS.records, row);
    notifyManagers_(user, current >= settings.start_warning_time ? "開始遅延" : (!schedule ? "予定外稼働" : "稼働開始"), `${user.name || user.email}さんが${formatJst_(now)}に稼働を開始しました。${payload.reason ? " 理由: " + payload.reason : ""}`);
    return { ok: true, record: findRecord_(user.email, today) };
  } finally {
    lock.releaseLock();
  }
}

function clockOut_(user, payload, idToken) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const settings = settings_();
    const now = new Date();
    if (timeKey_(now) >= settings.end_limit_time) throw apiError_("CORRECTION_REQUIRED", "22:00以降の終了は修正申請が必要です。");
    const record = findRecord_(user.email, today_());
    if (!record || !record["実開始"]) throw apiError_("NOT_STARTED", "稼働開始記録がありません。");
    if (record["実終了"]) return { ok: true, duplicate: true, record };
    updateById_(SHEETS.records, "record_id", record.record_id, { "状態": "終了済み", "実終了": now, "終了押下": now, "更新日時": now });
    return { ok: true, record: findRecord_(user.email, today_()), plans: findTodayPlans_(user, idToken) };
  } finally {
    lock.releaseLock();
  }
}

function submitCorrection_(user, payload, idToken) {
  const approval = accountApprovalRequest_({ phase: "prepare", idToken: idToken });
  const requestId = Utilities.getUuid();
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    ensureRequestContractHeaders_();
    appendObject_(SHEETS.requests, {
      request_id: requestId, record_id: payload.recordId || "", "種別": payload.type || "打刻修正",
      "申請者メール": user.email, "申請者氏名": user.name || "", "実勤務日": payload.workDate || today_(),
      "申請開始": payload.actualStart || "", "申請終了": payload.actualEnd || "", "理由区分": payload.reasonType || "その他",
      "理由詳細": payload.reason || "", "状態": "申請中", "申請日時": new Date(),
      applicant_internal_user_id: approval.applicant_internal_user_id, request_version: 1,
      approval_reviewer_internal_user_id: approval.approval_reviewer_internal_user_id,
      applicant_organization_version: approval.applicant_organization_version
    });
  } finally {
    lock.releaseLock();
  }
  notifyManagers_(user, "修正申請", `${user.name || user.email}さんから${payload.type || "打刻修正"}の申請が届きました。`);
  return { ok: true, requestId };
}

function submitReport_(user, payload) {
  ensureReportSheet_();
  if (!payload.recordId || !String(payload.result || "").trim()) throw apiError_("REPORT_REQUIRED", "実績内容を入力してください。");
  const record = rows_(SHEETS.records).find(r => String(r.record_id || "") === String(payload.recordId));
  if (!record || normalizeEmail_(record.email) !== normalizeEmail_(user.email)) {
    throw apiError_("REPORT_RECORD_FORBIDDEN", "本人の稼働記録を確認できません。");
  }
  append_(SHEETS.reports, [Utilities.getUuid(), payload.recordId, payload.planId || "", payload.planName || "", user.email, user.name || "", payload.result, payload.notes || "", new Date()]);
  return { ok: true };
}

function getAdminDashboard_(user, idToken) {
  const today = today_();
  const admin = isAdmin_(user);
  const schedules = admin ? getSchedules_(idToken).filter(r => dateKey_(r["勤務日"]) === today) : [];
  const records = admin ? rows_(SHEETS.records).filter(r => dateKey_(r["勤務日"]) === today) : [];
  const pendingRequests = rows_(SHEETS.requests).filter(r => String(r["状態"]) === "申請中");
  const reviewerId = internalUserId_(user);
  const requests = admin
    ? pendingRequests
    : pendingRequests.filter(r => String(r.approval_reviewer_internal_user_id || "") === reviewerId);
  const locations = admin && canViewPreciseLocation_(user) ? locationRows_() : [];
  const people = schedules.map(schedule => {
    const record = records.find(r => normalizeEmail_(r.email) === normalizeEmail_(schedule.email));
    const loc = record && locations.find(l => String(l.attendance_record_id) === String(record.record_id));
    return { schedule, record: record || null, location: loc || null };
  });
  records.filter(record => !schedules.some(s => normalizeEmail_(s.email) === normalizeEmail_(record.email))).forEach(record => {
    const loc = locations.find(l => String(l.attendance_record_id) === String(record.record_id));
    people.push({ schedule: null, record, location: loc || null });
  });
  return { ok: true, serverNow: nowIso_(), people, requests, settings: admin ? settings_() : {}, preciseLocationAccess: admin && canViewPreciseLocation_(user) };
}

function reviewRequest_(user, payload, idToken) {
  if (!["承認", "却下"].includes(payload.decision)) throw apiError_("INVALID_DECISION", "承認または却下を指定してください。");
  if (payload.decision === "却下" && !String(payload.reason || "").trim()) throw apiError_("REASON_REQUIRED", "却下理由を入力してください。");
  ensureRequestContractHeadersForReview_();
  const initial = findRequestById_(payload.requestId);
  assertRequestContract_(initial);
  if (String(initial.approval_reviewer_internal_user_id || "").trim() !== internalUserId_(user)) {
    const unexpectedAuthorization = accountApprovalRequest_(approvalContractPayload_(initial, payload, idToken, "authorize"));
    if (unexpectedAuthorization && unexpectedAuthorization.authorization_event_id) {
      finalizeAttendanceAudit_(initial, payload, idToken, unexpectedAuthorization.authorization_event_id, unexpectedAuthorization.reviewer_internal_user_id, "error", "申請中", "REVIEWER_ID_NORMALIZATION_MISMATCH");
    }
    throw apiError_("NOT_ASSIGNED_REVIEWER", "この申請の承認者ではありません。");
  }

  let authorization;
  try {
    authorization = accountApprovalRequest_(approvalContractPayload_(initial, payload, idToken, "authorize"));
  } catch (error) {
    if (error.code === "APPROVAL_ROUTE_CHANGED") markRouteForReconfirmation_(initial);
    throw error;
  }
  const eventId = authorization.authorization_event_id;
  const reviewerId = authorization.reviewer_internal_user_id;
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  let request;
  let record;
  let conflictCode = "";
  let processingError;
  let writeRollbackSucceeded = true;
  try {
    request = findRequestById_(payload.requestId);
    if (!request || request["状態"] !== "申請中") {
      conflictCode = "REQUEST_NOT_PENDING";
    } else {
      assertRequestContract_(request);
      const currentVersion = Number(request.request_version);
      if (!Number.isInteger(Number(payload.expectedRequestVersion)) || Number(payload.expectedRequestVersion) !== currentVersion || currentVersion !== Number(initial.request_version)) {
        conflictCode = "VERSION_CONFLICT";
      } else {
        const nextStatus = payload.decision + "済み";
        record = request.record_id ? rows_(SHEETS.records).find(r => String(r.record_id) === String(request.record_id)) : null;
        updateById_(SHEETS.requests, "request_id", payload.requestId, { "状態": nextStatus, request_version: currentVersion + 1, "承認者メール": user.email, "承認者氏名": user.name || "", "承認理由": payload.reason || "", "処理日時": new Date() });
        if (payload.decision === "承認" && request.record_id) updateById_(SHEETS.records, "record_id", request.record_id, { "正式開始": request["申請開始"] || "", "正式終了": request["申請終了"] || "", "更新日時": new Date() });
      }
    }
  } catch (error) {
    processingError = error;
    try {
      if (request) restoreAttendanceReview_(request, record);
    } catch (rollbackError) {
      writeRollbackSucceeded = false;
      processingError.rollback_error = rollbackError.code || rollbackError.message;
    }
  } finally {
    lock.releaseLock();
  }

  if (conflictCode) {
    finalizeAttendanceAudit_(request || initial, payload, idToken, eventId, reviewerId, "conflict", "申請中", conflictCode);
    throw apiError_(conflictCode, conflictCode === "REQUEST_NOT_PENDING" ? "申請はすでに処理されています。" : "申請が更新されています。再読込してください。");
  }
  if (processingError) {
    const result = writeRollbackSucceeded ? "error" : "recovery_required";
    finalizeAttendanceAudit_(request || initial, payload, idToken, eventId, reviewerId, result, "申請中", `${processingError.code || processingError.message}${processingError.rollback_error ? ":" + processingError.rollback_error : ""}`);
    if (!writeRollbackSucceeded) throw apiError_("RECOVERY_REQUIRED", "承認更新の復元に失敗しました。管理者確認が必要です。");
    throw processingError;
  }

  const nextStatus = payload.decision + "済み";
  try {
    finalizeAttendanceAudit_(request, payload, idToken, eventId, reviewerId, "success", nextStatus, "");
  } catch (finalizeError) {
    handleAttendanceFinalizeFailure_(request, record, payload, idToken, eventId, reviewerId, finalizeError);
  }
  try {
    createNotification_(request["申請者メール"], request["申請者氏名"], "申請結果", `${request["種別"]}は${payload.decision}されました。`, payload.requestId);
  } catch (notificationError) {
    console.error("Attendance approval notification failed", notificationError);
  }
  return { ok: true, requestVersion: Number(request.request_version) + 1 };
}

function approvalContractPayload_(request, payload, idToken, phase) {
  return { phase: phase, idToken: idToken, request_id: request.request_id, decision: payload.decision, reason: payload.reason || "", request_version: Number(request.request_version), applicant_internal_user_id: request.applicant_internal_user_id, approval_reviewer_internal_user_id: request.approval_reviewer_internal_user_id, applicant_organization_version: Number(request.applicant_organization_version) };
}

function finalizeAttendanceAudit_(request, payload, idToken, eventId, reviewerId, result, resultStatus, errorCode) {
  return accountApprovalRequest_(Object.assign(approvalContractPayload_(request, payload, idToken, "finalize"), {
    authorization_event_id: eventId,
    reviewer_internal_user_id: reviewerId,
    result: result,
    result_status: resultStatus,
    error_code: errorCode || ""
  }));
}

function handleAttendanceFinalizeFailure_(request, record, payload, idToken, eventId, reviewerId, originalError) {
  try {
    finalizeAttendanceAudit_(request, payload, idToken, eventId, reviewerId, "success", payload.decision + "済み", "");
    return;
  } catch (retryError) {
    originalError = retryError;
  }
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  let rollbackSucceeded = false;
  let rollbackError;
  try {
    const current = findRequestById_(request.request_id);
    const expectedStatus = payload.decision + "済み";
    if (!current || String(current["状態"]) !== expectedStatus || Number(current.request_version) !== Number(request.request_version) + 1) {
      throw apiError_("ROLLBACK_STATE_CHANGED", "復元対象の申請状態が変わっています。");
    }
    restoreAttendanceReview_(request, record);
    rollbackSucceeded = true;
  } catch (error) {
    rollbackError = error;
  } finally {
    lock.releaseLock();
  }

  const result = rollbackSucceeded ? "error" : "recovery_required";
  const errorCode = rollbackSucceeded
    ? (originalError.code || "AUDIT_FINALIZE_FAILED")
    : `${originalError.code || "AUDIT_FINALIZE_FAILED"}:${rollbackError.code || rollbackError.message || "ROLLBACK_FAILED"}`;
  try {
    finalizeAttendanceAudit_(request, payload, idToken, eventId, reviewerId, result, "申請中", errorCode);
  } catch (auditError) {
    throw apiError_("RECOVERY_REQUIRED", "承認結果の整合性を自動確定できませんでした。管理者確認が必要です。");
  }
  if (!rollbackSucceeded) throw apiError_("RECOVERY_REQUIRED", "承認結果の復元に失敗しました。管理者確認が必要です。");
  throw originalError;
}

function markRouteForReconfirmation_(request) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const current = findRequestById_(request.request_id);
    if (!current || String(current["状態"]) !== "申請中" || Number(current.request_version) !== Number(request.request_version)) return;
    updateById_(SHEETS.requests, "request_id", request.request_id, { "状態": "経路再確認", request_version: Number(request.request_version) + 1, "処理日時": new Date() });
  } finally {
    lock.releaseLock();
  }
}

function findRequestById_(requestId) {
  return rows_(SHEETS.requests).find(r => String(r.request_id) === String(requestId)) || null;
}

function assertRequestContract_(request) {
  if (!request || String(request["状態"]) !== "申請中") throw apiError_("REQUEST_NOT_FOUND", "申請が見つからないか、処理済みです。");
  if (!request.applicant_internal_user_id || !request.request_version || !request.approval_reviewer_internal_user_id) throw apiError_("LEGACY_REQUEST_REAPPLY_REQUIRED", "旧形式の申請です。本人確認後に再申請してください。");
}

function accountApprovalRequest_(payload) {
  const request = Object.assign({ action: "attendanceApprovalContract" }, payload);
  request.service_secret = PropertiesService.getScriptProperties().getProperty("ATTENDANCE_APPROVAL_SERVICE_SECRET") || "";
  const response = UrlFetchApp.fetch(ACCOUNT_APPROVAL_API_URL, { method: "post", contentType: "text/plain;charset=utf-8", payload: JSON.stringify(request), muteHttpExceptions: true });
  let result;
  try { result = JSON.parse(response.getContentText() || "{}"); } catch (error) { result = {}; }
  if (!result.ok) throw apiError_(result.code || "ACCOUNT_APPROVAL_UNAVAILABLE", result.message || "承認経路を確認できません。");
  return result;
}

function restoreAttendanceReview_(request, record) {
  updateById_(SHEETS.requests, "request_id", request.request_id, { "状態": request["状態"], request_version: request.request_version, "承認者メール": request["承認者メール"] || "", "承認者氏名": request["承認者氏名"] || "", "承認理由": request["承認理由"] || "", "処理日時": request["処理日時"] || "" });
  if (record) updateById_(SHEETS.records, "record_id", record.record_id, { "正式開始": record["正式開始"] || "", "正式終了": record["正式終了"] || "", "更新日時": record["更新日時"] || "" });
}

function updateEndWarningTime_(user, payload) {
  requireAdmin_(user);
  const value = String(payload.time || "");
  if (!/^([01]\d|2[0-1]):[0-5]\d$/.test(value)) throw apiError_("INVALID_TIME", "通知時刻は00:00〜21:59で指定してください。");
  updateById_(SHEETS.settings, "設定キー", "end_warning_time", { "設定値": value, "変更者": user.email, "変更日時": new Date() });
  return { ok: true, settings: settings_() };
}

function markNotificationRead_(user, payload) {
  const notification = rows_(SHEETS.notifications).find(r => String(r.notification_id) === String(payload.notificationId));
  if (!notification || normalizeEmail_(notification["宛先メール"]) !== normalizeEmail_(user.email)) throw apiError_("NOT_FOUND", "通知が見つかりません。");
  updateById_(SHEETS.notifications, "notification_id", payload.notificationId, { "既読": true, "既読日時": new Date() });
  return { ok: true };
}

function saveLocation_(user, recordId, location, plannedLocation) {
  const status = String(location.status || "取得失敗");
  const id = Utilities.getUuid();
  const sheet = SpreadsheetApp.openById(locationSpreadsheetId_()).getSheetByName("位置情報ログ");
  const now = new Date();
  sheet.appendRow([
    id, recordId, user.organization_id || "", user.employee_code || "", now,
    location.latitude || "", location.longitude || "", location.accuracy || "", status,
    location.consentVersion || "2026-08-02-v1", location.consentAt ? new Date(location.consentAt) : "", plannedLocation || "",
    "未確認", "", "", addDays_(now, 7)
  ]);
  return { id, status };
}

function notifyManagers_(subjectUser, title, message) {
  const managers = managerEmails_(subjectUser.organization_id);
  createNotification_(subjectUser.email, subjectUser.name || "", title, message, "");
  managers.forEach(m => createNotification_(m.email, m.name, title, message, ""));
  const recipients = [subjectUser.email].concat(managers.map(m => m.email)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  if (recipients.length) MailApp.sendEmail({ to: recipients.join(","), subject: `[ShiftCore] ${title}`, body: message });
}

function createNotification_(email, name, type, body, targetId) {
  if (!email) return;
  append_(SHEETS.notifications, [Utilities.getUuid(), email, name || "", type, type, body, targetId || "", false, "送信済み", new Date(), ""]);
}

function managerEmails_(organizationId) {
  const values = SpreadsheetApp.getActive().getSheetByName("管理者") || null;
  const managers = values ? objects_(values).filter(r => !organizationId || !r.organization_id || String(r.organization_id) === String(organizationId)).filter(r => isAdminRole_(r.role)).map(r => ({ email: r.email, name: r.name || "" })) : [];
  if (managers.length) return managers;
  const owner = Session.getEffectiveUser().getEmail();
  return owner ? [{ email: owner, name: "ShiftCore管理者" }] : [];
}

function getSchedules_(idToken) {
  const local = rows_(SHEETS.schedules);
  try {
    const targetMonth = Utilities.formatDate(new Date(), TZ, "yyyy-MM");
    const response = UrlFetchApp.fetch(SHIFTBUILDER_API_URL, {
      method: "post",
      contentType: "text/plain;charset=utf-8",
      payload: JSON.stringify({ action: "shiftBuilderGetMonthData", idToken: idToken, targetMonth: targetMonth, area: "all" }),
      muteHttpExceptions: true
    });
    const result = JSON.parse(response.getContentText() || "{}");
    const cases = result && result.success === true && result.data && Array.isArray(result.data.cases) ? result.data.cases : [];
    const derived = [];
    cases.forEach(caseItem => {
      const cells = caseItem.cells || {};
      Object.keys(cells).forEach(workDate => {
        const cell = cells[workDate] || {};
        (Array.isArray(cell.assigned) ? cell.assigned : []).forEach(member => {
          derived.push({
            schedule_id: member.assignment_id || member.assignmentId || `${caseItem.caseId || "plan"}-${workDate}-${member.internal_user_id || member.internalUserId || member.employee_code || member.email || "member"}`,
            organization_id: member.organization_id || "",
            employee_code: member.employee_code || member.account_code || "",
            email: member.email || member.mail || member.gmail || "",
            "氏名": member.display_name || member.displayName || member.name || "",
            "勤務日": workDate,
            "予定開始": cell.start_time || cell.startTime || caseItem.start_time || caseItem.startTime || "",
            "予定終了": cell.end_time || cell.endTime || caseItem.end_time || caseItem.endTime || "",
            "稼働場所": caseItem.shiftcore_display_name || caseItem.shiftcoreDisplayName || caseItem.store_name || caseItem.storeName || caseItem.title || caseItem.client || caseItem.area || "場所未定",
            "開発予定ID": caseItem.caseId || "",
            "開発予定名": caseItem.shiftcore_display_name || caseItem.title || caseItem.caseId || "開発予定"
          });
        });
      });
    });
    return mergeSchedules_(local, derived);
  } catch (error) {
    console.warn("ShiftBuilder schedule fetch failed", error);
    return local;
  }
}

function mergeSchedules_(local, derived) {
  const result = local.slice();
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.schedules);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const syncedFields = ["organization_id", "employee_code", "email", "氏名", "勤務日", "予定開始", "予定終了", "稼働場所", "開発予定ID", "開発予定名"];
  derived.forEach(item => {
    const key = String(item.schedule_id || "");
    const existingIndex = result.findIndex(existing => String(existing.schedule_id || "") === key);
    if (existingIndex < 0) {
      result.push(item);
      append_(SHEETS.schedules, [
        item.schedule_id, item.organization_id || "", item.employee_code || "", item.email || "", item["氏名"] || "",
        item["勤務日"] || "", item["予定開始"] || "", item["予定終了"] || "", item["稼働場所"] || "",
        item["開発予定ID"] || "", item["開発予定名"] || "", new Date()
      ]);
      return;
    }

    const existing = result[existingIndex];
    const changed = syncedFields.some(field => String(existing[field] || "") !== String(item[field] || ""));
    if (changed) {
      const merged = Object.assign({}, existing, item, { "同期日時": new Date() });
      result[existingIndex] = merged;
      sheet.getRange(existingIndex + 2, 1, 1, headers.length).setValues([headers.map(header => merged[header] == null ? "" : merged[header])]);
    }
  });
  return result;
}

function matchesUser_(schedule, user) {
  const emailMatch = schedule.email && normalizeEmail_(schedule.email) === normalizeEmail_(user.email);
  const employeeMatch = schedule.employee_code && String(schedule.employee_code) === String(user.employee_code || user.account_code || "");
  const idMatch = schedule.internal_user_id && String(schedule.internal_user_id) === String(user.internal_user_id || user.internalUserId || user.user_id || "");
  return Boolean(emailMatch || employeeMatch || idMatch);
}

function setupAttendanceTriggers() {
  const handlerNames = ["runAttendanceNotifications", "cleanupExpiredLocations"];
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlerNames.includes(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("runAttendanceNotifications").timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger("cleanupExpiredLocations").timeBased().atHour(2).everyDays(1).inTimezone(TZ).create();
}

function runAttendanceNotifications() {
  const now = new Date();
  const current = timeKey_(now);
  const today = today_();
  const settings = settings_();
  const schedules = rows_(SHEETS.schedules).filter(r => dateKey_(r["勤務日"]) === today);
  const records = rows_(SHEETS.records).filter(r => dateKey_(r["勤務日"]) === today);

  if (current >= settings.start_warning_time && current < settings.start_limit_time) {
    schedules.forEach(schedule => {
      const record = records.find(r => matchesUser_(schedule, r));
      const targetId = `start-warning-${today}-${schedule.schedule_id}`;
      if (!record || !record["実開始"]) {
        if (!notificationExists_(schedule.email, "稼働開始未確認", targetId)) {
          notifyScheduledPerson_(schedule, "稼働開始未確認", "9:30時点で稼働開始が確認できません。10:00までに、これまで押下していなかった理由を添えて開始してください。", targetId);
        }
      }
    });
  }

  if (current >= settings.end_warning_time && current < settings.end_limit_time) {
    records.filter(record => record["実開始"] && !record["実終了"]).forEach(record => {
      const targetId = `end-warning-${today}-${record.record_id}`;
      if (!notificationExists_(record.email, "稼働終了未確認", targetId)) {
        notifyScheduledPerson_(record, "稼働終了未確認", `${settings.end_warning_time}時点で稼働終了が確認できません。${settings.end_limit_time}までに終了操作を行ってください。`, targetId);
      }
    });
  }
}

function notifyScheduledPerson_(subject, title, message, targetId) {
  const managers = managerEmails_(subject.organization_id);
  createNotification_(subject.email, subject["氏名"] || subject.name || "", title, message, targetId);
  managers.forEach(manager => {
    if (!notificationExists_(manager.email, title, targetId)) createNotification_(manager.email, manager.name, title, message, targetId);
  });
  const recipients = [subject.email].concat(managers.map(manager => manager.email)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  if (recipients.length) MailApp.sendEmail({ to: recipients.join(","), subject: `[ShiftCore] ${title}`, body: message });
}

function notificationExists_(email, type, targetId) {
  return rows_(SHEETS.notifications).some(row => normalizeEmail_(row["宛先メール"]) === normalizeEmail_(email) && String(row["種別"]) === String(type) && String(row["対象ID"]) === String(targetId));
}

function cleanupExpiredLocations() {
  const sheet = SpreadsheetApp.openById(locationSpreadsheetId_()).getSheetByName("位置情報ログ");
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(String);
  const expiryCol = headers.indexOf("削除予定日");
  const recordCol = headers.indexOf("attendance_record_id");
  const pendingRecordIds = rows_(SHEETS.requests).filter(r => String(r["状態"]) === "申請中").map(r => String(r.record_id || ""));
  const now = new Date();
  for (let index = values.length - 1; index >= 1; index -= 1) {
    const expiry = values[index][expiryCol];
    const recordId = String(values[index][recordCol] || "");
    if (expiry instanceof Date && expiry.getTime() <= now.getTime() && !pendingRecordIds.includes(recordId)) sheet.deleteRow(index + 1);
  }
}

function findRecord_(email, date) { return rows_(SHEETS.records).find(r => normalizeEmail_(r.email) === normalizeEmail_(email) && dateKey_(r["勤務日"]) === date) || null; }
function findSchedule_(user, date, scheduleId, idToken) { return getSchedules_(idToken).find(r => matchesUser_(r, user) && dateKey_(r["勤務日"]) === date && (!scheduleId || String(r.schedule_id) === String(scheduleId))) || null; }
function findTodayPlans_(user, idToken) { return getSchedules_(idToken).filter(r => matchesUser_(r, user) && dateKey_(r["勤務日"]) === today_()).map(r => ({ id: r["開発予定ID"] || r.schedule_id, name: r["開発予定名"] || r["稼働場所"] || "当日の開発予定" })); }
function rows_(name) { const sheet = SpreadsheetApp.getActive().getSheetByName(name); return sheet ? objects_(sheet) : []; }
function locationRows_() { const sheet = SpreadsheetApp.openById(locationSpreadsheetId_()).getSheetByName("位置情報ログ"); return objects_(sheet); }

function locationSpreadsheetId_() {
  const id = settings_().location_spreadsheet_id;
  if (!id) throw apiError_("CONFIG_MISSING", "位置情報保存先が設定されていません。");
  return id;
}
function objects_(sheet) { const values = sheet.getDataRange().getValues(); if (values.length < 2) return []; const headers = values.shift().map(String); return values.filter(row => row.some(v => v !== "")).map(row => headers.reduce((o, h, i) => (o[h] = row[i], o), {})); }
function append_(name, values) { const sheet = SpreadsheetApp.getActive().getSheetByName(name); if (!sheet) throw apiError_("SHEET_NOT_FOUND", `${name}シートがありません。`); sheet.appendRow(values); }
function appendObject_(name, value) { const sheet = SpreadsheetApp.getActive().getSheetByName(name); if (!sheet) throw apiError_("SHEET_NOT_FOUND", `${name}シートがありません。`); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String); const missing = Object.keys(value).filter(key => !headers.includes(key)); if (missing.length) throw apiError_("SHEET_SCHEMA_MISMATCH", `${name}シートの列が不足しています: ${missing.join(",")}`); sheet.appendRow(headers.map(header => value[header] == null ? "" : value[header])); }
function updateById_(sheetName, idColumn, id, changes) { const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName); const values = sheet.getDataRange().getValues(); const headers = values[0].map(String); const rowIndex = values.findIndex((r, i) => i > 0 && String(r[headers.indexOf(idColumn)]) === String(id)); if (rowIndex < 1) throw apiError_("NOT_FOUND", "対象データが見つかりません。"); Object.keys(changes).forEach(k => { const col = headers.indexOf(k); if (col >= 0) sheet.getRange(rowIndex + 1, col + 1).setValue(changes[k]); }); }
function settings_() { return rows_(SHEETS.settings).reduce((o, r) => (o[String(r["設定キー"])] = String(r["設定値"]), o), {}); }
function ensureReportSheet_() { const ss = SpreadsheetApp.getActive(); if (!ss.getSheetByName(SHEETS.reports)) { const s = ss.insertSheet(SHEETS.reports); s.appendRow(HEADERS.reports); s.setFrozenRows(1); } }
function ensureRequestContractHeaders_() { const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.requests); if (!sheet) throw apiError_("SHEET_NOT_FOUND", `${SHEETS.requests}シートがありません。`); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String); const duplicate = headers.find((header, index) => header && headers.indexOf(header) !== index); if (duplicate) throw apiError_("SHEET_SCHEMA_MISMATCH", `${SHEETS.requests}シートに重複列があります: ${duplicate}`); const missingExisting = HEADERS.requests.filter(header => !headers.includes(header)); if (missingExisting.length) throw apiError_("SHEET_SCHEMA_MISMATCH", `${SHEETS.requests}シートの既存列が不足しています: ${missingExisting.join(",")}`); HEADERS.requestContract.forEach(header => { if (!headers.includes(header)) { sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header); headers.push(header); } }); }
function ensureRequestContractHeadersForReview_() { const lock = LockService.getDocumentLock(); lock.waitLock(20000); try { ensureRequestContractHeaders_(); } finally { lock.releaseLock(); } }
function publicUser_(user) { return { internal_user_id: internalUserId_(user), name: user.name || "", email: user.email || "", role: user.role || "", organization_id: user.organization_id || "", employee_code: user.employee_code || "", employment_type: user.employment_type || user.contract_type || "" }; }
function internalUserId_(user) { return String(user && (user.internal_user_id || user.internalUserId || user.user_id || user.userId) || "").trim(); }
function hasApprovalReviewAccess_(user) { const userId = internalUserId_(user); return Boolean(userId) && rows_(SHEETS.requests).some(request => String(request["状態"]) === "申請中" && String(request.approval_reviewer_internal_user_id || "") === userId); }
function isAdminRole_(role) { return ["admin", "manager", "team_leader", "leader", "executive", "labor", "hr", "developer", "dev"].includes(String(role || "").toLowerCase()); }
function isAdmin_(user) { return isAdminRole_(user.role); }
function canViewPreciseLocation_(user) { return ["admin", "executive", "labor", "hr", "developer", "dev"].includes(String(user.role || "").toLowerCase()); }
function requireAdmin_(user) { if (!isAdmin_(user)) throw apiError_("FORBIDDEN", "管理者権限が必要です。"); }
function normalizeEmail_(v) { return String(v || "").trim().toLowerCase(); }
function today_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd"); }
function dateKey_(v) { if (!v) return ""; if (Object.prototype.toString.call(v) === "[object Date]") return Utilities.formatDate(v, TZ, "yyyy-MM-dd"); return String(v).slice(0, 10).replace(/\//g, "-"); }
function timeKey_(d) { return Utilities.formatDate(d, TZ, "HH:mm"); }
function formatJst_(d) { return Utilities.formatDate(d, TZ, "yyyy/MM/dd HH:mm"); }
function nowIso_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function addDays_(d, days) { return new Date(d.getTime() + days * 86400000); }
function apiError_(code, message) { const e = new Error(message); e.code = code; return e; }
function jsonOutput_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
