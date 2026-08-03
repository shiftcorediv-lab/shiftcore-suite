import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const serviceSource = fs.readFileSync(
  new URL('../backend/ordercase-apps-script/Service_Cases.js', import.meta.url),
  'utf8'
);
const repositorySource = fs.readFileSync(
  new URL('../backend/ordercase-apps-script/Repository_Sheets.js', import.meta.url),
  'utf8'
);

function loadServiceContext() {
  const context = vm.createContext({ console });
  vm.runInContext(serviceSource, context);
  return context;
}

test('時刻はHH:mm形式かつ開始より後の終了だけを許可する', () => {
  const context = loadServiceContext();
  assert.doesNotThrow(() => context.validateWorkTimeRange_('10:00', '18:00', '基本時間'));
  assert.throws(() => context.validateWorkTimeRange_('10:00', '9:00', '基本時間'));
  assert.throws(() => context.validateWorkTimeRange_('18:00', '10:00', '基本時間'));
});

test('人数は整数、金額は許可区分の0以上だけを許可する', () => {
  const context = loadServiceContext();
  assert.equal(context.normalizeSameConditionCount_(3), 3);
  assert.throws(() => context.normalizeSameConditionCount_(2.5));
  assert.doesNotThrow(() => context.validateAmountFields_({
    amount_type: 'per_person_day', amount: '18000'
  }, false));
  assert.doesNotThrow(() => context.validateAmountFields_({ amount_type: 'per_day', amount: '1' }, true));
  assert.throws(() => context.validateAmountFields_({ amount_type: 'per_day', amount: '1' }, false));
  assert.throws(() => context.validateAmountFields_({ amount_type: 'unknown', amount: '1' }, true));
  assert.throws(() => context.validateAmountFields_({ amount_type: 'per_case', amount: '-1' }, false));
});

test('OC時刻変更は未確定アサインだけ更新し、確定状態を保護する', () => {
  const values = [
    ['case_id', 'case_date_id', 'assignment_status', 'start_time', 'end_time', 'updated_at', 'updated_by', 'archived'],
    ['CASE-1', 'DATE-1', 'draft', '10:00', '18:00', '', '', false],
    ['CASE-1', 'DATE-1', 'confirmed', '10:00', '18:00', '', '', false],
    ['CASE-1', 'DATE-1', 'archived', '10:00', '18:00', '', '', true],
    ['CASE-2', 'DATE-1', 'draft', '10:00', '18:00', '', '', false]
  ];
  const writes = [];
  const sheet = {
    getDataRange: () => ({ getValues: () => values.map(row => row.slice()) }),
    getRange: rowNumber => ({
      setValues: rows => {
        writes.push({ rowNumber, row: rows[0].slice() });
        values[rowNumber - 1] = rows[0].slice();
      }
    })
  };
  const context = vm.createContext({
    console,
    SHIFTBUILDER_SPREADSHEET_ID: 'TEST-SHEET',
    SHEET_SHIFT_ASSIGNMENTS: 'shift_assignments',
    formatDate_: () => '2026-08-03T18:00:00+09:00',
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: () => sheet }),
      flush() {}
    }
  });
  vm.runInContext(repositorySource, context);

  const result = context.syncDraftShiftAssignmentTimesByCaseId_(
    'CASE-1',
    { start_time: '10:30', end_time: '17:30' },
    {},
    'editor@example.com',
    new Date()
  );

  assert.deepEqual({ ...result }, { updated_count: 1, protected_count: 1 });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].row[3], '10:30');
  assert.equal(writes[0].row[4], '17:30');
  assert.equal(values[2][3], '10:00');
});

test('担当者入れ替えAPIへ選択セルの開始・終了時刻を渡す', () => {
  const apiSource = fs.readFileSync(
    new URL('../../shiftbuilder/js/shiftbuilder/api.js', import.meta.url),
    'utf8'
  );
  const mainSource = fs.readFileSync(
    new URL('../../shiftbuilder/js/shiftbuilder/main.js', import.meta.url),
    'utf8'
  );
  assert.match(apiSource, /startTime:\s*params\.startTime/);
  assert.match(apiSource, /endTime:\s*params\.endTime/);
  assert.match(mainSource, /startTime:\s*cell\.start_time/);
  assert.match(mainSource, /endTime:\s*cell\.end_time/);
});
