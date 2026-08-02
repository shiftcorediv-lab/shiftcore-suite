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
  return String(a?.name || a?.display_name || "").localeCompare(
    String(b?.name || b?.display_name || ""),
    "ja"
  );
}
