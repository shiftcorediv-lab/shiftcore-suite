function isLineInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /Line\//i.test(ua) || /LINE\//i.test(ua);
}

function createGuardHtml(pageLabel) {
  return `
    <div class="line-guard-overlay" id="lineGuardOverlay">
      <div class="line-guard-card">
        <div class="line-guard-badge">LINE内ブラウザ検知</div>
        <h2 class="line-guard-title">この画面ではログインできません</h2>
        <p class="line-guard-text">
          LINE内ブラウザでは Google ログインが正常に動かないことがあります。<br>
          <strong>${pageLabel}</strong> は外部ブラウザで開いてください。
        </p>

        <div class="line-guard-warning">
          このまま進むとログインや登録が途中で止まる場合があります
        </div>

        <div class="line-guard-button-stack">
          <button type="button" class="line-guard-btn line-guard-btn-primary" id="lineGuardOpenBtn">
            外部ブラウザで開く
          </button>
          <button type="button" class="line-guard-btn line-guard-btn-secondary" id="lineGuardCopyBtn">
            URLをコピー
          </button>
        </div>

        <button type="button" class="line-guard-mini-link" id="lineGuardHelpToggle">
          ログインできない場合はこちら
        </button>

        <div class="line-guard-details line-guard-hidden" id="lineGuardHelpArea">
          <div class="line-guard-details-title">うまくいかない時</div>
          <ol class="line-guard-steps">
            <li>まず「外部ブラウザで開く」を押してください</li>
            <li>うまく開かない場合は「URLをコピー」を押してください</li>
            <li>コピーしたURLを Safari や Chrome に貼り付けて開いてください</li>
          </ol>
        </div>

        <button type="button" class="line-guard-mini-link" id="lineGuardLabsToggle">
          毎回外部ブラウザで開く設定を見る
        </button>

        <div class="line-guard-details line-guard-hidden" id="lineGuardLabsArea">
          <div class="line-guard-details-title">LINE Labs 設定</div>
          <ol class="line-guard-steps">
            <li>LINEホーム</li>
            <li>設定</li>
            <li>LINE Labs</li>
            <li>「リンクをデフォルトブラウザで開く」を ON</li>
          </ol>
        </div>

        <div class="line-guard-status" id="lineGuardStatus"></div>
      </div>
    </div>
  `;
}

function setStatus(message) {
  const statusEl = document.getElementById("lineGuardStatus");
  if (statusEl) {
    statusEl.textContent = message || "";
  }
}

async function copyCurrentUrl() {
  const url = window.location.href;

  try {
    await navigator.clipboard.writeText(url);
    setStatus("URLをコピーしました\nSafari または Chrome に貼り付けて開いてください");
    return;
  } catch (error) {
    // fallback
  }

  const textarea = document.createElement("textarea");
  textarea.value = url;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand("copy");
    setStatus("URLをコピーしました\nSafari または Chrome に貼り付けて開いてください");
  } catch (error) {
    setStatus("URLコピーに失敗しました\nURLを手動でコピーしてください");
  } finally {
    document.body.removeChild(textarea);
  }
}

function tryOpenExternalBrowser() {
  setStatus("外部ブラウザで開く処理を試しています");

  const url = window.location.href;

  try {
    window.open(url, "_blank");
  } catch (error) {
    // noop
  }

  setTimeout(() => {
    setStatus("開けない場合は「URLをコピー」を押してください");
  }, 1200);
}

function bindLineGuardEvents() {
  const openBtn = document.getElementById("lineGuardOpenBtn");
  const copyBtn = document.getElementById("lineGuardCopyBtn");
  const helpToggle = document.getElementById("lineGuardHelpToggle");
  const helpArea = document.getElementById("lineGuardHelpArea");
  const labsToggle = document.getElementById("lineGuardLabsToggle");
  const labsArea = document.getElementById("lineGuardLabsArea");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      tryOpenExternalBrowser();
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      await copyCurrentUrl();
    });
  }

  if (helpToggle && helpArea) {
    helpToggle.addEventListener("click", () => {
      helpArea.classList.toggle("line-guard-hidden");
    });
  }

  if (labsToggle && labsArea) {
    labsToggle.addEventListener("click", () => {
      labsArea.classList.toggle("line-guard-hidden");
    });
  }
}

export function initLineBrowserGuard(options = {}) {
  const pageLabel = options.pageLabel || "この画面";

  if (!isLineInAppBrowser()) {
    return;
  }

  document.body.classList.add("line-guard-body-lock");

  const wrapper = document.createElement("div");
  wrapper.innerHTML = createGuardHtml(pageLabel);
  document.body.appendChild(wrapper);

  bindLineGuardEvents();

  setStatus("LINE内ブラウザを検知しました\n外部ブラウザで開いてください");
}
