# ShiftBuilder コード棚卸し

- 作成: 2026-08-01 / 担当: Claude
- 基線: **`c47a31e feat: email personnel shift calendars`**（調査中にCodexがコミット。数値・行番号はすべてこのHEADで取り直し済み）
- 編集したファイル: なし（読み取りのみ）

---

## 0. この調査の制約（先に開示）

**調査中にHEADが動いた。** 開始時点のHEADは `3311a0e` で、ICSメール送信機能は未コミット差分7ファイルとして存在していた。調査の途中でCodexがこれを `c47a31e` としてコミットしたため、作業ツリーとHEADが一致した。差分の消失ではなく、コードは全て残っている（`sendShiftBuilderPersonnelIcs` の現存を確認済み）。本報告の数値はすべて `c47a31e` で取り直した。

**私のサンドボックスでは `git status` / `git diff` が信頼できない。** `.git/index.lock` を作成できず（`Operation not permitted`）、実際には差分があるのに `git diff` が空を返す事象を確認した。そのため状態確認は `git show <rev>:<path>` と実ファイルの `diff` で行っている。git の書き込み操作（add / commit / stash / checkout / reset）は一切行っていない。

以下の「確認済み事実」は実コードの読み取り結果であり、**公開環境での実データ動作は未確認**である。

---

## 1. 規模（確認済み事実）

| ファイル | 行数 |
|---|---:|
| main.js | 3,105 |
| render-detail-panel.js | 825 |
| render-shift-table.js | 708 |
| render-personnel-table.js | 313 |
| api.js | 236 |
| export-menu.js | 226 |
| personnel-axis-view-model.js | 199 |
| export-utils.mjs | 169 |
| その他11ファイル | 計 約630 |

- ShiftBuilder JS 合計 約6,400行。うち `main.js` が **48%** を占める。
- `main.js`: 関数77個、モジュールレベルの `let` 11個。
- CSS は `shiftbuilder.css` 単一で1,934行。

最大関数：

| 関数 | 行数 |
|---|---:|
| `loadShiftData` | 217 |
| `replaceAssignmentFromSelectedCell` | 209 |
| `createAssignmentFromSelectedCell` | 185 |
| `renderCurrentShiftView` | 148 |
| `renderAssignmentCandidateCards` | 110 |
| `archiveAssignmentFromButton` | 102 |

---

## 2. 先に良い点（確認済み事実）

棚卸しなので問題を多く挙げるが、土台は雑ではない。

- **`escapeHtml` が正しく実装され、一貫して使われている。** `innerHTML` への代入24箇所に対し、描画系ファイルで `escapeHtml` を計132回使用。実装も `& < > " '` の5文字を漏れなく処理している。
- **API層に読み取りキャッシュが設計されている。** `api.js` は revision キー + 60秒TTL + トークンsubject単位のキーで `sessionStorage` キャッシュを持ち、キャッシュ失敗時は「絶対にAPIレスポンスを妨げない」方針で握り潰している。設計意図がコメントで残っている。
- **`.mjs` = 純ロジック + テストあり、という分離方針が既にある。** `async-focus-policy` / `availability-policy` / `export-utils` の3つがこの形。
- **`personnel-axis-view-model.js` に正規化層がある。** `firstValue(source, ["family_name", "familyName"])` 形式で snake / camel の揺れを1箇所に閉じ込めている。これは本来この規模のコードに必要な層で、既に部分的に存在する。

---

## 3. 不整合・バグ候補

### 3-1. 未ログイン時に楽観反映がロールバックされない【確認済み・要判断】

**確認済み事実**

3つのミューテーション関数はいずれも次の構造を持つ。

```js
cell.assigned.push(optimisticMember);   // 楽観反映
renderCurrentShiftView();
setStatus("アサインを反映しました：...");

try {
  let session = getCurrentSession();
  if (!session || !session.isLoggedIn || !session.idToken) {
    session = await requireShiftBuilderSession();
    setCurrentSession(session);
  }
  if (!session.isLoggedIn) {
    renderNoLogin(session);
    return;              // ← throw ではなく return
  }
  ...
} catch (error) {
  found.cell.assigned = previousAssigned;   // ロールバックはここにしかない
}
```

`renderNoLogin(session)` の呼び出し5箇所（main.js / `c47a31e`）:

| 行 | 関数 | 楽観反映後か |
|---:|---|---|
| 2110 | `loadShiftData` | いいえ（影響なし） |
| **2452** | **`createAssignmentFromSelectedCell`** | **はい** |
| **2643** | **`replaceAssignmentFromSelectedCell`** | **はい** |
| **2794** | **`archiveAssignmentFromButton`** | **はい** |
| 2859 | `init` | いいえ（影響なし） |

`return` は例外ではないため catch を通らず、`previousAssigned` へのロールバックが実行されない。

さらに `renderNoLogin()`（258行）が書き換えるのは `operatorText` / `permissionText` / `permissionBadge` / `apiStatusText` / `userNameText` / `shiftPermissionText` / `editPermissionText` とステータス文言のみで、**シフト表そのものは再描画しない**。

**この分岐が到達可能であることは `auth.js` で確認できる。**

```js
export async function requireShiftBuilderSession() {
  const session = await getShiftCoreSession();

  // デバッグ中は自動リダイレクトしない。
  // 未ログインなら main.js 側で画面に表示する。
  return session;
}
```

`requireShiftBuilderSession()` は**例外を投げず、未ログインセッションをそのまま返す**。コメントのとおり「main.js側で表示する」設計であり、`if (!session.isLoggedIn)` 分岐は意図的に到達する経路である。したがって catch へは流れない。

**推論**

セッション失効後にアサイン操作を行うと、保存されていないアサインが画面に残ったまま「未ログインです」と表示される。ユーザーには「反映済み」に見えるが実データには存在しない、という食い違いが起きうる。

**発生条件（2026-08-01 追記・確認済み事実）**

`shared/js/shiftcore-auth.js` を読んで確定した。`getShiftCoreSession()` は `waitForShiftCoreAuthState()` を待つだけで、`isLoggedIn: false` を返すのは **`onAuthStateChanged` のコールバックに渡る `user` が `null` のときのみ**。

```js
if (!user) {
  resolve({ isLoggedIn: false, user: null, idToken: null, email: "", uid: "" });
  return;
}
const idToken = await user.getIdToken();
```

`user.getIdToken()` は Firebase SDK が自動で更新するため、**IDトークンの単純な期限切れでは `isLoggedIn: false` にならない**。3-1 が発動するのは `user` 自体が消える次のケースに絞られる。

- 明示的なサインアウト（別タブでのログアウト含む）
- リフレッシュトークンの失効・取り消し（パスワード変更、アカウント無効化・削除、管理者による取り消し）
- ブラウザの永続化ストレージがクリアされた

つまり「よく起きる」経路ではないが、別タブでのログアウトは実運用でありうる。修正対象として妥当。

---

### 3-3. 認証セッション取得が永久ハングしうる【新規・3-1より重い】

**確認済み事実**

`shared/js/shiftcore-auth.js` 18〜49行。

```js
export function waitForShiftCoreAuthState() {
  return new Promise((resolve) => {          // ← reject を受け取っていない
    let settled = false;
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, async (user) => {   // ← async コールバック
      if (settled) return;
      settled = true;
      unsubscribe();                          // ← 先に購読解除

      if (!user) { resolve({ isLoggedIn: false, ... }); return; }

      const idToken = await user.getIdToken(); // ← ここが reject したら
      resolve({ isLoggedIn: true, ... });      // ← 到達しない
    });
  });
}
```

問題が3つ重なっている。

1. **`new Promise((resolve) => ...)` が `reject` を受け取っていない。** 失敗を外へ伝える手段がない。
2. **コールバックが `async` なので、`user.getIdToken()` の reject は浮いた Promise の未処理拒否になる。** 外側の Promise は settle しない。
3. **`settled = true` と `unsubscribe()` が `await` より前に実行されている。** 再試行の余地がない。

さらに `onAuthStateChanged(auth, next, error)` の**第3引数のエラーコールバックを渡していない**ため、認証層自体のエラーでも Promise は settle しない。

**推論**

`user.getIdToken()` が reject すると（オフライン時のトークン更新失敗、サーバ側でのトークン取り消しなど）、`await requireShiftBuilderSession()` は**永久に解決も拒否もしない**。結果として:

- `main.js` の `try` は catch へ流れず、`finally` もないためロールバックも `setLoading(false)` も走らない
- 楽観反映が画面に残ったまま、操作が無反応になる
- ユーザーからは「保存中のまま固まった」ように見える

3-1 は「誤った表示が残る」だが、3-3 は「処理が二度と戻らない」ため影響が大きい。**3-1 の修正を `catch` の中だけで行うと、3-3 の経路は catch に到達しないため救えない。** 両方を同時に見ないと片手落ちになる。

**未確認**

実際に `getIdToken()` が reject する頻度。ネットワーク断のタイミング依存であり、コードからは判定できない。

**影響範囲**

現時点で `shiftcore-auth.js` を import しているのは `apps/shiftbuilder/js/shiftbuilder/auth.js` のみ（grep確認済み）。ただし `shared/` 配下にあるため、他アプリが同じ認証を使い始めた時点で同じ問題を引き継ぐ。

**修正の方向（案）**

- `new Promise((resolve, reject) => ...)` にして `try/catch` で `reject` する、または `resolve({ isLoggedIn: false, error })` で失敗を値として返す
- `onAuthStateChanged` の第3引数にエラーコールバックを渡す
- 呼び出し側（`main.js`）のミューテーション3関数に `finally` を置き、成否によらずロールバックと `setLoading(false)` を保証する

3つ目は 4-1 の共通化（項目E）と同じ場所を触るため、まとめて実施するのが自然。

**注意**: `shared/` は ShiftBuilder 以外にも影響しうる共有領域であり、`AI_COLLABORATION_HANDOFF.md` の安全境界により、認証の変更はえいちの確認が必要。私は変更していない。

---

### 3-2. 重複アサインチェックのフィールド名が create だけ違う【小・実害は条件次第】

**確認済み事実**

`internal_user_id` の読み取りが2種類混在している（main.js / `c47a31e`）。

| 行 | 箇所 | 読み方 |
|---:|---|---|
| **2375** | **`create` の重複チェック** | **`internal_user_id` のみ** |
| 2565 | `replace` の重複チェック | `internal_user_id \|\| internalUserId` |
| ほか3箇所 | `getSameDayAssignmentsForUser` / `hasSameDayAssignmentForUser` / `renderAssignmentCandidateCards` | `internal_user_id \|\| internalUserId` |

**推論**

APIが camelCase で返すケースがあれば、`create` だけ重複アサインを検出できずにすり抜ける。`replace` は検出する。

**未確認**

実APIが `internal_user_id` と `internalUserId` のどちらを返すか。両方書いてあるということは過去に揺れた実績があるか、防御的に書いただけかのどちらかで、コードからは判別できない。

---

## 4. 構造的な負債

### 4-1. ミューテーション3関数が同じ8段構成を重複している

`create`（185行）/ `replace`（209行）/ `archive`（102行）は次を各自で書いている。

1. ガード節 → `setStatus()` と `elements.assignmentCandidateStatus.textContent` の**2箇所同時更新**
2. `previousAssigned` のスナップショット
3. 楽観的にセルを書き換え
4. `setSelectedCell()` + `renderCurrentShiftView()`
5. セッション取得ブロック（8行、完全同一）
6. API呼び出し
7. `if (!result || result.success !== true) throw`
8. catch → `findShiftCell` → ロールバック → 再描画 → ステータス2箇所 → `refreshActionPopoverForChangedCell`

**測定値**

- `elements.assignmentCandidateStatus` への直接代入: **44箇所**
- `requireShiftBuilderSession()` の同一取得ブロック: **5箇所**

3-1 のバグはこの重複の帰結である。1箇所直しても、同じ形が残り2箇所に残る。

### 4-2. 状態が state.js と main.js に二重管理されている

- `state.js`: 正規の状態コンテナ。`currentSession` / `currentUser` / `currentShiftData` / `selectedCell` / `activeAxis` の5フィールド。
- `main.js`: モジュールレベルの `let` が11個。popover状態（`activePopoverMode` / `activePopoverKey` / `activePopoverAnchor` / `pendingActionPopoverFocus`）、描画中フラグ、外部更新タイマー3種など。

後者は他モジュールから不可視で、単体テストもできない。popover周りは既に十数個の関数（`getPopoverKey` / `reanchorActivePopover` / `capturePopoverRerenderState` / `restoreActionPopoverFocus` など）に広がっている。

### 4-3. 正規化の基準が2つある

`personnel-axis-view-model.js` は `firstValue()` で正規化層を持つのに対し、`main.js` は `a || b` 形式のインライン正規化が **28箇所**。同種の記述は `render-detail-panel.js` にもある。

既に良いパターンが存在するのに、案件軸側がそれを使っていない状態。3-2 はこの帰結である。

---

## 5. テストとキャッシュバスティング

### 5-1. テストは通るが、コマンドが文書化されていない

**確認済み事実**

- `node --test tests/*.test.mjs` → **12件すべてpass**（Node v22.22.3）
- `node --test tests/`（ディレクトリ指定）→ `MODULE_NOT_FOUND` で失敗
- リポジトリ全体に `package.json` が存在しない
- `AGENTS.md` にもテスト実行コマンドの記載なし

**推論**

新しい作業者（人・エージェント問わず）が自然に打つ `node --test tests/` が落ちるため、「テストが壊れている」と誤認する導線になっている。

**カバレッジ**: テスト対象は `.mjs` 3ファイル計259行のみ。残り約6,100行にテストなし。特に3-1のロールバック分岐は純ロジックへ切り出せばテスト可能。

### 5-2. `?v=` の付与漏れ

**確認済み事実**

`main.js`（`c47a31e`）の相対import 16件のうち、**5件に `?v=` が付いていない**。

| 行 | モジュール |
|---:|---|
| 3 | `./config.js` |
| 4 | `./auth.js` |
| 15 | `./mock-data.js` |
| 16 | `./utils.js` |
| 17 | `./permissions.js` |

版数文字列も複数系統が混在している。

- `20260714-workflow-1` … render-summary / render-shift-table / consecutive-work-alert / state / dom
- `20260729-personnel-preview-1` … render-detail-panel
- `20260730-case-cascade-1` … async-focus-policy
- `20260731-requested-off-1` … personnel-axis-view-model / availability-policy
- `20260731-ics-mail-1` … api / export-menu / render-personnel-table / export-utils

**推論**

`?v=` なしの5ファイルを単体で修正した場合、`main.js` の版数を上げてもブラウザは旧モジュールをキャッシュから返す可能性がある。特に `permissions.js`（権限判定）と `auth.js`（認証）がこの集合に入っているのが気になる。手動運用のため、更新漏れは今後も再発しうる。

**未確認**

GitHub Pages が実際に返す `Cache-Control` ヘッダ。これ次第で実害の大きさが変わる。ヘッダ次第では問題にならない。

---

## 6. 補足（実害なしと判断したもの）

- `api.js` の `getTokenSubject()` は JWT を `atob` でクライアント側デコードしているが、用途は**キャッシュキーの生成のみ**で認証判断には使っていない。検証なしデコードだが、この用途では妥当。`catch` で `"anonymous"` にフォールバックする実装も適切。

---

## 7. 次の一手の候補

優先度は私の判断であり、えいちの決定を待つ。**Codexが `c47a31e` をコミットしたため、`main.js` の作業競合は現時点で解消している。**

| # | 内容 | 規模 | 補足 |
|---|---|---|---|
| A | `shared/js/shiftcore-auth.js` を読み、3-1の発生条件を確定 | 極小 | 55行。着手前提の調査 |
| B | 3-1 の修正（3関数の未ログイン分岐でロールバック） | 小 | Aの結果次第。Eの一部として実施も可 |
| C | 2375行のフィールド名を他4箇所へ揃える | 極小 | 実APIのフィールド名確認が望ましい |
| D | `?v=` 未付与5件の解消と版数体系の統一 | 小 | `main.js` を触る |
| E | ミューテーション3関数の共通化（セッション取得・ロールバック・ステータス更新） | 大 | 3-1を構造的に潰せる。テスト可能な形へ切り出す前提 |
| F | テスト実行コマンドを `AGENTS.md` へ明記 | 極小 | 文書はCodex所有のため要判断 |

推奨は **A → B → C** の順。いずれも影響範囲が狭く、Eの前に単体で価値が出る。

---

## 作業引き継ぎ

- **担当**: Claude
- **Branch / HEAD**: `main` / `c47a31e`（開始時は `3311a0e`。調査中にCodexがコミット）
- **変更したファイル**: なし
- **変更内容**: なし（読み取り調査のみ）
- **確認済み事実**: 本文の「確認済み事実」節。すべて `c47a31e` のコミット済みコードから読み取り。行番号・件数は再取得済み
- **ユーザー報告**: ICSメール送信の未コミット差分はCodexの作業中である（えいち、調査開始時点）
- **推論・未確認**: 3-1の実発生条件（`shiftcore-auth.js` 未読）、実APIのフィールド名、GitHub Pages のキャッシュヘッダ。いずれも本文に明記
- **実施したテスト**: `node --test tests/*.test.mjs` → 12 pass / 0 fail
- **未実施・注意点**: 公開環境の実データ動作は未確認。私のサンドボックスでは `git status` / `git diff` が信頼できないため、状態確認は `git show <rev>:` と実ファイル比較で行った
- **次の担当者が最初に行うこと**: えいちが次の一手（A〜F）を選ぶ
- **触らない箇所**: `apps/CLAUDE.md`、`apps/AI_COLLABORATION_HANDOFF.md`、`apps/shiftbuilder/CLAUDE.md`、`docs/` 配下（Codex所有）
