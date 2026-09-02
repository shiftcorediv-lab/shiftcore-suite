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

test("activeな役員全員が1つの承認循環を構成する", () => {
  const context = createContext();
  const users = validUsers();
  users[0].executive_reviewer_user_id = "U-E3";
  users[1].executive_reviewer_user_id = "U-E1";
  users.push({
    internal_user_id: "U-E3",
    status: "active",
    organization_level: "executive",
    executive_reviewer_user_id: "U-E2"
  });

  const result = context.validateOrganizationGraph_(users);
  assert.equal(result.healthy, true);
});

test("役員承認者グラフが複数の循環へ分断される場合は検出する", () => {
  const context = createContext();
  const users = validUsers();
  users.push(
    {
      internal_user_id: "U-E3",
      status: "active",
      organization_level: "executive",
      executive_reviewer_user_id: "U-E4"
    },
    {
      internal_user_id: "U-E4",
      status: "active",
      organization_level: "executive",
      executive_reviewer_user_id: "U-E3"
    }
  );

  const result = context.validateOrganizationGraph_(users);
  assert.equal(result.healthy, false);
  assert.equal(
    result.errors.filter((item) => item.code === "EXECUTIVE_REVIEWER_GRAPH_INVALID").length,
    4
  );
});

test("役員2名から3名への段階更新も単一行の閉路エラーとして保存を拒否する", () => {
  const context = createContext();
  const beforeUsers = validUsers();
  const afterUsers = beforeUsers.concat({
    internal_user_id: "U-E3",
    status: "active",
    organization_level: "executive",
    executive_reviewer_user_id: "U-E1"
  });
  const before = context.validateOrganizationGraph_(beforeUsers);
  const after = context.validateOrganizationGraph_(afterUsers);

  assert.ok(after.errors.some((item) => item.code === "EXECUTIVE_REVIEWER_GRAPH_INVALID"));
  assert.ok(
    context.findBlockingOrganizationErrors_(before.errors, after.errors)
      .some((item) => item.code === "EXECUTIVE_REVIEWER_GRAPH_INVALID")
  );

  afterUsers.find((user) => user.internal_user_id === "U-E2").executive_reviewer_user_id = "U-E3";
  assert.equal(context.validateOrganizationGraph_(afterUsers).healthy, true);
});

test("組織更新APIは閉路エラーを含む保存拒否判定を使う", () => {
  const source = readFileSync(
    new URL("../backend/account-apps-script/organization_assignments.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /const newErrors = findBlockingOrganizationErrors_\(currentGraph\.errors, candidateGraph\.errors\)/
  );
});

test("閉路エラーを含む新しい組織不整合はすべて保存を拒否する", () => {
  const context = createContext();
  const result = context.findBlockingOrganizationErrors_([], [
    { internal_user_id: "U-E1", code: "EXECUTIVE_REVIEWER_GRAPH_INVALID" },
    { internal_user_id: "U-1", code: "DIRECT_MANAGER_INVALID" }
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { internal_user_id: "U-E1", code: "EXECUTIVE_REVIEWER_GRAPH_INVALID" },
    { internal_user_id: "U-1", code: "DIRECT_MANAGER_INVALID" }
  ]);
});

test("developerでも単一更新APIから役員追加・解除・承認者変更を迂回できない", () => {
  const context = createContext();
  const users = validUsers();
  const developer = {
    internal_user_id: "U-DEV",
    status: "active",
    person_type: "internal",
    role: "developer"
  };
  const manager = users.find((user) => user.internal_user_id === "U-M1");
  const executive = users.find((user) => user.internal_user_id === "U-E1");

  [
    [manager, { ...manager, organization_level: "executive", executive_reviewer_user_id: "U-E1" }],
    [executive, { ...executive, organization_level: "manager", executive_reviewer_user_id: "" }],
    [executive, { ...executive, executive_reviewer_user_id: "U-E1" }]
  ].forEach(([target, candidate]) => {
    assert.throws(
      () => context.assertCanUpdateOrganizationAssignment_(developer, target, candidate, users),
      (error) => error.code === "EXECUTIVE_BULK_UPDATE_REQUIRED"
    );
  });
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

test("組織階層未設定の開発者は自分を一度だけリーダーまたはマネージャーへ設定できる", () => {
  const context = createContext();
  const developer = {
    internal_user_id: "U-DEV",
    status: "active",
    role: "developer",
    organization_level: ""
  };
  const candidate = {
    ...developer,
    organization_level: "leader",
    direct_manager_user_id: "U-M1",
    executive_reviewer_user_id: ""
  };

  assert.equal(context.canOperatorEditOrganizationTarget_(developer, developer, []), true);
  assert.doesNotThrow(() => context.assertCanUpdateOrganizationAssignment_(
    developer,
    developer,
    candidate,
    validUsers().concat(developer)
  ));
  assert.doesNotThrow(() => context.assertCanUpdateOrganizationAssignment_(
    developer,
    developer,
    {
      ...developer,
      organization_level: "manager",
      direct_manager_user_id: "U-E1",
      executive_reviewer_user_id: ""
    },
    validUsers().concat(developer)
  ));
});

test("開発者の自己組織ブートストラップは役員化と再変更を拒否する", () => {
  const context = createContext();
  const developer = {
    internal_user_id: "U-DEV",
    status: "active",
    role: "developer",
    organization_level: ""
  };

  assert.throws(
    () => context.assertCanUpdateOrganizationAssignment_(
      developer,
      developer,
      { ...developer, organization_level: "executive" },
      []
    ),
    (error) => error.code === "SELF_ESCALATION_FORBIDDEN"
  );

  const configured = {
    ...developer,
    organization_level: "leader",
    direct_manager_user_id: "U-M1"
  };
  assert.equal(context.canOperatorEditOrganizationTarget_(configured, configured, []), false);
  assert.throws(
    () => context.assertCanUpdateOrganizationAssignment_(
      configured,
      configured,
      { ...configured, direct_manager_user_id: "U-M2" },
      []
    ),
    (error) => error.code === "SELF_ESCALATION_FORBIDDEN"
  );
});

test("開発者の自己組織ブートストラップは不正な本人属性とpayloadを拒否する", () => {
  const context = createContext();
  const base = {
    internal_user_id: "U-DEV",
    status: "active",
    role: "developer",
    organization_level: ""
  };
  const validCandidate = {
    ...base,
    organization_level: "leader",
    direct_manager_user_id: "U-M1",
    executive_reviewer_user_id: ""
  };
  const expectSelfRejection = (
    operator,
    candidate,
    expectedCodes = ["SELF_ESCALATION_FORBIDDEN"]
  ) => assert.throws(
    () => context.assertCanUpdateOrganizationAssignment_(operator, operator, candidate, validUsers()),
    (error) => expectedCodes.includes(error.code)
  );

  expectSelfRejection(base, { ...validCandidate, direct_manager_user_id: "" });
  expectSelfRejection(base, { ...validCandidate, executive_reviewer_user_id: "U-E1" });
  expectSelfRejection(base, { ...validCandidate, organization_level: "member" });
  expectSelfRejection({ ...base, status: "inactive" }, validCandidate);
  expectSelfRejection({ ...base, person_type: "external" }, validCandidate);
  expectSelfRejection(
    { ...base, role: "admin" },
    validCandidate,
    ["ORGANIZATION_LEVEL_INVALID"]
  );
});

test("開発者の自己組織ブートストラップも組織グラフで上位の実在と階層を検証する", () => {
  const context = createContext();
  const users = validUsers();
  const developer = {
    internal_user_id: "U-DEV",
    status: "active",
    role: "developer",
    organization_level: ""
  };
  const assertGraphRejected = (candidate) => {
    context.assertCanUpdateOrganizationAssignment_(developer, developer, candidate, users);
    const before = context.validateOrganizationGraph_(users.concat(developer));
    const after = context.validateOrganizationGraph_(users.concat(candidate));
    const errors = context.findBlockingOrganizationErrors_(before.errors, after.errors);
    assert.ok(errors.some((item) =>
      item.internal_user_id === "U-DEV" && item.code === "DIRECT_MANAGER_INVALID"
    ));
  };

  assertGraphRejected({
    ...developer,
    organization_level: "leader",
    direct_manager_user_id: "U-NOT-FOUND"
  });
  assertGraphRejected({
    ...developer,
    organization_level: "leader",
    direct_manager_user_id: "U-E1"
  });
  assertGraphRejected({
    ...developer,
    organization_level: "leader",
    direct_manager_user_id: "U-DEV"
  });
});

test("自己ブートストラップ状態をUIへ公開し専用監査イベントへ記録する", () => {
  const assignmentSource = readFileSync(
    new URL("../backend/account-apps-script/organization_assignments.js", import.meta.url),
    "utf8"
  );
  const mainSource = readFileSync(
    new URL("../js/account-console/main.js", import.meta.url),
    "utf8"
  );
  const uiSource = readFileSync(
    new URL("../js/account-console/ui.js", import.meta.url),
    "utf8"
  );
  const htmlSource = readFileSync(
    new URL("../account-console.html", import.meta.url),
    "utf8"
  );

  assert.match(assignmentSource, /self_bootstrap:\s*selfBootstrap/);
  assert.match(assignmentSource, /allowed_organization_levels:\s*selfBootstrap \? \["leader", "manager"\]/);
  assert.match(assignmentSource, /eventType[\s\S]*"organization\.self_bootstrap"/);
  assert.match(mainSource, /result\.self_bootstrap === true \? result\.allowed_organization_levels : \[\]/);
  assert.match(mainSource, /ui\.js\?v=20260903-display-labels-2/);
  assert.match(uiSource, /restrictOrganizationLevelOptions_\(allowedLevels\)/);
  assert.match(htmlSource, /main\.js\?v=20260903-display-labels-2/);
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

function usersWithExecutiveCandidate() {
  return validUsers().concat({
    internal_user_id: "U-E3",
    status: "active",
    person_type: "internal",
    organization_level: "manager",
    direct_manager_user_id: "U-E1",
    organization_version: 0
  });
}

function executiveBulkOperator() {
  return {
    internal_user_id: "U-DEV",
    status: "active",
    person_type: "internal",
    role: "developer"
  };
}

test("役員3名化を複数行まとめて健全な承認循環へ更新できる", () => {
  const context = createContext();
  const result = context.prepareExecutiveBulkUpdate_(
    usersWithExecutiveCandidate(),
    [
      {
        target_internal_user_id: "U-E2",
        expected_organization_version: 0,
        organization_level: "executive",
        executive_reviewer_user_id: "U-E3"
      },
      {
        target_internal_user_id: "U-E3",
        expected_organization_version: 0,
        organization_level: "executive",
        executive_reviewer_user_id: "U-E1"
      }
    ],
    executiveBulkOperator()
  );

  assert.equal(result.items.length, 2);
  assert.equal(context.validateOrganizationGraph_(result.candidate_users).healthy, true);
  assert.equal(result.items[1].after.organization_version, 1);
});

test("役員承認循環を壊す一部だけの一括更新は拒否する", () => {
  const context = createContext();

  assert.throws(
    () => context.prepareExecutiveBulkUpdate_(
      usersWithExecutiveCandidate(),
      [{
        target_internal_user_id: "U-E3",
        expected_organization_version: 0,
        organization_level: "executive",
        executive_reviewer_user_id: "U-E1"
      }],
      executiveBulkOperator()
    ),
    (error) => error.code === "EXECUTIVE_REVIEWER_GRAPH_INVALID"
  );
});

test("役員一括更新は不正な組織階層で既存役員を空欄化しない", () => {
  const context = createContext();

  assert.throws(
    () => context.prepareExecutiveBulkUpdate_(
      validUsers(),
      [{
        target_internal_user_id: "U-E1",
        expected_organization_version: 0,
        organization_level: "invalid-level",
        executive_reviewer_user_id: ""
      }],
      executiveBulkOperator()
    ),
    (error) => error.code === "ORGANIZATION_LEVEL_INVALID"
  );
});

test("役員一括更新は重複対象と古い版を拒否する", () => {
  const context = createContext();
  const duplicate = {
    target_internal_user_id: "U-E1",
    expected_organization_version: 0,
    organization_level: "executive",
    executive_reviewer_user_id: "U-E2"
  };

  assert.throws(
    () => context.prepareExecutiveBulkUpdate_(
      validUsers(), [duplicate, duplicate], executiveBulkOperator()
    ),
    (error) => error.code === "BULK_TARGET_DUPLICATED"
  );
  assert.throws(
    () => context.prepareExecutiveBulkUpdate_(
      validUsers(), [{ ...duplicate, expected_organization_version: 9 }], executiveBulkOperator()
    ),
    (error) => error.code === "VERSION_CONFLICT"
  );
  const { expected_organization_version, ...missingVersion } = duplicate;
  assert.throws(
    () => context.prepareExecutiveBulkUpdate_(
      validUsers(), [missingVersion], executiveBulkOperator()
    ),
    (error) => error.code === "VERSION_CONFLICT"
  );
});

test("役員一括更新の実行者はactiveな内部開発者に限定する", () => {
  const context = createContext();

  assert.equal(context.assertExecutiveBulkOperator_(executiveBulkOperator()), true);
  assert.throws(
    () => context.assertExecutiveBulkOperator_({
      ...executiveBulkOperator(),
      role: "user"
    }),
    (error) => error.code === "CAPABILITY_FORBIDDEN"
  );
  assert.throws(
    () => context.assertExecutiveBulkOperator_({
      ...executiveBulkOperator(),
      person_type: "alliance_individual"
    }),
    (error) => error.code === "CAPABILITY_FORBIDDEN"
  );
});

test("役員一括更新APIは専用actionと一括監査イベントを持つ", () => {
  const apiSource = readFileSync(
    new URL("../backend/account-apps-script/api.js", import.meta.url),
    "utf8"
  );
  const assignmentSource = readFileSync(
    new URL("../backend/account-apps-script/organization_assignments.js", import.meta.url),
    "utf8"
  );

  assert.match(apiSource, /action === "accountConsoleBulkUpdateExecutives"/);
  assert.match(assignmentSource, /event_type: "organization\.executive\.bulk_update"/);
  assert.match(assignmentSource, /assertExecutiveBulkWriteVerified_/);
  assert.match(assignmentSource, /handleExecutiveBulkUpdateFailure_/);
});

test("役員一括更新の書込み確認は欠落行も検出する", () => {
  const context = createContext();
  const headers = [
    "internal_user_id", "status", "organization_level", "direct_manager_user_id",
    "executive_reviewer_user_id", "organization_version", "organization_updated_at",
    "organization_updated_by"
  ];
  const users = validUsers();
  const rows = users.slice(0, -1).map((user) => headers.map((header) => user[header] || ""));
  const sheet = {
    getDataRange: () => ({ getValues: () => [headers, ...rows] })
  };

  assert.throws(
    () => context.assertExecutiveBulkWriteVerified_(sheet, headers, users, true),
    (error) => error.code === "BULK_WRITE_VERIFICATION_FAILED"
  );
});

test("役員一括更新の失敗時は復元後にも全行照合する", () => {
  const source = readFileSync(
    new URL("../backend/account-apps-script/organization_assignments.js", import.meta.url),
    "utf8"
  );
  const failureHandler = source.slice(
    source.indexOf("function handleExecutiveBulkUpdateFailure_"),
    source.indexOf("function recordAuthorizationRecovery_")
  );

  assert.match(
    failureHandler,
    /SpreadsheetApp\.flush\(\);\s*assertExecutiveBulkWriteVerified_\(sheet, headers, originalUsers, false\)/
  );
});

function createExecutiveBulkApiHarness({ failSuccessAudit = false } = {}) {
  const context = createContext();
  const users = usersWithExecutiveCandidate().concat(executiveBulkOperator());
  const headers = [
    "internal_user_id", "status", "person_type", "role", "organization_level",
    "direct_manager_user_id", "executive_reviewer_user_id", "organization_version",
    "organization_updated_at", "organization_updated_by"
  ];
  const rows = users.map((user) => headers.map((header) => user[header] ?? ""));
  const logs = [];
  let uuid = 0;
  let released = false;
  const sheet = {
    getDataRange: () => ({ getValues: () => [headers.slice(), ...rows.map((row) => row.slice())] }),
    getRange: (rowNumber, columnNumber) => ({
      setValue(value) {
        rows[rowNumber - 2][columnNumber - 1] = value;
      }
    })
  };

  context.getUsersData = () => rows.map((row) => {
    const user = {};
    headers.forEach((header, index) => { user[header] = row[index]; });
    return user;
  });
  context.getUsersSheet = () => sheet;
  context.requireAccountConsoleOperator_ = () => ({ internal_user_id: "U-DEV" });
  context.LockService = {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => { released = true; }
    })
  };
  context.Utilities = { getUuid: () => `UUID-${++uuid}` };
  context.SpreadsheetApp = { flush() {} };
  context.appendAuthorizationChangeLog_ = (entry) => {
    if (failSuccessAudit && entry.result === "success") {
      const error = new Error("audit failed");
      error.code = "AUDIT_WRITE_FAILED";
      throw error;
    }
    logs.push(JSON.parse(JSON.stringify(entry)));
  };
  context.recordAuthorizationRecovery_ = () => {
    throw new Error("recovery should not be required");
  };

  return {
    context,
    logs,
    released: () => released,
    snapshots: () => context.getUsersData().map((user) =>
      JSON.parse(JSON.stringify(context.organizationAuditSnapshot_(user)))
    )
  };
}

function validThreeExecutiveBulkPayload() {
  return {
    reason: "役員承認経路の変更",
    changes: [
      {
        target_internal_user_id: "U-E2",
        expected_organization_version: 0,
        organization_level: "executive",
        direct_manager_user_id: "",
        executive_reviewer_user_id: "U-E3"
      },
      {
        target_internal_user_id: "U-E3",
        expected_organization_version: 0,
        organization_level: "executive",
        direct_manager_user_id: "",
        executive_reviewer_user_id: "U-E1"
      }
    ]
  };
}

test("役員一括更新API本体は全対象を更新して開始・成功を同一イベントで記録する", () => {
  const harness = createExecutiveBulkApiHarness();
  const result = harness.context.accountConsoleBulkUpdateExecutives({
    payload: validThreeExecutiveBulkPayload()
  });

  assert.equal(result.ok, true);
  assert.equal(result.change_count, 2);
  assert.deepEqual(harness.logs.map((entry) => entry.result), ["started", "success"]);
  assert.equal(
    harness.logs[0].authorization_event_id,
    harness.logs[1].authorization_event_id
  );
  assert.equal(harness.logs[0].request_id, harness.logs[1].request_id);
  assert.equal(harness.released(), true);
  assert.equal(
    harness.context.validateOrganizationGraph_(harness.context.getUsersData()).healthy,
    true
  );
});

test("役員一括更新API本体は成功監査ログ失敗時に全行を復元してerrorを記録する", () => {
  const harness = createExecutiveBulkApiHarness({ failSuccessAudit: true });
  const before = harness.snapshots();

  assert.throws(
    () => harness.context.accountConsoleBulkUpdateExecutives({
      payload: validThreeExecutiveBulkPayload()
    }),
    (error) => error.code === "AUDIT_WRITE_FAILED"
  );
  assert.deepEqual(harness.snapshots(), before);
  assert.deepEqual(harness.logs.map((entry) => entry.result), ["started", "error"]);
  assert.equal(harness.released(), true);
});
