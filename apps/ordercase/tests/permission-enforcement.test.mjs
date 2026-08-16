import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const permissionSource = readFileSync(
  new URL('../backend/ordercase-apps-script/Service_OrderCasePermissions.js', import.meta.url),
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
