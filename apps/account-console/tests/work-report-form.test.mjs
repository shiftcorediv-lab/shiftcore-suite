import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../work-report.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../js/work-report/main.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../css/work-report.css", import.meta.url), "utf8");

test("実績報告はGASが確定した本人・案件・店舗・勤務日を表示する", () => {
  assert.match(source, /attendanceRequest\("getWorkReportForm", \{ recordId: context\.recordId \}\)/);
  for (const label of ["稼働案件名", "氏名（フルネーム）", "店舗名", "入店日"]) assert.ok(source.includes(label), label);
  assert.doesNotMatch(html, /id="planSelect"|id="reporterName"|id="storeName"|id="entryDate"/);
});

test("項目マスターをカテゴリ別に折りたたみ、数値と文章を描画する", () => {
  assert.match(html, /id="reportFields"/);
  assert.match(source, /<details class="category"/);
  assert.match(source, /item\.type === "number"/);
  assert.match(source, /data-item-type="text"/);
  assert.match(css, /@media\(max-width:640px\)/);
});

test("正規化回答だけをrecordIdと共に送信し、失敗時は入力を保持する", () => {
  assert.match(source, /attendanceRequest\("submitReport", \{ recordId: formData\.record\.recordId, answers \}\)/);
  assert.doesNotMatch(source, /planId:|planName:|result, notes/);
  assert.match(source, /入力内容は画面に残っています/);
  assert.match(source, /同じ勤怠記録へ安全に再送できます/);
});
