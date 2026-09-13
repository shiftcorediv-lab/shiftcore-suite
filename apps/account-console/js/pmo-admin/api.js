import { PMO_ADMIN_API_URL } from "./config.js?v=20260803-role-1";
import { resolveAuthenticatedSession } from "../common/auth-session.js";

export async function postJson(body) {
  const session = await resolveAuthenticatedSession();
  if (!session.ok) throw new Error(session.message || "再ログインしてください。");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
  const response = await fetch(PMO_ADMIN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({ ...body, idToken: session.idToken }),
    signal: controller.signal
  });

  if (!response.ok) {
    throw new Error("API通信に失敗しました: " + response.status);
  }

  return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("通信に時間がかかっています。時間をおいて再度お試しください。");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPmoAdminMeta(targetYearMonth = "", idToken = "") {
  return await postJson({
    action: "getPmoAdminMetaSecure",
    targetYearMonth: targetYearMonth,
    idToken: idToken
  });
}

export async function fetchMonthlyExcel(targetYearMonth = "", idToken = "") {
  return await postJson({
    action: "exportMonthlyExcelSecure",
    targetYearMonth: targetYearMonth,
    idToken: idToken
  });
}

export async function fetchPmoMonthlyTable(targetYearMonth = "", idToken = "") {
  return await postJson({
    action: "getPmoMonthlyTableSecure",
    targetYearMonth: targetYearMonth,
    idToken: idToken
  });
}
