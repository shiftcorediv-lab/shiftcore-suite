import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const apiClientSource = readFileSync(
  new URL('../js/api.js', import.meta.url),
  'utf8'
);
const apiGetSource = readFileSync(
  new URL('../backend/ordercase-apps-script/Api_Get.js', import.meta.url),
  'utf8'
);
const apiPostSource = readFileSync(
  new URL('../backend/ordercase-apps-script/Api_Post.js', import.meta.url),
  'utf8'
);
const codeSource = readFileSync(
  new URL('../backend/ordercase-apps-script/Code.js', import.meta.url),
  'utf8'
);
const workerSource = readFileSync(
  new URL('../../../workers/ordercaseapiproxyworker/worker.js', import.meta.url),
  'utf8'
);

test('認証付き読取はIDトークンをURLではなくPOST bodyへ入れる', async () => {
  const requests = [];
  const context = vm.createContext({
    URL,
    JSON,
    Object,
    window: {
      ORDERCASE_CONFIG: {
        API_URL: 'https://ordercase.example/api'
      }
    },
    getOrderCaseIdToken: async () => 'SECRET_ID_TOKEN',
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ ok: true })
      };
    },
    console: { error() {} }
  });
  vm.runInContext(apiClientSource, context);

  const result = await context.fetchApiJsonWithParams('getCaseDetail', {
    case_id: 'CASE-001'
  });

  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://ordercase.example/api');
  assert.equal(requests[0].options.method, 'POST');
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.action, 'getCaseDetail');
  assert.equal(body.case_id, 'CASE-001');
  assert.equal(body.idToken, 'SECRET_ID_TOKEN');
  assert.doesNotMatch(requests[0].url, /SECRET_ID_TOKEN|idToken/);
});

test('非JSON応答のログと画面エラーへURL・本文を漏らさない', async () => {
  const errors = [];
  const context = vm.createContext({
    URL,
    JSON,
    Object,
    window: { ORDERCASE_CONFIG: { API_URL: 'https://ordercase.example/api' } },
    getOrderCaseIdToken: async () => 'SECRET_ID_TOKEN',
    fetch: async () => ({
      status: 502,
      statusText: 'Bad Gateway',
      url: 'https://ordercase.example/api?idToken=SECRET_ID_TOKEN',
      text: async () => 'PRIVATE_STACK_AND_RESPONSE'
    }),
    console: { error: (...args) => errors.push(args) }
  });
  vm.runInContext(apiClientSource, context);

  await assert.rejects(
    context.fetchApiJson('bootstrap'),
    error => {
      assert.doesNotMatch(error.message, /SECRET_ID_TOKEN|PRIVATE_STACK/);
      return true;
    }
  );
  assert.doesNotMatch(JSON.stringify(errors), /SECRET_ID_TOKEN|PRIVATE_STACK/);
});

test('認証付きGETをGASとWorkerの両方で拒否する', () => {
  const context = vm.createContext({
    jsonResponse_: value => value,
    orderCaseRuntimeEnvironment_: () => 'production'
  });
  vm.runInContext(apiGetSource, context);

  const result = context.handleGet_({
    parameter: { action: 'listCases', idToken: 'SECRET_ID_TOKEN' }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'METHOD_NOT_ALLOWED');
  assert.match(workerSource, /TOKEN_IN_URL_REJECTED/);
  assert.match(workerSource, /searchParams\.has\("idToken"\)/);
});

test('POSTされた読取actionだけを読取処理へ渡す', () => {
  const calls = [];
  const context = vm.createContext({
    parsePostBody_: event => event.body,
    isOrderCaseReadAction_: action => action === 'listCases',
    handleOrderCaseRead_: body => {
      calls.push(body);
      return { ok: true };
    },
    jsonResponse_: value => value
  });
  vm.runInContext(apiPostSource, context);

  const result = context.handlePost_({
    body: { action: 'listCases', idToken: 'SECRET_ID_TOKEN' }
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].idToken, 'SECRET_ID_TOKEN');
});

test('GASの外部エラー応答へstackを含めない', () => {
  assert.doesNotMatch(apiGetSource, /\bstack\s*:/);
  assert.doesNotMatch(apiPostSource, /\bstack\s*:/);
  assert.doesNotMatch(codeSource, /\bstack\s*:/);
  assert.doesNotMatch(workerSource, /message:\s*error\.message/);
});
