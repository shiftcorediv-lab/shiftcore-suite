import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignedInSession,
  buildSignedOutSession,
  describeAuthFailure
} from "../js/shiftcore-auth-policy.mjs";
import {
  assertMutationSession,
  isMutationSessionRequiredError
} from "../../apps/shiftbuilder/js/shiftbuilder/mutation-session-policy.mjs";

test("未ログインセッションへ認証失敗理由を保持する", () => {
  assert.deepEqual(buildSignedOutSession("認証失敗"), {
    isLoggedIn: false,
    user: null,
    idToken: null,
    email: "",
    uid: "",
    authError: "認証失敗"
  });
});

test("認証失敗セッションはShiftBuilderのミューテーションで拒否される", () => {
  assert.throws(
    () => assertMutationSession(buildSignedOutSession("トークン取得失敗")),
    (error) => (
      isMutationSessionRequiredError(error) &&
      error.session?.authError === "トークン取得失敗"
    )
  );
});

test("ログイン済みセッションの欠損メールとUIDを空文字へ落とす", () => {
  assert.deepEqual(buildSignedInSession({}, "token"), {
    isLoggedIn: true,
    user: {},
    idToken: "token",
    email: "",
    uid: "",
    authError: ""
  });
});

test("認証失敗理由をError・文字列・空値から正規化する", () => {
  assert.equal(describeAuthFailure(new Error("通信失敗"), "既定"), "通信失敗");
  assert.equal(describeAuthFailure("  認証失敗  ", "既定"), "認証失敗");
  assert.equal(describeAuthFailure(undefined, "既定"), "既定");
  assert.equal(describeAuthFailure({ message: "" }, "既定"), "既定");
});
