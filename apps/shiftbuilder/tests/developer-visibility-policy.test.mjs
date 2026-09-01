import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("ShiftBuilderの全候補者生成経路でdeveloperを除外する", () => {
  const sources = [
    "../backend/shiftbuilder-apps-script/api.js",
    "../backend/shiftbuilder-apps-script/ShiftBuilderService.js"
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

  sources.forEach((source) => {
    assert.match(
      source,
      /isShiftBuilderAssignableUser_\(user\)/,
      "候補者生成時の共通適格性検証が必要"
    );
  });

  const utils = readFileSync(
    new URL("../backend/shiftbuilder-apps-script/utils.js", import.meta.url),
    "utf8"
  );
  assert.match(
    utils,
    /function isShiftBuilderAssignableUser_[\s\S]*role\) === "developer"/
  );
});

test("developerは候補者には出さずShiftBuilder操作権限は常に持つ", () => {
  const source = readFileSync(
    new URL("../backend/shiftbuilder-apps-script/utils.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /function hasShiftBuilderModule_[\s\S]*role\) === "developer"/);
  assert.match(source, /function hasShiftBuilderPermission_[\s\S]*role\) === "developer"/);
  assert.match(source, /function canEditShiftBuilder_[\s\S]*role\) === "developer"/);
});

test("過去の配置データを削除せずShiftBuilder表示からdeveloperを除外する", () => {
  const source = readFileSync(
    new URL("../backend/shiftbuilder-apps-script/repositore.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /function buildAssignedMembers_[\s\S]*normalizeLowerText\(user\.role\) !== "developer"/,
    "配置済み表示にもdeveloper除外が必要"
  );
});

test("配置の書込み経路でもdeveloperを拒否する", () => {
  const service = readFileSync(
    new URL("../backend/shiftbuilder-apps-script/ShiftBuilderService.js", import.meta.url),
    "utf8"
  );

  // 候補一覧と配置済み表示から消すだけでは、internal_user_id を直接指定した
  // リクエストで配置できてしまう。作成・入替の両方が通る関数で拒否する。
  assert.match(
    service,
    /function buildCreateAssignmentParams_[\s\S]*!isShiftBuilderAssignableUser_\(targetUser\)/,
    "配置書込み時のdeveloper拒否が必要"
  );

  const createIndex = service.indexOf("function shiftBuilderCreateAssignment(");
  const replaceIndex = service.indexOf("function shiftBuilderReplaceAssignment(");
  assert.ok(createIndex !== -1 && replaceIndex !== -1);
  assert.match(
    service.slice(createIndex, service.indexOf("function", createIndex + 1)),
    /buildCreateAssignmentParams_\(body, operator\)/,
    "作成経路がガード対象の関数を通っていない"
  );
  assert.match(
    service.slice(replaceIndex, service.indexOf("function", replaceIndex + 1)),
    /buildCreateAssignmentParams_\(body, operator\)/,
    "入替経路がガード対象の関数を通っていない"
  );
});
