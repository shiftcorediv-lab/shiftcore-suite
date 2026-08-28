import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const backendSource = readFileSync(new URL("../backend/attendance-apps-script/Code.gs", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../js/dashboard/main.js", import.meta.url), "utf8");
const dashboardHtml = readFileSync(new URL("../dashboard.html", import.meta.url), "utf8");

function formatJst(date, format) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
  if (format === "yyyy-MM-dd") return `${parts.year}-${parts.month}-${parts.day}`;
  if (format === "HH:mm") return `${parts.hour}:${parts.minute}`;
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function timingContext() {
  const context = vm.createContext({ Utilities: { formatDate: (date, _tz, format) => formatJst(date, format) }, console });
  vm.runInContext(backendSource, context);
  return context;
}

function schedule() { return { "勤務日": "2026-08-28", "予定開始": "10:00", "予定終了": "18:00" }; }

test("出発リミットは1時間前ちょうどを警告せず直後だけ警告する", () => {
  const context = timingContext();
  assert.equal(context.buildTimingStatus_(schedule(), new Date("2026-08-28T09:00:00+09:00")).departureWarning, false);
  assert.equal(context.buildTimingStatus_(schedule(), new Date("2026-08-28T09:00:00.001+09:00")).departureWarning, true);
});

test("入店は15分前超過で警告し予定開始ちょうどから承認必須", () => {
  const context = timingContext();
  assert.equal(context.buildTimingStatus_(schedule(), new Date("2026-08-28T09:45:00+09:00")).arrivalWarning, false);
  assert.equal(context.buildTimingStatus_(schedule(), new Date("2026-08-28T09:45:00.001+09:00")).arrivalWarning, true);
  assert.equal(context.buildTimingStatus_(schedule(), new Date("2026-08-28T09:59:59.999+09:00")).arrivalApprovalRequired, false);
  assert.equal(context.buildTimingStatus_(schedule(), new Date("2026-08-28T10:00:00+09:00")).arrivalApprovalRequired, true);
});

test("終了注意は予定終了1時間後ちょうどを含まず直後から", () => {
  const context = timingContext();
  assert.equal(context.buildTimingStatus_(schedule(), new Date("2026-08-28T19:00:00+09:00")).endWarning, false);
  assert.equal(context.buildTimingStatus_(schedule(), new Date("2026-08-28T19:00:00.001+09:00")).endWarning, true);
});

test("23:59は通常終了で翌日0:00ちょうどから承認必須", () => {
  const context = timingContext();
  assert.equal(context.buildTimingStatus_(schedule(), new Date("2026-08-28T23:59:59.999+09:00")).endApprovalRequired, false);
  assert.equal(context.buildTimingStatus_(schedule(), new Date("2026-08-29T00:00:00+09:00")).endApprovalRequired, true);
});

test("日付またぎ予定の終了予定日時を翌日として計算する", () => {
  const context = timingContext();
  const result = context.buildTimingStatus_({ "勤務日": "2026-08-28", "予定開始": "22:00", "予定終了": "01:00" }, new Date("2026-08-29T01:00:00+09:00"));
  assert.equal(result.plannedEnd, "2026-08-28T16:00:00.000Z");
  assert.equal(result.endApprovalRequired, true);
});

test("入店前に出発を必須とし遅い入店と0時以降終了を直属承認へ接続する", () => {
  assert.match(backendSource, /DEPARTURE_REPORT_REQUIRED/);
  assert.match(backendSource, /arrivalApprovalRequired \? accountApprovalRequest_/);
  assert.match(backendSource, /endApprovalRequired \? accountApprovalRequest_/);
  assert.match(backendSource, /"入店承認待ち"/);
  assert.match(backendSource, /"終了承認待ち"/);
  assert.match(backendSource, /createApprovalRequestIfMissing_/);
});

test("利用者画面は1つの主操作が出発・入店・終了報告へ遷移する", () => {
  assert.match(dashboardSource, /name: "departure", label: "出発"/);
  assert.match(dashboardSource, /name: "arrival", label: "入店"/);
  assert.match(dashboardSource, /name: "completion", label: "終了報告"/);
  assert.match(dashboardSource, /attendanceRequest\("arrive"/);
  assert.match(dashboardSource, /attendanceRequest\("clockOut"/);
  assert.equal((dashboardHtml.match(/id="startBtn"/g) || []).length, 1);
  assert.doesNotMatch(dashboardHtml, /id="departureBtn"|id="arrivalBtn"|id="endBtn"/);
  assert.doesNotMatch(dashboardHtml, />稼働終了</);
});

test("同日複数予定は選択したschedule_idを画面・現場報告・勤怠記録へ維持する", () => {
  assert.match(dashboardHtml, /id="scheduleSelect"/);
  assert.match(dashboardSource, /selectedScheduleId/);
  assert.match(backendSource, /ensureRecordContractHeaders_/);
  assert.match(backendSource, /updateById_\(SHEETS\.records, "record_id", recordId, \{ schedule_id:/);
  assert.match(backendSource, /schedule_id: schedule\.schedule_id/);
});

test("実時刻は承認前に保存し承認後は既存の正式時刻へ反映する", () => {
  assert.match(backendSource, /createClockInRecord_/);
  assert.match(backendSource, /"実終了": now/);
  assert.match(backendSource, /formalChanges\["正式開始"\] = request\["申請開始"\]/);
  assert.match(backendSource, /formalChanges\["正式終了"\] = request\["申請終了"\]/);
});

test("旧clockIn経路でも予定勤務は出発報告なしに開始できない", () => {
  const context = timingContext();
  context.LockService = { getDocumentLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) };
  context.settings_ = () => ({ start_limit_time: "23:59", start_warning_time: "23:58" });
  context.today_ = () => "2026-08-28";
  context.timeKey_ = () => "09:00";
  context.findRecord_ = () => null;
  context.findSchedule_ = () => ({ schedule_id: "SCHEDULE-1" });
  assert.throws(() => context.clockIn_({ email: "member@example.com" }, { scheduleId: "SCHEDULE-1" }, "token"), error => error.code === "DEPARTURE_REPORT_REQUIRED");
});

test("同日複数予定ではschedule_idなしの旧記録を別予定へ流用しない", () => {
  const context = timingContext();
  context.rows_ = () => [
    { email: "member@example.com", "勤務日": "2026-08-28", schedule_id: "", record_id: "LEGACY" },
    { email: "member@example.com", "勤務日": "2026-08-28", schedule_id: "SCHEDULE-2", record_id: "SECOND" }
  ];
  assert.equal(context.findRecord_("member@example.com", "2026-08-28", "SCHEDULE-1"), null);
  assert.equal(context.findRecord_("member@example.com", "2026-08-28", "SCHEDULE-2").record_id, "SECOND");
});

test("終了済み案件は同日の次予定の選択を妨げない", () => {
  const context = timingContext();
  const schedules = [
    { email: "member@example.com", schedule_id: "SCHEDULE-1" },
    { email: "member@example.com", schedule_id: "SCHEDULE-2" }
  ];
  const records = [
    { email: "member@example.com", schedule_id: "SCHEDULE-1", "実開始": "10:00", "実終了": "11:00" },
    { email: "member@example.com", schedule_id: "SCHEDULE-2" }
  ];
  assert.equal(context.findScheduleRecordIn_(records, schedules[1], schedules).schedule_id, "SCHEDULE-2");
});

test("前日出発済みで未入店のschedule_idを日付変更後も引き継ぐ", () => {
  const context = timingContext();
  context.rows_ = () => [
    { "勤務日": "2026-08-28", schedule_id: "NIGHT-1", "報告種別": "出発", "報告者メール": "member@example.com" }
  ];
  assert.equal(context.findPendingOvernightReport_({ email: "member@example.com" }, "2026-08-29").schedule_id, "NIGHT-1");
});
