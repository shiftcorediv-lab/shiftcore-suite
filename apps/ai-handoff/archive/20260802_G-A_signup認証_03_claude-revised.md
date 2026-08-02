# Codex作業指示書：G-A 登録申請の承認APIに認証を追加する（改訂版）

- 状態: レビュー待ち（えいちの承認待ち）
- 作成者: Claude
- 作成日: 2026-08-02
- 前提文書: `reviewed/20260802_G-A_signup認証_02_codex-review.md`
- 置き換える版: `archive/20260801_G-A_signup認証_01_claude-draft.md`
- 実装: 未実施
- commit: 未実施
- push: 未実施
- deploy: 未実施

> **本書は `approved/` へ移されるまで実装指示ではない**（`README.md` 共通ルール5）。
> えいちの承認後に `approved/` へ配置すること。

## 関連文書

| 連番 | 文書 | 作成者 |
|---|---|---|
| 01 | `archive/20260801_G-A_signup認証_01_claude-draft.md` | Claude（置き換え済み） |
| 02 | `reviewed/20260802_G-A_signup認証_02_codex-review.md` | Codex |
| 03 | 本書 | Claude |

根拠となる監査結果は `260801_ShiftCoreSuite_監査報告_Claude.md` の G-A / W-1 / W-2 / W-3。

---

## 0. 前版からの訂正

Codexの指摘を実コードで照合した。**検証可能な指摘は4件すべて事実だった。前版の誤りを訂正する。**

| # | Codexの指摘 | 検証結果 | 前版の扱い |
|---|---|---|---|
| §2 | GASとクライアントの同時反映は不可能 | **正しい** | **誤り。訂正する** |
| §3 | 承認payloadに許容値検証がない | **正しい**（`VALID_ACCOUNT_ROLES` / `VALID_ACCOUNT_STATUSES` は `config.js` に存在し、accountConsole系のみ使用） | 欠落。追加する |
| §3 | `signup_user_write.js` が `workStatus: "on"` を固定 | **正しい**（94行目） | 見落とし。追加する |
| §4 | `requireAccountConsoleOperator_` が重複定義 | **正しい**（`account_console_users.js:332` と `account_console_accounts.js:3`。**diff で完全一致を確認**） | 見落とし。対処する |
| §5 | 権限条件の変更で既存管理者が締め出されうる | **正しい** | **前版の「既存動作を壊さない」は誤り。設計を変更する** |
| §6 | idToken の失効 | 正しい | 欠落。追加する |
| §8 | 競合の余地（ACCOUNT GASに `LockService` なし） | **正しい**（PMOの `api.js` は使用、ACCOUNTは0件） | 欠落。別ステップとして追加する |

### Codexの推測のうち、否定できたもの

Codex §3 は「`approval.workStatus` が実際の保存処理に反映されているか再確認が必要」とした。**確認した結果、列名の不整合は存在しない。**

`account_console_users.js:135` が `setIfHeaderExists_(newUser, headers, "workStatus", ...)` を使っていることから、**ユーザーマスタの列名は camelCase の `workStatus`** である。したがって `signup_user_write.js` の `workStatus: "on"` は正しく書き込まれる。

**残る問題は「クライアントから受け取った `approval.workStatus` が捨てられている」ことのみ**で、書き込み自体は機能している。

### Claudeが新たに発見した不整合

`appendUserMasterFromSignup_` は `engagement_status` を設定していない（`rowObject` にキーが存在しない）。一方 `accountConsoleCreateUser` は `convertWorkStatusToEngagementStatus_()` で設定する。

**signup経由で作られたユーザーだけ `engagement_status` が空になる。** 本作業で併せて是正するかは第7章で扱う。

---

## 1. 直す対象（前版から変更なし）

`approveSignupRequest` は `idToken` を受け取っていない。ACCOUNT GAS はスイート全体の身元認証局であり（勤怠・PMO・ログイン画面が login-proxy Worker 経由で身元解決を委ねている）、匿名の攻撃者が admin ロールのアカウントを発行させられる。

デプロイは `"access": "ANYONE_ANONYMOUS"` / `"executeAs": "USER_DEPLOYING"`。到達経路は4つ。

| # | URL | 対処 |
|---|---|---|
| 1 | `AKfycbx83rAzXDfQPJUE…` @37 | 本番。新バージョンで更新 |
| 2 | `AKfycbyvUOQHkNWSxiBz…` @37 | コード内参照0件。アーカイブ |
| 3 | `AKfycbzS0Etn9kdeI_I3…` @HEAD | コード内参照0件 |
| 4 | login-proxy Worker | 許可リストを追加 |

---

## 2. 【重要な設計変更】権限条件は変えない

前版は `requireAccountConsoleOperator_` の再利用を指示し、「クライアント側の旧判定より厳密である」と書いた。**厳密であること自体は正しいが、それを「既存動作を壊さない」と書いたのは誤りである。**

### 現状の条件

クライアント `signup-admin/navigation.js` の `canUseSignupAdmin`:

```
role ∈ {admin, dev, developer}  OR  allowed_modules ∋ account_console
```

`requireAccountConsoleOperator_` の条件:

```
status = active  AND  allowed_modules ∋ account_console
```

**後者は role ベースの経路を持たない。** `account_console` が付与されていない admin ロールの担当者は、この変更で承認できなくなる。実際に誰が締め出されるかは実データを見ないと分からない。

### 方針

**認証の追加と、権限モデルの変更を、同じ作業に混ぜない。**

今回の目的は「無認証の穴を塞ぐ」ことである。誰に権限があるかを変えるのは別の意思決定であり、混ぜると次の問題が起きる。

- 締め出しが起きたとき、原因が認証追加なのか条件変更なのか切り分けられない
- ロールバックの単位が大きくなる
- えいちが「セキュリティ修正」として承認したものに、業務影響のある仕様変更が混入する

### 実装

**`requireAccountConsoleOperator_` を直接使わない。** 現行クライアントと同じ条件をサーバ側で実装した専用ガードを新設する。

```js
// signup_admin.js
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

  return { success: true, user: user };
}
// ===== signup承認の操作者確認ここまで =====
```

**`status=active` は新規に追加する。** クライアント側の旧判定には無かったが、停止中ユーザーの操作を許す理由がないため。これだけは条件を厳しくする。**この1点はえいちへ明示的に報告すること。**

### えいちへの確認事項（本作業とは分離）

正式な権限条件は別途決める。決まったら別作業として反映する。判断材料:

1. signup承認の正式な条件はロールか `account_console` モジュールか
2. 現在の管理担当者全員に `account_console` が付与されているか（**実データ確認が必要**）
3. Account Console のユーザー作成権限と signup 承認権限を同一にしてよいか

---

## 3. 作業順序（Codex §2 を受けて全面改訂）

**前版の「GASとクライアントを同じデプロイで反映」は実現不可能だった。** GASと静的クライアントは別々の公開物であり、原子的な同時反映はできない。段階移行へ改める。

各手順は「壊れないこと」を満たす。**順序を入れ替えると画面が停止するか、穴が残る。**

| 手順 | 対象 | 内容 | 壊れるか |
|---|---|---|---|
| A | Worker | ソースをリポジトリへ取り込む | 変更なし |
| B | Worker | 許可リストを追加 | 壊れない |
| C | — | ログイン・勤怠・PMO を回帰確認 | — |
| D | GAS | 重複ガードを一本化 | 壊れない（完全一致のため） |
| E | GAS | 認証付きPOST版を**追加**（旧GETは残す） | 壊れない |
| F | クライアント | Firebaseセッション + 認証付きPOSTへ移行 | 壊れない |
| G | — | 本番クライアントがPOST版を使っていることを確認 | — |
| H | GAS | 承認・却下で `idToken` を必須化 | 壊れない（Fで対応済み） |
| I | GAS | 承認payloadの許容値検証を追加 | 壊れない |
| J | — | 正規管理者・権限なし・トークンなしを確認 | — |
| K | GAS | 旧GET一覧を**削除** | 壊れない（Gで確認済み） |
| L | — | 旧GETで個人情報が取れないことを確認 | — |
| M | GAS | `LockService` を追加（任意・第7章） | 壊れない |
| N | えいち | 孤児デプロイのアーカイブ | — |

### 移行期間中に残るリスク（明示）

**手順EからKまでの間、旧GET版 `getSignupRequests` が無認証のまま残る。** これは個人情報（`applicant_email` / `applicant_name` / `phone`）の開示経路である。

一方、**最も深刻な承認・却下は手順Hで閉じる。** 権限昇格の経路が先に閉じ、情報開示が後に残る形になる。この順序は意図的である。

**手順Kを別作業へ先送りしないこと。** EからKまでを1つの作業単位として追跡し、Kが完了するまで「完了」と報告しない。

---

## 4. 手順A・B：Worker

### Codex §7 への回答

Codexは「ローカルリポジトリでWorkerソースを確認できなかった」としている。**正しい。** 現在リポジトリに存在しない。

ただし**Claudeは実ソースを確認済みである。** えいちがCloudflareダッシュボードから取得したものを提示した。以下がその全文であり、これに基づいて許可リストの挿入位置を判断している。

**手順Aとして、まずこれをリポジトリへ取り込むこと。** 取り込み後、Codex自身が実ファイルで再確認できる。

```
workers/shiftcore-login-proxy/worker.js
```

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

**OPTIONSへの影響はない。** 許可リストは `request.method !== "POST"` の判定より後、`try` ブロック内に入るため、OPTIONS は従来どおり204で返る。

### 全呼び出し元の確認（Claudeによる確認済み事実）

Codex §7 は「実際の全呼び出し元が上記2アクションだけか」を未確認としている。**Claudeがgrepで全数確認した。結果は以下。**

```
grep -rn "workers.dev" apps/ shared/ --include=*.js --include=*.gs | grep -i "login-proxy"
```

| 呼び出し元 | action |
|---|---|
| `apps/account-console/js/login/api.js:4` | `checkLoginUserByEmail` |
| `apps/account-console/js/login/api.js:20` | `resolveCurrentUserByIdToken` |
| `apps/account-console/backend/attendance-apps-script/Code.gs:47` | `resolveCurrentUserByIdToken` |
| `apps/pmo/backend/pmo-apps-script/auth_guard.gs.js` | `resolveCurrentUserByIdToken` |

**ただしこれはリポジトリ内の全数である。** リポジトリ外（ShiftBuilder GAS、別アカウント所有の勤怠GAS、外部連携）からの呼び出しは確認できていない。**手順Cの回帰確認で実地に確かめること。**

### 許可リストの実装

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
      JSON.stringify({
        ok: false,
        code: "INVALID_JSON",
        message: "リクエストの解析に失敗しました"
      }),
      { status: 400, headers: corsHeaders }
    );
  }

  if (!ALLOWED_ACTIONS.has(requestedAction)) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: "ACTION_NOT_ALLOWED",
        message: "このアクションは許可されていません"
      }),
      { status: 403, headers: corsHeaders }
    );
  }
  // ===== アクション許可リストここまで =====

  const gasResponse = await fetch(gasUrl, { ... });
```

**`Access-Control-Allow-Origin` はアクセス制御ではない。** `request.headers.get("Origin")` を検査していないため `curl` には効かない。Origin検査を足しても防御にならないので、それをもって「対策済み」と書かないこと。実際の防御は許可リストであり、**Worker許可リストは経路4を塞ぐのみで、公開GAS URLへの直接アクセスは防げない**（Codex §7 の認識に同意）。

---

## 5. 手順D：重複ガードの一本化

### 確認済み事実

```
account_console_accounts.js:3    function requireAccountConsoleOperator_(body)
account_console_users.js:332     function requireAccountConsoleOperator_(body)
```

**両者を diff した結果、完全一致。** 現時点で挙動の差はない。

GASはプロジェクト内の全ファイルが単一のグローバルスコープを共有するため、**後に評価された定義が有効になる。** ファイルの評価順は Apps Script エディタ上の並び順に依存し、明示的な制御が難しい。

内容が同一な現在は問題ないが、**片方だけ更新されると認証仕様が分岐し、どちらが効いているか追えなくなる。** PMOの `getPmoAdminMetaSecure` 二重定義（G-E）と同じ構造の罠である。

### 実装

1. `account_console_accounts.js` 側の定義を**削除**する
2. `account_console_users.js:332` の定義を残す
3. 削除箇所に、定義場所を示すコメントを残す

```js
// requireAccountConsoleOperator_ は account_console_users.js に定義。
```

**内容は変更しない。同一実装の重複解消のみに限定する**（Codex §4 の提案に同意）。

### 本番GASでの重複確認

Codex §4 は「本番GASにも重複定義が存在するか」を挙げている。**`clasp clone` は本番プロジェクトの現在のファイルを取得したものであり、ローカルの状態が本番の状態である。** 別途の確認は不要。

ただし念のため、手順D完了後に `npx @google/clasp status` で差分がないことを確認すること。

---

## 6. 手順E〜I：GAS本体

### 6-1. 手順E：認証付きPOST版の追加（旧GETは残す）

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

### 6-2. 手順H：承認・却下の認証必須化

`api.js`

```js
if (action === "approveSignupRequest") {
  const operator = requireSignupAdminOperator_(body);

  if (!operator.success) {
    return jsonResponse_(operator);
  }

  const requestId = normalizeText(body.requestId);
  const approval = body.approval || {};

  return jsonResponse_(approveSignupRequest(requestId, approval, operator.user));
}

if (action === "rejectSignupRequest") {
  const operator = requireSignupAdminOperator_(body);

  if (!operator.success) {
    return jsonResponse_(operator);
  }

  const requestId = normalizeText(body.requestId);

  return jsonResponse_(rejectSignupRequest(requestId, operator.user));
}
```

**`body.reviewedBy` はもう読まない。**

`signup_admin.js` のシグネチャを変更。

```js
function approveSignupRequest(requestId, approval, operator) {
  const reviewedBy = normalizeText(operator?.internal_user_id);
  ...
  sheet.getRange(row, headerMap["reviewed_by"]).setValue(reviewedBy);
```

`internal_user_id` は `buildLoginUserResponse()` が必ず返す（`users.js` で確認済み）。従来クライアントが送っていた `currentUser.userId` と同値のため、既存データとの整合は保たれる。

`rejectSignupRequest(requestId, operator)` も同様。

### 6-3. 手順I：承認payloadの許容値検証（Codex §3）

**確認済み事実**: `VALID_ACCOUNT_ROLES` / `VALID_ACCOUNT_STATUSES` は `config.js` に存在し、`accountConsoleCreateUser` / `accountConsoleUpdateUser` が使用している。**signup承認は使っていない。**

`approveSignupRequest` の非空チェックの直後へ、既存定数を使った検証を追加する。

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

**新しい定数を定義しないこと。** `config.js` の既存定義を使う。accountConsole系と判定がずれるのを避けるため。

#### `allowedModules` について

Codex §3 の問い「未知のモジュールキーを許可する仕様か」への回答: **現行に許容値リストが存在しないため、本作業では制限しない。**

理由は、正しいモジュールキーの一覧が実データ（各アプリの `allowed_modules` 運用）に依存し、コードからは確定できないため。ここで推測のリストを作ると、正当なモジュールを弾く事故になる。

**えいちへ確認したうえで、別作業とする。** 本作業では現行どおり非空チェックのみとし、その旨をコメントで残すこと。

```js
// allowed_modules の許容値リストは未定義。
// 正式なモジュールキー一覧を確定後、別途検証を追加する。
```

#### `organizationId` について

同様に、存在確認の可否は実データ次第。**本作業では非空チェックのみを維持する。**

#### `workStatus` について

**確認済み事実**: `approval.workStatus` はクライアントで必須入力とされ、`approveSignupRequest` で非空チェックされるが、**`appendUserMasterFromSignup_` が `workStatus: "on"` を固定しているため使われていない**（`signup_user_write.js:94`）。

**本作業では挙動を変更しない。** 固定値を `approval.workStatus` に置き換えるのは仕様変更であり、認証追加とは別の判断である。

代わりに、実態を示すコメントを残すこと。

```js
// approval.workStatus はクライアントから受け取るが、
// 現行仕様では常に "on" を設定している。仕様確定後に見直す。
```

**この不整合はえいちへ報告すること。** 「画面で選ばせているのに反映されない」という状態であり、業務上の誤解を生む。

---

## 7. 手順M：競合対策（Codex §8）— 任意

### 確認済み事実

- ACCOUNT GAS に `LockService` の使用は**0件**
- PMO GAS の `api.js` は `doPost` の冒頭で `LockService.getScriptLock()` を使用している
- `createNextInternalUserId_` / `createNextEmployeeCode_` は `signup_user_write.js` で連番を生成する

同一申請への同時承認、`existsUserByEmail_` 確認後の割り込み、連番の重複が起こりうる。

### 判断

**認証追加とは独立した問題である。** ただし、次の理由から本指示書に含める。

- 修正対象が承認処理そのものであり、同じ関数を触る
- PMOに実装済みの前例があり、設計を新たに考える必要がない
- 規模が小さい

**手順A〜Lを完了・確認してから、独立したコミットとして実施すること。** 認証修正と混ぜない。

### 実装

PMO `api.js` の形に倣う。

```js
function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
  } catch (error) {
    return jsonResponse_({
      success: false,
      message: "処理が混み合っています。もう一度お試しください"
    });
  }

  try {
    // 既存の処理
  } catch (error) {
    // 既存のcatch
  } finally {
    lock.releaseLock();
  }
}
```

**注意**: `doPost` 全体をロックすると、`resolveCurrentUserByIdToken`（他GASからの身元解決）も直列化される。**勤怠・PMOの認証が遅くなる可能性がある。**

したがって、`doPost` 全体ではなく**承認・却下の分岐内だけをロックする**方が安全である。実装方針をどちらにするか判断し、理由を報告に残すこと。

### スコープ外（本作業では触らない）

`engagement_status` の不整合（`appendUserMasterFromSignup_` が設定せず、`accountConsoleCreateUser` は設定する）は、Claudeが新たに発見した別問題である。**本作業では触らない。** えいちへ報告のうえ別課題とする。

---

## 8. 手順F：クライアント

### 対象

`apps/account-console/js/signup-admin/`

### 6-1. セッション取得

`pmo-admin/main.js` の `initializePage()` と同じ形にする。

```js
import { requireAuthenticatedSession } from "../common/auth-session.js";
```

### 6-2. idToken の取得タイミング（Codex §6）

**前版の「起動時に一度取得し以後使い回す」は改める。** Firebase の idToken は約1時間で失効するため、画面を開いたままにすると承認時に失効している。

**API操作の直前に取得すること。**

```js
async function getFreshIdToken() {
  const session = await requireAuthenticatedSession();

  if (!session.ok) {
    throw new Error(session.message || "ログイン状態を確認できません");
  }

  return session.idToken;
}
```

`requireAuthenticatedSession()` は内部で `firebaseUser.getIdToken()` を呼ぶ。Firebase SDK は失効前後に自動更新するため、**操作直前に呼べば新しいトークンが得られる。**

`getIdToken(true)` による強制更新と再試行は、**本作業では実装しない。** 承認は冪等でない操作であり、自動再試行は二重承認のリスクがある。代わりに、認証エラー時は明確なメッセージを表示する。

```js
showMessage("ログイン状態が切れました。再ログインしてください。", "error");
```

### 6-3. API呼び出し

```js
export async function fetchSignupRequests(status, idToken) {
  const response = await fetch(SIGNUP_ADMIN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "getSignupRequestsSecure",
      status: status,
      idToken: idToken
    })
  });
  ...
}

export async function approveSignupRequest(requestId, approval, idToken) {
  // action: "approveSignupRequest", requestId, approval, idToken
  // reviewedBy は送らない
}

export async function rejectSignupRequest(requestId, idToken) {
  // action: "rejectSignupRequest", requestId, idToken
}
```

**`reviewedBy` はクライアントから送らない。**

### 6-4. クライアント側の権限判定

`canUseSignupAdmin(currentUser)` によるURLクエリ由来の判定は、**表示制御として残してよい。** ただし最終的な権限判定はサーバ側である。

`?v=` を更新する場合、**触ったファイルの範囲で一貫させること。** account-console は現在9種類の版数が混在しているが、その全面整理は本作業の対象外。

---

## 9. 触らない範囲

- PMO の非Secureアクション（G-B）— 別指示書
- `checkLoginUserByEmail` の公開範囲（G-D）— 別途
- **`submitSignupRequest` — 公開の申請フォーム。無認証で正しい。認証を足さないこと**
- `accountConsole*` 系6アクション — 既に守られている（`requireAccountConsoleOperator_` の重複解消を除く）
- `engagement_status` の不整合 — 別課題
- `allowed_modules` / `organizationId` の許容値検証 — 仕様確定後
- 勤怠 `Code.gs`、OrderCase GAS、ShiftBuilder 一式
- `apps/CLAUDE.md` / `apps/AI_COLLABORATION_HANDOFF.md` / `apps/shiftbuilder/CLAUDE.md` / `docs/`
- account-console の `?v=` 全面整理
- 無関係な整形・リファクタリング・依存追加

---

## 10. 完了条件

Codex §10-8 の指摘を受け、**移行途中と完了後に分ける。**

### 手順C（Worker反映直後）— 全アプリの認証経路

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

### 手順G（クライアント移行後・旧GET削除前）

6. signup-admin 画面で一覧取得・承認・却下ができる
7. **ブラウザの開発者ツールで、一覧取得がPOST `getSignupRequestsSecure` になっていることを確認**
8. 承認後、スプレッドシートの `reviewed_by` に正しい `internal_user_id` が入っている
9. 権限のないアカウントで開くと拒否される
10. トークンなしで `approveSignupRequest` を叩くと拒否される

```bash
curl -s -X POST 'https://script.google.com/macros/s/<新デプロイID>/exec' \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"approveSignupRequest","requestId":"dummy","approval":{"role":"admin"}}'
```

**`requestId` は存在しない値を使い、実データを操作しないこと。**

11. 不正な `role` / `status` を送ると拒否される（手順I）

### 手順L（旧GET削除後）— 完了判定

12. 旧GET が個人情報を返さない

```bash
curl -s 'https://script.google.com/macros/s/<新デプロイID>/exec?action=getSignupRequests&status=pending_approval'
```

`Unknown GET action` などが返り、`applicant_email` を含まないこと。

13. signup-admin 画面が引き続き正常動作する

### 自動確認（全手順共通）

14. 変更した全JSファイルが `node --check` を通る
15. 既存テスト21件が pass

```bash
node --test shared/tests/*.test.mjs apps/shiftbuilder/tests/*.test.mjs
```

### えいちの手作業（Codexは実行しない）

16. 孤児デプロイ `AKfycbyvUOQ…`（ACCOUNT @37）のアーカイブ — **本番と同版のため最優先**
17. 孤児デプロイ `AKfycbzS0Etn…`（ACCOUNT @HEAD）のアーカイブ
18. PMO・ORDERCASE の孤児デプロイは**用途確認まで触らない**

---

## 11. 完了報告

`AI_COLLABORATION_HANDOFF.md` 第7節の形式で。加えて次を明示すること。

- 手順A〜Nのどこまで完了したか。**Kが未完了なら「完了」と書かないこと**
- 第2章の設計変更（権限条件を変えない判断）に同意したか、異論があるか
- `status=active` を新規追加したことによる影響の有無
- 第10章の確認項目のうち、実施できた項目とできなかった項目
- **実施できなかった確認を、実施済みとして書かないこと**
- 手順M（LockService）を実施した場合、`doPost` 全体と分岐内のどちらをロックしたか、その理由

---

## 12. えいちへの報告事項（本作業とは別）

Codexの指摘とClaudeの検証から派生した、判断が必要な項目。

| # | 内容 | 必要な判断 |
|---|---|---|
| 1 | signup承認の正式な権限条件 | ロールか `account_console` モジュールか。管理担当者への `account_console` 付与状況の実データ確認が必要 |
| 2 | `approval.workStatus` が画面で必須入力なのに保存されない | 画面から外すか、保存に反映するか |
| 3 | `allowed_modules` の正式なキー一覧 | 許容値検証を入れるための前提 |
| 4 | `organizationId` の存在確認 | マスタ照合が必要か |
| 5 | `engagement_status` が signup 経由のユーザーだけ空になる | 是正するか |
| 6 | PMO・ORDERCASE の孤児デプロイ3つの用途 | アーカイブ可否 |
