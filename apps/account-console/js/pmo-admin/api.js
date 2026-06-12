import { PMO_ADMIN_API_URL } from "./config.js";

async function postJson(body) {
  const response = await fetch(PMO_ADMIN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error("API通信に失敗しました: " + response.status);
  }

  return await response.json();
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
