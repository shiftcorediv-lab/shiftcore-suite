import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mainSource = readFileSync(new URL("../js/shiftbuilder/main.js", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../js/shiftbuilder/api.js", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../backend/shiftbuilder-apps-script/ShiftBuilderService.js", import.meta.url), "utf8");
const repositorySource = readFileSync(new URL("../backend/shiftbuilder-apps-script/repositore.js", import.meta.url), "utf8");

test("希望休は警告し、本人了承後だけアサイン要求を送る", () => {
  assert.match(mainSource, /本人へ相談し、アサインの了承を得ていますか/);
  assert.match(mainSource, /requestedOffConfirmed:\s*requestedOffConfirmed/);
  assert.match(apiSource, /requestedOffConfirmed:\s*params\.requestedOffConfirmed === true/);
});

test("バックエンドでも希望休の本人了承を必須にする", () => {
  assert.match(serviceSource, /validateRequestedOffAssignment_\([\s\S]*params\.requested_off_confirmed/);
  assert.match(serviceSource, /希望休・本人相談了承済み/);
  assert.match(repositorySource, /requestedOffConfirmed !== true/);
  assert.match(repositorySource, /相談・了承確認が必要/);
});
