export class MutationSessionRequiredError extends Error {
  constructor(session) {
    super("ログイン状態を確認できませんでした。ダッシュボードから再ログインしてください。");
    this.name = "MutationSessionRequiredError";
    this.code = "MUTATION_SESSION_REQUIRED";
    this.session = session || null;
  }
}

export function assertMutationSession(session) {
  if (!session?.isLoggedIn || !session?.idToken) {
    throw new MutationSessionRequiredError(session);
  }

  return session;
}

export function isMutationSessionRequiredError(error) {
  return error?.code === "MUTATION_SESSION_REQUIRED";
}

export function restoreAssignedSnapshot(cell, previousAssigned) {
  if (!cell) {
    return false;
  }

  cell.assigned = Array.isArray(previousAssigned) ? [...previousAssigned] : [];
  return true;
}
