// ===== ShiftCore shared URLs ここから =====

function resolveSuiteBaseUrl() {
  const marker = "/apps/";
  const pathname = window.location.pathname;
  const markerIndex = pathname.indexOf(marker);
  const basePath = markerIndex >= 0
    ? pathname.slice(0, markerIndex + 1)
    : "/";
  return new URL(basePath, window.location.origin).toString();
}

export const SUITE_BASE_URL = resolveSuiteBaseUrl();

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

export { resolveSuiteBaseUrl };

// ===== ShiftCore shared URLs ここまで =====
