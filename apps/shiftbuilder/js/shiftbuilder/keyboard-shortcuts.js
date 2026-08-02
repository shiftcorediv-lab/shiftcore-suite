export function getMonthShortcutOffset(key) {
  if (key === "<" || key === "＜") return -1;
  if (key === ">" || key === "＞") return 1;
  return 0;
}
