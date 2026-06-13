// ===== ShiftCore shared URLs ここから =====

export const SUITE_BASE_URL =
  "https://shiftcorediv-lab.github.io/shiftcore-suite/";

export const APP_URLS = {
  accountConsole: SUITE_BASE_URL + "apps/account-console/",
  pmo: SUITE_BASE_URL + "apps/pmo/",
  ordercase: SUITE_BASE_URL + "apps/ordercase/",
  personaGacha: SUITE_BASE_URL + "apps/persona-gacha/",
  shiftbuilder: SUITE_BASE_URL + "apps/shiftbuilder/"
};

export const APP_LABELS = {
  accountConsole: "Account Console",
  pmo: "PMO",
  ordercase: "OrderCase",
  personaGacha: "Persona Gacha",
  shiftbuilder: "ShiftBuilder"
};

export function getAppUrl(appKey) {
  return APP_URLS[appKey] || SUITE_BASE_URL;
}

// ===== ShiftCore shared URLs ここまで =====
