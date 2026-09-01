import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { buildOrderCaseDetailsUrl } from "../js/shiftbuilder/render-shift-table.js";

const apiSource = await readFile(
  new URL("../backend/shiftbuilder-apps-script/api.js", import.meta.url),
  "utf8"
);

test("Order案件詳細の新規タブURLへTEST環境を継承する", () => {
  const environment = {
    withEnvironment(url) {
      const target = new URL(url, "https://shiftcorediv-lab.github.io/shiftcore-suite/apps/shiftbuilder/");
      target.searchParams.set("shiftcore_env", "staging");
      return target.toString();
    }
  };

  const url = new URL(buildOrderCaseDetailsUrl("CASE 001", environment));
  assert.equal(url.pathname, "/shiftcore-suite/apps/ordercase/case.html");
  assert.equal(url.searchParams.get("case_id"), "CASE 001");
  assert.equal(url.searchParams.get("shiftcore_env"), "staging");
});

test("環境判定がなければOrder案件詳細リンクを生成しない", () => {
  assert.throws(
    () => buildOrderCaseDetailsUrl("CASE-001", null),
    /環境判定を確認できません/
  );
});

function createApiContext(runtimeEnvironment) {
  const calls = [];
  const context = {
    Object,
    JSON,
    normalizeText: value => String(value || "").trim(),
    shiftBuilderRuntimeEnvironment_: () => runtimeEnvironment,
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) {
        return {
          setMimeType() {
            return JSON.parse(text);
          }
        };
      }
    },
    ng_: (message, code) => ({ ok: false, message, code }),
    shiftBuilderCreateAssignment: body => {
      calls.push(body);
      return { ok: true };
    }
  };

  vm.runInNewContext(apiSource, context);
  return { context, calls };
}

test("TEST画面からproduction Shift APIへの全更新を保存前に拒否する", () => {
  const mutationActions = [
    "shiftBuilderCreateAssignment",
    "shiftBuilderArchiveAssignment",
    "shiftBuilderReplaceAssignment",
    "shiftBuilderSendPersonnelIcs"
  ];

  for (const action of mutationActions) {
    const { context, calls } = createApiContext("production");
    const result = context.doPost({
      postData: {
        contents: JSON.stringify({
          action,
          clientEnvironment: "staging"
        })
      }
    });

    assert.equal(result.ok, false, action);
    assert.match(result.message, /接続環境が一致しない/, action);
    assert.equal(calls.length, 0, action);
  }
});

test("環境が一致するShift更新だけ処理へ渡す", () => {
  const { context, calls } = createApiContext("staging");
  const result = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "shiftBuilderCreateAssignment",
        clientEnvironment: "staging"
      })
    }
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
});

test("環境指定なしの旧クライアントによるShift更新を拒否する", () => {
  const { context, calls } = createApiContext("production");
  const result = context.doPost({
    postData: {
      contents: JSON.stringify({ action: "shiftBuilderCreateAssignment" })
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /clientEnvironment が必要です/);
  assert.equal(calls.length, 0);
});
