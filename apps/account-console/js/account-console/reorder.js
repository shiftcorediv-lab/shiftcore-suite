export function normalizeSortOrder(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 1 ? normalized : null;
}

export function planSortOrderUpdates(users, targetUserId, previousOrderValue, nextOrderValue) {
  const previousOrder = normalizeSortOrder(previousOrderValue);
  const nextOrder = normalizeSortOrder(nextOrderValue);
  if (previousOrder === nextOrder) return [];

  return (Array.isArray(users) ? users : []).flatMap(user => {
    if (String(user?.internal_user_id || "") === String(targetUserId || "")) return [];
    const currentOrder = normalizeSortOrder(user?.sort_order ?? user?.sortOrder);
    if (currentOrder === null) return [];

    let shiftedOrder = currentOrder;
    if (previousOrder === null && nextOrder !== null && currentOrder >= nextOrder) {
      shiftedOrder = currentOrder + 1;
    } else if (previousOrder !== null && nextOrder === null && currentOrder > previousOrder) {
      shiftedOrder = currentOrder - 1;
    } else if (previousOrder !== null && nextOrder !== null && nextOrder < previousOrder && currentOrder >= nextOrder && currentOrder < previousOrder) {
      shiftedOrder = currentOrder + 1;
    } else if (previousOrder !== null && nextOrder !== null && nextOrder > previousOrder && currentOrder > previousOrder && currentOrder <= nextOrder) {
      shiftedOrder = currentOrder - 1;
    }

    return shiftedOrder === currentOrder ? [] : [{ user, from: currentOrder, to: shiftedOrder }];
  });
}
