# Codex作業指示書：S-4 反射型XSS 3箇所を修正する

- 状態: レビュー待ち（えいちの承認待ち）
- 作成者: Claude
- 作成日: 2026-08-02
- 前提文書: `ISSUES.md` の S-4
- 置き換える版: なし
- 実装: 未実施
- commit: 未実施
- push: 未実施
- deploy: 未実施

> **本書は `approved/` へ移されるまで実装指示ではない**（`README.md` 共通ルール5）。

---

## 1. 要約

URLクエリの値を、エスケープせず `innerHTML` へ展開している箇所が3つある。**クライアント側で完結する問題で、GASもWorkerも関係しない。**

修正は各3〜5行。**`escapeHtml` を新設せず、`textContent` によるDOM構築へ置き換える。**

---

## 2. 確認済み事実

### 対象箇所

| # | ファイル:行 | 展開している値 | 出所 |
|---|---|---|---|
| 1 | `apps/pmo/js/ui.js:77` | `${params.module \|\| "unknown"}` | URLクエリ |
| 2 | `apps/account-console/js/account-portal/ui.js:63` | `${params.module \|\| "unknown"}` | URLクエリ |
| 3 | `apps/account-console/js/pmo-portal/ui.js:56-58` | `${moduleName}` `${role}` `${workStatus}` | URLクエリ |

### 1・2 は同一コード

```js
export function setupShiftCoreEntryBanner(params) {
  if ((params.from || "") !== "shiftcore") return;

  const banner = document.createElement("div");
  banner.style.margin = "0 auto 16px";
  // …style設定が続く…
  banner.innerHTML = `
    <div><strong>ShiftCoreから移動しました</strong></div>
    <div>module: ${params.module || "unknown"}</div>
  `;
  entryBannerArea.appendChild(banner);
}
```

`params` は各アプリの `query.js` の `getQueryParams()` が返す、URLのクエリ文字列そのものである。

### 3 のガードは有効でない

```js
export function renderDeveloperMeta(params, currentUser) {
  const role = String(currentUser?.role || "").trim().toLowerCase();

  if (role !== "developer") {          // ← このroleもURLクエリ由来
    developerMetaArea.style.display = "none";
    developerMetaArea.innerHTML = "";
    return;
  }

  const moduleName = params?.module || "unknown";
  const workStatus = currentUser?.workStatus || "未設定";

  developerMetaArea.style.display = "block";
  developerMetaArea.innerHTML = `
    <div class="developer-meta-inner">
      <span>ShiftCore &gt; ${moduleName}</span>
      <span>role: ${role}</span>
      <span>workStatus: ${workStatus}</span>
    </div>
  `;
}
```

`currentUser` は `buildCurrentUserFromQuery(params)` が生成する（S-1）。**`role` もURLから来るため、攻撃者は `?role=developer` で自らガードを満たせる。**

### 推論：影響

`?module=<img src=x onerror=…>` のような値で任意スクリプトが動く。

単独では自己XSSに近いが、**同一オリジンに Firebase セッションと `sessionStorage` の識別情報がある。** 細工したリンクを管理者に踏ませた場合、idToken の窃取につながりうる。

### 安全な既存実装（参考）

同じ `apps/pmo/js/ui.js` の別箇所は `textContent` を使っており安全である。

```js
completeText.textContent = payload.displayName + " さんの希望休提出が完了しました。";
```

**問題はバナー表示部分に限定される。**

---

## 3. 方針

### `escapeHtml` を新設しない

`apps/pmo` と `apps/account-console/js/account-portal`・`pmo-portal` には `escapeHtml` が存在しない。

ここで新しく定義すると、suite全体で **4つ目の `escapeHtml` 実装**になる（現在3つ: `shiftbuilder/js/shiftbuilder/utils.js`、`ordercase/js/utils.js`、`account-console/js/dashboard/main.js`）。C-3 として既に指摘済みの重複をさらに増やすことになる。

**`textContent` でDOMを組み立てれば、エスケープ関数自体が不要になる。** ブラウザが自動的に文字列として扱う。

### 表示は変えない

見た目・文言・スタイルを変更しないこと。**XSSの解消のみに限定する。**

---

## 4. 作業内容

### 4-1. `apps/pmo/js/ui.js`

`banner.innerHTML = …` を置き換える。

```js
  const titleLine = document.createElement("div");
  const titleStrong = document.createElement("strong");
  titleStrong.textContent = "ShiftCoreから移動しました";
  titleLine.appendChild(titleStrong);

  const moduleLine = document.createElement("div");
  moduleLine.textContent = "module: " + (params.module || "unknown");

  banner.appendChild(titleLine);
  banner.appendChild(moduleLine);

  entryBannerArea.appendChild(banner);
```

`banner.style.…` の設定はそのまま残す。

### 4-2. `apps/account-console/js/account-portal/ui.js`

**4-1と同一の変更。** コードが完全に同じであるため、同じ置き換えを適用する。

### 4-3. `apps/account-console/js/pmo-portal/ui.js`

```js
  developerMetaArea.style.display = "block";
  developerMetaArea.textContent = "";

  const inner = document.createElement("div");
  inner.className = "developer-meta-inner";

  const moduleSpan = document.createElement("span");
  moduleSpan.textContent = "ShiftCore > " + moduleName;

  const roleSpan = document.createElement("span");
  roleSpan.textContent = "role: " + role;

  const workStatusSpan = document.createElement("span");
  workStatusSpan.textContent = "workStatus: " + workStatus;

  inner.appendChild(moduleSpan);
  inner.appendChild(roleSpan);
  inner.appendChild(workStatusSpan);

  developerMetaArea.appendChild(inner);
```

**注意点2つ。**

元コードの `&gt;` はHTMLエンティティであり、画面上は `>` と表示される。`textContent` では実体参照が展開されないため、**`"ShiftCore > "` と直接書く。** `&gt;` のままにすると画面に `&gt;` と表示されてしまう。

非developer時の `developerMetaArea.innerHTML = ""` は、**`developerMetaArea.textContent = ""` へ変更してよい**（挙動は同等で、より意図が明確）。変更しなくても脆弱性ではない。

### 4-4. キャッシュバスティング

変更した3ファイルについて、`?v=` を更新すること。

**account-console は現在9種類の版数が混在している（C-5）が、その全面整理は本作業の対象外。** 触ったファイルの参照元だけを整合させること。

`apps/pmo` は `index.html` の `main.js?v=2` のみで、モジュール単位の `?v=` がほぼない（C-5）。**本作業では `apps/pmo/index.html` の版数を上げるに留める。** PMO全体の `?v=` 整備は別課題。

---

## 5. 触らない範囲

- **S-1（URLクエリ由来の権限判定）— 本作業では直さない。** `buildCurrentUserFromQuery` や `canUseSignupAdmin` の構造は変更しない
- `query.js` 5重複（C-4）
- `escapeHtml` の統合（C-3）
- account-console と PMO の `?v=` 全面整理（C-5）
- 表示文言・スタイル・レイアウト
- GAS、Worker
- 無関係な整形・リファクタリング

---

## 6. 完了条件

### 自動確認

1. 変更した3ファイルが `node --check` を通る
2. 既存テスト21件が pass

```bash
node --test shared/tests/*.test.mjs apps/shiftbuilder/tests/*.test.mjs
```

3. 対象3ファイルに、テンプレートリテラルを `innerHTML` へ代入する箇所が残っていないこと

```bash
grep -n 'innerHTML\s*=\s*`' apps/pmo/js/ui.js \
  apps/account-console/js/account-portal/ui.js \
  apps/account-console/js/pmo-portal/ui.js
```

**何も出力されないこと。**

### 手で確認（えいち）

4. **表示が変わっていないこと。** 3画面それぞれで、バナーと開発者メタ表示が従来どおりに見える
   - PMOアプリを `?from=shiftcore&module=pmo` で開く
   - account-portal を `?from=shiftcore&module=account` で開く
   - pmo-portal を `?role=developer&module=pmo` で開く
5. `pmo-portal` で `>` が正しく表示されること（`&gt;` と出ていないこと）

### XSSが解消されたことの確認

6. 次のURLで**スクリプトが実行されず、文字列としてそのまま表示される**こと

```
<PMOアプリURL>?from=shiftcore&module=<img src=x onerror=alert(1)>
```

```
<account-portal URL>?from=shiftcore&module=<img src=x onerror=alert(1)>
```

```
<pmo-portal URL>?role=developer&module=<img src=x onerror=alert(1)>
```

**アラートが出ないこと**、かつ画面に `<img src=x onerror=alert(1)>` という文字列が表示されること。

**この確認は公開環境で行う前に、ローカルの静的表示で実施してよい。** 認証を必要としない画面部分である。

---

## 7. 補足：この修正で塞がらないもの

S-4 を直しても、**S-1（URLクエリ由来の権限判定）は残る。**

XSSは「注入されたスクリプトが動くこと」の問題であり、S-1は「クエリで身元を詐称できること」の問題である。別の欠陥であり、別の修正が要る。

S-1 は G-A・G-B・G-C・G-K のサーバ側修正が進めば、クライアント側の判定を「表示制御」に降格でき、自然に解消へ向かう。**単独で先に直す必要はない。**

---

## 8. 完了報告

`ai-handoff/archive/` へ結果文書を追加すること。加えて次を明示すること。

- 変更した3ファイルと、更新した `?v=` の値
- 第6章の確認項目のうち、実施できた項目とできなかった項目
- **実施できなかった確認を、実施済みとして書かないこと**
- 表示に変化がなかったか（変化があった場合はその内容）
