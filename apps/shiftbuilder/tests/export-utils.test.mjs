import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCaseCsv,
  buildCaseCsvFilename,
  buildPersonnelIcs,
  sanitizeFilenamePart
} from "../js/shiftbuilder/export-utils.mjs";

test("案件CSVは案件ごとに1行で日別配置を横持ちする", () => {
  const csv = buildCaseCsv({
    caseId: "CASE-1",
    title: "福岡/販売",
    client: "代理店",
    area: "福岡",
    cells: {
      "2026-08-01": {
        required: 2,
        assigned: [
          { family_name: "山田", given_name: "花子", assignment_status: "assigned" },
          { name: "=危険", assignment_status: "saving", is_pending: true }
        ]
      }
    }
  }, [{ date: "2026-08-01", label: "8/1", weekday: "土" }]);
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /"8\/1 必要人数","8\/1 配置人数","8\/1 配置者"/);
  assert.match(csv, /"2","1","山田 花子"/);
  assert.equal(csv.trim().split("\r\n").length, 2);
});

test("案件CSVファイル名は指定形式で禁止文字を除去する", () => {
  assert.equal(
    buildCaseCsvFilename({ title: "福岡/A店:販売" }, "2026-08"),
    "(株)弊社名_2608福岡A店販売シフト.csv"
  );
  assert.equal(sanitizeFilenamePart(" A / B "), "AB");
});

test("ICSは時間予定と終日予定を生成する", () => {
  const person = {
    displayName: "山田 花子",
    assignmentsByDate: {
      "2026-08-01": [{ caseId: "CASE-1", caseTitle: "販売", assignmentId: "A-1" }],
      "2026-08-02": [{ caseId: "CASE-2", caseTitle: "催事", assignmentId: "A-2" }]
    }
  };
  const ics = buildPersonnelIcs(person, {
    cases: [
      { caseId: "CASE-1", title: "販売", start_time: "09:00", end_time: "18:00" },
      { caseId: "CASE-2", title: "催事" }
    ]
  }, new Date("2026-07-31T00:00:00Z"));
  assert.match(ics, /DTSTART;TZID=Asia\/Tokyo:20260801T090000/);
  assert.match(ics, /DTEND;TZID=Asia\/Tokyo:20260801T180000/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260802/);
  assert.match(ics, /DTEND;VALUE=DATE:20260803/);
  assert.match(ics, /UID:A-1@shiftcore/);
});
