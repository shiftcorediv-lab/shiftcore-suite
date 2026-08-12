import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function createContext() {
  let organizationShadowValue = "true";
  const context = vm.createContext({
    console: { error() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => organizationShadowValue
      })
    }
  });

  context.normalizeText = (value) => String(value == null ? "" : value).trim();
  context.getNormalizedPersonType = (user) => user.person_type || "internal";
  context.getNowIsoStringJst = () => "2026-08-10T12:00:00";
  context.ORGANIZATION_LEVELS = ["member", "leader", "manager", "executive"];
  context.ORGANIZATION_LEVEL_RANKS = { member: 1, leader: 2, manager: 3, executive: 4 };
  context.ORGANIZATION_SHADOW_ENABLED_PROPERTY = "ORGANIZATION_SHADOW_ENABLED";
  context.setOrganizationShadowValue = (value) => { organizationShadowValue = value; };

  vm.runInContext(
    readFileSync(
      new URL("../backend/account-apps-script/organization_authorization.js", import.meta.url),
      "utf8"
    ),
    context
  );
  vm.runInContext(
    readFileSync(
      new URL("../backend/account-apps-script/organization_bootstrap.js", import.meta.url),
      "utf8"
    ),
    context
  );
  vm.runInContext(
    readFileSync(
      new URL("../backend/account-apps-script/organization_assignments.js", import.meta.url),
      "utf8"
    ),
    context
  );
  return context;
}

test("組織Shadowは明示的に有効化されるまでfail-closedにする", () => {
  const context = createContext();
  context.setOrganizationShadowValue("");
  assert.equal(context.isOrganizationShadowEnabled_(), false);
  context.setOrganizationShadowValue("true");
  assert.equal(context.isOrganizationShadowEnabled_(), true);
});

test("組織Shadow停止中は組織変更APIを書込み前に拒否する", () => {
  const context = createContext();
  context.setOrganizationShadowValue("false");
  assert.throws(
    () => context.accountConsoleUpdateOrganizationAssignment({}),
    (error) => error.code === "ORGANIZATION_SHADOW_DISABLED"
  );
});

function validUsers() {
  return [
    {
      internal_user_id: "U-E1",
      status: "active",
      organization_level: "executive",
      executive_reviewer_user_id: "U-E2"
    },
    {
      internal_user_id: "U-E2",
      status: "active",
      organization_level: "executive",
      executive_reviewer_user_id: "U-E1"
    },
    {
      internal_user_id: "U-M1",
      status: "active",
      organization_level: "manager",
      direct_manager_user_id: "U-E1"
    },
    {
      internal_user_id: "U-L1",
      status: "active",
      organization_level: "leader",
      direct_manager_user_id: "U-M1"
    },
    {
      internal_user_id: "U-1",
      status: "active",
      organization_level: "member",
      direct_manager_user_id: "U-L1"
    }
  ];
}

test("4階層と直属関係が正しければ組織グラフを受け付ける", () => {
  const context = createContext();
  const result = context.validateOrganizationGraph_(validUsers());

  assert.equal(result.healthy, true);
  assert.equal(result.errors.length, 0);
});

test("メンバーの直属にマネージャーを指定すると拒否する", () => {
  const context = createContext();
  const users = validUsers();
  users.find((user) => user.internal_user_id === "U-1").direct_manager_user_id = "U-M1";
  const result = context.validateOrganizationGraph_(users);

  assert.equal(result.healthy, false);
  assert.ok(result.errors.some((item) =>
    item.internal_user_id === "U-1" && item.code === "DIRECT_MANAGER_INVALID"
  ));
});

test("自分自身を直属管理者にすると拒否する", () => {
  const context = createContext();
  const users = validUsers();
  users.find((user) => user.internal_user_id === "U-L1").direct_manager_user_id = "U-L1";
  const result = context.validateOrganizationGraph_(users);

  assert.ok(result.errors.some((item) => item.code === "DIRECT_MANAGER_INVALID"));
  assert.ok(result.errors.some((item) => item.code === "ORGANIZATION_CYCLE"));
});

test("役員の承認者は自分以外のactiveな役員に限定する", () => {
  const context = createContext();
  const users = validUsers();
  users[0].executive_reviewer_user_id = "U-E1";
  const result = context.validateOrganizationGraph_(users);

  assert.ok(result.errors.some((item) =>
    item.internal_user_id === "U-E1" && item.code === "EXECUTIVE_REVIEWER_INVALID"
  ));
});

test("承認は記録された直属管理者本人だけに許可する", () => {
  const context = createContext();
  const users = validUsers();
  const member = users.find((user) => user.internal_user_id === "U-1");
  const leader = users.find((user) => user.internal_user_id === "U-L1");
  const manager = users.find((user) => user.internal_user_id === "U-M1");

  assert.equal(context.assertApprovalReviewer_(member, leader), true);
  assert.throws(
    () => context.assertApprovalReviewer_(member, manager),
    (error) => error.code === "REVIEWER_MISMATCH"
  );
});

test("自己承認を専用コードで拒否する", () => {
  const context = createContext();
  const member = validUsers().find((user) => user.internal_user_id === "U-1");

  assert.throws(
    () => context.assertApprovalReviewer_(member, member),
    (error) => error.code === "SELF_APPROVAL_FORBIDDEN"
  );
});

test("役員申請は指定された別役員だけが承認できる", () => {
  const context = createContext();
  const users = validUsers();
  const executive = users[0];

  assert.equal(context.assertApprovalReviewer_(executive, users[1]), true);
  assert.throws(
    () => context.assertApprovalReviewer_(executive, users[2]),
    (error) => error.code === "REVIEWER_MISMATCH"
  );
});

test("マネージャーはメンバーとリーダーだけを変更できる", () => {
  const context = createContext();
  const users = validUsers();
  const operator = users.find((user) => user.internal_user_id === "U-M1");
  const member = users.find((user) => user.internal_user_id === "U-1");
  const executive = users.find((user) => user.internal_user_id === "U-E1");

  assert.doesNotThrow(() => context.assertCanUpdateOrganizationAssignment_(
    operator,
    member,
    { ...member, organization_level: "member" },
    users
  ));
  assert.throws(
    () => context.assertCanUpdateOrganizationAssignment_(
      operator,
      executive,
      { ...executive, organization_level: "executive" },
      users
    ),
    (error) => error.code === "TARGET_LEVEL_FORBIDDEN"
  );
});

test("自分自身の組織設定変更を拒否する", () => {
  const context = createContext();
  const users = validUsers();
  const operator = users.find((user) => user.internal_user_id === "U-M1");

  assert.throws(
    () => context.assertCanUpdateOrganizationAssignment_(
      operator,
      operator,
      { ...operator, organization_level: "executive" },
      users
    ),
    (error) => error.code === "SELF_ESCALATION_FORBIDDEN"
  );
});

test("リーダーは組織設定を変更できない", () => {
  const context = createContext();
  const users = validUsers();
  const leader = users.find((user) => user.internal_user_id === "U-L1");
  const member = users.find((user) => user.internal_user_id === "U-1");

  assert.throws(
    () => context.assertCanUpdateOrganizationAssignment_(
      leader,
      member,
      { ...member, organization_level: "member" },
      users
    ),
    (error) => error.code === "CAPABILITY_FORBIDDEN"
  );
});

test("開発者は組織階層未設定でも役員を含む他者を変更できる", () => {
  const context = createContext();
  const users = validUsers();
  const developer = {
    internal_user_id: "U-DEV",
    status: "active",
    role: "developer",
    organization_level: ""
  };
  const executive = users.find((user) => user.internal_user_id === "U-E1");

  assert.doesNotThrow(() => context.assertOrganizationOperator_(developer));
  assert.equal(context.canOperatorEditOrganizationTarget_(developer, executive, users), true);
  assert.doesNotThrow(() => context.assertCanUpdateOrganizationAssignment_(
    developer,
    executive,
    { ...executive, organization_level: "executive" },
    users
  ));
});

test("開発者でも自分自身の組織設定は変更できない", () => {
  const context = createContext();
  const developer = {
    internal_user_id: "U-DEV",
    status: "active",
    role: "developer",
    organization_level: ""
  };

  assert.equal(context.canOperatorEditOrganizationTarget_(developer, developer, []), false);
  assert.throws(
    () => context.assertCanUpdateOrganizationAssignment_(
      developer,
      developer,
      { ...developer, organization_level: "executive" },
      []
    ),
    (error) => error.code === "SELF_ESCALATION_FORBIDDEN"
  );
});

test("開発者でも最後の役員を変更できない", () => {
  const context = createContext();
  const users = validUsers().filter((user) => user.internal_user_id !== "U-E2");
  const developer = {
    internal_user_id: "U-DEV",
    status: "active",
    role: "developer",
    organization_level: ""
  };
  const lastExecutive = users.find((user) => user.internal_user_id === "U-E1");

  assert.throws(
    () => context.assertCanUpdateOrganizationAssignment_(
      developer,
      lastExecutive,
      { ...lastExecutive, organization_level: "manager" },
      users
    ),
    (error) => error.code === "LAST_EXECUTIVE_PROTECTED"
  );
});

test("マネージャーは別系統のメンバーを変更できない", () => {
  const context = createContext();
  const users = validUsers();
  users.push(
    {
      internal_user_id: "U-M2",
      status: "active",
      organization_level: "manager",
      direct_manager_user_id: "U-E1"
    },
    {
      internal_user_id: "U-L2",
      status: "active",
      organization_level: "leader",
      direct_manager_user_id: "U-M2"
    },
    {
      internal_user_id: "U-2",
      status: "active",
      organization_level: "member",
      direct_manager_user_id: "U-L2"
    }
  );
  const operator = users.find((user) => user.internal_user_id === "U-M1");
  const otherMember = users.find((user) => user.internal_user_id === "U-2");

  assert.throws(
    () => context.assertCanUpdateOrganizationAssignment_(
      operator,
      otherMember,
      { ...otherMember },
      users
    ),
    (error) => error.code === "SCOPE_FORBIDDEN"
  );
});

test("別系統のメンバーを自系統へ付け替える送信値も拒否する", () => {
  const context = createContext();
  const users = validUsers();
  users.push(
    { internal_user_id: "U-M2", status: "active", organization_level: "manager", direct_manager_user_id: "U-E1" },
    { internal_user_id: "U-L2", status: "active", organization_level: "leader", direct_manager_user_id: "U-M2" },
    { internal_user_id: "U-2", status: "active", organization_level: "member", direct_manager_user_id: "U-L2" }
  );
  const operator = users.find((user) => user.internal_user_id === "U-M1");
  const otherMember = users.find((user) => user.internal_user_id === "U-2");

  assert.throws(
    () => context.assertCanUpdateOrganizationAssignment_(
      operator,
      otherMember,
      { ...otherMember, direct_manager_user_id: "U-L1" },
      users
    ),
    (error) => error.code === "SCOPE_FORBIDDEN"
  );
});

test("今回の変更で新しく発生する配下側の不整合を検出する", () => {
  const context = createContext();
  const users = validUsers();
  const changed = users.map((user) => user.internal_user_id === "U-L1"
    ? { ...user, organization_level: "member", direct_manager_user_id: "U-L1" }
    : user
  );
  const before = context.validateOrganizationGraph_(users);
  const after = context.validateOrganizationGraph_(changed);
  const newErrors = context.findNewOrganizationErrors_(before.errors, after.errors);

  assert.ok(newErrors.some((item) =>
    item.internal_user_id === "U-1" && item.code === "DIRECT_MANAGER_INVALID"
  ));
});

test("既存の無関係な不整合は今回の新規エラーとして扱わない", () => {
  const context = createContext();
  const before = [{ internal_user_id: "U-X", code: "DIRECT_MANAGER_INVALID" }];
  const after = [
    { internal_user_id: "U-X", code: "DIRECT_MANAGER_INVALID" },
    { internal_user_id: "U-Y", code: "ORGANIZATION_CYCLE" }
  ];
  const result = context.findNewOrganizationErrors_(before, after);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { internal_user_id: "U-Y", code: "ORGANIZATION_CYCLE" }
  ]);
});

test("マネージャーは別系統の対象を画面上でも編集不可とする", () => {
  const context = createContext();
  const users = validUsers();
  users.push(
    { internal_user_id: "U-M2", status: "active", organization_level: "manager", direct_manager_user_id: "U-E1" },
    { internal_user_id: "U-L2", status: "active", organization_level: "leader", direct_manager_user_id: "U-M2" }
  );
  const operator = users.find((user) => user.internal_user_id === "U-M1");
  const otherLeader = users.find((user) => user.internal_user_id === "U-L2");

  assert.equal(context.canOperatorEditOrganizationTarget_(operator, otherLeader, users), false);
});

test("外部人員を内部組織階層へ割り当てない", () => {
  const context = createContext();

  assert.throws(
    () => context.assertInternalOrganizationTarget_({ person_type: "alliance_individual" }),
    (error) => error.code === "ORGANIZATION_TARGET_NOT_INTERNAL"
  );
});

test("初回役員2人を相互承認可能な候補へ変換する", () => {
  const context = createContext();
  const users = [
    { internal_user_id: "U-E1", status: "active", person_type: "internal" },
    { internal_user_id: "U-E2", status: "active", person_type: "internal" },
    { internal_user_id: "U-1", status: "active", person_type: "internal" }
  ];
  const result = context.buildExecutiveBootstrapCandidates_(users, ["U-E1", "U-E2"], "U-E1");
  const first = result.candidate_users.find((user) => user.internal_user_id === "U-E1");
  const second = result.candidate_users.find((user) => user.internal_user_id === "U-E2");

  assert.equal(first.organization_level, "executive");
  assert.equal(first.executive_reviewer_user_id, "U-E2");
  assert.equal(second.executive_reviewer_user_id, "U-E1");
  assert.equal(first.organization_version, 1);
  assert.equal(result.changes.length, 2);
  assert.equal(context.validateOrganizationGraph_(result.candidate_users).healthy, true);
});

test("初回役員候補へ停止中・外部人員を含めない", () => {
  const context = createContext();
  const users = [
    { internal_user_id: "U-E1", status: "active", person_type: "internal" },
    { internal_user_id: "U-E2", status: "inactive", person_type: "internal" }
  ];

  assert.throws(
    () => context.buildExecutiveBootstrapCandidates_(users, ["U-E1", "U-E2"], "U-E1"),
    (error) => error.code === "BOOTSTRAP_EXECUTIVES_INVALID"
  );
});

test("初回役員bootstrapは設定済み独立監査担当の代行を許可する", () => {
  const context = createContext();

  assert.equal(
    context.assertExecutiveBootstrapActorRole_("U-A1", ["U-E1", "U-E2"], "U-A1"),
    true
  );
  assert.throws(
    () => context.assertExecutiveBootstrapActorRole_("U-X", ["U-E1", "U-E2"], "U-A1"),
    (error) => error.code === "BOOTSTRAP_ACTOR_INVALID"
  );
});

test("初回役員ロールバックもbootstrapと同じ実行者判定を使う", () => {
  const source = readFileSync(
    new URL("../backend/account-apps-script/organization_bootstrap.js", import.meta.url),
    "utf8"
  );
  const rollback = source.slice(
    source.indexOf("function runOrganizationExecutiveBootstrapRollback()"),
    source.indexOf("function normalizeBootstrapExecutiveIds_")
  );

  assert.match(rollback, /assertExecutiveBootstrapActorRole_\(/);
  assert.match(rollback, /assertOrganizationBootstrapActorFromUsers_\(/);
  assert.doesNotMatch(rollback, /executiveIds\.indexOf\(actorId\) === -1/);
});

test("bootstrap実行者が存在しない場合も構造化エラーで拒否する", () => {
  const context = createContext();

  assert.throws(
    () => context.assertOrganizationBootstrapActorFromUsers_([], "U-X", "x@example.com"),
    (error) => error.code === "BOOTSTRAP_ACTOR_INVALID"
  );
});

test("組織列に同名ヘッダーがある場合は準備処理を拒否する", () => {
  const context = createContext();

  assert.throws(
    () => context.assertNoDuplicateHeaders_([
      "internal_user_id",
      "organization_level",
      "organization_level"
    ]),
    (error) => error.code === "ORGANIZATION_SCHEMA_MISMATCH"
  );
});
