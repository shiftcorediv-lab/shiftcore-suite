// 先行する非同期保存が完了しても、別セルで進行中の操作は再描画しない。
export function shouldRefreshActionPopoverForCell(
  activeMode,
  activeKey,
  changedCellKey
) {
  if (activeMode !== "action") {
    return false;
  }

  if (!changedCellKey?.caseId || !changedCellKey?.date) {
    return true;
  }

  return (
    activeKey?.caseId === changedCellKey.caseId &&
    activeKey?.date === changedCellKey.date
  );
}

export function resolvePopoverAnchorTarget(activeMode, activeKey) {
  if (
    ["action", "preview"].includes(activeMode) &&
    activeKey?.caseId &&
    activeKey?.date
  ) {
    return {
      axis: "case",
      id: String(activeKey.caseId),
      date: String(activeKey.date)
    };
  }

  if (
    ["personnel", "personnel-preview"].includes(activeMode) &&
    activeKey?.personId &&
    activeKey?.date
  ) {
    return {
      axis: "personnel",
      id: String(activeKey.personId),
      date: String(activeKey.date)
    };
  }

  return null;
}

export function wasPopoverAnchorFocused(activeElement, previousAnchor) {
  return Boolean(previousAnchor && activeElement === previousAnchor);
}
