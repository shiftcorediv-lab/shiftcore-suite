// ===== 勤怠申請の直属承認契約 ここから =====

const ATTENDANCE_REJECTION_AUDIT_CACHE_SECONDS = 300;

function attendanceApprovalContract_(body) {
  const phase = normalizeText(body.phase);
  requireAttendanceApprovalService_(body.service_secret);
  if (phase === "prepare") {
    return prepareAttendanceApprovalRequest_(body);
  }
  if (phase === "authorize") {
    return authorizeAttendanceApprovalReview_(body);
  }
  if (phase === "finalize") {
    return finalizeAttendanceApprovalReview_(body);
  }
  return { ok: false, code: "INVALID_PHASE", message: "未対応の承認処理です" };
}

function prepareAttendanceApprovalRequest_(body) {
  const resolved = resolveCurrentUserByIdToken(normalizeText(body.idToken));
  if (!resolved || resolved.ok !== true || !resolved.user) {
    return { ok: false, code: "AUTH_INVALID", message: "申請者を確認できません" };
  }
  const applicant = findOrganizationUserById_(resolved.user.internal_user_id);
  if (!applicant || normalizeText(applicant.status).toLowerCase() !== "active") {
    return { ok: false, code: "APPLICANT_INACTIVE", message: "申請者の組織情報を確認できません" };
  }
  const level = normalizeOrganizationLevel_(applicant.organization_level);
  const reviewerId = level === "executive"
    ? normalizeText(applicant.executive_reviewer_user_id)
    : normalizeText(applicant.direct_manager_user_id);
  if (!level || !reviewerId) {
    return { ok: false, code: "APPROVAL_ROUTE_MISSING", message: "承認経路が設定されていません" };
  }
  return {
    ok: true,
    applicant_internal_user_id: normalizeText(applicant.internal_user_id),
    approval_reviewer_internal_user_id: reviewerId,
    applicant_organization_version: normalizeOrganizationVersion_(applicant.organization_version)
  };
}

function authorizeAttendanceApprovalReview_(body) {
  const requestId = normalizeText(body.request_id);
  const applicantId = normalizeText(body.applicant_internal_user_id);
  const eventId = "ACE-" + Utilities.getUuid();
  let reviewer;
  let applicant;
  try {
    reviewer = resolveAttendanceReviewer_(body.idToken);
    applicant = findOrganizationUserById_(applicantId);
    assertAttendanceApprovalRouteUnchanged_(applicant, reviewer, body);
    appendAttendanceAuthorizationLog_({
      authorization_event_id: eventId,
      event_type: "approval.review",
      request_id: requestId,
      actor_internal_user_id: reviewer.internal_user_id,
      target_internal_user_id: applicantId,
      reviewer_internal_user_id: reviewer.internal_user_id,
      before: { status: "pending", request_version: Number(body.request_version) },
      reason: normalizeText(body.reason) || normalizeText(body.decision),
      result: "started",
      source: "attendance"
    });
    return { ok: true, authorization_event_id: eventId, reviewer_internal_user_id: reviewer.internal_user_id };
  } catch (error) {
    try {
      appendAttendanceRejectionLog_({
        authorization_event_id: eventId,
        event_type: "approval.review",
        request_id: requestId,
        actor_internal_user_id: reviewer && reviewer.internal_user_id,
        target_internal_user_id: applicantId,
        reviewer_internal_user_id: reviewer && reviewer.internal_user_id,
        reason: normalizeText(body.reason) || normalizeText(body.decision),
        result: "rejected",
        error_code: normalizeText(error.code || error.message),
        source: "attendance"
      });
    } catch (auditError) {
      return { ok: false, code: "AUDIT_WRITE_FAILED", message: "監査ログを記録できません" };
    }
    return { ok: false, code: normalizeText(error.code || "REVIEW_FORBIDDEN"), message: "現在の直属承認経路では処理できません" };
  }
}

function finalizeAttendanceApprovalReview_(body) {
  let reviewerId = normalizeText(body.reviewer_internal_user_id);
  try {
    reviewerId = resolveAttendanceReviewer_(body.idToken).internal_user_id;
  } catch (error) {
    // 終端ログは認可結果ではなく処理結果の記録なので、開始時に確定したIDを使う。
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return finalizeAttendanceApprovalReviewLocked_(body, reviewerId);
  } finally {
    lock.releaseLock();
  }
}

function finalizeAttendanceApprovalReviewLocked_(body, resolvedReviewerId) {
  const eventId = normalizeText(body.authorization_event_id);
  const result = normalizeText(body.result || "error");
  if (eventId.indexOf("ACE-") !== 0 ||
      ["success", "error", "conflict", "recovery_required"].indexOf(result) === -1) {
    return { ok: false, code: "INVALID_FINALIZE", message: "終端監査情報が不正です" };
  }
  const existingTerminal = findAttendanceApprovalTerminal_(eventId);
  if (existingTerminal) {
    if (existingTerminal === result) return { ok: true, duplicate: true };
    recordAuthorizationRecovery_({
      authorization_event_id: eventId,
      request_id: normalizeText(body.request_id),
      error_code: "TERMINAL_RESULT_CONFLICT",
      source: "attendance",
      existing_result: existingTerminal,
      requested_result: result
    });
    return { ok: false, code: "EVENT_ALREADY_FINALIZED", message: "監査イベントは別の結果で確定済みです" };
  }
  const reviewerId = normalizeText(resolvedReviewerId || body.reviewer_internal_user_id);
  const succeeded = result === "success";
  if (result === "recovery_required") {
    recordAuthorizationRecovery_({
      authorization_event_id: eventId,
      request_id: normalizeText(body.request_id),
      error_code: normalizeText(body.error_code),
      source: "attendance"
    });
  }
  try {
    appendAuthorizationChangeLog_({
      authorization_event_id: eventId,
      event_type: "approval.review",
      request_id: normalizeText(body.request_id),
      actor_internal_user_id: reviewerId,
      target_internal_user_id: normalizeText(body.applicant_internal_user_id),
      reviewer_internal_user_id: reviewerId,
      before: { status: "pending", request_version: Number(body.request_version) },
      after: { status: succeeded ? normalizeText(body.result_status) : "pending", request_version: succeeded ? Number(body.request_version) + 1 : Number(body.request_version) },
      reason: normalizeText(body.reason) || normalizeText(body.decision),
      result: result,
      error_code: normalizeText(body.error_code),
      source: "attendance"
    });
  } catch (error) {
    recordAuthorizationRecovery_({
      authorization_event_id: eventId,
      request_id: normalizeText(body.request_id),
      error_code: normalizeText(error.code || error.message),
      source: "attendance",
      result: result
    });
    return { ok: false, code: "AUDIT_WRITE_FAILED", message: "終端監査ログを記録できません" };
  }
  return { ok: true };
}

function findAttendanceApprovalTerminal_(eventId) {
  const sheet = getAuthorizationChangeLogsSheet_();
  if (sheet.getLastRow() < 2) return "";
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(normalizeText);
  const eventIndex = headers.indexOf("authorization_event_id");
  const resultIndex = headers.indexOf("result");
  if (eventIndex === -1 || resultIndex === -1) throw organizationAuthorizationError_("AUDIT_READ_FAILED");
  const matches = sheet.getRange(2, eventIndex + 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(eventId)
    .matchEntireCell(true)
    .matchCase(true)
    .findAll()
    .sort(function(left, right) { return right.getRow() - left.getRow(); });
  for (let index = 0; index < matches.length; index += 1) {
    const result = normalizeText(sheet.getRange(matches[index].getRow(), resultIndex + 1).getDisplayValue());
    if (["success", "error", "conflict", "recovery_required", "rejected"].indexOf(result) !== -1) return result;
  }
  return "";
}

function appendAttendanceAuthorizationLog_(entry) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return appendAuthorizationChangeLog_(entry);
  } finally {
    lock.releaseLock();
  }
}

function appendAttendanceRejectionLog_(entry) {
  const reviewerId = normalizeText(entry.actor_internal_user_id);
  const errorCode = normalizeText(entry.error_code);
  if (!reviewerId || errorCode !== "NOT_ASSIGNED_REVIEWER") {
    return appendAttendanceAuthorizationLog_(entry);
  }
  let cache;
  let cacheKey;
  try {
    cache = CacheService.getScriptCache();
    cacheKey = attendanceRejectionAuditCacheKey_(entry.request_id, reviewerId);
  } catch (cacheError) {
    return appendAttendanceAuthorizationLog_(entry);
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    try {
      if (cache.get(cacheKey)) return null;
    } catch (cacheReadError) {
      // キャッシュはログ抑制専用。読取失敗時も監査記録を優先する。
    }
    const result = appendAuthorizationChangeLog_(entry);
    try {
      cache.put(cacheKey, "1", ATTENDANCE_REJECTION_AUDIT_CACHE_SECONDS);
    } catch (cacheWriteError) {
      // 記録済みの監査ログをキャッシュ障害で失敗扱いにしない。
    }
    return result;
  } finally {
    lock.releaseLock();
  }
}

function attendanceRejectionAuditCacheKey_(requestId, reviewerId) {
  const source = normalizeText(requestId) + "\u001f" + normalizeText(reviewerId);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, source, Utilities.Charset.UTF_8);
  return "attendance-rejection-" + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, "");
}

function resolveAttendanceReviewer_(idToken) {
  const resolved = resolveCurrentUserByIdToken(normalizeText(idToken));
  if (!resolved || resolved.ok !== true || !resolved.user) {
    throw organizationAuthorizationError_("AUTH_INVALID");
  }
  const reviewer = findOrganizationUserById_(resolved.user.internal_user_id);
  if (!reviewer) throw organizationAuthorizationError_("REVIEWER_MISMATCH");
  return reviewer;
}

function assertAttendanceApprovalRouteUnchanged_(applicant, reviewer, body) {
  if (!applicant) throw organizationAuthorizationError_("APPLICANT_NOT_FOUND");
  const expectedVersion = Number(body.applicant_organization_version);
  if (!Number.isInteger(expectedVersion) ||
      normalizeOrganizationVersion_(applicant.organization_version) !== expectedVersion) {
    throw organizationAuthorizationError_("APPROVAL_ROUTE_CHANGED");
  }
  const savedReviewerId = normalizeText(body.approval_reviewer_internal_user_id);
  if (savedReviewerId !== normalizeText(reviewer.internal_user_id)) {
    throw organizationAuthorizationError_("NOT_ASSIGNED_REVIEWER");
  }
  try {
    assertApprovalReviewer_(applicant, reviewer);
  } catch (error) {
    if (normalizeText(error.code) === "REVIEWER_MISMATCH") {
      throw organizationAuthorizationError_("APPROVAL_ROUTE_CHANGED");
    }
    throw error;
  }
}

function requireAttendanceApprovalService_(providedSecret) {
  const expected = normalizeText(PropertiesService.getScriptProperties()
    .getProperty(ATTENDANCE_APPROVAL_SERVICE_SECRET_PROPERTY));
  if (!expected || normalizeText(providedSecret) !== expected) {
    throw organizationAuthorizationError_("SERVICE_AUTH_INVALID");
  }
}

// ===== 勤怠申請の直属承認契約 ここまで =====
