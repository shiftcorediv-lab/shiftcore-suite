/****************************************************
 * api.js
 * OrderCase API通信共通処理
 ****************************************************/


/****************************************************
 * buildApiUrlWithParams ここから
 ****************************************************/
function buildApiUrlWithParams(action, params) {
  const base = window.ORDERCASE_CONFIG.API_URL;

  if (!base || !base.startsWith('https://')) {
    throw new Error('API URLが不正です: ' + base);
  }

  const url = new URL(base);
  url.searchParams.set('action', action);

  Object.keys(params || {}).forEach(function(key) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      url.searchParams.set(key, params[key]);
    }
  });

  return url.toString();
}
/****************************************************
 * buildApiUrlWithParams ここまで
 ****************************************************/


/****************************************************
 * buildParamsWithAuth_ ここから
 ****************************************************/
async function buildParamsWithAuth_(params) {
  const idToken = await getOrderCaseIdToken();

  return Object.assign({}, params || {}, {
    idToken: idToken
  });
}
/****************************************************
 * buildParamsWithAuth_ ここまで
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
      statusText: res.statusText,
      url: res.url,
      responseText: text
    });

    throw new Error(
      'APIの返答がJSONではありません。status=' +
      res.status +
      ' / ' +
      text.slice(0, 220)
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
  const paramsWithAuth = await buildParamsWithAuth_(params);
  const url = buildApiUrlWithParams(action, paramsWithAuth);

  const res = await fetch(url, options);

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
/****************************************************
 * postUpdateCase ここまで
 ****************************************************/
