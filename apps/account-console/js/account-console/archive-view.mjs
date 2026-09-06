// アーカイブは一覧上の分類のみ。保存済みのアカウント状態は変更しない。
export function filterAccountArchive(users, view = "current") {
  return users.filter(user => {
    const stopped = String(user.status || "").trim().toLowerCase() === "inactive";
    return view === "all" || (view === "archived" ? stopped : !stopped);
  });
}
