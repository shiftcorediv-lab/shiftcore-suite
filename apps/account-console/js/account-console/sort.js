import { resolveAccountFullName } from "./name-policy.mjs?v=20260902-name-sync-1";

function sortOrderValue(user) {
  const raw = user?.sort_order ?? user?.sortOrder ?? "";
  const value = Number(raw);
  return {
    hasOrder: String(raw).trim() !== "" && Number.isFinite(value),
    value
  };
}

export function compareUsersBySortOrder(a, b) {
  const aOrder = sortOrderValue(a);
  const bOrder = sortOrderValue(b);
  if (aOrder.hasOrder !== bOrder.hasOrder) return aOrder.hasOrder ? -1 : 1;
  if (aOrder.hasOrder && aOrder.value !== bOrder.value) return aOrder.value - bOrder.value;
  return String(resolveAccountFullName(a) || a?.display_name || "").localeCompare(
    String(resolveAccountFullName(b) || b?.display_name || ""),
    "ja"
  );
}
