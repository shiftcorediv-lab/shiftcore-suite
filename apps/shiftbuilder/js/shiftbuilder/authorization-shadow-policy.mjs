export async function runAuthorizationShadowCheck(idToken, requestAuthorization, logger = console) {
  if (!idToken || typeof requestAuthorization !== "function") {
    return { attempted: false, healthy: false };
  }

  try {
    const result = await requestAuthorization(idToken);
    return {
      attempted: true,
      healthy: result?.ok === true && result?.authorization?.shadow?.healthy !== false
    };
  } catch (error) {
    logger?.warn?.("[ShiftBuilder] Authorization Shadow check failed", error);
    return { attempted: true, healthy: false };
  }
}
