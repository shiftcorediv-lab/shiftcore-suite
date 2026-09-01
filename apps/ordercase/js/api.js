/****************************************************
 * api.js
 * OrderCase API通信共通処理
 ****************************************************/

/****************************************************
 * parseApiJsonResponse_ ここから
 * APIレスポンスをJSONとして解析する
 * JSONでない場合は原因調査しやすい情報を出す
 ****************************************************/
async function parseApiJsonResponse_(res, context) {
  const text = await res.text();

  let json;

  try {
    json = JSON.parse(text);
  } catch (error) {
    console.error('OrderCase API non-JSON response', {
      context: context || '',
      status: res.status,
      statusText: res.statusText
    });

    throw new Error(
      'APIの返答がJSONではありません。status=' + res.status
    );
  }

  return json;
}
/****************************************************
 * parseApiJsonResponse_ ここまで
 ****************************************************/

/****************************************************
 * fetchApiJsonWithParams ここから
 ****************************************************/
async function fetchApiJsonWithParams(action, params, options = {}) {
  const base = window.ORDERCASE_CONFIG.API_URL;

  if (!base || !base.startsWith('https://')) {
    throw new Error('API URLが不正です: ' + base);
  }

  const idToken = await getOrderCaseIdToken();
  const requestOptions = Object.assign({}, options, {
    method: 'POST',
    headers: Object.assign({}, options.headers || {}, {
      'Content-Type': 'text/plain;charset=utf-8'
    }),
    body: JSON.stringify(Object.assign({}, params || {}, {
      action: action,
      idToken: idToken
    }))
  });

  const res = await fetch(base, requestOptions);

  return parseApiJsonResponse_(res, action);
}
/****************************************************
 * fetchApiJsonWithParams ここまで
 ****************************************************/


/****************************************************
 * fetchApiJson ここから
 ****************************************************/
async function fetchApiJson(action, options = {}) {
  return fetchApiJsonWithParams(action, {}, options);
}
/****************************************************
 * fetchApiJson ここまで
 ****************************************************/


/****************************************************
 * postCreateCase ここから
 ****************************************************/
async function postCreateCase(payload) {
  const base = window.ORDERCASE_CONFIG.API_URL;
  const idToken = await getOrderCaseIdToken();

  const res = await fetch(base, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action: 'createCase',
      idToken: idToken,
      payload: payload
    })
  });

  return parseApiJsonResponse_(res, 'createCase');
}
/****************************************************
 * postCreateCase ここまで
 ****************************************************/


/****************************************************
 * postUpdateCase ここから
 ****************************************************/
async function postUpdateCase(payload) {
  const base = window.ORDERCASE_CONFIG.API_URL;

  if (!base || !base.startsWith('https://')) {
    throw new Error('API URLが不正です: ' + base);
  }

  const idToken = await getOrderCaseIdToken();

  const res = await fetch(base, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action: 'updateCase',
      idToken: idToken,
      payload: payload
    })
  });

  return parseApiJsonResponse_(res, 'updateCase');
}

async function postOrderCaseAction(action, payload) {
  const base = window.ORDERCASE_CONFIG.API_URL;
  const idToken = await getOrderCaseIdToken();
  const res = await fetch(base, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: action, idToken: idToken, payload: payload })
  });
  return parseApiJsonResponse_(res, action);
}
/****************************************************
 * postUpdateCase ここまで
 ****************************************************/
