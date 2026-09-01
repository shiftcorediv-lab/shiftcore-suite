import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const browserPolicySource = readFileSync(
  new URL('../js/create-operation-policy.js', import.meta.url),
  'utf8'
);
const casesServiceSource = readFileSync(
  new URL('../backend/ordercase-apps-script/Service_Cases.js', import.meta.url),
  'utf8'
);
const createPageSource = readFileSync(
  new URL('../index.html', import.meta.url),
  'utf8'
);

function createCasesContext() {
  const sheetRows = {
    cases: [],
    case_dates: []
  };
  const context = vm.createContext({
    Date,
    JSON,
    Object,
    String,
    Array,
    Number,
    isFinite,
    SHEET_CASES: 'cases',
    SHEET_CASE_DATES: 'case_dates',
    getSheetObjects_: sheetName => sheetRows[sheetName] || [],
    Utilities: {
      Charset: { UTF_8: 'utf8' },
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_algorithm, value) => Array.from(createHash('sha256').update(value, 'utf8').digest()),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url')
    }
  });
  vm.runInContext(casesServiceSource, context);
  return { context, sheetRows };
}

test('同じ入力の再送には同じ操作IDを使い、入力変更後は新しいIDにする', () => {
  let sequence = 0;
  const window = {
    crypto: {
      randomUUID() {
        sequence += 1;
        return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
      }
    }
  };
  const context = vm.createContext({ window, JSON, Object, String, Uint8Array, Array });
  vm.runInContext(browserPolicySource, context);

  const tracker = window.OrderCaseCreateOperationPolicy.createTracker(window.crypto);
  const first = tracker.attach({ store_name: '店舗A', amount: '1000' });
  const retry = tracker.attach({ store_name: '店舗A', amount: '1000' });
  const changed = tracker.attach({ store_name: '店舗A', amount: '2000' });

  assert.equal(retry.create_operation_id, first.create_operation_id);
  assert.notEqual(changed.create_operation_id, first.create_operation_id);

  tracker.complete(changed.create_operation_id);
  const nextOperation = tracker.attach({ store_name: '店舗A', amount: '2000' });
  assert.notEqual(nextOperation.create_operation_id, changed.create_operation_id);
});

test('作成画面は操作IDポリシーを読込み、サーバー成功後の画面失敗を再登録扱いにしない', () => {
  const policyScriptIndex = createPageSource.indexOf('js/create-operation-policy.js');
  const trackerIndex = createPageSource.indexOf('OrderCaseCreateOperationPolicy.createTracker()');

  assert.ok(policyScriptIndex >= 0);
  assert.ok(policyScriptIndex < trackerIndex);
  assert.match(createPageSource, /registrationConfirmed\s*=\s*true/);
  assert.match(createPageSource, /登録自体は完了しています/);
  assert.match(createPageSource, /button\.disabled\s*=\s*registrationConfirmed\s*&&\s*!formResetCompleted/);
});

test('payloadハッシュはキー順と操作IDに依存せず、案件内容の変更を検出する', () => {
  const { context } = createCasesContext();
  const first = context.buildCreateOperationPayloadHash_({
    create_operation_id: 'operation-00000001',
    created_by: '作成者A',
    created_by_email: 'creator@example.com',
    store_name: '店舗A',
    nested: { b: 2, a: 1 }
  });
  const reordered = context.buildCreateOperationPayloadHash_({
    nested: { a: 1, b: 2 },
    store_name: '店舗A',
    created_by: '作成者B',
    created_by_email: 'creator@example.com',
    create_operation_id: 'operation-00000002'
  });
  const changed = context.buildCreateOperationPayloadHash_({
    nested: { a: 1, b: 2 },
    store_name: '店舗B',
    create_operation_id: 'operation-00000002'
  });

  assert.equal(reordered, first);
  assert.notEqual(changed, first);
});

test('保存済みの同一操作は既存結果を返し、異なる内容と途中状態はfail-closedにする', () => {
  const { context, sheetRows } = createCasesContext();
  const operationId = 'operation-00000001';
  const payload = {
    create_operation_id: operationId,
    input_mode: 'dates',
    case_dates: [{ work_date: '2026-09-10' }, { work_date: '2026-09-11' }]
  };
  const payloadHash = context.buildCreateOperationPayloadHash_(payload);
  const operation = {
    operation_id: operationId,
    payload_hash: payloadHash,
    same_condition_count: 2,
    alternate_worker_count: 0,
    input_mode: 'dates'
  };

  sheetRows.cases = [
    { case_id: 'CASE-1', copy_index: 1, case_group_id: 'GROUP-1', create_operation_id: operationId, create_payload_hash: payloadHash },
    { case_id: 'CASE-2', copy_index: 2, case_group_id: 'GROUP-1', create_operation_id: operationId, create_payload_hash: payloadHash }
  ];
  sheetRows.case_dates = [
    { case_id: 'CASE-1' },
    { case_id: 'CASE-1' },
    { case_id: 'CASE-2' },
    { case_id: 'CASE-2' }
  ];

  const replay = context.resolveCreateOperationReplay_(payload, operation);
  assert.equal(replay.idempotent_replay, true);
  assert.deepEqual(Array.from(replay.case_ids), ['CASE-1', 'CASE-2']);
  assert.equal(replay.created_case_dates_count, 4);

  sheetRows.cases[1].create_payload_hash = 'different-hash';
  assert.throws(
    () => context.resolveCreateOperationReplay_(payload, operation),
    /異なる案件内容/
  );

  sheetRows.cases[0].create_payload_hash = payloadHash;
  sheetRows.cases = sheetRows.cases.slice(0, 1);
  assert.throws(
    () => context.resolveCreateOperationReplay_(payload, operation),
    /途中状態/
  );
});

test('createCase_の再送はロック内で既存案件を返し、新しい行を作らない', () => {
  const { context, sheetRows } = createCasesContext();
  let released = false;
  context.LockService = {
    getScriptLock() {
      return {
        waitLock() {},
        releaseLock() {
          released = true;
        }
      };
    }
  };
  context.ensureCaseRankColumn_ = () => {};
  context.ensureCaseDateConditionColumns_ = () => {};
  context.ensureCaseCreateOperationColumns_ = () => {};
  context.createSingleCase_ = () => {
    throw new Error('再送時に新規案件を作成してはいけません。');
  };

  const payload = {
    create_operation_id: 'operation-00000001',
    target_month: '2026-09',
    case_type: 'event_sales',
    case_rank: 'B',
    input_mode: 'days',
    agency_name: '代理店A',
    store_name: '店舗A',
    store_area: '関西',
    required_lines: 1,
    people_per_line: 1,
    requested_days: 2,
    shiftcore_display_name: '店舗A',
    work_start_time: '10:00',
    work_end_time: '18:00',
    same_condition_count: 1,
    created_by: '作成者A',
    created_by_email: 'creator@example.com',
    case_dates: []
  };
  const payloadHash = context.buildCreateOperationPayloadHash_(payload);
  sheetRows.cases = [{
    case_id: 'CASE-1',
    create_operation_id: payload.create_operation_id,
    create_payload_hash: payloadHash,
    agency_name: payload.agency_name,
    store_name: payload.store_name,
    store_area: payload.store_area
  }];

  const result = context.createCase_(payload);

  assert.equal(result.idempotent_replay, true);
  assert.equal(result.case_id, 'CASE-1');
  assert.equal(released, true);
});

test('操作列はロック取得後、案件行追加より前に準備・照合する', () => {
  const lockIndex = casesServiceSource.indexOf('lock.waitLock(10000)');
  const ensureIndex = casesServiceSource.indexOf('ensureCaseCreateOperationColumns_();');
  const replayIndex = casesServiceSource.indexOf('resolveCreateOperationReplay_(');
  const createLoopIndex = casesServiceSource.indexOf('for (let index = 1; index <= sameConditionCount; index++)');

  assert.ok(lockIndex >= 0);
  assert.ok(lockIndex < ensureIndex);
  assert.ok(ensureIndex < replayIndex);
  assert.ok(replayIndex < createLoopIndex);
  assert.match(casesServiceSource, /create_operation_id:\s*payload\.create_operation_id/);
  assert.match(casesServiceSource, /create_payload_hash:\s*payload\.create_payload_hash/);
});
