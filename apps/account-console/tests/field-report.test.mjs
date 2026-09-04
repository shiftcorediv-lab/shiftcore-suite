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
  assert.equal(result.endApprovalRequired, false);
  assert.equal(
    context.buildTimingStatus_(
      { "勤務日": "2026-08-28", "予定開始": "22:00", "予定終了": "01:00" },
      new Date("2026-08-29T01:00:00.001+09:00")
    ).endApprovalRequired,
    true
  );
});

test("開始・終了が同時刻の予定は24時間勤務と推測せず拒否する", () => {
  const context = timingContext();
  assert.throws(
    () => context.buildTimingStatus_(
      { "勤務日": "2026-08-28", "予定開始": "10:00", "予定終了": "10:00" },
      new Date("2026-08-28T10:00:00+09:00")
    ),
    error => error.code === "SCHEDULE_TIME_INVALID"
  );
});

test("入店前に出発と最寄り到着を必須とし遅い入店と0時以降終了を直属承認へ接続する", () => {
  assert.match(backendSource, /DEPARTURE_REPORT_REQUIRED/);
  assert.match(backendSource, /NEAREST_ARRIVAL_REPORT_REQUIRED/);
  assert.match(backendSource, /arrivalApprovalRequired \? accountApprovalRequest_/);
  assert.match(backendSource, /endApprovalRequired \? accountApprovalRequest_/);
  assert.match(backendSource, /"入店承認待ち"/);
  assert.match(backendSource, /"終了承認待ち"/);
  assert.match(backendSource, /createApprovalRequestIfMissing_/);
});

test("利用者画面は1つの主操作が出発・最寄り到着・入店・終了報告へ遷移する", () => {
  assert.match(dashboardSource, /name: "departure", label: "出発"/);
  assert.match(dashboardSource, /name: "nearestArrival", label: "最寄り到着"/);
  assert.match(dashboardSource, /name: "arrival", label: "入店"/);
  assert.match(dashboardSource, /name: "completion", label: "終了報告"/);
  assert.match(dashboardSource, /attendanceRequest\("arrive"/);
  assert.match(dashboardSource, /attendanceRequest\("clockOut"/);
  assert.equal((dashboardHtml.match(/id="startBtn"/g) || []).length, 1);
  assert.doesNotMatch(dashboardHtml, /id="departureBtn"|id="arrivalBtn"|id="endBtn"/);
  assert.doesNotMatch(dashboardHtml, />稼働終了</);
});

test("出発では位置情報を取らず最寄り到着だけを検証保存する", () => {
  const departureFunction = dashboardSource.match(/async function submitDeparture\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  const nearestArrivalFunction = dashboardSource.match(/async function submitNearestArrival\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(departureFunction, /readAttendanceLocation/);
  assert.match(departureFunction, /reportType: "出発", scheduleId: dashboardData\.schedule\.schedule_id \|\| ""/);
  assert.match(nearestArrivalFunction, /const location = await readAttendanceLocation\(\)/);
  assert.match(nearestArrivalFunction, /reportType: "最寄り到着", scheduleId: dashboardData\.schedule\.schedule_id \|\| "", location/);
  assert.match(dashboardSource, /parsed\.version === LOCATION_CONSENT_VERSION/);
  assert.match(dashboardHtml, /最寄り到着・予定外稼働のボタンを押した時点の位置情報/);
  assert.match(dashboardHtml, /出発・入店では取得しません/);
  assert.match(backendSource, /validateNearestArrivalLocation_\(payload\.location\)/);
  assert.match(backendSource, /nearestLocation: nearestLocation \|\| null/);
  assert.doesNotMatch(backendSource, /validateDepartureLocation_/);

  const context = timingContext();
  assert.equal(context.validateNearestArrivalLocation_({ status: "取得済み", latitude: 35, longitude: 135, accuracy: 10, consentVersion: "v2" }).status, "取得済み");
  const zeroLocation = context.validateNearestArrivalLocation_({ status: "取得済み", latitude: 0, longitude: 0, accuracy: 0 });
  assert.equal(zeroLocation.latitude, 0);
  assert.equal(zeroLocation.longitude, 0);
  assert.equal(zeroLocation.accuracy, 0);
  assert.throws(() => context.validateNearestArrivalLocation_({ status: "取得済み", latitude: 91, longitude: 135, accuracy: 10 }), error => error.code === "NEAREST_ARRIVAL_LOCATION_INVALID");
  assert.throws(() => context.validateNearestArrivalLocation_(null), error => error.code === "NEAREST_ARRIVAL_LOCATION_REQUIRED");
});

test("通常入店は位置情報を再取得せず予定外稼働は従来どおり検証する", () => {
  const arrivalFunction = dashboardSource.match(/async function submitArrival\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  const clockInRecordFunction = backendSource.match(/function createClockInRecord_\([\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(arrivalFunction, /readAttendanceLocation/);
  assert.doesNotMatch(clockInRecordFunction, /saveLocation_|validateClockInLocation_/);
  assert.match(backendSource, /validateClockInLocation_\(payload\.location\)/);
  const context = timingContext();
  assert.equal(context.validateClockInLocation_({ status: "許可なし", consentVersion: "v2" }).status, "許可なし");
  assert.equal(context.validateClockInLocation_({ status: "取得済み", latitude: 35, longitude: 135, accuracy: 10 }).latitude, 35);
  assert.throws(() => context.validateClockInLocation_(null), error => error.code === "CLOCK_IN_LOCATION_REQUIRED");
  assert.throws(() => context.validateClockInLocation_({ status: "取得済み", latitude: 35, longitude: 181, accuracy: 10 }), error => error.code === "CLOCK_IN_LOCATION_INVALID");
});

test("出発保存は位置情報へ触れず、最寄り到着保存だけが位置情報を関連付ける", () => {
  const context = timingContext();
  const reports = [];
  let savedLocation = null;
  context.LockService = { getDocumentLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) };
  context.Utilities.getUuid = () => "FIELD-1";
  context.today_ = () => "2026-08-28";
  context.findSchedule_ = () => ({ "勤務日": "2026-08-28", "開発予定ID": "PLAN-1", "稼働場所": "店舗", schedule_id: "SCHEDULE-1" });
  context.findScheduleById_ = context.findSchedule_;
  context.ensureFieldReportSheet_ = () => {};
  context.ensureFieldReportContractHeaders_ = () => {};
  context.fieldReportsFor_ = () => reports;
  context.findRecord_ = () => null;
  context.appendObject_ = (_sheet, report) => reports.push(report);
  context.notifyManagers_ = () => {};
  context.saveLocation_ = (_user, reportId, location, plannedLocation) => {
    savedLocation = { reportId, location, plannedLocation };
    return { id: "LOCATION-1", status: location.status };
  };

  context.submitFieldReport_({ email: "member@example.com", name: "会員" }, { reportType: "出発", scheduleId: "SCHEDULE-1" }, "token");
  assert.equal(savedLocation, null);
  assert.equal(reports[0]["報告種別"], "出発");

  context.submitFieldReport_({ email: "member@example.com", name: "会員" }, {
    reportType: "最寄り到着",
    scheduleId: "SCHEDULE-1",
    location: { status: "取得済み", latitude: 35, longitude: 135, accuracy: 10 }
  }, "token");
  assert.equal(savedLocation.reportId, "FIELD-1");
  assert.equal(savedLocation.location.status, "取得済み");
  assert.match(savedLocation.plannedLocation, /^最寄り到着:/);
  assert.equal(reports[1]["報告種別"], "最寄り到着");
});

test("新しい入店は最寄り到着を必須とし、旧入店済みデータはそのまま再表示できる", () => {
  const context = timingContext();
  const schedule = { "勤務日": "2026-08-28", "開発予定ID": "PLAN-1", schedule_id: "SCHEDULE-1" };
  context.findScheduleById_ = () => schedule;
  context.fieldReportsFor_ = () => [{ "報告種別": "出発" }];
  context.findRecord_ = () => null;
  context.buildTimingStatus_ = () => ({ arrivalApprovalRequired: false });
  context.LockService = { getDocumentLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) };
  context.ensureFieldReportSheet_ = () => {};
  context.ensureFieldReportContractHeaders_ = () => {};
  assert.throws(
    () => context.arrive_({ email: "member@example.com" }, { scheduleId: "SCHEDULE-1" }, "token"),
    error => error.code === "NEAREST_ARRIVAL_REPORT_REQUIRED"
  );

  const previousRecord = { record_id: "RECORD-1", "実開始": "10:00", "状態": "稼働中" };
  context.fieldReportsFor_ = () => [{ "報告種別": "出発" }, { "報告種別": "入店", field_report_id: "OLD-ARRIVAL" }];
  context.findRecord_ = () => previousRecord;
  context.findApprovalRequestId_ = () => "";
  context.hasPendingApproval_ = () => false;
  const result = context.arrive_({ email: "member@example.com" }, { scheduleId: "SCHEDULE-1" }, "token");
  assert.equal(result.duplicate, true);
  assert.equal(result.record.record_id, "RECORD-1");
});

test("同日複数予定は選択したschedule_idを画面・現場報告・勤怠記録へ維持する", () => {
  assert.match(dashboardHtml, /id="scheduleSelect"/);
  assert.match(dashboardSource, /selectedScheduleId/);
  assert.match(dashboardSource, /scheduleOptionText\(item\)/);
  assert.match(dashboardSource, /plannedTimeText\(schedule\)/);
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
  context.findActiveRecords_ = () => [];
  context.findRecord_ = () => null;
  context.getSchedules_ = () => [{ email: "member@example.com", "勤務日": "2026-08-28", schedule_id: "SCHEDULE-1" }];
  assert.throws(() => context.clockIn_({ email: "member@example.com" }, { scheduleId: "FAKE", unplanned: true }, "token"), error => error.code === "DEPARTURE_REPORT_REQUIRED");
});

test("同日複数予定ではschedule_idなしの旧記録を別予定へ流用しない", () => {
  const context = timingContext();
  context.rows_ = () => [
    { email: "member@example.com", "勤務日": "2026-08-28", schedule_id: "", record_id: "LEGACY" },
    { email: "member@example.com", "勤務日": "2026-08-28", schedule_id: "SCHEDULE-2", record_id: "SECOND" }
  ];
  assert.equal(context.findRecord_("member@example.com", "2026-08-28", "SCHEDULE-1"), null);
  assert.equal(context.findRecord_("member@example.com", "2026-08-28", "SCHEDULE-2").record_id, "SECOND");
  context.rows_ = () => [{ email: "member@example.com", "勤務日": "2026-08-28", schedule_id: "", record_id: "ONLY-LEGACY" }];
  assert.equal(context.findRecord_("member@example.com", "2026-08-28", "SCHEDULE-1"), null);
  assert.equal(context.findRecord_("member@example.com", "2026-08-28", "SCHEDULE-2"), null);
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
  context.rows_ = () => [{ "勤務日": "2026-08-27", schedule_id: "OLD", "報告種別": "出発", "報告者メール": "member@example.com" }];
  assert.equal(context.findPendingOvernightReport_({ email: "member@example.com" }, "2026-08-29"), null);
});

test("承認順序と復元処理で終了済み状態を稼働中へ戻さない", () => {
  assert.match(backendSource, /record && record\["実終了"\] \? "終了済み" : "稼働中"/);
  assert.match(backendSource, /\{ "状態": record\["状態"\] \|\| "", "正式開始":/);
});

test("別予定が稼働中なら古い画面から二件目を入店できない", () => {
  const context = timingContext();
  context.findActiveRecords_ = () => [{ schedule_id: "S1", "実開始": "10:00", "実終了": "" }];
  assert.throws(() => context.assertNoOtherActiveSchedule_("member@example.com", "S2"), error => error.code === "OTHER_SCHEDULE_ACTIVE");
  assert.doesNotThrow(() => context.assertNoOtherActiveSchedule_("member@example.com", "S1"));
});

test("終了報告は稼働中の別予定ではなく指定schedule_idだけを選ぶ", () => {
  const context = timingContext();
  const s1 = { record_id: "ACTIVE-S1", schedule_id: "S1", "実開始": "10:00", "実終了": "" };
  const s2 = { record_id: "ACTIVE-S2", schedule_id: "S2", "実開始": "12:00", "実終了": "" };
  context.findActiveRecords_ = () => [s1];
  context.findRecordBySchedule_ = (_email, scheduleId) => scheduleId === "S2" ? s2 : s1;
  assert.equal(context.selectClockOutRecord_("member@example.com", "S2").record_id, "ACTIVE-S2");
  context.findActiveRecords_ = () => [s1, s2];
  assert.throws(() => context.selectClockOutRecord_("member@example.com", "S2"), error => error.code === "MULTIPLE_ACTIVE_RECORDS");
});

test("前日から稼働中なら翌日の旧clockInで二件目を作らない", () => {
  assert.match(backendSource, /activeRecords\.length\) throw apiError_\("OTHER_SCHEDULE_ACTIVE"/);
  assert.match(backendSource, /dateKey_\(activeRecords\[0\]\["勤務日"\]\) === today && !activeRecords\[0\]\.schedule_id && payload\.unplanned/);
});
