import assert from "node:assert/strict";
import test from "node:test";
import {
  getAssignmentId,
  getInternalUserId
} from "../js/shiftbuilder/record-normalizers.mjs";
import {
  assertMutationSession,
  isMutationSessionRequiredError,
  restoreAssignedSnapshot
} from "../js/shiftbuilder/mutation-session-policy.mjs";

test("ユーザーIDはsnake_caseとcamelCaseの両方を正規化する", () => {
  assert.equal(getInternalUserId({ internal_user_id: " U001 " }), "U001");
  assert.equal(getInternalUserId({ internalUserId: "U002" }), "U002");
  assert.equal(getInternalUserId({ user_id: "U003" }), "U003");
});

test("アサインIDはsnake_caseとcamelCaseの両方を正規化する", () => {
  assert.equal(getAssignmentId({ assignment_id: "A001" }), "A001");
  assert.equal(getAssignmentId({ assignmentId: "A002" }), "A002");
});

test("未ログインまたはIDトークンなしのミューテーションを拒否する", () => {
  assert.throws(
    () => assertMutationSession({ isLoggedIn: false, idToken: null }),
    (error) => isMutationSessionRequiredError(error)
  );
  assert.throws(
    () => assertMutationSession({ isLoggedIn: true, idToken: "" }),
    (error) => isMutationSessionRequiredError(error)
  );
});

test("ログイン済みセッションはそのまま返す", () => {
  const session = { isLoggedIn: true, idToken: "token" };
  assert.equal(assertMutationSession(session), session);
});

test("楽観反映したアサインを失敗前の状態へ戻す", () => {
  const previousAssigned = [{ assignment_id: "A001" }];
  const cell = {
    assigned: [{ assignment_id: "PENDING-1", is_pending: true }]
  };

  assert.equal(restoreAssignedSnapshot(cell, previousAssigned), true);
  assert.deepEqual(cell.assigned, previousAssigned);
  assert.notEqual(cell.assigned, previousAssigned);
});
