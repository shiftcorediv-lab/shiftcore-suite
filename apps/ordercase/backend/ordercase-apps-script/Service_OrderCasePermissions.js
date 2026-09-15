/****************************************************
 * Service_OrderCasePermissions.gs
 * ShiftCore Account と OrderCase 権限連携
 ****************************************************/


/****************************************************
 * resolveOrderCaseUserByIdToken_ ここから
 * ShiftCore Account API に idToken を渡してログインユーザーを取得する
 * 読取操作だけ15分間CacheServiceに保存して高速化する。
 * 更新操作は権限剥奪を即時反映するためキャッシュを迂回する。
 ****************************************************/
function resolveOrderCaseUserByIdToken_(idToken, options) {
  const safeIdToken = String(idToken || '').trim();
  const bypassCache = options && options.bypassCache === true;
  const timing = options && options.timing;
  if (timing) timing.cache = bypassCache ? 'disabled' : 'miss';

  if (!safeIdToken) {
    throw new Error('idToken が必要です。');
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'ordercase_user_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      safeIdToken
    )
  ).slice(0, 80);

  const cachedText = bypassCache ? null : cache.get(cacheKey);

  if (cachedText) {
    try {
      const cachedUser = JSON.parse(cachedText);
      if (timing) timing.cache = 'hit';
      return cachedUser;
    } catch (error) {
      // キャッシュ破損時は無視して再取得する
    }
  }

  const lookupStartedAt = Date.now();
  let result;
  try {
    result = fetchOrderCaseIdentity_(safeIdToken, timing);
  } finally {
    if (timing) timing.roundTripMs = Date.now() - lookupStartedAt;
  }

  if (timing) {
    timing.roundTripMs = Date.now() - lookupStartedAt;
    // 同じ本人照合要求の内訳だけを渡す。上流の自由な項目や個人情報は複製しない。
    ['firebaseMs', 'memberLookupMs'].forEach(function(key) {
      const value = result.identityTiming && result.identityTiming[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) timing[key] = value;
    });
  }

  if (!bypassCache) {
    cache.put(cacheKey, JSON.stringify(result.user), 900);
  }

  return result.user;
}

function fetchOrderCaseIdentity_(idToken, timing) {
  // 再送するのは読取専用の本人照合だけ。案件の保存処理はこの中で実行しない。
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (timing) timing.attempts = attempt;
    let status = 0, data = null;
    try {
      const response = UrlFetchApp.fetch(SHIFTCORE_ACCOUNT_API_URL, {
        method: 'post', contentType: 'text/plain;charset=utf-8',
        payload: JSON.stringify({ action:'resolveCurrentUserByIdToken', idToken:idToken }),
        muteHttpExceptions: true
      });
      status = response.getResponseCode();
      data = JSON.parse(response.getContentText());
    } catch (_) { /* HTML本文・認証情報・通信例外本文は利用者にもログにも出さない。 */ }
    const valid = data && typeof data === 'object' && !Array.isArray(data) && typeof data.ok === 'boolean';
    const temporary = valid && ['WORKER_ERROR', 'INVALID_LOOKUP_RESPONSE', 'AUTH_SERVICE_UNAVAILABLE'].indexOf(data.code) !== -1;
    if (valid && !data.ok && !temporary) {
      throw new Error('ログイン情報または利用権限を確認できません。ダッシュボードから開き直してください。');
    }
    if (status === 200 && valid && data.ok && data.user && typeof data.user === 'object' && !Array.isArray(data.user)) return data;
    if (status >= 400 && status < 500 && [404, 408, 429].indexOf(status) === -1) {
      throw new Error('本人確認が拒否されました。ダッシュボードから開き直してください。');
    }
  }
  throw new Error('本人確認サービスとの通信に失敗しました。少し待ってから画面を再読み込みしてください。');
}
/****************************************************
 * resolveOrderCaseUserByIdToken_ ここまで
 ****************************************************/


/****************************************************
 * requireOrderCaseUser_ ここから
 * OrderCase利用可能ユーザーか確認する
 ****************************************************/
function requireOrderCaseUser_(idToken, options) {
  const user = resolveOrderCaseUserByIdToken_(idToken, options);
  const developer = String(user.role || '').trim().toLowerCase() === 'developer';

  const modules = Array.isArray(user.allowed_modules)
    ? user.allowed_modules
    : parseOrderCaseCsv_(user.allowed_modules);

  if (String(user.status || '').trim().toLowerCase() !== 'active') {
    throw new Error('このユーザーは停止中です。');
  }

  if (!developer && modules.indexOf(ORDERCASE_MODULE_KEY) === -1) {
    throw new Error('OrderCase の利用権限がありません。');
  }

  const permission = developer
    ? ORDERCASE_PERMISSION_ALL
    : String(user.ordercase_permission || '').trim();

  if (!permission) {
    throw new Error('OrderCase内の権限が設定されていません。');
  }

  if (!isValidOrderCasePermission_(permission)) {
    throw new Error('OrderCase権限が不正です: ' + permission);
  }

  return {
    user: user,
    permission: permission,
    canViewAmount: canViewOrderCaseAmount_(permission),
    canEdit: canEditOrderCase_(permission),
    canManage: canManageOrderCase_(permission)
  };
}
/****************************************************
 * requireOrderCaseUser_ ここまで
 ****************************************************/


/****************************************************
 * requireOrderCaseViewer_ ここから
 * 一覧・詳細閲覧用
 ****************************************************/
function requireOrderCaseViewer_(idToken) {
  return requireOrderCaseUser_(idToken);
}
/****************************************************
 * requireOrderCaseViewer_ ここまで
 ****************************************************/


/****************************************************
 * requireOrderCaseEditor_ ここから
 * 新規登録・編集用
 ****************************************************/
function requireOrderCaseEditor_(idToken, timing) {
  const context = requireOrderCaseUser_(idToken, { bypassCache: true, timing: timing });

  if (!context.canEdit) {
    throw new Error('案件を登録・編集する権限がありません。');
  }

  return context;
}
/****************************************************
 * requireOrderCaseEditor_ ここまで
 ****************************************************/


/****************************************************
 * requireOrderCaseCreator_ ここから
 * 案件登録は共通権限コンテキストの実効capabilityでも必ず確認する
 ****************************************************/
function requireOrderCaseCreator_(idToken) {
  const context = requireOrderCaseEditor_(idToken);
  const authorizationResult = resolveOrderCaseAuthorizationByIdToken_(idToken);

  if (!hasOrderCaseCapability_(
    authorizationResult.authorization,
    'ordercase.case.create'
  )) {
    throw new Error('案件を登録する権限がありません。');
  }

  return context;
}

function resolveOrderCaseAuthorizationByIdToken_(idToken) {
  const safeIdToken = String(idToken || '').trim();

  if (!safeIdToken) {
    throw new Error('idToken が必要です。');
  }

  const response = UrlFetchApp.fetch(SHIFTCORE_ACCOUNT_API_URL, {
    method: 'post',
    contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify({
      action: 'resolveAuthorizationContextByIdToken',
      idToken: safeIdToken
    }),
    muteHttpExceptions: true
  });
  const text = response.getContentText();
  let result;

  try {
    result = JSON.parse(text);
  } catch (error) {
    throw new Error('共通権限APIの応答を確認できません。');
  }
  if (!result || result.ok !== true || !result.user || !result.authorization) {
    throw new Error(result && result.message ? result.message : '共通権限を確認できません。');
  }
  return result;
}

function hasOrderCaseCapability_(authorization, capability) {
  const modules = authorization && authorization.modules;
  const orderCase = modules && modules.ordercase;
  const capabilities = orderCase && Array.isArray(orderCase.capabilities)
    ? orderCase.capabilities
    : [];
  return capabilities.indexOf(String(capability || '').trim()) !== -1;
}
/****************************************************
 * requireOrderCaseCreator_ ここまで
 ****************************************************/


/****************************************************
 * getIdTokenFromRequest_ ここから
 * 認証付きPOST bodyからidTokenを取得
 ****************************************************/
function getIdTokenFromRequest_(request) {
  return String(request && request.idToken ? request.idToken : '').trim();
}
/****************************************************
 * getIdTokenFromRequest_ ここまで
 ****************************************************/


/****************************************************
 * getIdTokenFromBody_ ここから
 * POST bodyからidTokenを取得
 ****************************************************/
function getIdTokenFromBody_(body) {
  return String(
    body && (
      body.idToken ||
      body.id_token ||
      body.token ||
      body.payload && body.payload.idToken
    ) || ''
  ).trim();
}
/****************************************************
 * getIdTokenFromBody_ ここまで
 ****************************************************/


/****************************************************
 * applyOrderCaseVisibility_ ここから
 * 権限に応じて案件データを加工する
 ****************************************************/
function applyOrderCaseVisibility_(data, context) {
  const publicData = stripOrderCaseInternalFieldsDeep_(data);

  if (!context || context.canViewAmount) {
    return publicData;
  }

  return maskOrderCaseAmountFieldsDeep_(publicData);
}
/****************************************************
 * applyOrderCaseVisibility_ ここまで
 ****************************************************/

function stripOrderCaseInternalFieldsDeep_(value) {
  if (Array.isArray(value)) {
    return value.map(function(item) {
      return stripOrderCaseInternalFieldsDeep_(item);
    });
  }

  if (value && typeof value === 'object') {
    const copied = {};

    Object.keys(value).forEach(function(key) {
      if (ORDERCASE_INTERNAL_FIELDS.indexOf(key) !== -1) {
        return;
      }

      copied[key] = stripOrderCaseInternalFieldsDeep_(value[key]);
    });

    return copied;
  }

  return value;
}


/****************************************************
 * maskOrderCaseAmountFieldsDeep_ ここから
 * オブジェクト・配列から金額情報を除去する
 ****************************************************/
function maskOrderCaseAmountFieldsDeep_(value) {
  if (Array.isArray(value)) {
    return value.map(function(item) {
      return maskOrderCaseAmountFieldsDeep_(item);
    });
  }

  if (value && typeof value === 'object') {
    const copied = {};

    Object.keys(value).forEach(function(key) {
      if (ORDERCASE_AMOUNT_FIELDS.indexOf(key) !== -1) {
        copied[key] = '';
        return;
      }

      copied[key] = maskOrderCaseAmountFieldsDeep_(value[key]);
    });

    return copied;
  }

  return value;
}
/****************************************************
 * maskOrderCaseAmountFieldsDeep_ ここまで
 ****************************************************/


/****************************************************
 * 権限判定 ここから
 ****************************************************/
function isValidOrderCasePermission_(permission) {
  return [
    ORDERCASE_PERMISSION_ALL,
    ORDERCASE_PERMISSION_EDIT,
    ORDERCASE_PERMISSION_VIEW,
    ORDERCASE_PERMISSION_VIEW_WITHOUT_AMOUNT
  ].indexOf(permission) !== -1;
}

function canEditOrderCase_(permission) {
  return permission === ORDERCASE_PERMISSION_ALL ||
    permission === ORDERCASE_PERMISSION_EDIT;
}

function canManageOrderCase_(permission) {
  return permission === ORDERCASE_PERMISSION_ALL;
}

function canViewOrderCaseAmount_(permission) {
  return permission !== ORDERCASE_PERMISSION_VIEW_WITHOUT_AMOUNT;
}

function parseOrderCaseCsv_(value) {
  return String(value || '')
    .split(',')
    .map(function(item) {
      return String(item || '').trim();
    })
    .filter(function(item) {
      return item !== '';
    });
}
/****************************************************
 * 権限判定 ここまで
 ****************************************************/

 /****************************************************
 * testAuthorizeUrlFetch ここから
 * UrlFetchApp の初回承認用
 ****************************************************/
function testAuthorizeUrlFetch() {
  const response = UrlFetchApp.fetch(SHIFTCORE_ACCOUNT_API_URL, {
    method: 'post',
    contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify({
      action: 'ping'
    }),
    muteHttpExceptions: true
  });

  Logger.log(response.getContentText());
}
/****************************************************
 * testAuthorizeUrlFetch ここまで
 ****************************************************/
