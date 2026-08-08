(function () {
  "use strict";

  const storageKey = "shiftcore-theme";
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function storedTheme() {
    try {
      const value = localStorage.getItem(storageKey);
      return value === "light" || value === "dark" ? value : null;
    } catch (_) {
      return null;
    }
  }

  function resolvedTheme() {
    return storedTheme() || (media.matches ? "dark" : "light");
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const button = document.querySelector("[data-shiftcore-theme-toggle]");
    if (!button) return;
    const nextTheme = theme === "dark" ? "light" : "dark";
    button.textContent = theme === "dark" ? "☀" : "☾";
    button.setAttribute("aria-label", `${nextTheme === "dark" ? "ダーク" : "ライト"}モードに切り替える`);
    button.title = button.getAttribute("aria-label");
    button.setAttribute("aria-pressed", String(theme === "dark"));
  }

  applyTheme(resolvedTheme());

  function mountToggle() {
    if (document.querySelector("[data-shiftcore-theme-toggle]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shiftcore-theme-toggle";
    button.dataset.shiftcoreThemeToggle = "";
    button.addEventListener("click", function () {
      const theme = root.dataset.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(storageKey, theme);
      } catch (_) {
        // Storage can be unavailable in privacy-restricted browsers.
      }
      applyTheme(theme);
    });
    document.body.appendChild(button);
    applyTheme(resolvedTheme());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToggle, { once: true });
  } else {
    mountToggle();
  }

  media.addEventListener("change", function () {
    if (!storedTheme()) applyTheme(resolvedTheme());
  });
})();
