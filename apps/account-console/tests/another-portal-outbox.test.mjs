import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("../backend/attendance-apps-script/Code.gs", import.meta.url),
  "utf8"
);

function loadAttendanceScript() {
  const context = vm.createContext({
    console,
    Utilities: {
      Charset: { UTF_8: "UTF_8" },
      DigestAlgorithm: { SHA_256: "SHA_256" },
      getUuid: () => "00000000-0000-4000-8000-000000000001",
      formatDate: (date, _timezone, pattern) => {
        if (pattern === "yyyy-MM-dd") return date.toISOString().slice(0, 10);
        if (pattern === "yyyy-MM-dd'T'HH:mm:ssXXX") {
          return date.toISOString().replace("Z", "+09:00");
        }
        return date.toISOString();
      }
    }
  });
  vm.runInContext(source, context);
  return context;
}

test("Portalイベントへ位置情報・メール・IDトークンを含めない", () => {
  const context = loadAttendanceScript();
  const event = context.buildPortalAttendanceEvent_(
    "attendance.started",
    {
      internal_user_id: "usr_001",
      employee_code: "AN0001",
      display_name: "テスト利用者",
      organization_id: "org_001",
      email: "must-not-be-sent@example.com",
      idToken: "must-not-be-sent"
    },
    {
      record_id: "record_001",
      "勤務日": "2026-08-23",
      "実開始": new Date("2026-08-23T00:00:00.000Z"),
      "実終了": "",
      "予定場所": "Another 店",
      latitude: 35.0,
      longitude: 139.0
    }
  );

  assert.equal(event.event_id, "evt_00000000-0000-4000-8000-000000000001");
  assert.equal(event.attendance.state, "working");
  assert.equal(event.attendance.ended_at, null);
  assert.equal(event.workplace.label, "Another 店");
  assert.equal(event.subject.internal_user_id, "usr_001");

  const serialized = JSON.stringify(event);
  assert.doesNotMatch(serialized, /must-not-be-sent/);
  assert.doesNotMatch(serialized, /latitude|longitude|idToken|email/);
});

test("退勤イベントは終了時刻とended状態を持つ", () => {
  const context = loadAttendanceScript();
  const event = context.buildPortalAttendanceEvent_(
    "attendance.ended",
    {
      internal_user_id: "usr_001",
      employee_code: "AN0001",
      display_name: "テスト利用者",
      organization_id: "org_001"
    },
    {
      record_id: "record_001",
      "勤務日": "2026-08-23",
      "実開始": new Date("2026-08-23T00:00:00.000Z"),
      "実終了": new Date("2026-08-23T09:00:00.000Z"),
      "予定場所": "Another 店"
    }
  );

  assert.equal(event.event_type, "attendance.ended");
  assert.equal(event.attendance.state, "ended");
  assert.equal(typeof event.attendance.ended_at, "string");
  assert.equal(event.occurred_at, event.attendance.ended_at);
});

test("所属や社員情報が不足したイベントを生成しない", () => {
  const context = loadAttendanceScript();
  assert.throws(
    () => context.buildPortalAttendanceEvent_(
      "attendance.started",
      { internal_user_id: "usr_001" },
      {
        record_id: "record_001",
        "勤務日": "2026-08-23",
        "実開始": new Date("2026-08-23T00:00:00.000Z"),
        "予定場所": "Another 店"
      }
    ),
    error => error && error.code === "PORTAL_SUBJECT_INCOMPLETE"
  );
});

test("Outbox再送間隔は上限6時間で段階的に増える", () => {
  const context = loadAttendanceScript();
  assert.deepEqual(
    [1, 2, 3, 4, 5, 99].map(context.portalRetryDelayMs_),
    [60000, 300000, 900000, 3600000, 21600000, 21600000]
  );
});

test("GASの符号付きバイト列を小文字hexへ変換する", () => {
  const context = loadAttendanceScript();
  assert.equal(context.portalHex_([-1, 0, 15, 16, 127, -128]), "ff000f107f80");
});

test("勤怠成功後のPortal連携失敗は勤怠例外へ変換しない", () => {
  assert.match(source, /function enqueuePortalAttendanceEventSafely_\(/);
  assert.match(source, /sync: "pending_recovery"/);
  assert.match(source, /portal: enqueuePortalAttendanceEventSafely_\("attendance\.started"/);
  assert.match(source, /portal: enqueuePortalAttendanceEventSafely_\("attendance\.ended"/);
});
