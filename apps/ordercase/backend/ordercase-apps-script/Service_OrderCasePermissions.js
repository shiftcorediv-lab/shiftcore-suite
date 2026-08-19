/****************************************************
 * Service_OrderCasePermissions.gs
 * ShiftCore Account と OrderCase 権限連携
 ****************************************************/


/****************************************************
 * resolveOrderCaseUserByIdToken_ ここから
 * ShiftCore Account API に idToken を渡してログインユーザーを取得する
 * 5分間だけCacheServiceに保存して高速化する
 ****************************************************/
function resolveOrderCaseUserByIdToken_(idToken) {
  const safeIdToken = String(idToken || '').trim();

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

  const cachedText = cache.get(cacheKey);

  if (cachedText) {
    try {
      return JSON.parse(cachedText);
    } catch (error) {
      // キャッシュ破損時は無視して再取得する
    }
  }

  const response = UrlFetchApp.fetch(SHIFTCORE_ACCOUNT_API_URL, {
    method: 'post',
    contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify({
      action: 'resolveCurrentUserByIdToken',
      idToken: safeIdToken
    }),
    muteHttpExceptions: true
  });

  const text = response.getContentText();

  let result;

  try {
    result = JSON.parse(text);
  } catch (error) {
    throw new Error('ShiftCore Account API のレスポンス解析に失敗しました: ' + text);
  }

  if (!result || result.ok !== true || !result.user) {
    throw new Error(result && result.message ? result.message : 'ログインユーザーを確認できません。');
  }

  cache.put(cacheKey, JSON.stringify(result.user), 900);

  return result.user;
}
/****************************************************
 * resolveOrderCaseUserByIdToken_ ここまで
 ****************************************************/


/****************************************************
 * requireOrderCaseUser_ ここから
 * OrderCase利用可能ユーザーか確認する
 ****************************************************/
function requireOrderCaseUser_(idToken) {
  const user = resolveOrderCaseUserByIdToken_(idToken);
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
function requireOrderCaseEditor_(idToken) {
  const context = requireOrderCaseUser_(idToken);

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
 * getIdTokenFromParams_ ここから
 * GETパラメータからidTokenを取得
 ****************************************************/
function getIdTokenFromParams_(params) {
  return String(params && params.idToken ? params.idToken : '').trim();
}
/****************************************************
 * getIdTokenFromParams_ ここまで
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
  if (!context || context.canViewAmount) {
    return data;
  }

  return maskOrderCaseAmountFieldsDeep_(data);
}
/****************************************************
 * applyOrderCaseVisibility_ ここまで
 ****************************************************/


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
