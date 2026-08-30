import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../work-report.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../js/work-report/main.js", import.meta.url), "utf8");

test("実績報告は暫定フォームの基本情報と定性報告を入力できる", () => {
  for (const label of ["稼働案件名", "氏名（フルネーム）", "店舗名", "入店日", "応対数", "成果につながった行動", "実施した対策と結果"]) {
    assert.ok(html.includes(label), label);
  }
});

test("数値実績と定性報告を既存の実績内容・申し送り契約へまとめる", () => {
  assert.match(source, /U39 MNP/);
  assert.match(source, /コーティング（片面）/);
  assert.match(source, /【実績集計】/);
  assert.match(source, /attendanceRequest\("submitReport", \{ recordId: context\.recordId, planId: plan\.id, planName: plan\.name, result, notes \}\)/);
});
