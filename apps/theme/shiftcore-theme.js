(function () {
  "use strict";

  const storageKey = "shiftcore-theme";
  const root = document.documentElement;
  const themeUrl = new URL(document.currentScript.src);
  let loadingCount = 0;
  let loadingOverlay;
  window.PortalLoading = {
    begin(message = "読み込み中…") {
      if (!loadingOverlay) {
        loadingOverlay = document.createElement("div");
        loadingOverlay.className = "portal-loading-overlay";
        loadingOverlay.setAttribute("role", "status");
        loadingOverlay.setAttribute("aria-live", "polite");
        loadingOverlay.innerHTML = '<div class="portal-loading-card"><span class="portal-loading-spinner" aria-hidden="true"></span><p></p></div>';
        document.body.appendChild(loadingOverlay);
      }
      loadingCount += 1;
      loadingOverlay.hidden = false;
      loadingOverlay.querySelector("p").textContent = message;
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        loadingCount -= 1;
        loadingOverlay.hidden = loadingCount === 0;
      };
    }
  };
  const mobileLayoutQuery = window.matchMedia("(max-width: 720px)");
  const coarsePointerQuery = window.matchMedia("(pointer: coarse)");

  function applyPresentationMode() {
    root.dataset.portalLayout = mobileLayoutQuery.matches ? "mobile" : "desktop";
    root.dataset.portalInput = coarsePointerQuery.matches ? "touch" : "pointer";
  }

  function watchPresentationMode(query) {
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", applyPresentationMode);
      return;
    }
    query.addListener(applyPresentationMode);
  }

  function storedTheme() {
    try {
      const value = localStorage.getItem(storageKey);
      return value === "light" || value === "dark" ? value : null;
    } catch (_) {
      return null;
    }
  }

  function resolvedTheme() {
    return storedTheme() || "light";
  }

  function updateControls(theme) {
    document.querySelectorAll("[data-shiftcore-theme-option]").forEach(function (button) {
      const selected = button.dataset.shiftcoreThemeOption === theme;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function applyTheme(theme, persist) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (persist) {
      try {
        localStorage.setItem(storageKey, theme);
      } catch (_) {
        // Storage can be unavailable in privacy-restricted browsers.
      }
    }
    updateControls(theme);
  }

  function createThemeOptions() {
    const options = document.createElement("div");
    options.className = "shiftcore-theme-options";
    options.setAttribute("role", "group");
    options.setAttribute("aria-label", "表示モード");

    [
      { value: "light", icon: "☀", label: "ライト" },
      { value: "dark", icon: "☾", label: "ダーク" },
    ].forEach(function (option) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "shiftcore-theme-option";
      button.dataset.shiftcoreThemeOption = option.value;
      button.innerHTML = `<span aria-hidden="true">${option.icon}</span>${option.label}`;
      button.addEventListener("click", function () {
        applyTheme(option.value, true);
      });
      options.appendChild(button);
    });
    return options;
  }

  function createThemeSection() {
    const section = document.createElement("section");
    section.className = "shiftcore-theme-menu-section";
    const heading = document.createElement("div");
    heading.className = "shiftcore-theme-menu-heading";
    heading.innerHTML = '<strong>表示モード</strong><small>画面の明るさを選択</small>';
    section.appendChild(heading);
    section.appendChild(createThemeOptions());
    return section;
  }

  function mountInExistingAccountMenu() {
    const panel = document.getElementById("userMenuPanel");
    if (!panel || panel.querySelector(".shiftcore-theme-menu-section")) return false;
    const logout = panel.querySelector(".user-menu-logout");
    panel.insertBefore(createThemeSection(), logout || null);
    return true;
  }

  function mountSharedAccountMenu() {
    const menu = document.createElement("div");
    menu.className = "shiftcore-account-menu";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "shiftcore-account-menu-trigger";
    trigger.setAttribute("aria-label", "アカウント・表示設定を開く");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<span class="shiftcore-account-icon" aria-hidden="true">●</span><span>アカウント</span><span aria-hidden="true">⌄</span>';

    const panel = document.createElement("div");
    panel.className = "shiftcore-account-menu-panel";
    panel.hidden = true;
    const heading = document.createElement("div");
    heading.className = "shiftcore-account-menu-heading";
    heading.innerHTML = '<strong>アカウント設定</strong><span>表示を切り替える</span>';
    panel.appendChild(heading);
    panel.appendChild(createThemeSection());

    function closeMenu() {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
      trigger.setAttribute("aria-expanded", String(!panel.hidden));
    });
    document.addEventListener("click", function (event) {
      if (!menu.contains(event.target)) closeMenu();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });

    menu.appendChild(trigger);
    menu.appendChild(panel);
    const headerActions = document.querySelector(".header-actions, .pmo-header-actions, header .topbar-actions");
    if (headerActions) {
      menu.classList.add("is-inline");
      headerActions.appendChild(menu);
    } else {
      document.body.appendChild(menu);
    }
  }

  function mountThemeMenu() {
    mountPortalHeader();
    if (!mountInExistingAccountMenu()) mountSharedAccountMenu();
    updateControls(root.dataset.theme);
  }

  function mountPortalHeader() {
    const existing = document.querySelector("header.topbar");
    if (existing && document.getElementById("userMenuPanel")) {
      existing.classList.add("portal-unified-header");
      return;
    }
    const moduleHeader = document.querySelector("header.portal-module-header, #ordercaseHeader");
    if (!moduleHeader) return;
    root.classList.add("portal-unified");
    const dashboard = new URL("../account-console/dashboard.html", themeUrl);
    const header = document.createElement("header");
    header.className = "portal-unified-header";
    header.innerHTML = `<a class="brand" aria-label="Another Portal ダッシュボード"><span class="brand-mark"><i></i><i></i></span><span><strong>Another Portal</strong><small>WORKFORCE PLATFORM</small></span></a>
      <div class="topbar-actions"><button class="icon-button" type="button" aria-label="通知を開く" aria-expanded="false">♢</button><button class="user-chip" type="button" aria-label="利用可能モジュールを開く" aria-expanded="false"><span>—</span><span class="portal-user-name">読み込み中</span><span>⌄</span></button></div>
      <aside class="user-menu-panel" id="userMenuPanel" hidden><div class="panel-heading"><strong>利用可能モジュール</strong><button type="button" aria-label="閉じる">×</button></div><a class="menu-dashboard-link">ダッシュボード</a><div class="user-module-list"></div><button class="user-module-button user-menu-logout" type="button">ログアウト</button></aside>
      <aside class="notification-panel" hidden><div class="panel-heading"><strong>通知</strong><button type="button" aria-label="閉じる">×</button></div><div class="notification-list"></div></aside>`;
    document.body.prepend(header);
    header.querySelectorAll("a").forEach(a => { a.href = dashboard.href; });
    const menu = header.querySelector(".user-menu-panel");
    const notice = header.querySelector(".notification-panel");
    const trigger = header.querySelector(".user-chip");
    const noticeTrigger = header.querySelector(".icon-button");
    function close() {
      menu.hidden = notice.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      noticeTrigger.setAttribute("aria-expanded", "false");
    }
    header.querySelectorAll(".panel-heading button").forEach(b => b.addEventListener("click", close));
    document.addEventListener("click", e => { if (!header.contains(e.target)) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") { close(); trigger.focus(); } });
    async function identity() {
      let user;
      try { user = JSON.parse(sessionStorage.getItem("shiftcore_user") || "null"); } catch (_) {}
      const name = user?.displayName || user?.display_name || user?.name || "未ログイン";
      header.querySelector(".portal-user-name").textContent = name;
      trigger.firstElementChild.textContent = [...name][0] || "—";
      const list = header.querySelector(".user-module-list");
      const { getEffectiveModuleCodes } = await import(new URL("../account-console/js/common/access-policy.mjs", themeUrl));
      const routes = { account_console: ["メンバー", "account-console/account-console.html"], pmo: ["オフ", ["admin", "developer"].includes(user?.role) ? "account-console/pmo-portal.html" : "pmo/index.html"], ordercase: ["オーダー", "ordercase/index.html"], shift: ["シフト", "shiftbuilder/index.html"] };
      list.replaceChildren();
      for (const code of getEffectiveModuleCodes(user?.allowed_modules || user?.allowedModules, user)) {
        if (!routes[code]) continue;
        const [label, path] = routes[code];
        const link = document.createElement("a");
        link.className = "user-module-button";
        link.textContent = label;
        const url = new URL("../" + path, themeUrl);
        Object.entries({ from: "shiftcore", module: code, userId: user?.userId || user?.internal_user_id || "", displayName: name, employeeCode: user?.employeeCode || user?.employee_code || "", role: user?.role || "", workStatus: user?.workStatus || user?.work_status || "" }).forEach(([key, value]) => url.searchParams.set(key, value));
        if (window.ShiftCoreEnvironment?.name === "staging") url.searchParams.set("shiftcore_env", "staging");
        link.href = url.href;
        list.appendChild(link);
      }
    }
    trigger.addEventListener("click", () => {
      const opening = menu.hidden; close(); menu.hidden = !opening;
      trigger.setAttribute("aria-expanded", String(opening));
      identity().catch(() => { header.querySelector(".user-module-list").textContent = "メニューを取得できません。ダッシュボードから開いてください。"; });
    });
    header.querySelector(".user-menu-logout").addEventListener("click", async e => {
      e.currentTarget.disabled = true;
      try {
        const { auth, signOut } = await import(new URL("../account-console/js/dashboard/auth.js", themeUrl));
        await signOut(auth);
        const { clearShiftCoreSessionState } = await import(new URL("../common/logout-session.js", themeUrl));
        clearShiftCoreSessionState();
        location.assign(new URL("../account-console/index.html", themeUrl).href);
      } catch (_) { e.target.disabled = false; e.target.textContent = "ログアウトを再試行"; }
    });
    noticeTrigger.addEventListener("click", async () => {
      const opening = notice.hidden; close(); notice.hidden = !opening;
      noticeTrigger.setAttribute("aria-expanded", String(opening));
      if (!opening) return;
      const list = header.querySelector(".notification-list");
      list.textContent = "通知を読み込んでいます…";
      try {
        const { attendanceRequest } = await import(new URL("../account-console/js/dashboard/attendance-api.js", themeUrl));
        const result = await attendanceRequest("getDashboardData");
        list.replaceChildren();
        for (const item of result.notifications || []) {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "notification-item";
          row.textContent = [item["タイトル"] || item["種別"], item["本文"]].filter(Boolean).join("：");
          row.addEventListener("click", async () => {
            try { await attendanceRequest("markNotificationRead", { notificationId: item.notification_id }); row.classList.remove("unread"); }
            catch (_) { list.append("既読に更新できませんでした。"); }
          });
          list.appendChild(row);
        }
        if (!list.childElementCount) list.textContent = "通知はありません。";
      } catch (_) { list.textContent = "通知を取得できませんでした。閉じて再度お試しください。"; }
    });
    identity().catch(() => {});
  }

  applyPresentationMode();
  watchPresentationMode(mobileLayoutQuery);
  watchPresentationMode(coarsePointerQuery);
  applyTheme(resolvedTheme(), false);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountThemeMenu, { once: true });
  } else {
    mountThemeMenu();
  }
})();
