import { auth, onAuthStateChanged, signOut } from "../login/auth.js";

function waitForAuthUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user || null);
    });
  });
}

export async function resolveAuthenticatedSession() {
  const firebaseUser = auth.currentUser || await waitForAuthUser();

  if (!firebaseUser || !firebaseUser.email) {
    return {
      ok: false,
      code: "NOT_SIGNED_IN",
      message: "ログインが必要です"
    };
  }

  const idToken = await firebaseUser.getIdToken();

  return {
    ok: true,
    idToken: idToken,
    firebaseUser: {
      email: String(firebaseUser.email || "").trim(),
      displayName: String(firebaseUser.displayName || "").trim()
    }
  };
}

export async function requireAuthenticatedSession() {
  const result = await resolveAuthenticatedSession();

  if (result.ok) {
    return result;
  }

  if (result.code === "NOT_SIGNED_IN") {
    try {
      await signOut(auth);
    } catch (error) {
      // noop
    }
  }

  return result;
}
