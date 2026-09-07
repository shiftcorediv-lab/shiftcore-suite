export function memberManagementLinks(person, month = '') {
  const make = (path, extra = {}) => {
    const url = new URL(path, import.meta.url);
    url.searchParams.set('target_member', person.id || person.internal_user_id || '');
    if (month) url.searchParams.set('target_month', month);
    Object.entries(extra).forEach(([key, value]) => url.searchParams.set(key, value || ''));
    return window.ShiftCoreEnvironment?.withEnvironment(url.href) || url.href;
  };
  return {
    account: make('../account-console/account-console.html'),
    off: make('../account-console/pmo-admin.html', {member_code: person.accountCode || person.employee_code || person.account_code}),
    rules: make('../ordercase/member-rules.html', {
      member_code: person.accountCode || person.employee_code || person.account_code,
      member_name: person.displayName || person.display_name || person.name
    })
  };
}
