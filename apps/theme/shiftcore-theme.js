(function () {
  "use strict";

  const storageKey = "shiftcore-theme";
  const root = document.documentElement;
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
    if (!mountInExistingAccountMenu()) mountSharedAccountMenu();
    updateControls(root.dataset.theme);
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
