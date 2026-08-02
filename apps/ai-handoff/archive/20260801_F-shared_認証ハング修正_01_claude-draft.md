# Codex作業指示書：3-3 認証セッション取得の永久ハング修正

- 発行: 2026-08-01 / 起案: Claude / 承認: えいち
- 基線: `aa3f9e9 fix: harden ShiftBuilder mutations and caching`
- 対象: `shared/js/shiftcore-auth.js`
- 安全境界: **認証領域の変更にあたるため、えいちの承認を得たうえでの作業である**（本指示書がその承認にあたる）

---

## 1. 前提の共有

`aa3f9e9` のレビューは完了している。**3-1・3-2・`?v=` 統一はすべて解決を確認した。差し戻す点はない。**

- テスト 17件 pass / 0 fail（`node --test apps/shiftbuilder/tests/*.test.mjs`）
- 全JSファイル `node --check` OK
- `?v=` は40箇所すべて `20260801-hardening-1`、未付与ゼロ
- GitHub Pages で `mutation-session-policy.mjs` の配信を確認済み

本指示書は、`aa3f9e9` で**意図的に未対応として引き継がれた 3-3 のみ**を対象とする。

---

## 2. 直す問題

### 現状のコード

`shared/js/shiftcore-auth.js` 18〜49行。

```js
export function waitForShiftCoreAuthState() {
  return new Promise((resolve) => {                          // (a)
    let settled = false;
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, async (user) => {  // (b) (d)
      if (settled) return;
      settled = true;
      unsubscribe();                                          // (e)

      if (!user) {
        resolve({ isLoggedIn: false, user: null, idToken: null, email: "", uid: "" });
        return;
      }

      const idToken = await user.getIdToken();                // (c)
      resolve({ isLoggedIn: true, user, idToken, email: user.email || "", uid: user.uid || "" });
    });
  });
}
```

### 欠陥

| # | 内容 |
|---|---|
| (a) | `new Promise((resolve) => ...)` が `reject` を受け取っていない。失敗を外へ伝える手段がない |
| (b) | コールバックが `async`。内部の reject は浮いた Promise の未処理拒否になり、外側の Promise は settle しない |
| (c) | `user.getIdToken()` が reject すると `resolve()` に到達しない。**Promiseが永久に解決も拒否もしない** |
| (d) | `onAuthStateChanged(auth, next, error)` の**第3引数のエラーコールバックを渡していない**。認証層のエラーでも settle しない |
| (e) | `settled = true` と `unsubscribe()` が `await` より前。再試行の余地がない。さらにコールバックが同期発火した場合、`unsubscribe` はまだ noop のままなのでリスナーが解除されず残る |

### 影響

`await requireShiftBuilderSession()` が永久に返らない。呼び出し側の `try` は `catch` へ流れず、`finally` もないため、`aa3f9e9` で入れたロールバックにも到達しない。画面は楽観反映が残ったまま無反応になる。

**`aa3f9e9` のロールバック修正は `catch` 経路にしか効かないため、この経路は現状救えない。**

### 発生条件

`user.getIdToken()` の reject。ネットワーク断中のトークン更新失敗、サーバ側でのトークン取り消しなど。

### 参考：中断時の症状

Codexの前回セッションは「2026年8月へ切り替えて再読込 → `ShiftBuilder月次データAPIを確認中...` で停止」の状態で中断している。これは 3-3 が起きたときの症状と一致する。**ただしセッション終了によるものである可能性の方が高く、原因は未確定。** 3-3 の根拠として扱わないこと。修正後の回帰確認で改めて観察する。

---

## 3. 要件

1. **`waitForShiftCoreAuthState()` は必ず有限時間で settle すること。**
2. **どの失敗経路でも、未処理の Promise 拒否を発生させないこと。**
3. **失敗を「例外」ではなく「値」で返すこと。** 呼び出し側の `assertMutationSession()` が `{ isLoggedIn: false }` を受けて `MutationSessionRequiredError` を投げる既存経路をそのまま活かす。これにより **`main.js` 側の変更は不要**で、差分を `shared/` に閉じ込められる。
4. 失敗理由を呼び出し側が区別できるよう、セッションオブジェクトに理由を持たせること。
5. リスナーを確実に解除すること（同期発火ケースを含む）。
6. **純ロジックは `.mjs` へ切り出してテストを書くこと。** 既存の `async-focus-policy.mjs` / `record-normalizers.mjs` と同じ方針に揃える。Firebase SDK を CDN から import しているモジュール本体は単体テストできないため、テスト可能な部分を分離する。

---

## 4. 実装案（そのまま採用してよい）

### 4-1. 純ロジックの切り出し

新規 `shared/js/shiftcore-auth-policy.mjs`:

```js
export const AUTH_STATE_TIMEOUT_MS = 15000;

export function buildSignedOutSession(authError = "") {
  return {
    isLoggedIn: false,
    user: null,
    idToken: null,
    email: "",
    uid: "",
    authError: authError || ""
  };
}

export function buildSignedInSession(user, idToken) {
  return {
    isLoggedIn: true,
    user: user,
    idToken: idToken,
    email: user?.email || "",
    uid: user?.uid || "",
    authError: ""
  };
}

export function describeAuthFailure(error, fallback) {
  const message = String(error?.message || error || "").trim();

  return message || fallback;
}
```

### 4-2. 本体の書き換え

`shared/js/shiftcore-auth.js` の `waitForShiftCoreAuthState()` を置き換える。

```js
import {
  AUTH_STATE_TIMEOUT_MS,
  buildSignedInSession,
  buildSignedOutSession,
  describeAuthFailure
} from "./shiftcore-auth-policy.mjs?v=<新しい版数>";

export function waitForShiftCoreAuthState({ timeoutMs = AUTH_STATE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = null;
    let timerId = null;

    const settle = (session) => {
      if (settled) {
        return;
      }
      settled = true;

      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }

      if (typeof unsubscribe === "function") {
        try {
          unsubscribe();
        } catch (error) {
          // 購読解除の失敗は認証結果へ影響させない。
        }
      }

      resolve(session);
    };

    timerId = setTimeout(() => {
      settle(buildSignedOutSession("認証状態の確認がタイムアウトしました。"));
    }, timeoutMs);

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (!user) {
          settle(buildSignedOutSession());
          return;
        }

        // async コールバックにしない。浮いた Promise 拒否を作らないため
        // then / catch の二引数形式で必ず settle する。
        user.getIdToken().then(
          (idToken) => {
            settle(buildSignedInSession(user, idToken));
          },
          (error) => {
            settle(buildSignedOutSession(
              describeAuthFailure(error, "IDトークンを取得できませんでした。")
            ));
          }
        );
      },
      (error) => {
        settle(buildSignedOutSession(
          describeAuthFailure(error, "認証状態を確認できませんでした。")
        ));
      }
    );

    // onAuthStateChanged が同期発火した場合、settle 時点では
    // unsubscribe がまだ未代入でリスナーが残る。ここで解除する。
    if (settled && typeof unsubscribe === "function") {
      try {
        unsubscribe();
      } catch (error) {
        // 同上。
      }
    }
  });
}
```

**設計上の要点（変更するなら理由を残すこと）**

- コールバックを `async` にしない。`then(onFulfilled, onRejected)` の二引数形式で、成功・失敗の両方から必ず `settle()` を呼ぶ
- `settle()` は冪等。タイマー解除・購読解除・resolve をまとめる
- `onAuthStateChanged` の第3引数にエラーコールバックを渡す
- タイムアウトは最後の砦。上記2つが効いていれば通常は発火しない
- `reject` ではなく `buildSignedOutSession()` を `resolve` する。理由は要件3のとおり

### 4-3. 呼び出し側

**`apps/shiftbuilder/js/shiftbuilder/auth.js` と `main.js` の変更は不要。**

`requireShiftBuilderSession()` はセッションをそのまま返し、`requireMutationSession()` → `assertMutationSession()` が `isLoggedIn: false` を見て `MutationSessionRequiredError` を投げ、`catch` でロールバックされる。`aa3f9e9` で作った経路がそのまま機能する。

**任意（やるなら小さく）**: `main.js` の `showMutationFailure()` で、`error.session?.authError` があればそれをステータスに含める。ユーザーが「ログアウトされた」のか「通信に失敗した」のか区別できるようになる。**必須ではない。やらない判断でよい。**

---

## 5. テスト

`shared/` に既存のテスト置き場がない。次のいずれかで対応し、選んだ方を README に反映すること。

- 案A: `shared/tests/shiftcore-auth-policy.test.mjs` を新設し、`apps/shiftbuilder/README.md` のコマンドを両方走る形へ更新
- 案B: リポジトリ直下に `TESTING.md` を作り、全テストコマンドを集約

**最低限カバーすること**

- `buildSignedOutSession()` が `isLoggedIn: false` / `idToken: null` / `authError` を正しく返す
- `buildSignedOutSession()` の戻り値が `assertMutationSession()` で `MutationSessionRequiredError` になる（`mutation-session-policy.mjs` と組み合わせた統合的な確認）
- `buildSignedInSession()` が `email` / `uid` の欠損を空文字へ落とす
- `describeAuthFailure()` が空メッセージ・`undefined`・Error インスタンスでフォールバックする

既存17件が引き続き pass することも確認する。

---

## 6. `?v=` の扱い（重要）

現在は**全40箇所が `20260801-hardening-1` で完全に統一されている**。この不変条件は機械的に検証できるので維持したい。

- 新しい版数文字列を1つ決める（例: `20260801-authfix-1`）
- **`shared/` と `apps/shiftbuilder/` の全静的import・`index.html` のCSS/JS参照を、その1つの文字列へ一括で揃える**
- 新規追加する `shiftcore-auth-policy.mjs` の import にも付ける

変更したファイルだけ版数を上げる方式は取らないこと。混在すると「どれが最新か」を人が追う必要が出る。

検証コマンド（`?v=` が1種類だけ・未付与ゼロになること）:

```bash
cd apps/shiftbuilder
grep -rho '?v=[0-9a-zA-Z-]*' js/shiftbuilder/ index.html | sort | uniq -c
grep -rhno 'from "\.[^"]*"' js/shiftbuilder/*.js js/shiftbuilder/*.mjs | grep -v "?v="
grep -rhno 'from "\.[^"]*"' ../../shared/js/*.js ../../shared/js/*.mjs | grep -v "?v="
```

---

## 7. 触らない範囲

- `apps/shiftbuilder/js/shiftbuilder/main.js` のミューテーション3関数の**構造**（項目E・共通化は今回の対象外）
- `apps/CLAUDE.md` / `apps/AI_COLLABORATION_HANDOFF.md` / `apps/shiftbuilder/CLAUDE.md` / `apps/shiftbuilder/docs/` 配下（未コミット差分が残っている。今回の作業と無関係）
- `.DS_Store`
- OrderCase / PMO / Persona Gacha / Account Console
- Firebase設定、API契約、権限判定ロジック
- 無関係な整形・リファクタリング・依存追加

`shared/js/shiftcore-firebase-config.js` は変更しない。

---

## 8. 完了条件

1. `node --test` で全テスト pass（新規分を含む）
2. 変更した全ファイルが `node --check` を通る
3. `?v=` が1種類のみ・未付与ゼロ（第6節のコマンドで確認）
4. `?demo=1` で静的表示に回帰がない
5. commit・push まで完了
6. GitHub Pages 反映後、公開URLで新モジュールが配信されていることを確認

---

## 9. 公開後の回帰確認（未ログインでは判定できない項目）

以下はえいちのログインが必要。Codexが実行できない場合は未実施として引き継ぐこと。**「実施できなかった確認」を実施済みとして書かないこと。**

1. 2026年8月へ切り替えて再読込 → **`ShiftBuilder月次データAPIを確認中...` で停止しないこと**（前回中断時の症状。最優先で見る）
2. 案件軸でアサイン作成・解除・入れ替えが成功すること
3. 人員軸でアサイン追加・解除が成功すること
4. 別タブでログアウトした状態でアサイン操作 → 楽観反映が**残らず**、ログイン案内が出ること（3-1の回帰確認）
5. Console にエラーが出ていないこと
6. ICSメール送信（`c47a31e`）が引き続き動作すること

---

## 10. 完了報告の形式

`AI_COLLABORATION_HANDOFF.md` 第7節の形式で報告すること。特に次を明示。

- 3-3 の各欠陥 (a)〜(e) をそれぞれどう塞いだか
- タイムアウト値を変更した場合はその理由
- `main.js` を触ったか触っていないか
- 第9節のうち実施できた項目とできなかった項目
- 実施できなかった確認の最短手順
