import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const attendanceSource = await readFile(new URL("../backend/attendance-apps-script/Code.gs", import.meta.url), "utf8");
const contractSource = await readFile(new URL("../backend/account-apps-script/attendance_approval_contract.js", import.meta.url), "utf8");
const adminUiSource = await readFile(new URL("../js/attendance-admin/main.js", import.meta.url), "utf8");

test("新規勤怠申請は内部ID・申請版・承認経路版を保存する", () => {
  assert.match(attendanceSource, /phase:\s*"prepare"/);
  assert.match(attendanceSource, /applicant_internal_user_id:\s*approval\.applicant_internal_user_id/);
  assert.match(attendanceSource, /request_version:\s*1/);
  assert.match(attendanceSource, /approval_reviewer_internal_user_id:\s*approval\.approval_reviewer_internal_user_id/);
  assert.match(attendanceSource, /applicant_organization_version:\s*approval\.applicant_organization_version/);
});

test("承認は版一致とDocument Lockを必須にし管理roleの全件承認へ戻さない", () => {
  const reviewFunction = attendanceSource.match(/function reviewRequest_\([\s\S]*?\n}\n\nfunction approvalContractPayload_/)[0];
  assert.match(reviewFunction, /LockService\.getDocumentLock\(\)/);
  assert.match(reviewFunction, /expectedRequestVersion/);
  assert.match(reviewFunction, /VERSION_CONFLICT/);
  assert.doesNotMatch(reviewFunction, /requireAdmin_/);
  assert.match(adminUiSource, /expectedRequestVersion:Number\(reviewRequest\.request_version\)/);
});

test("旧申請は自動変換せず再申請を要求し、異動後は経路再確認へ移す", () => {
  assert.match(attendanceSource, /LEGACY_REQUEST_REAPPLY_REQUIRED/);
  assert.match(attendanceSource, /APPROVAL_ROUTE_CHANGED/);
  assert.match(attendanceSource, /"状態":\s*"経路再確認"/);
  assert.match(contractSource, /normalizeOrganizationVersion_\(applicant\.organization_version\) !== expectedVersion/);
});

test("Account契約はサービス認証後に直属関係を再読取し同一イベントへ開始・完了を記録する", () => {
  assert.match(contractSource, /const phase = normalizeText\(body\.phase\);\s*requireAttendanceApprovalService_\(body\.service_secret\)/);
  assert.match(contractSource, /findOrganizationUserById_\(applicantId\)/);
  assert.match(contractSource, /assertApprovalReviewer_\(applicant, reviewer\)/);
  assert.match(contractSource, /result:\s*"started"/);
  assert.match(contractSource, /authorization_event_id:\s*normalizeText\(body\.authorization_event_id\)/);
  assert.match(contractSource, /source:\s*"attendance"/);
});

test("直属承認契約は自己承認・直属外・申請後の異動を拒否する", () => {
  const context = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "secret" }) },
    Utilities: { getUuid: () => "uuid" },
    ATTENDANCE_APPROVAL_SERVICE_SECRET_PROPERTY: "ATTENDANCE_APPROVAL_SERVICE_SECRET",
    normalizeText: value => String(value ?? "").trim(),
    normalizeOrganizationVersion_: value => Number(value || 0),
    normalizeOrganizationLevel_: value => String(value || ""),
    organizationAuthorizationError_: code => Object.assign(new Error(code), { code }),
    assertApprovalReviewer_: (applicant, reviewer) => {
      if (applicant.internal_user_id === reviewer.internal_user_id) throw Object.assign(new Error("SELF_APPROVAL_FORBIDDEN"), { code: "SELF_APPROVAL_FORBIDDEN" });
      if (applicant.direct_manager_user_id !== reviewer.internal_user_id) throw Object.assign(new Error("REVIEWER_MISMATCH"), { code: "REVIEWER_MISMATCH" });
      return true;
    }
  };
  vm.createContext(context);
  vm.runInContext(contractSource, context);
  const applicant = { internal_user_id: "U-1", organization_level: "member", direct_manager_user_id: "U-L1", organization_version: 3 };
  const reviewer = { internal_user_id: "U-L1", organization_level: "leader" };
  const body = { applicant_organization_version: 3, approval_reviewer_internal_user_id: "U-L1" };
  assert.equal(context.assertAttendanceApprovalRouteUnchanged_(applicant, reviewer, body), undefined);
  assert.throws(() => context.assertAttendanceApprovalRouteUnchanged_(applicant, applicant, { ...body, approval_reviewer_internal_user_id: "U-1" }), /SELF_APPROVAL_FORBIDDEN/);
  assert.throws(() => context.assertAttendanceApprovalRouteUnchanged_(applicant, { internal_user_id: "U-L2" }, { ...body, approval_reviewer_internal_user_id: "U-L2" }), /REVIEWER_MISMATCH/);
  assert.throws(() => context.assertAttendanceApprovalRouteUnchanged_({ ...applicant, organization_version: 4 }, reviewer, body), /APPROVAL_ROUTE_CHANGED/);
});
