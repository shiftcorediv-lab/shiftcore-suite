import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const attendanceSource = await readFile(
  new URL("../backend/attendance-apps-script/Code.gs", import.meta.url),
  "utf8"
);
const dashboardSource = await readFile(
  new URL("../js/dashboard/main.js", import.meta.url),
  "utf8"
);

function correctionContext({ records = [] } = {}) {
  const appended = [];
  const approvalCalls = [];
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
      getDocumentLock: () => ({ waitLock: () => {}, releaseLock: () => {} })
    },
    Utilities: {
      getUuid: () => `REQ-${appended.length + 1}`,
      formatDate: (date, _timezone, format) => {
        if (format !== "yyyy-MM-dd") return "2026/09/02 10:00";
        return new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(date);
      }
    }
  });
  vm.runInContext(attendanceSource, context);
  context.rows_ = name => {
    if (name === "勤怠記録") return records.map(record => ({ ...record }));
    if (name === "修正・予定外申請") return [];
    return [];
  };
  context.accountApprovalRequest_ = payload => {
    approvalCalls.push(payload);
    return {
      ok: true,
      applicant_internal_user_id: "U-1",
      approval_reviewer_internal_user_id: "U-L1",
      applicant_organization_version: 2
    };
  };
  context.ensureRequestContractHeaders_ = () => {};
  context.appendObject_ = (_sheetName, row) => appended.push(row);
  context.notifyManagers_ = () => {};
  context.invalidateAllDashboardReferenceCache_ = () => {};
  return { context, appended, approvalCalls };
}

const user = {
  internal_user_id: "U-1",
  email: "member@example.com",
  name: "本人"
};

test("訂正申請は他人または存在しない勤怠記録を承認経路へ送らない", () => {
  const fixture = correctionContext({
    records: [{
      record_id: "REC-OTHER",
      email: "other@example.com",
      "勤務日": "2026-09-02",
      "実開始": "2026-09-02T10:00:00+09:00"
    }]
  });

  for (const recordId of ["REC-OTHER", "REC-MISSING"]) {
    assert.throws(
      () => fixture.context.submitCorrection_(user, {
        type: "終了修正",
        recordId,
        actualEnd: "2026-09-02T18:00",
        reason: "終了報告を押し忘れた"
      }, "TOKEN"),
      error => error.code === "CORRECTION_RECORD_FORBIDDEN"
    );
  }
  assert.equal(fixture.approvalCalls.length, 0);
  assert.equal(fixture.appended.length, 0);
});

test("訂正申請は種別・対象時刻・理由をサーバー側で検証する", () => {
  const fixture = correctionContext({
    records: [{
      record_id: "REC-1",
      email: "member@example.com",
      "勤務日": "2026-09-02",
      "実開始": "2026-09-02T10:00:00+09:00"
    }]
  });
  const base = { recordId: "REC-1", reason: "押下を忘れた" };

  assert.throws(
    () => fixture.context.submitCorrection_(user, { ...base, type: "自由入力", actualEnd: "2026-09-02T18:00" }, "TOKEN"),
    error => error.code === "CORRECTION_TYPE_INVALID"
  );
  assert.throws(
    () => fixture.context.submitCorrection_(user, { ...base, type: "終了修正", actualEnd: "not-a-date" }, "TOKEN"),
    error => error.code === "CORRECTION_TIME_INVALID"
  );
  assert.throws(
    () => fixture.context.submitCorrection_(user, { ...base, type: "終了修正", actualEnd: "2026-09-04T18:00" }, "TOKEN"),
    error => error.code === "CORRECTION_DATE_MISMATCH"
  );
  assert.throws(
    () => fixture.context.submitCorrection_(user, { ...base, type: "終了修正", actualEnd: "2026-09-02T09:00" }, "TOKEN"),
    error => error.code === "CORRECTION_TIME_ORDER_INVALID"
  );
  assert.throws(
    () => fixture.context.submitCorrection_(user, { ...base, type: "終了修正", actualEnd: "2026-09-02T18:00", reason: "" }, "TOKEN"),
    error => error.code === "CORRECTION_REASON_REQUIRED"
  );
  assert.throws(
    () => fixture.context.submitCorrection_(user, { ...base, type: "終了修正", actualEnd: "2026-09-02T18:00", reasonType: "任意分類" }, "TOKEN"),
    error => error.code === "CORRECTION_REASON_TYPE_INVALID"
  );
  assert.equal(fixture.approvalCalls.length, 0);
  assert.equal(fixture.appended.length, 0);
});

test("既存記録の訂正は勤務日と本人情報をサーバー正本から保存する", () => {
  const fixture = correctionContext({
    records: [{
      record_id: "REC-1",
      email: " Member@Example.com ",
      "勤務日": "2026-09-02",
      "実開始": "2026-09-02T10:00:00+09:00"
    }]
  });
  const result = fixture.context.submitCorrection_(user, {
    type: "終了修正",
    recordId: "REC-1",
    workDate: "1999-01-01",
    actualEnd: "2026-09-02T18:00",
    reasonType: "その他",
    reason: "終了報告を押し忘れた"
  }, "TOKEN");

  assert.equal(result.ok, true);
  assert.equal(fixture.appended.length, 1);
  assert.equal(fixture.appended[0].record_id, "REC-1");
  assert.equal(fixture.appended[0]["実勤務日"], "2026-09-02");
  assert.equal(fixture.appended[0]["申請開始"], "");
  assert.equal(fixture.appended[0]["申請終了"].toISOString(), "2026-09-02T09:00:00.000Z");
  assert.equal(fixture.appended[0]["申請者メール"], "member@example.com");
});

test("記録未作成の訂正は孤立した承認申請を作らず拒否する", () => {
  const fixture = correctionContext();
  assert.throws(
    () => fixture.context.submitCorrection_(user, {
      type: "開始修正",
      actualStart: "2026-09-02T10:00",
      reason: "入店報告を押し忘れた"
    }, "TOKEN"),
    error => error.code === "CORRECTION_RECORD_REQUIRED"
  );
  assert.equal(fixture.approvalCalls.length, 0);
  assert.equal(fixture.appended.length, 0);
  assert.match(attendanceSource, /CORRECTION_RECORD_REQUIRED/);
  assert.match(dashboardSource, /\$\("correctionBtn"\)\.hidden = !record/);
});
