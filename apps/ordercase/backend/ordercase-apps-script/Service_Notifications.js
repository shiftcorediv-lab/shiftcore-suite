/****************************************************
 * Service_Notifications.gs
 * メール通知
 ****************************************************/

function sendCreateCaseNotification_(caseRecord, caseDates, createdByEmail) {
  const settings = getSettingsMap_();

  const fixedRecipients = splitEmails_(settings.ordercase_notify_emails || '');
  const recipients = fixedRecipients.slice();

  if (createdByEmail) {
    recipients.push(createdByEmail);
  }

  const uniqueRecipients = Array.from(new Set(recipients.filter(function(email) {
    return email && email.indexOf('@') !== -1;
  })));

  if (uniqueRecipients.length === 0) {
    return;
  }

  const envMode = settings.env_mode || 'dev';
  const listUrl = settings.ordercase_list_url || '';

  const subjectPrefix = envMode === 'prod' ? '' : '[' + envMode + '] ';
  const subject = subjectPrefix + 'OrderCase 新規案件登録: ' + caseRecord.case_id;

  const body = buildCreateCaseNotificationBody_(caseRecord, caseDates, listUrl);

  MailApp.sendEmail({
    to: uniqueRecipients.join(','),
    subject: subject,
    body: body
  });
}

function buildCreateCaseNotificationBody_(caseRecord, caseDates, listUrl) {
  const dateText = caseDates.length > 0
    ? caseDates.map(function(row) {
        return row.work_date + ' / ' + row.required_lines + '枠 / ' + row.required_people + '人';
      }).join('\n')
    : '希望日数: ' + caseRecord.requested_days;

  const lines = [
    'OrderCaseに新しい案件が登録されました。',
    '',
    '案件ID: ' + caseRecord.case_id,
    '対象月: ' + caseRecord.target_month,
    '案件種別: ' + caseRecord.case_type,
    'ステータス: ' + caseRecord.status,
    '',
    '代理店: ' + caseRecord.agency_name,
    '連携店舗: ' + caseRecord.store_name,
    '連携店舗エリア: ' + caseRecord.store_area,
    '実稼働場所: ' + caseRecord.work_location,
    '実稼働エリア: ' + caseRecord.work_area,
    '',
    '入力方式: ' + caseRecord.input_mode,
    '日付/日数:',
    dateText,
    '',
    '必要枠数: ' + caseRecord.required_lines,
    '1枠あたり人数: ' + caseRecord.people_per_line,
    '必要人数: ' + caseRecord.required_people,
    '',
    '登録者: ' + caseRecord.created_by,
    '登録日時: ' + formatDate_(caseRecord.created_at, 'yyyy-MM-dd HH:mm:ss')
  ];

  if (listUrl) {
    lines.push('');
    lines.push('OrderCase一覧: ' + listUrl);
  }

  return lines.join('\n');
}