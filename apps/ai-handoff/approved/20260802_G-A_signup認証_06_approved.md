# Codex作業指示書：G-A 登録申請の承認APIに認証を追加する（改訂版2）

- 状態: **承認済み（実装可）**
- 作成者: Claude
- 承認者: えいち
- 承認日: 2026-08-02
- 作成日: 2026-08-02
- 前提文書: `reviewed/20260802_G-A_signup認証_04_codex-rereview.md`
- 置き換える版: `archive/20260802_G-A_signup認証_03_claude-revised.md`
- 実装: 未実施
- commit: 未実施
- push: 未実施
- deploy: 未実施

> **えいちの承認済み。本書に従って実装してよい。**
>
> ただし着手前に、`apps/account-console/backend/account-apps-script/`、`apps/ai-handoff/`、`workers/` が
> コミット済みであることを確認すること（第2章）。**未追跡のまま着手しないこと。**

---

## 0. 前版（03）からの訂正

Codexの再レビューを実コードで照合した。**指摘は全件事実だった。**

| # | Codexの指摘 | 検証結果 | 対応 |
|---|---|---|---|
| P1 | 孤児の固定版デプロイが残る限りG-Aは解消しない。アーカイブを完了条件にすべき | **正しい** | **完了条件を全面改訂。第8章** |
| P1 | `internal_user_id` は空文字になりうる。「必ず返す」はプロパティ存在と有効値の混同 | **正しい**（`users.js:173` が `String(user.internal_user_id \|\| "").trim()`） | 非空検証を追加 |
| P2 | `status=active` は実効上の新規制限ではない | **正しい**（`checkLoginUserByEmail` が非activeへ `ok:false` を返す。`users.js:208-231`） | **説明を訂正** |
| P2 | `clasp status` は本番との内容一致を証明しない | **正しい** | 手順から削除 |
| P2 | LockService（G-J）はG-Aから分離すべき | 妥当 | **本書から除外** |
| §6 | 基線 `139d109` と現HEADが不一致。GAS一式が未追跡 | **正しい**（ブランチ `codex/attendance-dashboard`、HEAD `32323f8`、10コミット以上先） | 基線の指定方法を変更 |

### 前版の誤り（明示）

**誤り1**: 「`internal_user_id` は `buildLoginUserResponse()` が必ず返す」と書いた。プロパティは常に存在するが、**値は空文字になりうる。** 監査列に空文字が入る。

**誤り2**: 「`status=active` は新規に追加する。この1点だけ条件を厳しくする」と書いた。**既存の認証解決経路に active 制限が既にある。** 新規の制限ではない。

**誤り3**: 「`clasp status` で差分がないことを確認」と書いた。目的とコマンドが一致していない。

---

## 1. 直す対象

`approveSignupRequest` は `idToken` を受け取っていない。

```js
// apps/account-console/backend/account-apps-script/api.js
if (action === "approveSignupRequest") {
  const requestId = normalizeText(body.requestId);
  const approval = body.approval || {};
  const reviewedBy = normalizeText(body.reviewedBy);
  return jsonResponse_(approveSignupRequest(requestId, approval, reviewedBy));
}
```

本体（`signup_admin.js`）にも認証・権限確認がない。`approval.role` は非空チェックのみで、通ると `appendUserMasterFromSignup_` がユーザーマスタへ追加し、承認メールが送信される。

### なぜ最優先か

ACCOUNT GAS は**スイート全体の身元認証局**である。勤怠 `Code.gs` の `resolveUser_`、PMO `auth_guard.gs.js`、account-console のログイン画面が、いずれも login-proxy Worker 経由でこのGASに身元解決を委ねている。

**匿名の攻撃者が認証局に admin ロールのアカウントを発行させられる。** 発行されたアカウントは全アプリから正規ユーザーとして信頼される。

デプロイは `"access": "ANYONE_ANONYMOUS"` / `"executeAs": "USER_DEPLOYING"`。

### 到達経路は4つ

| # | URL | 対処 |
|---|---|---|
| 1 | `AKfycbx83rAzXDfQPJUE…` @37 | 本番。新バージョンで更新 |
| 2 | `AKfycbyvUOQHkNWSxiBz…` @37 | **孤児。アーカイブ必須** |
| 3 | `AKfycbzS0Etn9kdeI_I3…` @HEAD | 孤児。最新コード配信 |
| 4 | login-proxy Worker | 許可リストを追加 |

---

## 2. 基線

- ブランチ: `codex/attendance-dashboard`
- **実装開始時に `git rev-parse --short HEAD` を実行し、その値を完了報告へ記録すること**

前版は基線を `139d109` と固定したが1日で陳腐化した。**ハッシュを固定せず、着手時点の実測を記録する方式へ改める。**

**前提条件**: `apps/account-console/backend/account-apps-script/`、`apps/ai-handoff/`、`workers/` がコミット済みであること。**未追跡のまま着手しないこと。**

---

## 3. 作業順序

GASと静的クライアントは別々の公開物であり、原子的な同時反映はできない。段階移行で行う。

| 手順 | 対象 | 内容 | 壊れるか |
|---|---|---|---|
| A | Worker | ソースをリポジトリへ取り込む | 変更なし |
| B | Worker | 許可リストを追加 | 壊れない |
| C | — | ログイン・勤怠・PMO・ShiftBuilder を回帰確認 | — |
| D | GAS | 重複ガードを一本化 | 壊れない |
| E | GAS | 認証付きPOST版を**追加**（旧GETは残す） | 壊れない |
| F | クライアント | Firebaseセッション + 認証付きPOSTへ移行 | 壊れない |
| G | — | 本番クライアントがPOST版を使っていることを確認 | — |
| H | GAS | 承認・却下で `idToken` を必須化 | 壊れない（Fで対応済み） |
| I | GAS | 承認payloadの許容値検証を追加 | 壊れない |
| J | — | 正規管理者・権限なし・トークンなしを確認 | — |
| K | GAS | 旧GET一覧を**削除** | 壊れない（Gで確認済み） |
| L | えいち | **孤児デプロイ2つのアーカイブ** | — |
| M | — | **到達経路1〜4すべてへの攻撃テスト** | — |

**手順LとMを完了条件から外さないこと。** 詳細は第8章。

### 移行期間中に残るリスク（明示）

手順EからKの間、旧GET版 `getSignupRequests` が無認証のまま残る。個人情報（`applicant_email` / `applicant_name` / `phone`）の開示経路である。

一方、**最も深刻な承認・却下は手順Hで閉じる。** 権限昇格が先、情報開示が後という順序は意図的である。

**手順Kを別作業へ先送りしないこと。**

---

## 4. 手順A・B：Worker

### 4-1. ソースの取り込み

Worker のソースは現在リポジトリに存在しない。えいちがCloudflareダッシュボードから取得したものを以下に示す。**まずこれを取り込むこと。**

保存先: `workers/shiftcore-login-proxy/worker.js`

```js
export default {
  async fetch(request) {
    const allowedOrigin = "https://shiftcorediv-lab.github.io";
    const gasUrl = "https://script.google.com/macros/s/AKfycbx83rAzXDfQPJUEu9tX4dpULH4QHYUoqfaTnfzzySkW3KjGVbcH4tnq9PKCCvfuEx6eRA/exec";

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET") {
      return new Response(
        JSON.stringify({ ok: true, message: "ShiftCore Worker is running" }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ ok: false, code: "METHOD_NOT_ALLOWED", message: "POST only" }),
        { status: 405, headers: corsHeaders }
      );
    }

    try {
      const bodyText = await request.text();

      const gasResponse = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: bodyText,
        redirect: "follow"
      });

      const gasText = await gasResponse.text();

      return new Response(gasText, { status: gasResponse.status, headers: corsHeaders });
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, code: "WORKER_ERROR", message: String(error.message || error) }),
        { status: 500, headers: corsHeaders }
      );
    }
  }
};
```

**取り込み後、実ファイルで内容を再確認してから第4-3節を適用すること。** ダッシュボードの現行版とこの写しが異なる場合は、実際にデプロイされている方を正とし、その旨を報告すること。

### 4-2. 全呼び出し元（Claudeによる確認済み事実）

```
grep -rn "workers.dev" apps/ shared/ --include=*.js --include=*.gs | grep -i "login-proxy"
```

| 呼び出し元 | action |
|---|---|
| `apps/account-console/js/login/api.js:4` | `checkLoginUserByEmail` |
| `apps/account-console/js/login/api.js:20` | `resolveCurrentUserByIdToken` |
| `apps/account-console/backend/attendance-apps-script/Code.gs:47` | `resolveCurrentUserByIdToken` |
| `apps/pmo/backend/pmo-apps-script/auth_guard.gs.js` | `resolveCurrentUserByIdToken` |

**これはリポジトリ内の全数である。** リポジトリ外（ShiftBuilder GAS、別アカウント所有の勤怠GAS、外部連携）からの呼び出しは確認できていない。**手順Cの回帰確認で実地に確かめること。**

### 4-3. 許可リストの実装

```js
const ALLOWED_ACTIONS = new Set([
  "checkLoginUserByEmail",
  "resolveCurrentUserByIdToken"
]);
```

`try` ブロックの冒頭、GASへ転送する前に挿入する。

```js
try {
  const bodyText = await request.text();

  // ===== アクション許可リストここから =====
  let requestedAction = "";

  try {
    requestedAction = String(JSON.parse(bodyText)?.action || "");
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, code: "INVALID_JSON", message: "リクエストの解析に失敗しました" }),
      { status: 400, headers: corsHeaders }
    );
  }

  if (!ALLOWED_ACTIONS.has(requestedAction)) {
    return new Response(
      JSON.stringify({ ok: false, code: "ACTION_NOT_ALLOWED", message: "このアクションは許可されていません" }),
      { status: 403, headers: corsHeaders }
    );
  }
  // ===== アクション許可リストここまで =====

  const gasResponse = await fetch(gasUrl, { ... });
```

**OPTIONSへの影響はない。** 許可リストは `request.method !== "POST"` の判定より後に入るため、OPTIONS は従来どおり204で返る。

**`Access-Control-Allow-Origin` はアクセス制御ではない。** `request.headers.get("Origin")` を検査していないため `curl` には効かない。Origin検査を足しても防御にならないので、それをもって「対策済み」と書かないこと。

**Worker許可リストは経路4を塞ぐ補助防御であり、公開GAS URLへの直接アクセスは防げない。GAS側の認証必須化が本体である。**

---

## 5. 手順D：重複ガードの一本化

### 確認済み事実

```
account_console_accounts.js:3    function requireAccountConsoleOperator_(body)
account_console_users.js:332     function requireAccountConsoleOperator_(body)
```

**diff の結果、完全一致。** 現時点で挙動の差はない。

GASはプロジェクト内の全ファイルが単一のグローバルスコープを共有するため、**後に評価された定義が有効になる。** 評価順はエディタ上の並び順に依存し、明示的な制御が難しい。片方だけ更新されると認証仕様が分岐する。

### 実装

1. `account_console_accounts.js` 側の定義を**削除**
2. `account_console_users.js:332` の定義を残す
3. 削除箇所にコメントを残す

```js
// requireAccountConsoleOperator_ は account_console_users.js に定義。
```

**内容は変更しない。同一実装の重複解消のみ。**

### 本番との一致確認について（前版の訂正）

前版は「`npx @google/clasp status` で差分がないことを確認」と書いたが、**このコマンドは push 対象・無視対象の状態を示すものであり、デプロイ済み版やリモートとの内容一致を証明しない。** この手順は削除する。

ローカルのGASソースは `clasp clone` で本番プロジェクトから取得したものであり、**ローカルの状態が本番の状態である**という前提で進める。取得後に他者が本番を直接編集していないことは、`clasp push` 時の差分警告で気づける。

---

## 6. 手順E〜I：GAS本体

### 6-1. 権限条件は変えない（前版から維持）

現行クライアント `signup-admin/navigation.js` の条件:

```
role ∈ {admin, dev, developer}  OR  allowed_modules ∋ account_console
```

`requireAccountConsoleOperator_` の条件:

```
status = active  AND  allowed_modules ∋ account_console
```

**後者は role ベースの経路を持たない。** `account_console` が付与されていない admin ロールの担当者を締め出す。

**認証の追加と権限モデルの変更を混ぜない。** 混ぜると、締め出しが起きたとき原因を切り分けられず、ロールバックの単位も大きくなる。

### 6-2. 専用ガードの実装

`signup_admin.js` へ追加。**`requireAccountConsoleOperator_` を直接使わない。**

```js
// ===== signup承認の操作者確認ここから =====
const SIGNUP_ADMIN_ALLOWED_ROLES_SERVER = ["admin", "dev", "developer"];

function requireSignupAdminOperator_(body) {
  const idToken = normalizeText(body.idToken);

  if (!idToken) {
    return { success: false, message: "ログイン情報がありません" };
  }

  const resolved = resolveCurrentUserByIdToken(idToken);

  if (!resolved || resolved.ok !== true || !resolved.user) {
    return { success: false, message: "ログインユーザーを確認できません" };
  }

  const user = resolved.user;

  // 補足: status=active は checkLoginUserByEmail が既に強制している。
  // ここでの再確認は多層防御であり、新規の制限ではない。
  if (normalizeText(user.status).toLowerCase() !== "active") {
    return { success: false, message: "このユーザーは停止中です" };
  }

  const role = normalizeText(user.role).toLowerCase();
  const modules = Array.isArray(user.allowed_modules)
    ? user.allowed_modules
    : parseAllowedModules(user.allowed_modules);

  const allowedByRole = SIGNUP_ADMIN_ALLOWED_ROLES_SERVER.indexOf(role) !== -1;
  const allowedByModule = modules.indexOf(ACCOUNT_CONSOLE_MODULE_KEY) !== -1;

  if (!allowedByRole && !allowedByModule) {
    return { success: false, message: "登録申請管理の利用権限がありません" };
  }

  // 監査記録に空の操作者IDを残さない。
  const operatorId = normalizeText(user.internal_user_id);

  if (!operatorId) {
    return { success: false, message: "操作者IDを確認できません" };
  }

  return { success: true, user: user, operatorId: operatorId };
}
// ===== signup承認の操作者確認ここまで =====
```

#### `status=active` についての訂正（Codex P2）

前版は「新規に追加する。この1点だけ条件を厳しくする」と書いたが**誤り**である。

`resolveCurrentUserByIdToken()` は `checkLoginUserByEmail()` を呼び、同関数は非activeユーザーへ `ok:false` / `USER_STOPPED` を返す（`users.js:208-231`）。**`resolved.ok === true` を通過した時点で active は満たされている。**

ガード内の再確認は多層防御として残すが、**新規の制限ではない。** えいちへ「条件を厳しくした」と報告しないこと。

#### `internal_user_id` の非空検証（Codex P1）

`buildLoginUserResponse()` は次のように生成する（`users.js:173`）。

```js
internal_user_id: String(user.internal_user_id || "").trim(),
```

**プロパティは常に存在するが、値は空文字になりうる。** 前版の「必ず返す」は誤りだった。

ID欠損ユーザーは**操作を拒否する。** メールアドレス等を監査列へ暗黙に代入する仕様変更は行わない。

### 6-3. 手順E：認証付きPOST版の追加（旧GETは残す）

`api.js` の `doPost` へ追加。

```js
if (action === "getSignupRequestsSecure") {
  const operator = requireSignupAdminOperator_(body);
  if (!operator.success) {
    return jsonResponse_(operator);
  }

  const status = normalizeText(body.status);
  return jsonResponse_(getSignupRequests(status));
}
```

**この時点では `doGet` の `getSignupRequests` を削除しない。** `getSignupRequests(status)` の本体も変更不要。

### 6-4. 手順H：承認・却下の認証必須化

```js
if (action === "approveSignupRequest") {
  const operator = requireSignupAdminOperator_(body);
  if (!operator.success) {
    return jsonResponse_(operator);
  }

  const requestId = normalizeText(body.requestId);
  const approval = body.approval || {};

  return jsonResponse_(approveSignupRequest(requestId, approval, operator.operatorId));
}

if (action === "rejectSignupRequest") {
  const operator = requireSignupAdminOperator_(body);
  if (!operator.success) {
    return jsonResponse_(operator);
  }

  const requestId = normalizeText(body.requestId);
  return jsonResponse_(rejectSignupRequest(requestId, operator.operatorId));
}
```

**`body.reviewedBy` はもう読まない。**

`signup_admin.js` のシグネチャを変更する。**検証済みの `operatorId` を受け取る形にし、関数内で再度プロパティを掘らない。**

```js
function approveSignupRequest(requestId, approval, reviewedBy) {
  // reviewedBy は requireSignupAdminOperator_ で非空検証済みの internal_user_id
  ...
  sheet.getRange(row, headerMap["reviewed_by"]).setValue(normalizeText(reviewedBy));
```

従来クライアントが送っていた `currentUser.userId` と同値のため、既存データとの整合は保たれる。

`rejectSignupRequest(requestId, reviewedBy)` も同様。

### 6-5. 手順I：承認payloadの許容値検証

`VALID_ACCOUNT_ROLES` / `VALID_ACCOUNT_STATUSES` は `config.js` に存在し、`accountConsoleCreateUser` / `accountConsoleUpdateUser` が使用している。**signup承認は使っていない。**

非空チェックの直後へ追加する。

```js
const role = normalizeText(approval.role);
if (VALID_ACCOUNT_ROLES.indexOf(role) === -1) {
  return { success: false, message: "role の値が不正です" };
}

const status = normalizeText(approval.status);
if (VALID_ACCOUNT_STATUSES.indexOf(status) === -1) {
  return { success: false, message: "status の値が不正です" };
}
```

**新しい定数を定義しないこと。** `config.js` の既存定義を使う。

#### 検証を追加しないもの

| 項目 | 理由 | コメントを残す |
|---|---|---|
| `allowedModules` | 正しいモジュールキー一覧が実データ依存で、コードから確定できない。推測のリストを作ると正当なモジュールを弾く事故になる（**Q-3**） | `// allowed_modules の許容値リストは未定義。仕様確定後に追加する。` |
| `organizationId` | 存在確認の可否は実データ次第（**Q-4**） | — |
| `workStatus` | クライアントで必須入力・非空チェックされるが、`appendUserMasterFromSignup_` が `workStatus: "on"` を固定しているため使われていない（`signup_user_write.js:94`、**G-H**）。**挙動を変更しない** | `// approval.workStatus はクライアントから受け取るが、現行仕様では常に "on" を設定している。` |

---

## 7. 手順F：クライアント

### 対象

`apps/account-console/js/signup-admin/`

### idToken の取得タイミング

**起動時に一度取得して使い回さない。** Firebase の idToken は約1時間で失効するため、画面を開いたままにすると承認時に失効している。

**API操作の直前に取得する。**

```js
import { requireAuthenticatedSession } from "../common/auth-session.js";

async function getFreshIdToken() {
  const session = await requireAuthenticatedSession();
  if (!session.ok) {
    throw new Error(session.message || "ログイン状態を確認できません");
  }
  return session.idToken;
}
```

`requireAuthenticatedSession()` は内部で `firebaseUser.getIdToken()` を呼ぶ。Firebase SDK が自動更新するため、操作直前に呼べば新しいトークンが得られる。

**`getIdToken(true)` による強制更新と自動再試行は実装しない。** 承認は冪等でない操作であり、二重承認のリスクがある。認証エラー時は明確なメッセージを表示する。

```js
showMessage("ログイン状態が切れました。再ログインしてください。", "error");
```

### API呼び出し

```js
export async function fetchSignupRequests(status, idToken) {
  // action: "getSignupRequestsSecure", status, idToken
}

export async function approveSignupRequest(requestId, approval, idToken) {
  // action: "approveSignupRequest", requestId, approval, idToken
  // reviewedBy は送らない
}

export async function rejectSignupRequest(requestId, idToken) {
  // action: "rejectSignupRequest", requestId, idToken
}
```

### キャッシュバスティング（S-4と同じ注意）

`signup-admin` の `main.js` が版数なしで他モジュールをimportしている場合、**HTMLのエントリ更新だけでは新コードが配信されない。**

```bash
grep -n 'from "\./' apps/account-console/js/signup-admin/*.js | grep -v "?v="
```

**版数なしのimportがあれば、それも更新すること。** 触った範囲だけを1種類の版数へ統一する。account-console 全体の `?v=` 整理（C-5）は対象外。

### クライアント側の権限判定

`canUseSignupAdmin(currentUser)` によるURLクエリ由来の判定は、**表示制御として残してよい。** 最終的な権限判定はサーバ側である。

---

## 8. 完了条件（Codex P1・全面改訂）

### 8-1. Codexの実装完了と、G-Aの解消を分けて記録する

前版は孤児デプロイのアーカイブをえいちの手作業として脇に置き、完了条件に含めていなかった。**これでは本番URLとWorkerを直しても、旧URLから匿名承認を継続できる。**

**G-Aのセキュリティ完了条件は、到達経路1〜4がすべて閉じた時点である。**

| 区分 | 完了の意味 |
|---|---|
| **Codex実装完了** | 手順A〜Kの実装・検証が終わった状態 |
| **G-A解消** | 手順L・Mまで終わり、**経路1〜4すべてで匿名承認が拒否されることを実測した状態** |

**Codexは、手順L・Mが未実施の段階で「G-A解消」と報告しないこと。** 実装完了として報告し、残りをえいちの作業として明示すること。

### 8-2. 手順C（Worker反映直後）— 全アプリの認証経路

**ここを壊すと全アプリが止まる。最優先で確認する。**

1. ログイン画面からログインできる
2. 勤怠ダッシュボードが表示される
3. PMO管理画面が表示される
4. ShiftBuilder がログイン状態を認識する
5. Worker に許可外アクションを投げると403

```bash
curl -s -X POST 'https://shiftcore-login-proxy.shiftcore-div.workers.dev/' \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"approveSignupRequest","requestId":"dummy"}'
```

### 8-3. 手順G（クライアント移行後・旧GET削除前）

6. signup-admin 画面で一覧取得・承認・却下ができる
7. 開発者ツールで、一覧取得がPOST `getSignupRequestsSecure` になっていることを確認
8. **承認後、スプレッドシートの `reviewed_by` に正しい `internal_user_id` が入っている**（空文字でないこと）
9. 権限のないアカウントで開くと拒否される
10. 不正な `role` / `status` を送ると拒否される

### 8-4. 手順M（必須）— 到達経路1〜4すべてへの攻撃テスト

**1つでも通れば G-A は解消していない。**

各URLに対し、トークンなしで承認を試みる。

```bash
for URL in \
  'https://script.google.com/macros/s/<新デプロイID>/exec' \
  'https://script.google.com/macros/s/AKfycbyvUOQHkNWSxiBzsXMPn2WOcuHC_LGCit8IFVSEs7yUBBPNIE04GX1RQWmY1UFgeODwbw/exec' \
  'https://script.google.com/macros/s/AKfycbzS0Etn9kdeI_I3ucOh1TawqupaJ7K0HHlfuiBX9w2L/exec' \
  'https://shiftcore-login-proxy.shiftcore-div.workers.dev/'
do
  echo "--- $URL"
  curl -s -X POST "$URL" \
    -H 'Content-Type: text/plain;charset=utf-8' \
    -d '{"action":"approveSignupRequest","requestId":"dummy","approval":{"role":"admin"}}'
  echo
done
```

**`requestId` は存在しない値を使い、実データを操作しないこと。**

期待する結果。

| 経路 | 期待 |
|---|---|
| 1（本番・更新後） | 権限エラー |
| 2（孤児@37） | **アーカイブ済みのため到達不能**。到達する場合はアーカイブ未完了 |
| 3（孤児@HEAD） | 最新コード反映後のため権限エラー。到達不能ならなお良い |
| 4（Worker） | `ACTION_NOT_ALLOWED`（403） |

11. 同様に、旧GET経路で個人情報が取れないこと

```bash
curl -s 'https://script.google.com/macros/s/<新デプロイID>/exec?action=getSignupRequests&status=pending_approval'
```

`Unknown GET action` などが返り、`applicant_email` を含まないこと。

### 8-5. 自動確認

12. 変更した全JSファイルが `node --check` を通る
13. 既存テスト21件が pass

```bash
node --test shared/tests/*.test.mjs apps/shiftbuilder/tests/*.test.mjs
```

### 8-6. えいちの手作業（手順L・Codexは実行しない）

14. 孤児デプロイ `AKfycbyvUOQ…`（ACCOUNT @37）のアーカイブ — **本番と同版のため最優先**
15. 孤児デプロイ `AKfycbzS0Etn…`（ACCOUNT @HEAD）のアーカイブ
16. PMO・ORDERCASE の孤児デプロイは**用途確認まで触らない**（Q-6）

---

## 9. 触らない範囲

- **G-J（LockService）— 本書から除外。** 認証穴の閉鎖とは独立しており、完了範囲とコミット単位が曖昧になる。**G-Aを閉じた後、独立した承認・コミットで実施する**
- PMO の非Secureアクション（**G-B**）— 別指示書
- `checkLoginUserByEmail` の公開範囲（**G-D**）— 別途
- **`submitSignupRequest` — 公開の申請フォーム。無認証で正しい。認証を足さないこと**
- `accountConsole*` 系6アクション（重複ガード解消を除く）
- `engagement_status` の不整合（**G-I**）
- `allowed_modules` / `organizationId` の許容値検証（**Q-3 / Q-4**）
- `approval.workStatus` の挙動変更（**G-H / Q-2**）
- 勤怠 `Code.gs`、OrderCase GAS、ShiftBuilder 一式
- **既存のShiftBuilder文書差分**（`apps/shiftbuilder/docs/` の未コミット2件）
- account-console の `?v=` 全面整理（C-5）
- 無関係な整形・リファクタリング・依存追加

---

## 10. 完了報告

`ai-handoff/archive/` へ結果文書を追加すること。加えて次を明示すること。

- **着手時の `git rev-parse --short HEAD` の値**
- **更新前のGASバージョン番号**（戻せる状態の確保）
- 手順A〜Mのどこまで完了したか。**Kが未完了なら「完了」と書かないこと**
- **「Codex実装完了」と「G-A解消」を分けて記載すること**（第8-1節）
- Worker のソースが、ダッシュボードの現行版と一致していたか
- 第8章の確認項目のうち、実施できた項目とできなかった項目
- **実施できなかった確認を、実施済みとして書かないこと**
- 第0章の訂正3件に異論があれば、根拠とともに記載すること

---

## 11. えいちへの報告事項（本作業とは別）

| ID | 内容 | 必要な判断 |
|---|---|---|
| Q-1 | signup承認の正式な権限条件 | 管理担当者への `account_console` 付与状況の**実データ確認** |
| Q-2 | `approval.workStatus`（G-H）を画面から外すか、保存に反映するか | 業務上の仕様判断 |
| Q-3 | `allowed_modules` の正式なキー一覧 | 許容値検証の前提 |
| Q-4 | `organizationId` にマスタ存在確認が必要か | 業務上の仕様判断 |
| Q-5 | `engagement_status`（G-I）を是正するか | 影響範囲の確認 |
| Q-6 | PMO・ORDERCASE の孤児デプロイ3つの用途 | アーカイブ可否 |
| Q-7 | ShiftBuilder・勤怠のGASを持つアカウント | 心当たりの確認 |
