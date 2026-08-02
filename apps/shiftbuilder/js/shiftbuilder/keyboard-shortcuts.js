export function getMonthShortcutOffset(key) {
  if (key === "," || key === "<" || key === "＜") return -1;
  if (key === "." || key === ">" || key === "＞") return 1;
  return 0;
}

export function isTableNavigationKey(key) {
  return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key);
}
