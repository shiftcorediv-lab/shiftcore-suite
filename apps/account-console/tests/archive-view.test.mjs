import test from "node:test";
import assert from "node:assert/strict";
import { filterAccountArchive } from "../js/account-console/archive-view.mjs";

test("停止済みは通常一覧から分離し、すべてで再表示できる", () => {
  const users = [{ status: "active" }, { status: "inactive" }, { status: "pending" }];
  assert.deepEqual(filterAccountArchive(users), [users[0], users[2]]);
  assert.deepEqual(filterAccountArchive(users, "archived"), [users[1]]);
  assert.deepEqual(filterAccountArchive(users, "all"), users);
  assert.equal(users[1].status, "inactive");
  assert.deepEqual(filterAccountArchive([]), []);
});
