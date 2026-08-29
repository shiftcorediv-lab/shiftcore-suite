export function buildPortalEntryUrl(portal) {
  const configuredUrl = String(portal?.entry_url || "").trim();
  if (!configuredUrl) return "";

  try {
    const target = new URL(configuredUrl);
    if (target.protocol !== "https:" || target.username || target.password) return "";
    target.searchParams.set("from", "ap");
    target.searchParams.set("entry", "clock-in");
    return target.toString();
  } catch (_) {
    return "";
  }
}
