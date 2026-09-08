export function createMutationQueue() {
  let tail = Promise.resolve();
  return action => {
    const result = tail.then(action);
    // 1件の失敗で後続の保存まで止めない。失敗は呼出元へ返す。
    tail = result.catch(() => {});
    return result;
  };
}

export function removePendingAssignment(cell, pendingId) {
  if (!cell || !Array.isArray(cell.assigned)) return;
  cell.assigned = cell.assigned.filter(member =>
    String(member.client_pending_id || member.assignment_id || member.assignmentId || '') !== String(pendingId)
  );
}
