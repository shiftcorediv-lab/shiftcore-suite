// ===== ShiftBuilder API client ここから =====

import {
  ACCOUNT_AUTHORIZATION_API_URL,
  SHIFTBUILDER_API_URL
} from "./config.js?v=20260807-shadow-1";

const READ_CACHE_PREFIX = "shiftbuilder-read-v1";
const READ_CACHE_TTL_MS = 60 * 1000;
export const SHIFTBUILDER_DATA_REVISION_KEY =
  "shiftcore-shiftbuilder-data-revision-v1";

function getShiftBuilderDataRevision() {
  try {
    return localStorage.getItem(SHIFTBUILDER_DATA_REVISION_KEY) || "0";
  } catch (error) {
    return "0";
  }
}

function getTokenSubject(idToken) {
  try {
    const encodedPayload = idToken.split(".")[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const payload = encodedPayload.padEnd(
      encodedPayload.length + (4 - encodedPayload.length % 4) % 4,
      "="
    );
    const decoded = JSON.parse(atob(payload));
    return decoded.user_id || decoded.sub || "anonymous";
  } catch (error) {
    return "anonymous";
  }
}

function buildReadCacheKey(idToken, action, params = {}, revision = "0") {
  return [
    READ_CACHE_PREFIX,
    getTokenSubject(idToken),
    revision,
    action,
    params.targetMonth || "",
    params.area || "all"
  ].join(":");
}

function readCachedResult(cacheKey, revision) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");

    if (
      !cached ||
      cached.revision !== revision ||
      Date.now() - cached.savedAt > READ_CACHE_TTL_MS
    ) {
      sessionStorage.removeItem(cacheKey);
      return null;
    }

    return cached.result;
  } catch (error) {
    return null;
  }
}

function writeCachedResult(cacheKey, result, revision) {
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({
      savedAt: Date.now(),
      revision: revision,
      result: result
    }));
  } catch (error) {
    // Cache failures must never block the API response.
  }
}

function clearReadCache(idToken) {
  const userPrefix = `${READ_CACHE_PREFIX}:${getTokenSubject(idToken)}:`;

  try {
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith(userPrefix)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    // Cache failures must never block a mutation.
  }
}


// ===== API共通POSTここから =====
async function postToShiftBuilderApi(action, body = {}) {
  const payload = {
    ...body,
    action: action
  };

  const response = await fetch(SHIFTBUILDER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("APIレスポンスのJSON解析に失敗しました\n\n" + text);
  }
}
// ===== API共通POSTここまで =====

// ===== 共通権限Shadow確認ここから =====
export async function resolveAuthorizationShadow(idToken) {
  const response = await fetch(ACCOUNT_AUTHORIZATION_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "resolveAuthorizationContextByIdToken",
      idToken: idToken
    })
  });
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("権限Shadow APIレスポンスのJSON解析に失敗しました");
  }
}
// ===== 共通権限Shadow確認ここまで =====

async function postCachedRead(action, idToken, body = {}, options = {}) {
  const requestRevision = getShiftBuilderDataRevision();
  const cacheKey = buildReadCacheKey(
    idToken,
    action,
    body,
    requestRevision
  );
  const bypassCache = options.bypassCache === true;
  const cached = bypassCache
    ? null
    : readCachedResult(cacheKey, requestRevision);

  if (cached) {
    return cached;
  }

  const result = await postToShiftBuilderApi(action, {
    ...body,
    idToken: idToken
  });

  if (
    result &&
    (result.success === true || result.ok === true) &&
    getShiftBuilderDataRevision() === requestRevision
  ) {
    writeCachedResult(cacheKey, result, requestRevision);
  }

  return result;
}

async function postMutation(action, idToken, body = {}) {
  const result = await postToShiftBuilderApi(action, {
    ...body,
    idToken: idToken
  });

  if (result && (result.success === true || result.ok === true)) {
    clearReadCache(idToken);
  }

  return result;
}


// ===== 疎通確認ここから =====
export async function pingShiftBuilderApi() {
  return postToShiftBuilderApi("shiftBuilderPing");
}
// ===== 疎通確認ここまで =====


// ===== 現在ユーザー取得ここから =====
export async function getCurrentShiftBuilderUser(idToken) {
  return postCachedRead("shiftBuilderGetCurrentUser", idToken);
}
// ===== 現在ユーザー取得ここまで =====


// ===== 月次シフトデータ取得ここから =====
export async function getShiftBuilderMonthData(idToken, params = {}) {
  return postCachedRead("shiftBuilderGetMonthData", idToken, {
    targetMonth: params.targetMonth || "",
    area: params.area || "all"
  }, {
    bypassCache: params.bypassCache === true
  });
}
// ===== 月次シフトデータ取得ここまで =====

// ===== アサイン作成ここから =====
export async function createShiftBuilderAssignment(idToken, params = {}) {
  return postMutation("shiftBuilderCreateAssignment", idToken, {
    targetMonth: params.targetMonth || "",
    area: params.area || "",
    caseId: params.caseId || "",
    caseDateId: params.caseDateId || "",
    workDate: params.workDate || "",
    internalUserId: params.internalUserId || "",
    startTime: params.startTime || params.start_time || "",
    endTime: params.endTime || params.end_time || "",
    assignmentNote: params.assignmentNote || ""
  });
}
// ===== アサイン作成ここまで =====

// ===== アサイン解除ここから =====
export async function archiveShiftBuilderAssignment(idToken, assignmentId) {
  return postMutation("shiftBuilderArchiveAssignment", idToken, {
    assignmentId: assignmentId
  });
}
// ===== アサイン解除ここまで =====

// ===== アサイン入れ替えここから =====
export async function replaceShiftBuilderAssignment(idToken, params = {}) {
  return postMutation("shiftBuilderReplaceAssignment", idToken, {
    replaceAssignmentId: params.replaceAssignmentId || params.replace_assignment_id || "",
    targetMonth: params.targetMonth || "",
    area: params.area || "",
    caseId: params.caseId || "",
    caseDateId: params.caseDateId || "",
    workDate: params.workDate || "",
    internalUserId: params.internalUserId || "",
    assignmentNote: params.assignmentNote || ""
  });
}
// ===== アサイン入れ替えここまで =====

// ===== アサイン候補者取得ここから =====
export async function getShiftBuilderAssignmentCandidates(idToken, params = {}) {
  return postCachedRead("shiftBuilderGetAssignmentCandidates", idToken, {
    targetMonth: params.targetMonth || "",
    area: params.area || "all"
  }, {
    bypassCache: params.bypassCache === true
  });
}
// ===== アサイン候補者取得ここまで =====

// ===== ICSメール送信ここから =====
export async function sendShiftBuilderPersonnelIcs(idToken, params = {}) {
  return postMutation("shiftBuilderSendPersonnelIcs", idToken, {
    targetMonth: params.targetMonth || "",
    recipients: Array.isArray(params.recipients) ? params.recipients : []
  });
}
// ===== ICSメール送信ここまで =====

// ===== ShiftBuilder API client ここまで =====
