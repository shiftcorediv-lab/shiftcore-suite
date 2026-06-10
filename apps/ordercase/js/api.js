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
 * fetchApiJsonWithParams ここから
 ****************************************************/
async function fetchApiJsonWithParams(action, params, options = {}) {
  const paramsWithAuth = await buildParamsWithAuth_(params);
  const url = buildApiUrlWithParams(action, paramsWithAuth);

  const res = await fetch(url, options);
  const text = await res.text();

  let json;

  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error('APIの返答がJSONではありません: ' + text.slice(0, 120));
  }

  return json;
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

  const text = await res.text();

  let json;

  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error('APIの返答がJSONではありません: ' + text.slice(0, 120));
  }

  return json;
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

  const text = await res.text();

  let json;

  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error('APIの返答がJSONではありません: ' + text.slice(0, 120));
  }

  return json;
}
/****************************************************
 * postUpdateCase ここまで
 ****************************************************/
