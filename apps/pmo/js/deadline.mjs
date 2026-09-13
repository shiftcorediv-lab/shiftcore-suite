export function deadlineText(deadlineAt, now) {
  const remaining = Date.parse(deadlineAt) - now;
  if (!Number.isFinite(remaining)) return "締切を確認できません";
  if (remaining <= 0) return "締切を過ぎています（提出・修正は可能です）";
  const seconds = Math.ceil(remaining / 1000);
  return `締切まで ${Math.floor(seconds / 86400)}日 ${String(Math.floor(seconds / 3600) % 24).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
