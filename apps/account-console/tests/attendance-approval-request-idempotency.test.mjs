import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const attendanceSource = await readFile(
  new URL("../backend/attendance-apps-script/Code.gs", import.meta.url),
  "utf8"
);

function requestContext() {
  const requests = [];
  const approvalCalls = [];
  let uuid = 0;
  let failNextAppend = false;
  let lockHeld = false;
  const context = vm.createContext({
    console,
    Date,
    JSON,
    SpreadsheetApp: {},
    PropertiesService: {},
    UrlFetchApp: {},
    ContentService: {},
    MailApp: {},
    Session: {},
    LockService: {
      getDocumentLock: () => ({
        waitLock: () => { lockHeld = true; },
        releaseLock: () => { lockHeld = false; }
      })
    },
    Utilities: {
      getUuid: () => `REQ-${++uuid}`,
      formatDate: () => "2026-09-02"
    }
  });
  vm.runInContext(attendanceSource, context);
  context.rows_ = name => name === "修正・予定外申請" ? requests.map(row => ({ ...row })) : [];
  context.ensureRequestContractHeaders_ = () => {};
  context.appendObject_ = (_sheetName, row) => {
    if (failNextAppend) {
      failNextAppend = false;
      throw Object.assign(new Error("request append failed"), { code: "REQUEST_APPEND_FAILED" });
    }
    requests.push({ ...row });
  };
  context.invalidateAllDashboardReferenceCache_ = () => {};
  context.accountApprovalRequest_ = payload => {
    approvalCalls.push({ ...payload, lockHeld });
    return {
      ok: true,
      applicant_internal_user_id: "U-1",
      approval_reviewer_internal_user_id: "U-L1",
      applicant_organization_version: 3
    };
  };
  return {
    context,
    requests,
    approvalCalls,
    failNextAppend: () => { failNextAppend = true; }
  };
}

const user = {
  internal_user_id: "U-1",
  email: "member@example.com",
  name: "本人"
};

function requestPayload(overrides = {}) {
  return {
    recordId: "REC-1",
    type: "入店遅延報告",
    workDate: "2026-09-02",
    actualStart: new Date("2026-09-02T10:00:00+09:00"),
    reasonType: "その他",
    reason: "通信失敗後の申請復旧",
    ...overrides
  };
}

test("保存済み打刻の承認申請が欠けた場合は再送で1件だけ復旧する", () => {
  const fixture = requestContext();
  fixture.failNextAppend();
  assert.throws(
    () => fixture.context.ensureStoredApprovalRequest_(user, "TOKEN", requestPayload()),
    error => error.code === "REQUEST_APPEND_FAILED"
  );
  assert.equal(fixture.requests.length, 0);

  const repaired = fixture.context.ensureStoredApprovalRequest_(user, "TOKEN", requestPayload());
  const duplicate = fixture.context.ensureStoredApprovalRequest_(user, "TOKEN", requestPayload());
  assert.equal(repaired, "REQ-2");
  assert.equal(duplicate, "REQ-2");
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.requests[0].record_id, "REC-1");
  assert.equal(fixture.requests[0]["申請開始"].toISOString(), "2026-09-02T01:00:00.000Z");
  assert.equal(fixture.approvalCalls.length, 2);
  assert.equal(fixture.approvalCalls.some(call => call.lockHeld), false);
});

test("既存申請がある再送はAccount承認経路を再取得せず同じIDを返す", () => {
  const fixture = requestContext();
  fixture.requests.push({
    request_id: "REQ-EXISTING",
    record_id: "REC-1",
    "種別": "入店遅延報告",
    "状態": "申請中"
  });
  const result = fixture.context.ensureStoredApprovalRequest_(user, "TOKEN", requestPayload());
  assert.equal(result, "REQ-EXISTING");
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.approvalCalls.length, 0);
});

test("承認経路確認中に別送信が申請を作ってもロック内再確認で重複させない", () => {
  const fixture = requestContext();
  fixture.context.accountApprovalRequest_ = () => {
    fixture.requests.push({
      request_id: "REQ-RACE",
      record_id: "REC-1",
      "種別": "入店遅延報告",
      "状態": "申請中"
    });
    return {
      ok: true,
      applicant_internal_user_id: "U-1",
      approval_reviewer_internal_user_id: "U-L1",
      applicant_organization_version: 3
    };
  };
  const result = fixture.context.ensureStoredApprovalRequest_(user, "TOKEN", requestPayload());
  assert.equal(result, "REQ-RACE");
  assert.equal(fixture.requests.length, 1);
});

test("入店と日付またぎ終了の再送分岐は保存済み時刻から欠損申請を修復する", () => {
  const arriveSource = attendanceSource.match(/function arrive_\([\s\S]*?\n}\n\nfunction createClockInRecord_/)[0];
  const clockOutSource = attendanceSource.match(/function clockOut_\([\s\S]*?\n}\n\nfunction createApprovalRequestIfMissing_/)[0];
  assert.match(arriveSource, /"入店承認待ち"/);
  assert.match(arriveSource, /ensureStoredApprovalRequest_/);
  assert.match(arriveSource, /actualStart:\s*previousRecord\["実開始"\]/);
  assert.match(clockOutSource, /"終了承認待ち"/);
  assert.match(clockOutSource, /ensureStoredApprovalRequest_/);
  assert.match(clockOutSource, /actualEnd:\s*recordBeforeLock\["実終了"\]/);
});
