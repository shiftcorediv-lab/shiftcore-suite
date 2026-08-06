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
const storesMasterSource = fs.readFileSync(
  new URL('../backend/ordercase-apps-script/Service_StoresMaster.js', import.meta.url),
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
    ['assignment_id', 'case_id', 'case_date_id', 'assignment_status', 'start_time', 'end_time', 'updated_at', 'updated_by', 'archived', 'assignment_note'],
    ['A-1', 'CASE-1', 'DATE-1', 'draft', '10:00', '18:00', '', '', false, 'SB入力は維持'],
    ['A-2', 'CASE-1', 'DATE-1', 'confirmed', '10:00', '18:00', '', '', false, '保護'],
    ['A-3', 'CASE-1', 'DATE-1', 'archived', '10:00', '18:00', '', '', true, '対象外'],
    ['A-4', 'CASE-1', 'DATE-1', '', '10:00', '18:00', '', '', false, '状態不明'],
    ['A-5', 'CASE-2', 'DATE-1', 'draft', '10:00', '18:00', '', '', false, '別案件']
  ];
  const writes = [];
  const sheet = {
    getDataRange: () => ({ getValues: () => values.map(row => row.slice()) }),
    getRange: (rowNumber, columnNumber, numRows, numColumns) => ({
      getValues: () => [values[rowNumber - 1].slice(0, numColumns).map((value, index) => {
        if (rowNumber === 2 && (index === 4 || index === 5) && typeof value === 'string') {
          return {
            [Symbol.toStringTag]: 'Date',
            getTime: () => 1,
            timeText: value
          };
        }
        return value;
      })],
      setValue: value => {
        writes.push({ rowNumber, columnNumber, value });
        values[rowNumber - 1][columnNumber - 1] = value;
      }
    })
  };
  const context = vm.createContext({
    console,
    SHIFTBUILDER_SPREADSHEET_ID: 'TEST-SHEET',
    SHEET_SHIFT_ASSIGNMENTS: 'shift_assignments',
    formatDate_: (value, pattern) => pattern === 'HH:mm'
      ? value.timeText
      : '2026-08-03T18:00:00+09:00',
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

  assert.deepEqual({ ...result }, { updated_count: 1, protected_count: 2 });
  assert.equal(writes.length, 4);
  assert.equal(values[1][4], '10:30');
  assert.equal(values[1][5], '17:30');
  assert.equal(values[1][9], 'SB入力は維持');
  assert.equal(values[2][4], '10:00');
  assert.equal(values[4][4], '10:00');
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

test('店舗状態の入力規則を有効・アーカイブの2種類に統一する', () => {
  const writes = [];
  const existingRule = {
    getCriteriaValues: () => [['active', 'inactive']]
  };
  const sheet = {
    getLastColumn: () => 9,
    getMaxRows: () => 1000,
    getRange: (row, column, numRows = 1, numColumns = 1) => {
      if (row === 1) {
        return {
          getValues: () => [[
            'agency_id', 'agency_name', 'store_id', 'store_name', 'store_area', 'status',
            'store_short_name', 'address', 'nearest_station'
          ]]
        };
      }
      if (row === 2 && column === 6 && numRows === 1 && numColumns === 1) {
        return { getDataValidation: () => existingRule };
      }
      return {
        setDataValidation: rule => writes.push({ row, column, numRows, numColumns, rule })
      };
    }
  };
  const context = vm.createContext({
    SHEET_STORES_MASTER: 'stores_master',
    getSheetForUpdate_: () => sheet,
    SpreadsheetApp: {
      newDataValidation: () => {
        const values = [];
        const builder = {
          requireValueInList: list => { values.push(...list); return builder; },
          setAllowInvalid: () => builder,
          build: () => ({ values })
        };
        return builder;
      }
    }
  });
  vm.runInContext(storesMasterSource, context);

  context.ensureStoreMasterLocationColumns_();

  assert.equal(writes.length, 1);
  assert.deepEqual([...writes[0].rule.values], ['active', 'archived']);
  assert.deepEqual(
    { row: writes[0].row, column: writes[0].column, numRows: writes[0].numRows, numColumns: writes[0].numColumns },
    { row: 2, column: 6, numRows: 999, numColumns: 1 }
  );
});

test('店舗状態は有効かアーカイブだけを受け付ける', () => {
  const context = vm.createContext({});
  vm.runInContext(storesMasterSource, context);

  assert.equal(context.normalizeStoreStatus_('active'), 'active');
  assert.equal(context.normalizeStoreStatus_('archived'), 'archived');
  assert.equal(context.normalizeStoreStatus_(''), 'active');
  assert.throws(() => context.normalizeStoreStatus_('inactive'), /有効.*アーカイブ/);
});
