// 状態だけの変更に、旧登録データの補完や権限の再設定を要求しない。
export function statusOnlyChange(user, baseline) {
  return Boolean(baseline && user.internal_user_id &&
    user.internal_user_id === baseline.internal_user_id &&
    user.status !== baseline.status &&
    Object.keys(user).every(key => key === "status" || user[key] === baseline[key]));
}
