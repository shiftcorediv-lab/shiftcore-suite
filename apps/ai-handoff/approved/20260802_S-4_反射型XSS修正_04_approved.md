# Codex作業指示書：S-4 反射型XSS 3箇所を修正する（改訂版）

- 状態: **承認済み（実装可）**
- 作成者: Claude
- 承認者: えいち
- 承認日: 2026-08-02
- 作成日: 2026-08-02
- 前提文書: `reviewed/20260802_S-4_反射型XSS修正_02_codex-review.md`
- 置き換える版: `archive/20260802_S-4_反射型XSS修正_01_claude-draft.md`
- 実装: 未実施
- commit: 未実施
- push: 未実施
- deploy: 未実施

> **えいちの承認済み。本書に従って実装してよい。**
>
> ただし着手前に、`apps/ai-handoff/` がコミット済みであることを確認すること（第2章）。

---

## 0. 前版からの訂正

Codexの指摘を実コードで照合した。**指摘は全件事実だった。**

| # | Codexの指摘 | 検証結果 | 対応 |
|---|---|---|---|
| P1 | `main.js` が `./ui.js` を**版数なし**でimportしている。HTMLの `main.js?v=` だけ更新しても旧 `ui.js` がキャッシュから使われる | **正しい**（3ファイルすべて確認） | **前版の手順は不十分。全面改訂** |
| P2 | 攻撃文字列をURLエンコードして記載すべき | 正しい | 対応 |
| P2 | キャッシュ無効化した確認だけではバスティングの検証にならない | 正しい | 確認項目を追加 |

### 前版の誤り

前版は「`apps/pmo/index.html` の版数を上げるに留める」と書いた。**これでは修正が配信されない可能性がある。**

```js
// apps/pmo/js/main.js:24
} from "./ui.js";                                   // ← 版数なし

// apps/account-console/js/account-portal/main.js:3
import { … } from "./ui.js";                        // ← 版数なし

// apps/account-console/js/pmo-portal/main.js:3
import { … } from "./ui.js";                        // ← 版数なし
```

HTMLの `main.js?v=` を上げると `main.js` は再取得されるが、その `main.js` が同じURL `./ui.js` をimportするため、**ブラウザや配信キャッシュに残った修正前の `ui.js` が再利用されうる。**

これは Claude 自身が ShiftBuilder の監査で **C-5** として指摘した問題である。自分の指摘を自分の指示書へ適用できていなかった。

---

## 1. 要約

URLクエリの値を、エスケープせず `innerHTML` へ展開している箇所が3つある。クライアント側で完結する問題で、GASもWorkerも関係しない。

修正は各3〜5行。**`escapeHtml` を新設せず、`textContent` によるDOM構築へ置き換える。**

**加えて、キャッシュバスティングを2段（HTMLのエントリ + main.js内のui.js import）で行う。**

---

## 2. 基線

- ブランチ: `codex/attendance-dashboard`
- **実装開始時に `git rev-parse --short HEAD` を実行し、その値を完了報告へ記録すること**

前版は基線を `139d109` と固定したが、1日で陳腐化した。**ハッシュを固定せず、着手時点の実測を記録する方式へ改める。**

前提として、`apps/ai-handoff/` と取り込み済みGAS一式がコミット済みであること。未追跡のまま着手しないこと。

---

## 3. 確認済み事実

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

`params` は各アプリの `query.js` の `getQueryParams()` が返す、URLのクエリ文字列そのもの。

### 3 のガードは有効でない

```js
const role = String(currentUser?.role || "").trim().toLowerCase();
if (role !== "developer") { … return; }     // ← この role も URLクエリ由来
```

`currentUser` は `buildCurrentUserFromQuery(params)` が生成する（S-1）。攻撃者は `?role=developer` で自らガードを満たせる。

### 対象は3箇所で正しい

`account-console/js/signup-admin/ui.js` にも `banner.innerHTML` があるが、**固定文字列のみでURL値を展開していない。** 反射型XSSではない（Codexの確認と一致）。

### 推論：影響

`?module=<img src=x onerror=…>` で任意スクリプトが動く。単独では自己XSSに近いが、**同一オリジンに Firebase セッションと `sessionStorage` の識別情報がある。** 細工リンクを管理者に踏ませると idToken 窃取につながりうる。

---

## 4. 方針

### `escapeHtml` を新設しない

対象3画面に `escapeHtml` は存在しない。ここで定義すると suite 内で**4つ目の実装**になる（現在3つ: `shiftbuilder/js/shiftbuilder/utils.js`、`ordercase/js/utils.js`、`account-console/js/dashboard/main.js`）。C-3 として指摘済みの重複を増やすことになる。

**`textContent` でDOMを組み立てれば、エスケープ関数自体が不要。**

### 表示は変えない

見た目・文言・スタイルを変更しない。**XSSの解消とキャッシュバスティングのみに限定する。**

---

## 5. 作業内容

### 5-1. `apps/pmo/js/ui.js`

`banner.innerHTML = …` を置き換える。`banner.style.…` の設定はそのまま残す。

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

### 5-2. `apps/account-console/js/account-portal/ui.js`

**5-1と同一の変更。** コードが完全に同じため、同じ置き換えを適用する。

### 5-3. `apps/account-console/js/pmo-portal/ui.js`

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

**注意2点。**

元コードの `&gt;` はHTMLエンティティで、画面上は `>` と表示される。`textContent` では実体参照が展開されないため、**`"ShiftCore > "` と直接書く。** `&gt;` のままだと画面に `&gt;` と表示される。

非developer時の `developerMetaArea.innerHTML = ""` は `textContent = ""` へ変更してよい（挙動同等、意図が明確）。変更しなくても脆弱性ではない。

### 5-4. キャッシュバスティング（Codex P1・必須）

**2段で行う。片方だけでは不十分。**

版数文字列を1つ決める。例: `20260802-xss-1`

#### 第1段：`main.js` 内の `ui.js` import へ版数を付ける

| ファイル | 現在 | 変更後 |
|---|---|---|
| `apps/pmo/js/main.js:24` | `from "./ui.js"` | `from "./ui.js?v=20260802-xss-1"` |
| `apps/account-console/js/account-portal/main.js:3` | 同上 | 同上 |
| `apps/account-console/js/pmo-portal/main.js:3` | 同上 | 同上 |

#### 第2段：HTMLのエントリ `main.js?v=` を更新する

| ファイル |
|---|
| `apps/pmo/index.html` |
| `apps/account-console/account-portal.html` |
| `apps/account-console/pmo-portal.html` |

**第2段がないと、新しい `main.js` 自体が取得されないため第1段が効かない。**

#### 範囲

**触った範囲だけを1種類の版数に統一する。** account-console 全体の `?v=` 整理（9種類混在、C-5）と PMO 全体の `?v=` 整備は本作業の対象外。

---

## 6. 触らない範囲

- **S-1（URLクエリ由来の権限判定）— 直さない。** `buildCurrentUserFromQuery` や `canUseSignupAdmin` の構造は変更しない
- `query.js` 5重複（C-4）
- `escapeHtml` の統合（C-3）
- account-console と PMO の `?v=` 全面整理（C-5）
- 表示文言・スタイル・レイアウト
- GAS、Worker
- **既存のShiftBuilder文書差分**（`apps/shiftbuilder/docs/` の未コミット2件）
- 無関係な整形・リファクタリング

**S-4対象ファイルだけを扱い、既存差分を混ぜないこと。**

---

## 7. 完了条件

### 自動確認

1. 変更した6ファイル（`ui.js` × 3、`main.js` × 3）が `node --check` を通る
2. 既存テスト21件が pass

```bash
node --test shared/tests/*.test.mjs apps/shiftbuilder/tests/*.test.mjs
```

3. 対象3 `ui.js` に、テンプレートリテラルを `innerHTML` へ代入する箇所が残っていないこと

```bash
grep -n 'innerHTML\s*=\s*`' apps/pmo/js/ui.js \
  apps/account-console/js/account-portal/ui.js \
  apps/account-console/js/pmo-portal/ui.js
```

**何も出力されないこと。**

4. 3つの `main.js` の `ui.js` import に版数が付いていること

```bash
grep -n 'from "\./ui\.js' apps/pmo/js/main.js \
  apps/account-console/js/account-portal/main.js \
  apps/account-console/js/pmo-portal/main.js
```

**3件すべてに `?v=` が付いていること。**

### 手で確認（えいち）

5. **表示が変わっていないこと。** 3画面それぞれで、バナーと開発者メタ表示が従来どおり
   - PMOアプリ `?from=shiftcore&module=pmo`
   - account-portal `?from=shiftcore&module=account`
   - pmo-portal `?role=developer&module=pmo`
6. `pmo-portal` で `>` が正しく表示されること（`&gt;` と出ていないこと）

### XSSが解消されたことの確認（Codex P2・URLエンコード）

7. 次のURLで**スクリプトが実行されず、文字列としてそのまま表示される**こと

```
<PMOアプリURL>?from=shiftcore&module=%3Cimg%20src%3Dx%20onerror%3Dalert%281%29%3E
```

```
<account-portal URL>?from=shiftcore&module=%3Cimg%20src%3Dx%20onerror%3Dalert%281%29%3E
```

```
<pmo-portal URL>?role=developer&module=%3Cimg%20src%3Dx%20onerror%3Dalert%281%29%3E
```

**アラートが出ないこと**、かつ画面にデコード後の文字列 `<img src=x onerror=alert(1)>` がテキストとして表示されること。

### キャッシュバスティングの確認（Codex P2・必須）

8. **キャッシュを無効化せず、通常の再読み込みで**新しい版数付き `ui.js` が取得されていることを、開発者ツールのNetworkタブで確認する

**「キャッシュ無効化してから確認」では、バスティングが効いているかの検証にならない。** 修正前の状態を一度ブラウザに読み込ませてから、公開後に通常リロードして確認するのが望ましい。

---

## 8. 補足：この修正で塞がらないもの

S-4 を直しても **S-1（URLクエリ由来の権限判定）は残る。**

XSSは「注入されたスクリプトが動くこと」の問題、S-1は「クエリで身元を詐称できること」の問題であり、別の欠陥である。

S-1 は G-A・G-B・G-C・G-K のサーバ側修正が進めば、クライアント側の判定を「表示制御」に降格でき、自然に解消へ向かう。**単独で先に直す必要はない。**

---

## 9. 完了報告

`ai-handoff/archive/` へ結果文書を追加すること。加えて次を明示すること。

- **着手時の `git rev-parse --short HEAD` の値**
- 変更した6ファイルと、統一した版数文字列
- 第7章の確認項目のうち、実施できた項目とできなかった項目
- **実施できなかった確認を、実施済みとして書かないこと**
- 表示に変化がなかったか（変化があった場合はその内容）
- 確認8（通常リロードでのキャッシュ検証）を実施できたか
