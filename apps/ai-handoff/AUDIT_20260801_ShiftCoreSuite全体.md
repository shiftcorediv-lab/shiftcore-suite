# ShiftCore Suite 監査報告

- 実施: 2026-08-01 / 担当: Claude
- 基線: HEAD `139d109 fix: bound shared auth session waits`
- 範囲: 5アプリ + `shared/`（約13,000行）を浅く広く
- 観点: セキュリティ・権限 / 横断の一貫性 / 壊れやすさ / 保守性
- 編集したファイル: なし（読み取りのみ）

---

## 0. 制約の開示

- **公開環境での動作確認・侵入テストは行っていない。** 全指摘は静的なコード読解にもとづく。
- **GAS（Google Apps Script）側のコードは本リポジトリに存在しないため未確認。** サーバ側で追加の検証を行っている可能性は否定できない。ただし「クライアントが資格情報を送っていない」ことは確認済みの事実であり、サーバはそれを受け取れない。
- 私のサンドボックスでは `git status` / `git diff` が信頼できないため、状態確認は `git show` と実ファイル読み取りで行った。git の書き込み操作は一切していない。

---

## 1. 総括

**土台は悪くない。ただし「正しい認証実装」と「認証していない実装」が同じリポジトリに同居しており、後者が管理者機能を含んでいる。**

良い知らせは、**修正のお手本が既にこのリポジトリの中にある**ことだ。`pmo-admin` は Firebase セッションから実 idToken を取り、`getPmoAdminMetaSecure` のような `Secure` 系アクションを叩いている。`account-console` と `ShiftBuilder` も同型。つまり新しい設計を考える必要はなく、**既にある正しい型へ揃えるだけ**で S-1〜S-3 は塞がる。

| 深刻度 | 件数 | 内容 |
|---|---:|---|
| **最重要** | 1 | **G-A signup系3アクションが完全に無認証（承認＝ロール付与が誰でも実行可能）** |
| 高 | 4 | G-B PMO非Secureが URLクエリの role を信頼 / G-C PMO書き込み系が無認証 / S-4 反射型XSS 3箇所 / F-1 OrderCase 認証ハング |
| 中 | 4 | G-D `checkLoginUserByEmail` の無認証開示 / S-1 クライアント側のクエリ由来権限判定 / S-5 idTokenのConsole出力 / F-2 タイムアウト不在 |
| 低〜構造 | 7 | G-E 関数の二重定義、C-1〜C-5、保守性項目 |
| **取り下げ** | 1 | F-3 attendance-admin（GAS側で正しく守られていた。第4章参照） |

**S-2・S-3 は GAS を読んだ結果、G-A・G-B・G-C として確認済み事実に格上げした。** クライアント側の記述（第2章）は経緯として残す。

---

## 1-2. GAS（サーバ側）について【2026-08-01 追記】

リポジトリ内にGASのソースは**1本だけ**存在する。

`apps/account-console/backend/attendance-apps-script/Code.gs`（408行）

### 判明した事実（重要）

**同梱の README に、デプロイ方針が明記されている。**

> 公開範囲は「全員」ですが、各API操作はFirebase IDトークンを既存ログイン基盤で検証します。

つまり **GAS Webアプリは「全員」で公開されており、エンドポイントURLを知っていれば誰でもPOSTが届く。** 唯一の防御は各スクリプトが idToken を検証するかどうかである。

### この Code.gs は正しく書けている

```js
function doPost(e) {
  const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  const user = resolveUser_(body.idToken);      // ← 全アクションの手前で必須
  ...
}

function resolveUser_(idToken) {
  if (!idToken) throw apiError_("AUTH_REQUIRED", "ログイン情報がありません。");
  // ログインプロキシ（Cloudflare Worker）へ問い合わせて身元を確定
  const response = UrlFetchApp.fetch(LOGIN_PROXY_URL, { ... });
  if (!data.ok || !data.user || !data.user.email) throw apiError_("AUTH_INVALID", ...);
  return data.user;
}

function requireAdmin_(user) {
  if (!isAdmin_(user)) throw apiError_("FORBIDDEN", "管理者権限が必要です。");
}
```

- `doPost` の入口で `resolveUser_` が必須。トークンなしは即 `AUTH_REQUIRED`
- 管理系アクション（`getAdminDashboard` / `reviewRequest` / `updateEndWarningTime`）はすべて `requireAdmin_(user)` を通す
- ロールはクライアントからではなく**ログインプロキシが返した `user.role`** を使う
- 位置情報の閲覧は `canViewPreciseLocation_(user)` でさらに絞る

**これが ShiftCore の正しいサーバ側の型である。** S-1〜S-3 の解決像は、クライアント側（`pmo-admin`）とサーバ側（この `Code.gs`）の両方で既に実在している。

### S-2・S-3 に対する含意

デプロイが「全員」であることが確定したため、**S-2・S-3 の前提条件は満たされている。**

`signup-admin` と `PMO` のクライアントは idToken を一切送っていない（確認済み事実）。サーバは受け取っていない値を検証できないため、**それらのGASが `resolveUser_` 型の検証を行っていることはありえない。** 別の防御機構がある可能性は残るが、この方式ではない。

### 【2026-08-01 第2次追記】GAS 3本を取得し、全数確認した

`clasp` で3プロジェクト（計47ファイル）を取得し、ルーターと権限判定を全て読んだ。**S-1・S-2・S-3 は推論ではなく確認済み事実になった。**

| プロジェクト | 対応アプリ | 配置 |
|---|---|---|
| `PickMyOff_v2` | PMO / pmo-admin | `apps/pmo/backend/pmo-apps-script/` |
| `ShiftCore_Account_A…` | signup / account-console | `apps/account-console/backend/account-apps-script/` |
| `OrderCase_API_v1` | OrderCase | `apps/ordercase/backend/ordercase-apps-script/` |

#### 先に：正しく守られているもの

誤解を避けるため明記する。**大半のアクションはきちんと守られている。**

| 対象 | ガード | 内容 |
|---|---|---|
| 勤怠 `Code.gs` | `resolveUser_` + `requireAdmin_` | 入口で必須。管理系はロール検証 |
| Account Console 6アクション | `requireAccountConsoleOperator_` | idToken検証 + `status=active` + `allowed_modules` 確認 |
| PMO Secure 3アクション | `requirePmoAdminUser_` | ログインプロキシで身元解決 → role検証 |
| OrderCase 全般 | `requireOrderCaseViewer_` / `requireOrderCaseEditor_` | 加えて金額項目のマスキング層あり |

`token_auth.js` の `resolveFirebaseEmailByIdToken_` は Google の `identitytoolkit accounts:lookup` でトークンを実検証しており、自前の雑な検証ではない。**設計者は正しいやり方を知っている。** 問題は、それが一部のアクションに適用されていないことに尽きる。

---

#### G-A【最重要・確認済み】signup系3アクションが完全に無認証

**確認済み事実**

`apps/account-console/backend/account-apps-script/api.js`

```js
if (action === "approveSignupRequest") {
  const requestId = normalizeText(body.requestId);
  const approval = body.approval || {};
  const reviewedBy = normalizeText(body.reviewedBy);
  return jsonResponse_(approveSignupRequest(requestId, approval, reviewedBy));
}
```

**`idToken` を受け取ってすらいない。** `signup_admin.js` の本体にも認証・権限確認は一切ない。検証しているのは申請の存在・ステータス・必須項目の非空のみ。

```js
function approveSignupRequest(requestId, approval, reviewedBy) {
  const request = getSignupRequestById_(requestId);
  ...
  if (!normalizeText(approval.role)) {
    return { success: false, message: "role は必須です" };   // ← 空でなければ何でも通る
  }
  ...
  const internalUserId = appendUserMasterFromSignup_(request, approval);  // ← ユーザーマスタへ追加
  sheet.getRange(row, headerMap["reviewed_by"]).setValue(normalizeText(reviewedBy));  // ← 文字列をそのまま記録
  sendSignupApprovedMail_(request.applicant_email, request.applicant_name);
```

同様に無認証なアクション:

| アクション | 種別 | 影響 |
|---|---|---|
| `approveSignupRequest` | POST | **ユーザーマスタへの追加とロール付与** |
| `rejectSignupRequest` | POST | 申請の却下 |
| `getSignupRequests` | GET | `applicant_email` / `applicant_name` / `phone` を返す＝**個人情報** |

**推論（攻撃連鎖）**

1. `submitSignupRequest` で新規メールアドレスの申請を作る（これは公開の申請フォームであり、無認証で正しい）
2. `approveSignupRequest` を直接POSTし、`approval.role` に `admin` を指定する
3. ユーザーマスタに admin ロールで登録される

`existsUserByEmail_` があるため既存メールは弾かれるが、**新規メールなら通る。ゼロから管理者権限を取得できる。** `reviewedBy` は呼び出し側の文字列なので、監査証跡も詐称できる。

**GAS Webアプリの公開範囲は「全員」**（勤怠READMEに明記、他2本も同一方針と推定）。エンドポイントURLは公開JSに平文で入っている。

#### G-B【高・確認済み】PMOの非Secureアクションが URLクエリの role を信頼

**確認済み事実**

`apps/pmo/backend/pmo-apps-script/api.js` の `doGet`

```js
if (action === "exportMonthlyExcel") {
  const targetYearMonth = normalizeText(getParam_(e, "targetYearMonth"));
  const role = normalizeText(getParam_(e, "role"));        // ← URLクエリから
  return jsonResponse_(exportMonthlyExcel(targetYearMonth, role));
}
```

`pmo_admin.js`

```js
function canManagePmoByRole_(role) {
  const normalizedRole = normalizeText(role).toLowerCase();
  return normalizedRole === "admin" || normalizedRole === "developer";   // ← 文字列比較のみ
}
```

対象は `getPmoAdminMeta` / `getPmoMonthlyTable` / `exportMonthlyExcel` の3つ。いずれも `role` をURLクエリから受け取り、それを信頼して権限判定している。

**同じファイル群に `getPmoAdminMetaSecure` などの正しい実装が存在するのに、非Secure版が生きたまま残っている。** クライアント（`pmo-admin`）はSecure版へ移行済みだが、旧アクションが撤去されていない。

**推論**

`GET <PMO_GAS_URL>/exec?action=exportMonthlyExcel&targetYearMonth=2026-08&role=admin` で、全社員の希望休一覧をExcelとして取得できる。希望休は個人の勤務予定であり個人情報にあたる。

#### G-C【高・確認済み】PMOの書き込み系2アクションが無認証

`doPost` の `submitShiftRequest` と `createMonthlyRequestSheet` は、トークンもロールも一切見ない。他人名義の希望休提出、月次シートの作成が可能。

#### G-D【中・確認済み】`checkLoginUserByEmail` が無認証でユーザー情報を返す

```js
if (action === "checkLoginUserByEmail") {
  const email = normalizeText(body.email);
  return jsonResponse_(checkLoginUserByEmail(email));   // ← トークン不要
}
```

任意のメールアドレスに対し、登録の有無・停止状態・`buildLoginUserResponse(user)` の内容を返す。**アカウント列挙とユーザー情報の開示**にあたる。ログイン基盤の一部として必要な面はあるが、無条件公開は過剰。

#### G-E【低・バグ】`getPmoAdminMetaSecure` が二重定義

`apps/pmo/backend/pmo-apps-script/monthly_sheet.js` の **323行目と605行目**に同名関数が2つある。JavaScriptでは後の定義が勝つため、323行目は死にコード。差分はレスポンスに `currentUser: auth.user` を含むかどうか。

セキュリティ上の問題ではない（両者とも `requirePmoAdminUser_` を正しく呼ぶ）が、**片方を修正しても効かない**という保守上の罠になっている。

---

### 【第3次追記】login-proxy Worker とデプロイ棚卸しの結果

#### W-1【最重要・G-Aの深刻度を引き上げる】ACCOUNT GAS はスイート全体の身元認証局である

**確認済み事実**

`shiftcore-login-proxy` Worker のソースを確認した。**素通しのプロキシである。**

```js
const gasUrl = "https://script.google.com/macros/s/AKfycbx83rAzXDfQPJUE.../exec";
...
const bodyText = await request.text();
const gasResponse = await fetch(gasUrl, {
  method: "POST",
  headers: { "Content-Type": "text/plain;charset=utf-8" },
  body: bodyText,          // ← 中身を検査せずそのまま転送
  redirect: "follow"
});
```

- **アクションの許可リストがない。** `action` を見ずに全てのリクエストを ACCOUNT GAS へ転送する
- 転送先は `AKfycbx83rAz...` = **G-A を持つ ACCOUNT プロジェクト**
- `Access-Control-Allow-Origin` に `https://shiftcorediv-lab.github.io` を設定しているが、**`request.headers.get("Origin")` を検査していない。** CORS はブラウザのJSがレスポンスを読むことを制限する仕組みであり、`curl` やサーバ間リクエストには一切効かない。**アクセス制御にはなっていない**

そして、この Worker を**スイート全体が身元解決に使っている。**

| 呼び出し元 | 経路 |
|---|---|
| 勤怠 `Code.gs` の `resolveUser_` | Worker → ACCOUNT GAS |
| PMO `auth_guard.gs.js` の `resolveShiftCoreCurrentUserByIdToken_` | Worker → ACCOUNT GAS |
| account-console ログイン画面 `LOGIN_CHECK_URL` | Worker → ACCOUNT GAS |

**推論（G-Aの再評価）**

G-A は「signup画面の不具合」ではない。**匿名の攻撃者が、スイート全体の認証局に対して admin ロールのアカウントを発行させられる**ということである。

発行されたアカウントは、勤怠・PMO・Account Console・ShiftBuilder のすべてから正規ユーザーとして信頼される。これらは全て同じ ACCOUNT GAS に身元解決を委ねているため、**「正しく守られている」と評価した各アプリの防御も、この経路で迂回される。**

なお、トークン検証の仕組み自体（`identitytoolkit accounts:lookup`）は正しく、Worker はそれを弱めてはいない。問題は**認証局が、無認証でアカウントを作れる口を同居させていること**にある。

#### W-2【高】G-A に到達できるURLが4つある

デプロイ棚卸しの結果、ACCOUNT プロジェクトの `approveSignupRequest` へは**4経路**で到達できる。

| # | URL | 状態 |
|---|---|---|
| 1 | `AKfycbx83rAzXDfQPJUE…` @37 | コードが参照。本番 |
| 2 | `AKfycbyvUOQHkNWSxiBz…` @37 | **コード内参照0件。本番と同版＝同じ脆弱性** |
| 3 | `AKfycbzS0Etn9kdeI_I3…` @HEAD | コード内参照0件。常に最新コードを配信 |
| 4 | `shiftcore-login-proxy.shiftcore-div.workers.dev` | Worker経由の素通し |

**修正時に1だけ直しても塞がらない。** 2と3はアーカイブ、4はアクション許可リストの追加が必要。

#### W-3【中】コード内から参照されていないデプロイが5つ稼働している

| デプロイID | プロジェクト | 版 |
|---|---|---|
| `AKfycbxwSCE-HKFJQNJf…` | PMO | @HEAD |
| `AKfycbzS0Etn9kdeI_I3…` | ACCOUNT | @HEAD |
| `AKfycbyvUOQHkNWSxiBz…` | ACCOUNT | @37 |
| `AKfycbzT60FjPOEZF0h0…` | ORDERCASE | @HEAD |
| `AKfycbxTZCSs-CoDqmNI…` | ORDERCASE | @39 |

いずれも `ANYONE_ANONYMOUS`。`@HEAD` はエディタで保存した時点のコードを即座に配信するため、**デプロイしたつもりのない作業途中のコードが公開される。**

#### W-4【中】ShiftBuilder と勤怠のGASは別のGoogleアカウント所有

`clasp list` は3プロジェクトしか返さず、そのデプロイ一覧にも次の2つは現れなかった。

- `AKfycbxlWX3iPy6b1LDj…` — ShiftBuilder
- `AKfycbzYSk46G7ZZx55v…` — 勤怠（ソースのみリポジトリ内にあり）

**本番バックエンド2本が、現在のアカウントの管理外にある。** とくに ShiftBuilder は開発が最も活発なアプリであり、そのサーバ側コードをレビューできない状態が続くのは望ましくない。

---

### G-1【中】GASの5本中1本しかバージョン管理されていなかった

コード内に登場するGASエンドポイントは4つ、加えてCloudflare Workerが2つある。

| エンドポイント | 用途 | ソース管理 |
|---|---|---|
| `AKfycbzYSk46...` | 勤怠 | **リポジトリ内にあり** |
| `AKfycbx83rAz...` | signup-admin / signup-request / account-console | **なし** |
| `AKfycbyTQlhU...` | PMO / pmo-admin | **なし** |
| `AKfycbxlWX3i...` | ShiftBuilder | **なし** |
| `shiftcore-login-proxy...workers.dev` | ログイン基盤（身元解決） | **なし** |
| `ordercaseapiproxyworker...workers.dev` | OrderCase | **なし** |

サーバ側のロジック、とりわけ**認証と権限判定の本体がバージョン管理されていない。** 変更履歴・レビュー・ロールバックのいずれも効かない。`Code.gs` の README には「変更したらApps Script側へ反映し、新バージョンを作成する」という運用が書かれているが、これは手作業に依存する。

---

## 2. セキュリティ・権限

### S-1【最重要】身元と権限をURLクエリから組み立てている

**確認済み事実**

`buildCurrentUserFromQuery()` が **`role` を URL のクエリ文字列から読んでいる。**

```js
// apps/account-console/js/signup-admin/query.js
export function buildCurrentUserFromQuery(params) {
  return {
    userId: normalizeText(params.userId || params.user_id || params.userid),
    ...
    role: normalizeText(params.role),
    ...
  };
}
```

そしてその `role` が、そのまま権限判定に使われる。

```js
// apps/account-console/js/signup-admin/main.js:26-30
const currentUser = buildCurrentUserFromQuery(params);
sessionStorage.setItem("shiftcore_portal_user", JSON.stringify(currentUser));
const canUse = canUseSignupAdmin(currentUser);
```

```js
// apps/account-console/js/signup-admin/navigation.js
export function canUseSignupAdmin(currentUser) {
  const role = String(currentUser?.role || "").trim().toLowerCase();
  if (SIGNUP_ADMIN_ALLOWED_ROLES.includes(role)) return true;   // ["admin","dev","developer"]
  ...
}
```

同じ実装を持つ画面（`query.js` が5重複）:

| 画面 | 権限判定に使用 |
|---|---|
| `account-console/js/signup-admin/` | **する** |
| `account-console/js/account-portal/` | する（`updatePortalState`） |
| `account-console/js/pmo-portal/` | する（`role !== "developer"`） |
| `account-console/js/pmo-admin/` | 表示のみ。API は idToken を使う |
| `pmo/js/` | する |

**推論**

`signup-admin.html?role=admin&userId=任意` を開けば、クライアント側のゲートは通過する。`account-portal` は `sessionStorage` のフォールバックも持つが、初回は同じくURL由来。

### S-2【最重要】signup-admin のAPIが資格情報を一切送っていない

**確認済み事実**

`apps/account-console/js/signup-admin/api.js` の3関数すべてに idToken も Authorization ヘッダもない。

```js
export async function approveSignupRequest(requestId, approval, reviewedBy) {
  const response = await fetch(SIGNUP_ADMIN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "approveSignupRequest", requestId, approval, reviewedBy })
  });
```

- `fetchSignupRequests` — 申請一覧の取得
- `approveSignupRequest` — **承認**。`approval` に `role` / `organizationId` / `allowedModules` / `status` / `workStatus` を含む
- `rejectSignupRequest` — 却下

`reviewedBy` に渡すのは `currentUser.userId`（S-1のとおりURL由来）。

**推論**

承認はアカウント発行と権限付与にあたる。ここが無資格情報ということは、**GASのデプロイ設定が「全員（Anyone）」であれば、エンドポイントURLを知る者は誰でも承認・却下を実行できる。** URLは公開されたJSに平文で入っている。監査証跡の `reviewedBy` も詐称可能。

**最優先で確認すべきこと**: このGAS Webアプリのデプロイ設定（アクセスできるユーザー）。「全員」なら即時対応が必要。

### S-3【高】PMOアプリが完全に無認証

**確認済み事実**

`apps/pmo/js/api.js` は全体で idToken / Authorization / Bearer を一度も使っていない（grep で0件）。

```js
export async function apiPost(action, body = {}) {
  const response = await fetch(GAS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...body })
  });
```

さらに、**PMO の `GAS_API_URL` と `pmo-admin` の `PMO_ADMIN_API_URL` は同一のエンドポイント**である。

```
https://script.google.com/macros/s/AKfycbyTQlhU9osbUqh0cjJJCzERgs8fuQ1gr3x5svc-aw3TziPbhCE1UWQTCfgsjARKl7FiJw/exec
```

`pmo-admin` は `getPmoAdminMetaSecure` のように `Secure` 付きアクションへ idToken を添えて送る。つまり**同じエンドポイントに secure 系と非 secure 系のアクションが同居している。**

**推論**

希望休の提出・参照が資格情報なしで到達しうる。希望休は個人の勤務予定であり個人情報にあたる。

### S-4【高】反射型XSS 3箇所

**確認済み事実**

URLクエリ由来の値を、エスケープせず `innerHTML` へ展開している。

| ファイル:行 | 展開している値 |
|---|---|
| `apps/pmo/js/ui.js:77` | `${params.module \|\| "unknown"}` |
| `apps/account-console/js/account-portal/ui.js:63` | `${params.module \|\| "unknown"}` |
| `apps/account-console/js/pmo-portal/ui.js:56-58` | `${moduleName}` `${role}` `${workStatus}` |

```js
banner.innerHTML = `
  <div><strong>ShiftCoreから移動しました</strong></div>
  <div>module: ${params.module || "unknown"}</div>
`;
```

`pmo-portal` は `role !== "developer"` でガードされているが、その `role` 自体がURL由来（S-1）なので攻撃者が自分で満たせる。

**推論**

`?module=<img src=x onerror=...>` の形で任意スクリプトが動く。単独では自己XSS止まりだが、**同一オリジンに Firebase セッションと `sessionStorage` の識別情報がある。** 細工したリンクを管理者に踏ませれば idToken の窃取に繋がりうる。S-1・S-2と組み合わせると影響が上がる。

**なお `pmo/js/ui.js:87` 付近の氏名表示は `textContent` を使っており安全。** 問題はバナー部分に限定される。

### S-5【中】idTokenを含むセッションをConsoleへ出力

**確認済み事実**

```js
// apps/shiftbuilder/js/shiftbuilder/main.js:2844
console.log("[ShiftBuilder] auth session:", session);
```

`session` は `idToken` を含む。画面共有・スクリーンショット・ブラウザ拡張から読める。

---

## 3. 横断の一貫性

### C-1 認証実装が4系統ある

| # | 実装 | SDK | 利用元 |
|---|---|---|---|
| 1 | `shared/js/shiftcore-auth.js` | modular 10.12.2 | ShiftBuilder のみ |
| 2 | `account-console/js/common/auth-session.js` | modular（`login/auth.js` 経由） | pmo-admin ほか |
| 3 | `account-console/js/dashboard/auth.js` | modular（別インスタンス） | dashboard, attendance-admin |
| 4 | `ordercase/js/auth-session.js` | **compat 10.12.4**（動的script注入） | OrderCase |

`139d109` で堅牢化したのは1のみ。2〜4には反映されていない。

### C-2 Firebase設定が4重複

`shared/js/shiftcore-firebase-config.js` / `account-console/js/dashboard/config.js` / `account-console/js/login/config.js` / `ordercase/js/config.js`。**現時点で値は完全に一致しており、乖離はない。**

**補足（誤解を避けるため）**: Firebase の Web API キーは秘密情報ではなく、公開前提の識別子である。露出そのものは脆弱性ではない。実際の防御は Firebase の承認済みドメイン設定とサーバ側のルールで行う。ここでの問題は**同期コストのみ**。

### C-3 `escapeHtml` が3重定義、2アプリで未定義

| 場所 | 実装 |
|---|---|
| `shiftbuilder/js/shiftbuilder/utils.js:3` | `replaceAll` で5文字を明示置換 |
| `ordercase/js/utils.js:10` | 独自 |
| `account-console/js/dashboard/main.js:281` | `div.textContent` → `innerHTML` を利用 |
| `pmo` | **定義なし** |
| `persona-gacha` | **定義なし** |

S-4 の3箇所は、いずれも `escapeHtml` を持たないか使っていない画面で起きている。

### C-4 `query.js` が5重複

`account-portal` / `signup-admin` / `pmo-portal` / `pmo-admin` / `pmo` にほぼ同一のコピー。`account-portal` だけ `sessionStorage` フォールバックを持ち、他と挙動が違う。**S-1を直すとき、5箇所すべてを直す必要がある。**

### C-5 キャッシュバスティングが統一されていない

| アプリ | `?v=` 箇所数 | 相対import数 | 版数の種類 |
|---|---:|---:|---|
| shiftbuilder | 41 | 36 | **1種類**（`20260801-authfix-1`） |
| account-console | 35 | 74 | **9種類**（`?v=8`, `?v=9`, `?v=20260703_1505`, `20260802-modules-1/2` ほか） |
| pmo | 1 | 17 | 1種類（`?v=2`） |
| ordercase | 0 | 0 | ESモジュール未使用（classic script） |
| persona-gacha | 0 | 0 | 同上 |

ShiftBuilder だけが完全統一されている。**account-console は適用率が約47%で、版数体系も混在。** PMO は17 import に対し `?v=` が index.html の1箇所のみで、モジュール単体の更新が反映されない可能性がある。

---

## 4. 壊れやすさ

### F-1【高】OrderCase に 3-3 と同型の認証ハング。しかもより重い

**確認済み事実**

`apps/ordercase/js/auth-session.js:50-71`

```js
return new Promise(function(resolve) {                      // reject なし
  firebase.auth().onAuthStateChanged(async function(user) { // async コールバック
    if (!user) { /* リダイレクト */ return; }
    const idToken = await user.getIdToken();                // 拒否したら resolve に到達しない
    window.ORDERCASE_AUTH = { ... };
    resolve(window.ORDERCASE_AUTH);
  });
});                                                          // 戻り値を捨てている＝購読解除なし
```

`139d109` で `shared/` から潰した欠陥 (a)〜(e) がそのまま残っている。**加えて `onAuthStateChanged` の戻り値（unsubscribe関数）を受け取っておらず、リスナーを一度も解除していない。** これは ShiftBuilder の旧実装より悪い。

**推論**

- `getIdToken()` の拒否で `requireOrderCaseLogin()` が永久に返らない
- リスナーが残るため、後からログアウトした際にコールバックが再発火し、`!user` 分岐のリダイレクトが意図しないタイミングで走る

### F-2【中】`common/auth-session.js` にタイムアウトがない

```js
function waitForAuthUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user || null);
    });
  });
}
```

購読解除はしており、コールバックも `async` ではないため F-1 より軽症。`getIdToken()` は `resolveAuthenticatedSession()` の `await` にあるので拒否は呼び出し側へ伝播する。**残るのは `onAuthStateChanged` が発火しない場合のハングのみ**で、タイムアウトを足せば閉じる。

### F-3【訂正・実害なし】attendance-admin の権限判定

**当初この項目を「権限判定がない」と指摘したが、GAS を読んだ結果これは誤りだった。取り下げる。**

`apps/account-console/js/attendance-admin/main.js` は確かにクライアント側ではログイン有無しか見ていない。

```js
onAuthStateChanged(auth,user=>user?load():window.location.replace("./index.html"));
```

しかし実データ取得は `dashboard/attendance-api.js` の `attendanceRequest()` を通り、**idToken を必ず添えて送る。**

```js
const idToken = await user.getIdToken();
body: JSON.stringify({ action, idToken, payload })
```

サーバ側（`Code.gs`）では `resolveUser_(body.idToken)` で身元を確定し、`getAdminDashboard` は `requireAdmin_(user)` でロールを検証している。**サーバ側の防御は正しく効いている。**

残るのはUI上の体験のみ（非管理者が一瞬画面に入り、APIが `FORBIDDEN` を返す）。セキュリティ上の問題ではない。

**この訂正の教訓**: クライアント側の grep だけで「権限判定なし」と判断すべきではなかった。API モジュールが別ディレクトリ（`dashboard/`）にあったため見落とした。以下 S-2・S-3 についても、同じ理由で GAS 側の確認が必要である。

---

## 5. 保守性

- **テストは ShiftBuilder(16) + shared(5) の21件のみ。** account-console・ordercase・pmo・persona-gacha はゼロ。account-console は4,006行・62JS・10HTMLでテストなし。
- `attendance-admin/main.js` は15行に圧縮された1行スタイルで、他ファイルの整形方針と大きく異なる。
- **文書が古い。** `SHIFTBUILDER_CURRENT_STATE.md` と `AI_COLLABORATION_HANDOFF.md` はいずれも 2026-07-17 のまま。ルートの `README.md` は移行状況表に ShiftBuilder を載せていない（公開URL表には載っている）。
- `apps/CLAUDE.md` / `apps/AI_COLLABORATION_HANDOFF.md` / `apps/shiftbuilder/CLAUDE.md` が**2週間以上、未追跡のまま**。
- **`.gitignore` が存在しない。** `.DS_Store` が2つ未追跡で残り続けている。

---

## 6. 良い点

指摘が多いので明記しておく。

- **`pmo-admin` の認証は正しい形。** `requireAuthenticatedSession()` → 実 idToken → `...Secure` アクション。S-1〜S-3 の解決モデルがリポジトリ内に既にある。
- **ShiftBuilder は直近2回の修正で、テスト・キャッシュバスティング・失敗経路のいずれも suite 内で最良の状態。** 他アプリの目標地点になる。
- `shared/js/shiftcore-auth.js` は `139d109` で有限時間 settle が保証された。
- `escapeHtml` は ShiftBuilder では実装・適用とも一貫している。
- API層に revision + TTL のキャッシュがあり、失敗時に握り潰す方針が明示されている。
- Persona Gacha は外部通信が QRコード生成のみで、攻撃面が小さい。

---

## 7. 優先順位

**先にコードを触るより、まず設定を1つ確認してほしい。**

GAS 3本を取得したことで、優先順位が変わった。**最上位はサーバ側である。クライアント側をいくら直しても G-A は塞がらない。**

| 順 | 対応 | 規模 | 備考 |
|---|---|---|---|
| **1** | **G-A `approveSignupRequest` / `rejectSignupRequest` / `getSignupRequests` に認証を追加** | 小 | **最優先。** `requireAccountConsoleOperator_` が同じプロジェクト内にあるので、それを呼ぶだけ。`reviewedBy` も呼び出し側の文字列ではなく解決済みユーザーから取る |
| 2 | G-B PMOの非Secureアクション3つを撤去 | 小 | クライアントは既にSecure版へ移行済み。`doGet` から3分岐を削るだけで済む可能性が高い。要確認 |
| 3 | G-C `submitShiftRequest` / `createMonthlyRequestSheet` に認証を追加 | 小〜中 | 提出は本人性の確認が要る。`resolveShiftCoreCurrentUserByIdToken_` を利用 |
| 4 | S-4 XSS 3箇所をエスケープ or `textContent` 化 | 極小 | 3行程度。クライアント側で完結 |
| 5 | S-5 `console.log` からセッションを外す | 極小 | 1行 |
| 6 | G-D `checkLoginUserByEmail` の公開範囲を絞る | 小 | ログイン基盤の設計判断を伴う。要相談 |
| 7 | S-1 5画面の権限判定をサーバ検証へ移す | 中 | 1〜3が済めば、クライアント側の判定は「表示制御」に降格でき、自然に片付く |
| 8 | F-1 OrderCase クライアントの認証ハングを `shared/` の実装へ寄せる | 中 | `139d109` の成果を再利用できる。OrderCaseのGAS側は良好 |
| 9 | G-E `getPmoAdminMetaSecure` の二重定義を解消 | 極小 | 323行目が死にコード |
| 10 | C-5 account-console と PMO のキャッシュバスティング整備 | 小〜中 | ShiftBuilder の方式を横展開 |
| 11 | `.gitignore` 追加、未追跡文書のコミット、文書の日付更新 | 極小 | |

**1〜3 の修正材料はすべて既にリポジトリ内にある。** 新しい設計を考える必要はない。

- `requireAccountConsoleOperator_`（`account_console_users.js`）— idToken検証 + status + allowed_modules
- `requirePmoAdminUser_`（`auth_guard.gs.js`）— ログインプロキシ経由の身元解決 + role検証
- `resolveUser_` / `requireAdmin_`（勤怠 `Code.gs`）— 参考実装

**1 は GAS 側の変更だけで塞がる。** クライアント（`signup-admin/api.js`）に idToken 送信を足す作業とセットになるが、サーバ側を先に固めれば、クライアントが未対応でも攻撃経路は閉じる（正規画面が一時的に動かなくなるだけ）。緊急度を優先するならその順序もありうる。

**G-1 は解消済み。** 3本を `backend/` 配下へ取り込んだ。以後はGASもコードレビューと差分の対象にできる。

---

## 作業引き継ぎ

- **担当**: Claude
- **Branch / HEAD**: `main` / `139d109`
- **変更したファイル**: なし
- **確認済み事実**: 第2〜5章の「確認済み事実」節。すべて実コードから読み取り、行番号は実物照合済み
- **推論・未確認**: GAS側の検証有無とデプロイ設定、公開環境での実際の到達可否、実APIのレスポンス形状
- **実施したテスト**: `node --test shared/tests/*.test.mjs apps/shiftbuilder/tests/*.test.mjs` → 21 pass / 0 fail
- **未実施**: 侵入テスト、公開環境での動作確認、GASソースの確認
- **次の担当者が最初に行うこと**: 第7章の順序0（GASデプロイ設定の確認）
- **触らない箇所**: 全既存ファイル。特に未追跡のCLAUDE.md系3ファイルと `docs/` 配下
