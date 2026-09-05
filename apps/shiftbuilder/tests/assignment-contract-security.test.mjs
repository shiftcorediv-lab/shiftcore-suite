import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const utilsSource = readFileSync(
  new URL("../backend/shiftbuilder-apps-script/utils.js", import.meta.url),
  "utf8"
);
const repositorySource = readFileSync(
  new URL("../backend/shiftbuilder-apps-script/repositore.js", import.meta.url),
  "utf8"
);
const serviceSource = readFileSync(
  new URL("../backend/shiftbuilder-apps-script/ShiftBuilderService.js", import.meta.url),
  "utf8"
);

function createContext() {
  const context = vm.createContext({
    DEFAULT_AREA: "関西",
    SHIFTBUILDER_MODULE_KEY: "shift",
    VALID_SHIFTBUILDER_PERMISSIONS: ["all", "manager", "edit", "view", "self"],
    SHIFTBUILDER_EDITABLE_PERMISSIONS: ["all", "manager", "edit"]
  });
  vm.runInContext(utilsSource, context);
  vm.runInContext(repositorySource, context);
  vm.runInContext(serviceSource, context);
  return context;
}

const datesCase = {
  case_id: "CASE-DATES",
  input_mode: "dates",
  target_month: "2026-09",
  work_area: "福岡",
  status: "confirmed",
  archived: false,
  for_shift_builder: true,
  required_people: 2
};
const caseDate = {
  case_id: "CASE-DATES",
  case_date_id: "CD-001",
  work_date: "2026-09-10",
  required_people: 2
};

test("日付指定案件は案件日・月・エリア・必要人数が一致する時だけ許可する", () => {
  const context = createContext();
  const valid = {
    case_id: "CASE-DATES",
    case_date_id: "CD-001",
    work_date: "2026-09-10",
    target_month: "2026-09",
    area: "福岡"
  };

  const contract = context.resolveShiftBuilderAssignmentContract_(
    valid,
    [datesCase],
    [caseDate]
  );
  assert.equal(contract.input_mode, "dates");
  assert.equal(contract.required_total, 2);

  assert.throws(
    () => context.resolveShiftBuilderAssignmentContract_(
      { ...valid, case_date_id: "CD-NOT-FOUND" },
      [datesCase],
      [caseDate]
    ),
    /組み合わせが不正/
  );
  assert.throws(
    () => context.resolveShiftBuilderAssignmentContract_(
      { ...valid, target_month: "2026-10" },
      [datesCase],
      [caseDate]
    ),
    /target_monthとwork_dateが一致しません/
  );
  assert.throws(
    () => context.resolveShiftBuilderAssignmentContract_(
      { ...valid, area: "熊本" },
      [datesCase],
      [caseDate]
    ),
    /案件エリアとアサイン先エリアが一致しません/
  );
});

test("代理店・店舗の指名とNGは設定元を分けて契約へ保持し、NGも配置可能にする", () => {
  const context = createContext();
  const targetCase = { ...datesCase, agency_id: "AG-001", store_id: "ST-001" };
  const agencies = [{
    agency_id: "AG-001",
    preferred_member_ids: "AN0001,U-AGENCY-PREFERRED",
    ng_member_ids: "AN0088,U-AGENCY-NG",
    ng_note: "代理店都合"
  }];
  const stores = [{
    store_id: "ST-001",
    preferred_member_ids: "AN0001,U-PREFERRED",
    ng_member_ids: "AN0099,U-NG"
  }];
  const baseParams = {
    case_id: "CASE-DATES",
    case_date_id: "CD-001",
    work_date: "2026-09-10",
    target_month: "2026-09",
    area: "福岡",
    internal_user_id: "U-PREFERRED",
    account_code: "AN0001"
  };

  const contract = context.resolveShiftBuilderAssignmentContract_(
    baseParams,
    [targetCase],
    [caseDate],
    stores,
    { orderCaseAgencies: agencies }
  );
  assert.deepEqual(
    Array.from(contract.member_rule.store_preferred_member_ids),
    ["an0001", "u-preferred"]
  );
  assert.deepEqual(
    Array.from(contract.member_rule.agency_ng_member_ids),
    ["an0088", "u-agency-ng"]
  );
  assert.doesNotThrow(() => context.resolveShiftBuilderAssignmentContract_(
    { ...baseParams, internal_user_id: "U-NG", account_code: "AN0099" },
    [targetCase],
    [caseDate],
    stores,
    { orderCaseAgencies: agencies }
  ));

  const existingAssignments = context.filterShiftAssignmentsByAssignableOrderCases_(
    [{
      ...baseParams,
      assignment_id: "SA-EXISTING-NG",
      internal_user_id: "U-NG",
      account_code: "AN0099"
    }],
    [targetCase],
    [caseDate]
  );
  assert.deepEqual(
    existingAssignments.map(assignment => assignment.assignment_id),
    ["SA-EXISTING-NG"]
  );
});

test("日数指定案件はcase_date_idなし・案件対象月内・依頼日数ありに限定する", () => {
  const context = createContext();
  const daysCase = {
    case_id: "CASE-DAYS",
    input_mode: "days",
    target_month: "2026-09",
    work_area: "福岡",
    status: "confirmed",
    for_shift_builder: true,
    requested_days: 3
  };
  const valid = {
    case_id: "CASE-DAYS",
    case_date_id: "",
    work_date: "2026-09-12",
    target_month: "2026-09",
    area: "福岡"
  };

  const contract = context.resolveShiftBuilderAssignmentContract_(valid, [daysCase], []);
  assert.equal(contract.input_mode, "days");
  assert.equal(contract.required_total, 3);
  assert.throws(
    () => context.resolveShiftBuilderAssignmentContract_(
      { ...valid, case_date_id: "CD-FORGED" },
      [daysCase],
      []
    ),
    /case_date_idは指定できません/
  );
  assert.throws(
    () => context.resolveShiftBuilderAssignmentContract_(
      valid,
      [{ ...daysCase, requested_days: 0 }],
      []
    ),
    /依頼日数が設定されていません/
  );
  assert.throws(
    () => context.resolveShiftBuilderAssignmentContract_(
      { ...valid, work_date: "2026-09-99" },
      [daysCase],
      []
    ),
    /work_dateが不正です/
  );
});

test("アサイン時刻はクライアント値ではなくOrderの日別契約から確定する", () => {
  const context = createContext();
  const timeRange = context.getShiftBuilderContractTimeRange_({
    case_row: { work_start_time: "09:00", work_end_time: "18:00" },
    case_date_row: { work_start_time: "22:00", work_end_time: "01:00" }
  });

  assert.deepEqual(
    { ...timeRange },
    { start_time: "22:00", end_time: "01:00", ends_next_day: true }
  );
  assert.throws(
    () => context.getShiftBuilderContractTimeRange_({
      case_row: { work_start_time: "10:00", work_end_time: "10:00" }
    }),
    /時刻が不正/
  );

  const sheetTimeRange = context.getShiftBuilderContractTimeRange_({
    case_row: {
      work_start_time: "1899-12-30 10:00:00",
      work_end_time: new Date(1899, 11, 30, 18, 0)
    }
  });
  assert.deepEqual(
    { ...sheetTimeRange },
    { start_time: "10:00", end_time: "18:00", ends_next_day: false }
  );
});

test("読取側も契約外のghost active rowを除外する", () => {
  const context = createContext();
  const base = {
    assignment_id: "SA-001",
    case_id: "CASE-DATES",
    case_date_id: "CD-001",
    work_date: "2026-09-10",
    target_month: "2026-09",
    area: "福岡"
  };
  const filtered = context.filterShiftAssignmentsByAssignableOrderCases_(
    [
      base,
      { ...base, assignment_id: "SA-GHOST-DATE", case_date_id: "CD-FORGED" },
      { ...base, assignment_id: "SA-GHOST-MONTH", target_month: "2026-10" },
      { ...base, assignment_id: "SA-GHOST-AREA", area: "熊本" }
    ],
    [datesCase],
    [caseDate]
  );

  assert.deepEqual(filtered.map(row => row.assignment_id), ["SA-001"]);
});

test("必要枠上限を超える作成を拒否し、入替元だけは枠計算から除く", () => {
  const context = createContext();
  const params = {
    case_id: "CASE-DATES",
    case_date_id: "CD-001",
    work_date: "2026-09-10"
  };
  context.getActiveShiftAssignments_ = () => [
    { assignment_id: "SA-001", ...params },
    { assignment_id: "SA-002", ...params }
  ];

  assert.throws(
    () => context.validateShiftBuilderAssignmentCapacity_(params, {
      input_mode: "dates",
      required_total: 2
    }),
    /必要人数を超えて/
  );

  assert.doesNotThrow(() => context.validateShiftBuilderAssignmentCapacity_(
    { ...params, replacing_assignment_id: "SA-001" },
    { input_mode: "dates", required_total: 2 }
  ));
});

test("日数指定案件は1日1枠と依頼日数上限を超えられない", () => {
  const context = createContext();
  context.getActiveShiftAssignments_ = () => [
    {
      assignment_id: "SA-001",
      case_id: "CASE-DAYS",
      case_date_id: "",
      work_date: "2026-09-10"
    },
    {
      assignment_id: "SA-002",
      case_id: "CASE-DAYS",
      case_date_id: "",
      work_date: "2026-09-11"
    }
  ];

  assert.throws(
    () => context.validateShiftBuilderAssignmentCapacity_({
      case_id: "CASE-DAYS",
      work_date: "2026-09-10"
    }, {
      input_mode: "days",
      required_total: 3
    }),
    /同じ日に2名以上/
  );
  assert.throws(
    () => context.validateShiftBuilderAssignmentCapacity_({
      case_id: "CASE-DAYS",
      work_date: "2026-09-12"
    }, {
      input_mode: "days",
      required_total: 2
    }),
    /依頼日数を超えて/
  );
});

test("停止中・非稼働・Shift対象外・権限未設定の人員を直接指定しても拒否する", () => {
  const context = createContext();
  const valid = {
    status: "active",
    role: "member",
    workStatus: "on",
    engagement_status: "active",
    allowed_modules: "shift",
    shiftbuilder_permission: "self"
  };

  assert.equal(context.isShiftBuilderAssignableUser_(valid), true);
  assert.equal(context.isShiftBuilderAssignableUser_({ ...valid, status: "stopped" }), false);
  assert.equal(context.isShiftBuilderAssignableUser_({ ...valid, workStatus: "off" }), false);
  assert.equal(context.isShiftBuilderAssignableUser_({ ...valid, engagement_status: "inactive" }), false);
  assert.equal(context.isShiftBuilderAssignableUser_({ ...valid, allowed_modules: "pmo" }), false);
  assert.equal(context.isShiftBuilderAssignableUser_({ ...valid, shiftbuilder_permission: "" }), false);
  assert.equal(context.isShiftBuilderAssignableUser_({ ...valid, role: "developer" }), false);
});

test("案件契約と枠数はappend前後に検証し、失敗時は作成行を解除する", () => {
  const createStart = serviceSource.indexOf("function createShiftBuilderAssignment_(");
  const createEnd = serviceSource.indexOf("function getActiveShiftAssignments_(", createStart);
  const createSource = serviceSource.slice(createStart, createEnd);
  const contractIndex = createSource.indexOf("resolveShiftBuilderAssignmentContract_(params)");
  const contractTimeIndex = createSource.indexOf("getShiftBuilderContractTimeRange_(assignmentContract)");
  const capacityIndex = createSource.indexOf("validateShiftBuilderAssignmentCapacity_(params");
  const appendIndex = createSource.indexOf("appendShiftAssignment_(");

  assert.ok(contractIndex >= 0 && contractIndex < appendIndex);
  assert.ok(contractTimeIndex > contractIndex && contractTimeIndex < appendIndex);
  assert.match(createSource, /params\.start_time = contractTimeRange\.start_time/);
  assert.match(createSource, /params\.end_time = contractTimeRange\.end_time/);
  assert.ok(capacityIndex >= 0 && capacityIndex < appendIndex);
  assert.match(createSource, /capacity_ignore_assignment_id:\s*assignment\.assignment_id/);
  assert.match(createSource, /archiveShiftAssignment_\(assignment\.assignment_id/);
});
