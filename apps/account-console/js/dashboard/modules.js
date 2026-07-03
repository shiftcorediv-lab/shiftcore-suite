import { moduleList } from "./dom.js";

export function renderModules() {
  if (!moduleList) {
    return;
  }

  moduleList.innerHTML = `
    <div class="module-card">
      <div class="module-card-title">モジュール一覧を復旧中です</div>
      <div class="module-card-code">GitHub Pages の反映確認中</div>
      <button type="button" disabled>準備中</button>
    </div>
  `;
}
