let overlayEl = null;
let textEl = null;

function ensureLoadingOverlay() {
  if (overlayEl) {
    return;
  }

  overlayEl = document.createElement("div");
  overlayEl.className = "loading-overlay";
  overlayEl.innerHTML = `
    <div class="loading-card">
      <div class="loading-spinner"></div>
      <div class="loading-text" id="commonLoadingText">読み込み中...</div>
    </div>
  `;

  document.body.appendChild(overlayEl);
  textEl = overlayEl.querySelector("#commonLoadingText");
}

export function showLoading(message = "読み込み中...") {
  ensureLoadingOverlay();

  if (textEl) {
    textEl.textContent = message;
  }

  overlayEl.classList.add("is-visible");
  document.body.classList.add("loading-lock");
}

export function hideLoading() {
  if (!overlayEl) {
    return;
  }

  overlayEl.classList.remove("is-visible");
  document.body.classList.remove("loading-lock");
}

export function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}
