// ===== 勤怠申請の直属承認契約 ここから =====

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
    appendAuthorizationChangeLog_({
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
      appendAuthorizationChangeLog_({
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
  const reviewer = resolveAttendanceReviewer_(body.idToken);
  const applicant = findOrganizationUserById_(normalizeText(body.applicant_internal_user_id));
  assertAttendanceApprovalRouteUnchanged_(applicant, reviewer, body);
  const succeeded = normalizeText(body.result || "success") === "success";
  appendAuthorizationChangeLog_({
    authorization_event_id: normalizeText(body.authorization_event_id),
    event_type: "approval.review",
    request_id: normalizeText(body.request_id),
    actor_internal_user_id: reviewer.internal_user_id,
    target_internal_user_id: applicant.internal_user_id,
    reviewer_internal_user_id: reviewer.internal_user_id,
    before: { status: "pending", request_version: Number(body.request_version) },
    after: { status: succeeded ? normalizeText(body.result_status) : "pending", request_version: succeeded ? Number(body.request_version) + 1 : Number(body.request_version) },
    reason: normalizeText(body.reason) || normalizeText(body.decision),
    result: normalizeText(body.result || "success"),
    error_code: normalizeText(body.error_code),
    source: "attendance"
  });
  return { ok: true };
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
    throw organizationAuthorizationError_("APPROVAL_ROUTE_CHANGED");
  }
  assertApprovalReviewer_(applicant, reviewer);
}

function requireAttendanceApprovalService_(providedSecret) {
  const expected = normalizeText(PropertiesService.getScriptProperties()
    .getProperty(ATTENDANCE_APPROVAL_SERVICE_SECRET_PROPERTY));
  if (!expected || normalizeText(providedSecret) !== expected) {
    throw organizationAuthorizationError_("SERVICE_AUTH_INVALID");
  }
}

// ===== 勤怠申請の直属承認契約 ここまで =====
