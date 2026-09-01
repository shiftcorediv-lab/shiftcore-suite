import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const accountUsersSource = readFileSync(
  new URL("../backend/account-apps-script/account_console_users.js", import.meta.url),
  "utf8"
);
const signupRequestSource = readFileSync(
  new URL("../backend/account-apps-script/signup_request.js", import.meta.url),
  "utf8"
);
const signupAdminSource = readFileSync(
  new URL("../backend/account-apps-script/signup_admin.js", import.meta.url),
  "utf8"
);
const signupUserWriteSource = readFileSync(
  new URL("../backend/account-apps-script/signup_user_write.js", import.meta.url),
  "utf8"
);

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

test("通常作成・申請受付・承認は重複確認と採番を同じScriptLock内で行う", () => {
  const createFunction = accountUsersSource.slice(
    accountUsersSource.indexOf("function accountConsoleCreateUser(body)"),
    accountUsersSource.indexOf("// ===== ユーザー新規作成ここまで =====")
  );
  const submitFunction = signupRequestSource.slice(
    signupRequestSource.indexOf("function submitSignupRequest(payload)"),
    signupRequestSource.indexOf("// ===== 仮登録申請保存ここまで =====")
  );
  const approveFunction = signupAdminSource.slice(
    signupAdminSource.indexOf("function approveSignupRequest(requestId"),
    signupAdminSource.indexOf("// ===== 承認処理ここまで =====")
  );
  const rejectFunction = signupAdminSource.slice(
    signupAdminSource.indexOf("function rejectSignupRequest(requestId"),
    signupAdminSource.indexOf("// ===== 却下処理ここまで =====")
  );

  for (const source of [createFunction, submitFunction, approveFunction, rejectFunction]) {
    assert.match(source, /LockService\.getScriptLock\(\)/);
    assert.match(source, /tryLock\(10000\)/);
    assert.match(source, /finally\s*\{[\s\S]*lock\.releaseLock\(\)/);
  }

  assert.ok(createFunction.indexOf("tryLock(10000)") < createFunction.indexOf("findUserByEmail(email)"));
  assert.ok(createFunction.indexOf("findUserByEmail(email)") < createFunction.indexOf("generateInternalUserId_()"));
  assert.ok(submitFunction.indexOf("tryLock(10000)") < submitFunction.indexOf("hasPendingSignupRequest_"));
  assert.ok(submitFunction.indexOf("hasPendingSignupRequest_") < submitFunction.indexOf("createSignupRequestId_()"));
  assert.ok(approveFunction.indexOf("tryLock(10000)") < approveFunction.indexOf("getSignupRequestById_(requestId)"));
  assert.ok(approveFunction.indexOf("getSignupRequestById_(requestId)") < approveFunction.indexOf("appendUserMasterFromSignup_"));
});

test("申請保存後の通知失敗は申請失敗へ巻き戻さない", () => {
  let released = false;
  let savedRow = null;
  const sheet = {
    getLastRow: () => 1,
    getRange() {
      return {
        setValues(values) {
          savedRow = values[0];
        }
      };
    }
  };
  const context = vm.createContext({
    normalizeText,
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => { released = true; }
      })
    }
  });
  vm.runInContext(signupRequestSource, context);
  context.ensureSignupRequestsHeader_ = () => {};
  context.existsUserByEmail_ = () => false;
  context.hasPendingSignupRequest_ = () => false;
  context.getSignupRequestsSheet = () => sheet;
  context.createSignupRequestId_ = () => "REQ-20260902-0001";
  context.getNowIsoStringJst = () => "2026-09-02 12:00:00";
  context.notifySignupRequest_ = () => { throw new Error("mail failed"); };

  const result = context.submitSignupRequest({
    applicantEmail: "person@example.com",
    applicantName: "申請者",
    applicantType: "internal",
    phone: "09000000000"
  });

  assert.equal(result.success, true);
  assert.equal(result.notificationSent, false);
  assert.equal(result.requestId, "REQ-20260902-0001");
  assert.equal(savedRow[0], "REQ-20260902-0001");
  assert.equal(released, true);
});

test("承認途中で作成済みのユーザーは申請IDから復旧し、再作成しない", () => {
  let released = false;
  let appendCount = 0;
  let appliedChanges = null;
  const context = vm.createContext({
    normalizeText,
    VALID_ACCOUNT_ROLES: ["member", "developer"],
    VALID_ACCOUNT_STATUSES: ["active", "inactive"],
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => { released = true; }
      })
    }
  });
  vm.runInContext(signupAdminSource, context);
  context.assertDeveloperAccountMutationAllowed_ = () => true;
  context.getSignupRequestById_ = () => ({
    row: 2,
    request_id: "REQ-1",
    request_status: "pending_approval",
    applicant_email: "person@example.com",
    applicant_name: "申請者"
  });
  context.findUserBySignupRequestId_ = () => ({
    internal_user_id: "U0007",
    email: "person@example.com",
    role: "member",
    organization_id: "internal",
    status: "active",
    workStatus: "off",
    allowed_modules: "account_console"
  });
  context.existsUserByEmail_ = () => true;
  context.appendUserMasterFromSignup_ = () => {
    appendCount += 1;
    return "U0008";
  };
  context.updateSignupRequestReviewState_ = (_request, changes) => {
    appliedChanges = changes;
  };
  context.beginDeveloperAccountAuthorizationEvent_ = () => "";
  context.completeDeveloperAccountAuthorizationEvent_ = () => {};
  context.getNowIsoStringJst = () => "2026-09-02 12:00:00";
  context.sendSignupApprovedMail_ = () => {};

  const result = context.approveSignupRequest("REQ-1", {
    role: "member",
    organizationId: "internal",
    allowedModules: ["account_console"],
    status: "active",
    workStatus: "off"
  }, "U-ADMIN", { internal_user_id: "U-ADMIN", role: "admin" });

  assert.equal(result.success, true);
  assert.equal(result.repaired, true);
  assert.equal(result.internalUserId, "U0007");
  assert.equal(appendCount, 0);
  assert.equal(appliedChanges.request_status, "approved");
  assert.equal(appliedChanges.linked_internal_user_id, "U0007");
  assert.equal(released, true);
});

test("途中復旧では保存済みユーザーと再試行時の承認内容の差異を拒否する", () => {
  const context = vm.createContext({ normalizeText });
  vm.runInContext(signupAdminSource, context);

  const mismatch = context.getSignupCreatedUserMismatch_({
    email: "person@example.com",
    role: "developer",
    organization_id: "internal",
    status: "active",
    workStatus: "on",
    allowed_modules: "account_console,shift"
  }, {
    applicant_email: "person@example.com"
  }, {
    role: "member",
    organizationId: "internal",
    status: "active",
    workStatus: "on",
    allowedModules: ["shift", "account_console"]
  });

  assert.equal(mismatch, "role");
});

test("申請承認は画面で選んだ稼働状態と申請IDをusers_masterへ保存する", () => {
  let writtenRow = null;
  const headers = [
    "internal_user_id", "employee_code", "email", "name", "role",
    "organization_id", "status", "allowed_modules", "workStatus", "work_status",
    "engagement_status", "signup_request_id"
  ];
  const sheet = {
    getLastColumn: () => headers.length,
    getLastRow: () => 1,
    getRange(row) {
      if (row === 1) {
        return { getDisplayValues: () => [headers] };
      }
      return { setValues: values => { writtenRow = values[0]; } };
    }
  };
  const context = vm.createContext({ normalizeText });
  vm.runInContext(signupUserWriteSource, context);
  context.getUsersSheet = () => sheet;
  context.createNextInternalUserId_ = () => "U0001";
  context.createNextEmployeeCode_ = () => "AN0001";
  context.beginDeveloperAccountAuthorizationEvent_ = () => "";
  context.completeDeveloperAccountAuthorizationEvent_ = () => {};

  const userId = context.appendUserMasterFromSignup_({
    request_id: "REQ-1",
    applicant_email: "person@example.com",
    applicant_name: "申請者"
  }, {
    role: "member",
    organizationId: "internal",
    status: "active",
    allowedModules: ["account_console"],
    workStatus: "off"
  }, { internal_user_id: "U-ADMIN" });

  const rowObject = Object.fromEntries(headers.map((header, index) => [header, writtenRow[index]]));
  assert.equal(userId, "U0001");
  assert.equal(rowObject.workStatus, "off");
  assert.equal(rowObject.work_status, "off");
  assert.equal(rowObject.engagement_status, "inactive");
  assert.equal(rowObject.signup_request_id, "REQ-1");
});

test("申請状態は4セル分割ではなく1行の単一書込みで確定する", () => {
  let setValuesCount = 0;
  let setValueCount = 0;
  let written = null;
  const headers = [
    "request_id", "request_status", "reviewed_at", "reviewed_by", "linked_internal_user_id"
  ];
  const row = ["REQ-1", "pending_approval", "", "", ""];
  const sheet = {
    getLastColumn: () => headers.length,
    getRange(targetRow) {
      if (targetRow === 2) {
        return {
          getValues: () => [row.slice()],
          setValues(values) {
            setValuesCount += 1;
            written = values[0];
          },
          setValue() { setValueCount += 1; }
        };
      }
      return {};
    }
  };
  const context = vm.createContext({ normalizeText });
  vm.runInContext(signupAdminSource, context);
  context.getSignupRequestsSheet = () => sheet;
  context.getHeaderMap_ = () => Object.fromEntries(headers.map((header, index) => [header, index + 1]));

  context.updateSignupRequestReviewState_({ row: 2 }, {
    request_status: "approved",
    reviewed_at: "2026-09-02 12:00:00",
    reviewed_by: "U-ADMIN",
    linked_internal_user_id: "U0001"
  });

  assert.equal(setValuesCount, 1);
  assert.equal(setValueCount, 0);
  assert.deepEqual(Array.from(written), [
    "REQ-1", "approved", "2026-09-02 12:00:00", "U-ADMIN", "U0001"
  ]);
});
