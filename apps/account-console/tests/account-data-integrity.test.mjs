import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const utilsSource = readFileSync(
  new URL("../backend/account-apps-script/utils.js", import.meta.url),
  "utf8"
);
const usersSource = readFileSync(
  new URL("../backend/account-apps-script/account_console_users.js", import.meta.url),
  "utf8"
);
const logsSource = readFileSync(
  new URL("../backend/account-apps-script/account_console_logs.js", import.meta.url),
  "utf8"
);
const signupUserWriteSource = readFileSync(
  new URL("../backend/account-apps-script/signup_user_write.js", import.meta.url),
  "utf8"
);

function createContext() {
  const context = vm.createContext({});
  vm.runInContext(utilsSource, context);
  vm.runInContext(usersSource, context);
  return context;
}

test("Account系シート書込みは空白や改行で隠した数式も無害化する", () => {
  const context = createContext();
  for (const value of ["=IMPORTXML()", " +1+1", "\n-1+1", "\t@SUM(A1:A2)"]) {
    assert.equal(context.escapeAccountSpreadsheetValue_(value), `'${value}`);
  }
  assert.equal(context.escapeAccountSpreadsheetValue_("山田太郎"), "山田太郎");
  assert.equal(context.escapeAccountSpreadsheetValue_(false), false);

  assert.match(usersSource, /escapeAccountSpreadsheetValue_\(newUser\[header\]/);
  assert.match(logsSource, /escapeAccountSpreadsheetValue_\(log\[header\]/);
  assert.match(signupUserWriteSource, /escapeAccountSpreadsheetValue_\(key in rowObject/);
});

test("途中書込み失敗時は適用済みセルだけを元へ戻す", () => {
  const context = createContext();
  const values = new Map([[2, "旧氏名"], [3, "old@example.com"]]);
  let writeCount = 0;
  const sheet = {
    getRange(_row, column) {
      return {
        setValue(value) {
          writeCount += 1;
          if (writeCount === 2) throw new Error("WRITE_FAILED");
          values.set(column, value);
        }
      };
    }
  };

  assert.throws(
    () => context.writeAccountConsoleFieldsWithRollback_(
      sheet,
      2,
      ["internal_user_id", "name", "email"],
      { name: "旧氏名", email: "old@example.com" },
      { name: "新氏名", email: "new@example.com" },
      ["name", "email"]
    ),
    /ACCOUNT_CONSOLE_UPDATE_FAILED/
  );
  assert.equal(values.get(2), "旧氏名");
  assert.equal(values.get(3), "old@example.com");
});

test("復元にも失敗した場合は要手動復旧として返す", () => {
  const context = createContext();
  let writeCount = 0;
  const sheet = {
    getRange() {
      return {
        setValue() {
          writeCount += 1;
          if (writeCount >= 2) throw new Error("SHEET_UNAVAILABLE");
        }
      };
    }
  };

  assert.throws(
    () => context.writeAccountConsoleFieldsWithRollback_(
      sheet,
      2,
      ["internal_user_id", "name", "email"],
      { name: "旧氏名", email: "old@example.com" },
      { name: "新氏名", email: "new@example.com" },
      ["name", "email"]
    ),
    (error) => {
      assert.equal(error.code, "ACCOUNT_CONSOLE_UPDATE_RECOVERY_REQUIRED");
      assert.deepEqual(Array.from(error.rollback_error_codes), ["SHEET_UNAVAILABLE"]);
      return true;
    }
  );
});

test("一意項目の重複判定は更新対象本人を除外する", () => {
  const context = createContext();
  const headers = ["internal_user_id", "employee_code", "email"];
  const values = [
    headers,
    ["U-1", "AN0001", "one@example.com"],
    ["U-2", "AN0002", "two@example.com"]
  ];

  assert.equal(context.accountConsoleValueExists_(values, headers, "employee_code", "an0001", "U-2"), true);
  assert.equal(context.accountConsoleValueExists_(values, headers, "employee_code", "an0002", "U-2"), false);
  assert.equal(context.accountConsoleValueExists_(values, headers, "email", "ONE@example.com", "U-2"), true);
});
