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

test("正規化回答と再送トークンだけをrecordIdと共に送信し、失敗時は入力を保持する", () => {
  assert.match(source, /attendanceRequest\("submitReport", \{ recordId: formData\.record\.recordId, answers, submissionToken \}\)/);
  assert.doesNotMatch(source, /planId:|planName:|result, notes/);
  assert.match(source, /入力内容は画面に残っています/);
  assert.match(source, /同じ勤怠記録へ安全に再送できます/);
  assert.match(source, /formData\.resumeSubmissionToken/);
  assert.ok(source.includes("前回の送信を復元しました"));
});

test("実績報告は送信前に本人・案件・店舗とカテゴリ別回答を確認できる", () => {
  assert.match(html, /id="reportConfirmDialog"/);
  assert.match(html, /id="editReportBtn"/);
  assert.match(html, /id="confirmSubmitBtn"/);
  assert.match(source, /pendingAnswers = collectAnswers\(\)/);
  assert.match(source, /renderConfirmation\(pendingAnswers\)/);
  assert.match(source, /if \(submitting\) event\.preventDefault\(\)/);
  assert.match(source, /未入力→0件/);
  assert.match(css, /\.confirm-answers\{[^}]*overflow:auto/);
});

test("実績報告の保存後は自動遷移せず本人へ労いと受付結果を表示する", () => {
  assert.match(html, /id="completionState"/);
  assert.ok(source.includes("今日もお疲れさまでした"));
  assert.ok(source.includes("本日の稼働と実績報告をありがとうございます"));
  assert.match(source, /実績報告を第\$\{result\.revisionNumber\}版として受け付けました/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => location\.replace\("\.\/dashboard\.html"\), 900\)/);
});
