import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const permissionSource = readFileSync(
  new URL('../backend/ordercase-apps-script/Service_OrderCasePermissions.js', import.meta.url),
  'utf8'
);
const storesMasterSource = readFileSync(
  new URL('../backend/ordercase-apps-script/Service_StoresMaster.js', import.meta.url),
  'utf8'
);

function createContext() {
  const context = vm.createContext({});
  vm.runInContext(permissionSource, context);
  return context;
}

test('案件登録capabilityを持つ実効権限だけを許可する', () => {
  const context = createContext();
  const authorization = {
    modules: {
      ordercase: {
        capabilities: ['ordercase.view', 'ordercase.case.create']
      }
    }
  };

  assert.equal(
    context.hasOrderCaseCapability_(authorization, 'ordercase.case.create'),
    true
  );
  assert.equal(
    context.hasOrderCaseCapability_(authorization, 'ordercase.case.edit'),
    false
  );
});

test('共通権限が欠落・不正な場合は案件登録をfail-closedにする', () => {
  const context = createContext();

  assert.equal(context.hasOrderCaseCapability_(null, 'ordercase.case.create'), false);
  assert.equal(context.hasOrderCaseCapability_({ modules: {} }, 'ordercase.case.create'), false);
  assert.equal(context.hasOrderCaseCapability_({
    modules: { ordercase: { capabilities: 'ordercase.case.create' } }
  }, 'ordercase.case.create'), false);
});

test('createCase APIは編集判定ではなく案件登録専用判定を使う', () => {
  const apiSource = readFileSync(
    new URL('../backend/ordercase-apps-script/Api_Post.js', import.meta.url),
    'utf8'
  );
  const createBranch = apiSource.slice(
    apiSource.indexOf("if (action === 'createCase')"),
    apiSource.indexOf('createCase ここまで')
  );

  assert.match(createBranch, /requireOrderCaseCreator_\(/);
  assert.doesNotMatch(createBranch, /requireOrderCaseEditor_\(/);
  assert.match(permissionSource, /action: 'resolveAuthorizationContextByIdToken'/);
  assert.match(apiSource, /if \(action === 'updateStoreMaster'\)/);
  assert.match(apiSource, /if \(action === 'createAgencyMaster'\)/);
  assert.match(apiSource, /if \(action === 'updateAgencyMaster'\)/);
  assert.match(apiSource, /createAgencyMaster'[\s\S]*requireOrderCaseEditor_/);
});

test('共通権限APIが通信例外なら案件登録用の権限取得をfail-closedにする', () => {
  const context = createContext();
  context.SHIFTCORE_ACCOUNT_API_URL = 'https://example.invalid/account';
  context.UrlFetchApp = {
    fetch() {
      throw new Error('network failed');
    }
  };

  assert.throws(
    () => context.resolveOrderCaseAuthorizationByIdToken_('token'),
    /network failed/
  );
});

test('共通権限APIがJSON以外を返したら案件登録用の権限取得を拒否する', () => {
  const context = createContext();
  context.SHIFTCORE_ACCOUNT_API_URL = 'https://example.invalid/account';
  context.UrlFetchApp = {
    fetch: () => ({ getContentText: () => '<!DOCTYPE html>' })
  };

  assert.throws(
    () => context.resolveOrderCaseAuthorizationByIdToken_('token'),
    /共通権限APIの応答を確認できません/
  );
});

test('案件登録専用判定は旧編集権限があってもcreate capability欠落を拒否する', () => {
  const context = createContext();
  context.requireOrderCaseEditor_ = () => ({ permission: 'edit' });
  context.resolveOrderCaseAuthorizationByIdToken_ = () => ({
    authorization: {
      modules: { ordercase: { capabilities: ['ordercase.view', 'ordercase.case.edit'] } }
    }
  });

  assert.throws(
    () => context.requireOrderCaseCreator_('token'),
    /案件を登録する権限がありません/
  );
});

test('本番店舗マスター更新ルートの実装関数をローカル正本にも保持する', () => {
  const context = vm.createContext({});
  vm.runInContext(storesMasterSource, context);

  assert.equal(typeof context.updateStoreMaster_, 'function');
  assert.equal(typeof context.ensureStoreMasterLocationColumns_, 'function');
  assert.equal(typeof context.getStoresMasterForManagement_, 'function');
});

test('更新認可は15分キャッシュを使わずAccountの現行状態を確認する', () => {
  const context = createContext();
  let cacheReadCount = 0;
  let accountFetchCount = 0;

  context.ORDERCASE_MODULE_KEY = 'ordercase';
  context.ORDERCASE_PERMISSION_ALL = 'all';
  context.ORDERCASE_PERMISSION_EDIT = 'edit';
  context.ORDERCASE_PERMISSION_VIEW = 'view';
  context.ORDERCASE_PERMISSION_VIEW_WITHOUT_AMOUNT = 'view_without_amount';
  context.SHIFTCORE_ACCOUNT_API_URL = 'https://example.invalid/account';
  context.Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: () => [1, 2, 3],
    base64EncodeWebSafe: () => 'digest'
  };
  context.CacheService = {
    getScriptCache() {
      return {
        get() {
          cacheReadCount += 1;
          return JSON.stringify({
            status: 'active',
            allowed_modules: ['ordercase'],
            ordercase_permission: 'edit'
          });
        },
        put() {}
      };
    }
  };
  context.UrlFetchApp = {
    fetch() {
      accountFetchCount += 1;
      return {
        getContentText: () => JSON.stringify({
          ok: true,
          user: {
            status: 'stopped',
            allowed_modules: ['ordercase'],
            ordercase_permission: 'edit'
          }
        })
      };
    }
  };

  assert.throws(
    () => context.requireOrderCaseEditor_('token'),
    /停止中/
  );
  assert.equal(cacheReadCount, 0);
  assert.equal(accountFetchCount, 1);
});

test('案件作成の操作IDとpayloadハッシュは読取APIへ公開しない', () => {
  const context = createContext();
  context.ORDERCASE_INTERNAL_FIELDS = ['create_operation_id', 'create_payload_hash'];
  context.ORDERCASE_AMOUNT_FIELDS = ['amount'];

  const visible = context.applyOrderCaseVisibility_({
    case_id: 'CASE-1',
    create_operation_id: 'operation-00000001',
    create_payload_hash: 'private-hash',
    amount: '1000',
    nested: {
      create_payload_hash: 'nested-private-hash'
    }
  }, { canViewAmount: true });

  assert.equal(visible.case_id, 'CASE-1');
  assert.equal(visible.amount, '1000');
  assert.equal('create_operation_id' in visible, false);
  assert.equal('create_payload_hash' in visible, false);
  assert.equal('create_payload_hash' in visible.nested, false);
});
