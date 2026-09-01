import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { buildPersonnelIcs } from "../../shiftbuilder/js/shiftbuilder/export-utils.mjs";

const orderServiceSource = readFileSync(
  new URL("../backend/ordercase-apps-script/Service_Cases.js", import.meta.url),
  "utf8"
);
const createPageSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const editPageSource = readFileSync(new URL("../edit.html", import.meta.url), "utf8");
const shiftRepositorySource = readFileSync(
  new URL("../../shiftbuilder/backend/shiftbuilder-apps-script/repositore.js", import.meta.url),
  "utf8"
);
const attendanceSource = readFileSync(
  new URL("../../account-console/backend/attendance-apps-script/Code.gs", import.meta.url),
  "utf8"
);
const dashboardSource = readFileSync(
  new URL("../../account-console/js/dashboard/main.js", import.meta.url),
  "utf8"
);
const caseDetailSource = readFileSync(new URL("../case.html", import.meta.url), "utf8");

function formatJst(date, format) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
  if (format === "yyyy-MM-dd") return `${parts.year}-${parts.month}-${parts.day}`;
  return `${parts.hour}:${parts.minute}`;
}

function assertInlineScriptsCompile(html, filename) {
  const scriptPattern = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptPattern.exec(html)) !== null) {
    if (/\bsrc\s*=/.test(match[1])) continue;
    new vm.Script(match[2], { filename });
  }
}

test("Orderは終了が早い時刻なら翌日扱いとし、同時刻と不正形式を拒否する", () => {
  const context = vm.createContext({ Date, JSON, Object, Array, Number, String, isFinite });
  vm.runInContext(orderServiceSource, context);

  assert.equal(context.validateWorkTimeRange_("10:00", "18:00", "基本時間"), false);
  assert.equal(context.validateWorkTimeRange_("22:00", "01:00", "夜間時間"), true);
  assert.throws(
    () => context.validateWorkTimeRange_("10:00", "10:00", "基本時間"),
    /同じにはできません/
  );
  assert.throws(
    () => context.validateWorkTimeRange_("25:00", "01:00", "基本時間"),
    /HH:mm/
  );
});

test("Orderの作成・編集画面は日跨ぎを明示し、保存前に確認する", () => {
  for (const source of [createPageSource, editPageSource]) {
    assert.match(source, /終了が開始より早い時刻の場合は、翌日の終了として扱います/);
    assert.match(source, /終了時刻は翌日として扱われます/);
    assert.doesNotMatch(source, /work_end_time\s*<=\s*payload\.work_start_time/);
  }
  assert.match(createPageSource, /confirmOvernightWorkPayload/);
  assert.match(editPageSource, /confirmOvernightUpdatePayload/);
  assertInlineScriptsCompile(createPageSource, "ordercase/index.html");
  assertInlineScriptsCompile(editPageSource, "ordercase/edit.html");
  assert.match(caseDetailSource, /formatWorkEndTime/);
  assert.match(caseDetailSource, /（翌日）/);
  assertInlineScriptsCompile(caseDetailSource, "ordercase/case.html");
});

test("Shiftは日別アサイン時刻を優先し、夜間勤務のICS終了日を翌日にする", () => {
  const person = {
    displayName: "夜勤担当",
    assignmentsByDate: {
      "2026-09-10": [{
        caseId: "CASE-1",
        assignmentId: "ASSIGN-1",
        start_time: "22:00",
        end_time: "01:00"
      }]
    }
  };
  const shiftData = {
    cases: [{ caseId: "CASE-1", start_time: "09:00", end_time: "18:00" }]
  };

  const ics = buildPersonnelIcs(person, shiftData, new Date("2026-09-01T00:00:00Z"));
  assert.match(ics, /DTSTART;TZID=Asia\/Tokyo:20260910T220000/);
  assert.match(ics, /DTEND;TZID=Asia\/Tokyo:20260911T010000/);
});

test("Orderの日別時刻はShiftのセルとAttendance予定へ同じ値で連携される", () => {
  assert.match(
    shiftRepositorySource,
    /start_time:\s*normalizeTimeString\(dateRow\.work_start_time\)\s*\|\|\s*normalizeTimeString\(caseRow\.work_start_time\)/
  );
  assert.match(
    shiftRepositorySource,
    /end_time:\s*normalizeTimeString\(dateRow\.work_end_time\)\s*\|\|\s*normalizeTimeString\(caseRow\.work_end_time\)/
  );
  assert.match(attendanceSource, /"予定開始": cell\.start_time \|\| cell\.startTime/);
  assert.match(attendanceSource, /"予定終了": cell\.end_time \|\| cell\.endTime/);
});

test("Attendanceは日跨ぎの予定終了までは通常終了、超過後は承認対象にする", () => {
  const context = vm.createContext({
    Utilities: {
      formatDate: (date, _timezone, format) => formatJst(date, format)
    },
    console
  });
  vm.runInContext(attendanceSource, context);

  const schedule = {
    "勤務日": "2026-09-10",
    "予定開始": "22:00",
    "予定終了": "01:00"
  };
  const planned = context.buildTimingStatus_(schedule, new Date("2026-09-11T01:00:00+09:00"));

  assert.equal(planned.plannedEnd, "2026-09-10T16:00:00.000Z");
  assert.equal(planned.endApprovalRequired, false);
  assert.equal(
    context.buildTimingStatus_(schedule, new Date("2026-09-11T01:00:00.001+09:00")).endApprovalRequired,
    true
  );
  assert.match(dashboardSource, /function plannedTimeText\(schedule\)/);
  assert.match(dashboardSource, /（翌日）/);
  assert.doesNotMatch(dashboardSource, /0:00以降の終了報告/);
});
