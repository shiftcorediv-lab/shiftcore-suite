(function initializeShiftCoreEnvironment(global) {
  "use strict";

  const QUERY_KEY = "shiftcore_env";
  const STORAGE_KEY = "shiftcore_environment";
  const STAGING = "staging";

  // テスト用URLは本番URLと混在させない。URLが壊れた場合も
  // 本番へフォールバックせず、設定不足として停止する。
  const STAGING_ENDPOINTS = Object.freeze({
    accountApi: "https://script.google.com/macros/s/AKfycbw0YEA6zX1G5SeBRgmw4LBDZzysYzNQFV9YJrrJlM1Iz34sNHLX1kIcW-Kd8ZoD6Hnkgw/exec",
    attendanceApi: "https://script.google.com/macros/s/AKfycbzARtxHt7O1W7e4f16VMLuBdkizN7wq8rOJhhuN9JgvMLBDk5fzIwCDBKV9L1Smdl4/exec",
    ordercaseApi: "https://script.google.com/macros/s/AKfycbydvA5StNhjHqDRVc40ga3s3nzGRiYqyoY_TPNrAvVRqJ0vaHax1Jnv-_ylByN8Je2MPQ/exec",
    pmoApi: "https://script.google.com/macros/s/AKfycbxi4aViRJdx7Fw5Y3mRuyOR06ffjDdiAKzwgcv1SOVzjw7rExyXWAZ4EXtHrfQTTKxl/exec",
    shiftbuilderApi: "https://script.google.com/macros/s/AKfycbx3S77Mx_yKOUl2BXjuVSUg3PkJtnsTSgo8vNGsXvveZbwF7DjLAUeFHhbplbF_-NtXAA/exec"
  });

  function normalizeEnvironment(value) {
    return String(value || "").trim().toLowerCase() === STAGING ? STAGING : "production";
  }

  function resolveEnvironment() {
    const params = new URLSearchParams(global.location.search);
    const requested = String(params.get(QUERY_KEY) || "").trim().toLowerCase();

    if (requested === STAGING) {
      global.sessionStorage.setItem(STORAGE_KEY, STAGING);
      return STAGING;
    }

    if (requested === "production") {
      global.sessionStorage.removeItem(STORAGE_KEY);
      return "production";
    }

    return normalizeEnvironment(global.sessionStorage.getItem(STORAGE_KEY));
  }

  const environment = resolveEnvironment();

  function endpoint(key, productionUrl) {
    if (environment !== STAGING) return productionUrl;
    const value = String(STAGING_ENDPOINTS[key] || "").trim();
    if (!/^https:\/\//.test(value)) {
      throw new Error(`ステージングAPIが未設定です: ${key}`);
    }
    return value;
  }

  function withEnvironment(url) {
    const target = new URL(url, global.location.href);
    if (environment === STAGING && target.origin === global.location.origin) {
      target.searchParams.set(QUERY_KEY, STAGING);
    }
    return target.toString();
  }

  function returnToProduction() {
    global.sessionStorage.removeItem(STORAGE_KEY);
    const target = new URL(global.location.href);
    target.searchParams.delete(QUERY_KEY);
    target.searchParams.set(QUERY_KEY, "production");
    global.location.assign(target.toString());
  }

  function installBanner() {
    if (environment !== STAGING || document.getElementById("shiftcore-staging-banner")) return;
    const banner = document.createElement("div");
    banner.id = "shiftcore-staging-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML = '<strong>TEST環境</strong><span>本番データには接続していません</span><button type="button">本番表示へ戻る</button>';
    banner.style.cssText = "position:sticky;top:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;gap:12px;min-height:40px;padding:7px 12px;box-sizing:border-box;background:#fff2a8;color:#4b3300;border-bottom:3px solid #e67e00;font:700 13px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center;";
    const button = banner.querySelector("button");
    button.style.cssText = "border:1px solid #7a4b00;border-radius:999px;background:#fff;color:#5b3600;padding:4px 10px;font:inherit;cursor:pointer;";
    button.addEventListener("click", returnToProduction);
    document.body.prepend(banner);
    document.documentElement.dataset.shiftcoreEnvironment = STAGING;
    const updateBannerHeight = () => {
      document.documentElement.style?.setProperty?.(
        "--shiftcore-environment-banner-height",
        `${Math.ceil(banner.getBoundingClientRect().height)}px`
      );
    };
    updateBannerHeight();
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(updateBannerHeight).observe(banner);
    } else if (typeof global.addEventListener === "function") {
      global.addEventListener("resize", updateBannerHeight);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installBanner, { once: true });
  } else {
    installBanner();
  }

  global.ShiftCoreEnvironment = Object.freeze({
    name: environment,
    isStaging: environment === STAGING,
    endpoint,
    withEnvironment,
    returnToProduction
  });
})(window);
