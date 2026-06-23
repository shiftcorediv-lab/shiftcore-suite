// ===== ShiftBuilder API client ここから =====

import { SHIFTBUILDER_API_URL } from "./config.js";


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


// ===== 疎通確認ここから =====
export async function pingShiftBuilderApi() {
  return postToShiftBuilderApi("shiftBuilderPing");
}
// ===== 疎通確認ここまで =====


// ===== 現在ユーザー取得ここから =====
export async function getCurrentShiftBuilderUser(idToken) {
  return postToShiftBuilderApi("shiftBuilderGetCurrentUser", {
    idToken: idToken
  });
}
// ===== 現在ユーザー取得ここまで =====


// ===== 月次シフトデータ取得ここから =====
export async function getShiftBuilderMonthData(idToken, params = {}) {
  return postToShiftBuilderApi("shiftBuilderGetMonthData", {
    idToken: idToken,
    targetMonth: params.targetMonth || "",
    area: params.area || "all"
  });
}
// ===== 月次シフトデータ取得ここまで =====

// ===== アサイン作成ここから =====
export async function createShiftBuilderAssignment(idToken, params = {}) {
  return postToShiftBuilderApi("shiftBuilderCreateAssignment", {
    idToken: idToken,
    targetMonth: params.targetMonth || "",
    area: params.area || "",
    caseId: params.caseId || "",
    caseDateId: params.caseDateId || "",
    workDate: params.workDate || "",
    internalUserId: params.internalUserId || "",
    assignmentNote: params.assignmentNote || ""
  });
}
// ===== アサイン作成ここまで =====

// ===== アサイン解除ここから =====
export async function archiveShiftBuilderAssignment(idToken, assignmentId) {
  return postToShiftBuilderApi("shiftBuilderArchiveAssignment", {
    idToken: idToken,
    assignmentId: assignmentId
  });
}
// ===== アサイン解除ここまで =====

// ===== アサイン候補者取得ここから =====
export async function getShiftBuilderAssignmentCandidates(idToken, params = {}) {
  return postToShiftBuilderApi("shiftBuilderGetAssignmentCandidates", {
    idToken: idToken,
    targetMonth: params.targetMonth || "",
    area: params.area || "all"
  });
}
// ===== アサイン候補者取得ここまで =====

// ===== ShiftBuilder API client ここまで =====
