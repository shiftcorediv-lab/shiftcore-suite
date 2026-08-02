# Codex作業指示書：G-A 登録申請の承認APIに認証を追加する（初版・置き換え済み）

- 状態: 要改訂（`03_claude-revised` で置き換え済み。**本書に従って実装しないこと**）
- 作成者: Claude
- 作成日: 2026-08-01
- 前提文書: `260801_ShiftCoreSuite_監査報告_Claude.md`
- 置き換える版: なし
- 後続版: `inbox/20260802_G-A_signup認証_03_claude-revised.md`
- 実装: 未実施
- commit: 未実施
- push: 未実施
- deploy: 未実施

> **本書は誤りを含むため保存のみ。** Codexのコード照合（`reviewed/…_02_codex-review.md`）により、
> 次の誤りが判明した。詳細と訂正は後続版の第0章を参照。
>
> 1. 「GASとクライアントを同じデプロイで反映」— 別々の公開物であり実現不可能
> 2. `requireAccountConsoleOperator_` の再利用を「既存動作を壊さない」と記載 — 権限条件が変わり既存管理者を締め出しうる
> 3. 承認payloadの許容値検証が欠落
> 4. `requireAccountConsoleOperator_` の重複定義を見落とし
> 5. idToken の失効を考慮せず
> 6. 同時実行時の競合を考慮せず

- 基線: `139d109`（GAS 3本を `backend/` 配下へ取り込み済み）
- 対象: GAS（ACCOUNT）、Cloudflare Worker、`apps/account-console/js/signup-admin/`
- 安全境界: **認証・権限の変更にあたる。本指示書がえいちの承認である**

---

## 1. 何を直すか

`approveSignupRequest` は **idToken を受け取ってすらいない。**

```js
// apps/account-console/backend/account-apps-script/api.js
if (action === "approveSignupRequest") {
  const requestId = normalizeText(body.requestId);
  const approval = body.approval || {};
  const reviewedBy = normalizeText(body.reviewedBy);
  return jsonResponse_(approveSignupRequest(requestId, approval, reviewedBy));
}
```

`signup_admin.js` の本体にも認証・権限確認はない。検証は申請の存在・ステータス・必須項目の非空のみで、`approval.role` は空でなければ何でも通る。通ると `appendUserMasterFromSignup_` がユーザーマスタへ追加し、承認メールが送信される。`reviewedBy` は呼び出し側の文字列がそのまま記録される。

### なぜ最優先か

ACCOUNT GAS は**スイート全体の身元認証局**である。勤怠 `Code.gs` の `resolveUser_`、PMO `auth_guard.gs.js`、account-console のログイン画面は、いずれも login-proxy Worker 経由でこのGASに身元解決を委ねている。

つまりこれは「signup画面の不具合」ではなく、**匿名の攻撃者が認証局に admin ロールのアカウントを発行させられる**という問題である。発行されたアカウントは勤怠・PMO・Account Console・ShiftBuilder のすべてから正規ユーザーとして信頼される。

デプロイは3本とも `"access": "ANYONE_ANONYMOUS"` かつ `"executeAs": "USER_DEPLOYING"`。匿名リクエストがえいちの権限で実行される。

### 到達経路は4つある

| # | URL | 対処 |
|---|---|---|
| 1 | `AKfycbx83rAzXDfQPJUE…` @37 | 本番。新バージョンで更新 |
| 2 | `AKfycbyvUOQHkNWSxiBz…` @37 | **コード内参照0件。アーカイブ** |
| 3 | `AKfycbzS0Etn9kdeI_I3…` @HEAD | コード内参照0件。常に最新コードを配信 |
| 4 | `shiftcore-login-proxy…workers.dev` | 素通しプロキシ。許可リストを追加 |

**1だけ直しても塞がらない。**

---

## 2. 作業順序（この順で行うこと）

ダウンタイムを作らず、かつ穴が開いている時間を最短にする順序である。**入れ替えると画面が壊れるか、穴が残る。**

| 手順 | 対象 | 壊れるか | 効果 |
|---|---|---|---|
| 1 | Worker に許可リスト | 壊れない | 経路4を即閉鎖 |
| 2 | クライアントが idToken を送り始める | 壊れない（GASは未知フィールドを無視） | 手順3の準備 |
| 3 | GAS が idToken を必須化 | 壊れない（手順2で対応済み） | **本丸を閉鎖** |
| 4 | 一覧取得をPOST化し、GET版を撤去 | 手順4内で同時変更 | 個人情報の無認証開示を閉鎖 |
| 5 | 孤児デプロイのアーカイブ | — | 経路2・3を閉鎖 |

手順1は他と独立していて壊れる要素がない。**先に入れてよい。**

---

## 3. 手順1：Worker に許可リストを追加

### 確認済み事実

Worker を経由するアクションは**2つだけ**である（全呼び出し元をgrep確認済み）。

| 呼び出し元 | action |
|---|---|
| `apps/account-console/js/login/api.js` | `checkLoginUserByEmail` |
| `apps/account-console/js/login/api.js` | `resolveCurrentUserByIdToken` |
| 勤怠 `Code.gs` `resolveUser_` | `resolveCurrentUserByIdToken` |
| PMO `auth_guard.gs.js` | `resolveCurrentUserByIdToken` |

したがって、この2つだけを通す許可リストで既存動作は壊れない。

### 実装

現行 Worker の `try` ブロック内、GASへ転送する直前に挿入する。

```js
const ALLOWED_ACTIONS = new Set([
  "checkLoginUserByEmail",
  "resolveCurrentUserByIdToken"
]);
```

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

  const gasResponse = await fetch(gasUrl, { ... });   // 以降は現行のまま
```

### 注意

**`Access-Control-Allow-Origin` はアクセス制御ではない。** 現行コードは `request.headers.get("Origin")` を検査しておらず、`curl` やサーバ間リクエストには一切効かない。Origin検査の追加は任意だが、**追加しても防御にはならない**ため、それをもって「対策済み」と書かないこと。実際の防御は許可リストである。

### ソースの管理

Worker のソースがリポジトリ外にあるなら、この機会に取り込むこと。

```
workers/shiftcore-login-proxy/worker.js
```

---

## 4. 手順2：クライアントが idToken を送る

### 対象

`apps/account-console/js/signup-admin/`

### 現状

`api.js` の3関数はいずれも資格情報を送っていない。`main.js` は `buildCurrentUserFromQuery(params)` でURLクエリから身元を作り、`currentUser.userId` を `reviewedBy` として渡している。

### 変更

`account-console` 側に既にある `requireAuthenticatedSession()` を使う。

```js
// apps/account-console/js/common/auth-session.js に既存
import { requireAuthenticatedSession } from "../common/auth-session.js";
```

`api.js` の3関数を、idToken を受け取って送る形へ変更する。

```js
export async function approveSignupRequest(requestId, approval, idToken) {
  const response = await fetch(SIGNUP_ADMIN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "approveSignupRequest",
      requestId,
      approval,
      idToken            // ← 追加。reviewedBy は送らない
    })
  });
  ...
}
```

`rejectSignupRequest` も同様。**`reviewedBy` はクライアントから送らない。** サーバ側で解決済みユーザーから取る（手順3）。

`main.js` は起動時に一度セッションを解決し、以後 idToken を使う。`pmo-admin/main.js` の `initializePage()` が同じ形をしているので参考にすること。

**この時点ではGASはまだ `idToken` を無視する。** 未知のフィールドが増えるだけなので、動作は変わらない。

---

## 5. 手順3：GAS が idToken を必須化

### 使う既存ガード

`apps/account-console/backend/account-apps-script/account_console_users.js` に実装済み。

```js
function requireAccountConsoleOperator_(body) {
  const idToken = normalizeText(body.idToken);
  if (!idToken) throw new Error("idToken が必要です");

  const resolved = resolveCurrentUserByIdToken(idToken);
  if (!resolved || resolved.ok !== true || !resolved.user) {
    throw new Error("ログインユーザーを確認できません");
  }

  const user = resolved.user;
  const modules = Array.isArray(user.allowed_modules)
    ? user.allowed_modules
    : parseAllowedModules(user.allowed_modules);

  if (normalizeText(user.status).toLowerCase() !== "active") {
    throw new Error("このユーザーは停止中です");
  }
  if (modules.indexOf(ACCOUNT_CONSOLE_MODULE_KEY) === -1) {
    throw new Error("Account Console の利用権限がありません");
  }

  return user;
}
```

**新しいガードを作らず、これを使うこと。** 本番で稼働している実績があり、`status=active` と `allowed_modules` の確認まで含んでいる。クライアント側の旧判定（role が admin/dev/developer）より厳密である。

### 5-1. ラッパーを追加

`signup_admin.js` の先頭付近へ。既存関数は `{success, message}` 形式を返すので、例外を値へ変換する。

```js
// ===== 操作者確認ここから =====
function requireSignupAdminOperator_(body) {
  try {
    return { success: true, user: requireAccountConsoleOperator_(body) };
  } catch (error) {
    return {
      success: false,
      message: error.message || "操作権限を確認できませんでした"
    };
  }
}
// ===== 操作者確認ここまで =====
```

### 5-2. ルーターを変更

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

### 5-3. `reviewedBy` をサーバ側で決める

`signup_admin.js` の2関数のシグネチャを変更する。

```js
function approveSignupRequest(requestId, approval, operator) {
  const reviewedBy = normalizeText(operator?.internal_user_id);
  ...
  sheet.getRange(row, headerMap["reviewed_by"]).setValue(reviewedBy);
```

`internal_user_id` は `buildLoginUserResponse()` が必ず返すフィールドである（`users.js` で確認済み）。従来クライアントが送っていた `currentUser.userId` も同じ値なので、**既存データとの整合は保たれる。**

`rejectSignupRequest(requestId, operator)` も同様。

---

## 6. 手順4：一覧取得をPOST化し、GET版を撤去

### 理由

`getSignupRequests` は現在 **GET かつ無認証**で、`applicant_email` / `applicant_name` / `phone` を返す。個人情報である。

**トークンをGETのクエリに載せてはいけない。** URLはアクセスログ・Referer・ブラウザ履歴に残る。したがってPOSTへ移す。

### GAS側

`doPost` に追加。

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

`doGet` から `getSignupRequests` の分岐を**削除する。**

`getSignupRequests(status)` の本体は変更不要。

### クライアント側

`api.js` の `fetchSignupRequests` を POST + `getSignupRequestsSecure` + idToken へ変更する。

### 順序

GAS と クライアントを**同じデプロイで反映すること。** GET版の削除だけ先行すると画面が壊れる。

---

## 7. 手順5：孤児デプロイのアーカイブ

**これはえいちの手作業。Codexは実行しないこと。** 指示書には手順のみ記載する。

Apps Script エディタ → 右上「デプロイ」→「デプロイを管理」→ 対象の「︙」→「アーカイブ」

| デプロイID | プロジェクト | 版 |
|---|---|---|
| `AKfycbyvUOQHkNWSxiBz…` | ACCOUNT | @37 |
| `AKfycbzS0Etn9kdeI_I3…` | ACCOUNT | @HEAD |

**`AKfycbyvUOQ…` を最優先。** 本番と同じ @37 なので、修正前のコードを配信し続ける。

`@HEAD` は仕様上アーカイブできない場合がある。その場合は「エディタに未完成のコードを保存したまま放置しない」という運用で対応する。

PMO・ORDERCASE の孤児デプロイ（`AKfycbxwSCE…` / `AKfycbzT60Fj…` / `AKfycbxTZCSs…`）も同様だが、**用途が不明なため独断で消さないこと。** えいちの確認を待つ。

---

## 8. 触らない範囲

- PMO の非Secureアクション（G-B）— **別指示書で扱う。今回は触らない**
- `checkLoginUserByEmail` の公開範囲（G-D）— ログイン基盤の設計判断を伴うため別途
- `submitSignupRequest` — **公開の申請フォームであり、無認証で正しい。認証を足さないこと**
- `accountConsole*` 系6アクション — 既に正しく守られている
- 勤怠 `Code.gs`、OrderCase GAS
- ShiftBuilder 一式
- `apps/CLAUDE.md` / `apps/AI_COLLABORATION_HANDOFF.md` / `apps/shiftbuilder/CLAUDE.md` / `docs/` 配下
- 無関係な整形・リファクタリング・依存追加

---

## 9. 完了条件

### 自動で確認できるもの

1. `node --check` が変更した全JSファイルを通る
2. 既存テスト21件が引き続き pass
3. `?v=` を更新した場合、1種類に統一されている（`apps/shiftbuilder` の方式に準拠。account-console は現在9種類混在だが、**今回は触った範囲のみで可**）

### 手で確認するもの（えいち）

4. 正規の管理者アカウントで signup-admin 画面を開き、一覧取得・承認・却下ができる
5. **承認後、スプレッドシートの `reviewed_by` に正しい `internal_user_id` が入っている**
6. 非管理者アカウントで開くと、一覧取得の時点で拒否される
7. ログイン画面が引き続き動作する（Worker許可リストの回帰確認）
8. 勤怠ダッシュボードが引き続き動作する（Worker経由の `resolveCurrentUserByIdToken` 回帰確認）
9. PMO管理画面が引き続き動作する（同上）

**7・8・9 は手順1の直後に必ず確認すること。** Worker はスイート全体の認証経路であり、ここを壊すと全アプリが止まる。

### 攻撃経路が閉じたことの確認

10. idToken なしで `approveSignupRequest` を叩き、拒否されること

```bash
curl -s -X POST 'https://script.google.com/macros/s/<新デプロイID>/exec' \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"approveSignupRequest","requestId":"dummy","approval":{"role":"admin"}}'
```

`success: false` かつ権限エラーが返ること。**`requestId` は存在しない値を使い、実データを操作しないこと。**

11. Worker に許可外アクションを投げ、403 が返ること

```bash
curl -s -X POST 'https://shiftcore-login-proxy.shiftcore-div.workers.dev/' \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"approveSignupRequest","requestId":"dummy"}'
```

---

## 10. 完了報告

`AI_COLLABORATION_HANDOFF.md` 第7節の形式で。加えて次を明示すること。

- 手順1〜4のどこまで完了したか
- Worker のソースをリポジトリへ取り込んだか
- 第9章の 4〜11 のうち、実施できた項目とできなかった項目
- **実施できなかった確認を、実施済みとして書かないこと**
- 孤児デプロイのアーカイブは未実施のはず（えいちの手作業）

---

## 付録：この修正で塞がらないもの

本指示書の範囲外。別途対応が必要。

| ID | 内容 | 深刻度 |
|---|---|---|
| G-B | PMO非Secureアクションが URLクエリの role を信頼 | 高 |
| G-C | PMO `submitShiftRequest` / `createMonthlyRequestSheet` が無認証 | 高 |
| S-4 | 反射型XSS 3箇所 | 高 |
| F-1 | OrderCase クライアントの認証ハング | 高 |
| G-D | `checkLoginUserByEmail` の無認証開示 | 中 |
| S-5 | idToken の Console 出力 | 中 |
| W-4 | ShiftBuilder・勤怠のGASが別アカウント所有 | 中 |
