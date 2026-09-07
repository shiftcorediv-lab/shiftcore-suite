(function (root) {
  // 反復受注は新規登録。ID・状態・過去の日付・配置・監査情報は引き継がない。
  const mapping = {
    caseType: 'case_type', shiftcoreDisplayName: 'shiftcore_display_name',
    inputMode: 'input_mode', agencyName: 'agency_name', agencyId: 'agency_id',
    storeName: 'store_name', storeArea: 'store_area', workLocation: 'work_location',
    workAddress: 'work_address', workNearestStation: 'work_nearest_station', workArea: 'work_area',
    workStartTime: 'work_start_time', workEndTime: 'work_end_time', meetingTime: 'meeting_time',
    meetingPlace: 'meeting_place', requiredSkill: 'required_skill', requestedDays: 'requested_days',
    amount: 'amount', amountMemo: 'amount_memo', taxType: 'tax_type',
    clientMemo: 'client_memo', internalMemo: 'internal_memo', operationMemo: 'operation_memo'
  };
  root.OrderCaseRepeatPolicy = {buildFields(item, stores = []) {
    const fields = Object.fromEntries(Object.entries(mapping).map(([id, key]) => [id, item[key] ?? '']));
    // 古い単価区分を新しい区分へ勝手に換算しない。
    fields.amountType = ['', 'per_person_day', 'per_case'].includes(item.amount_type) ? item.amount_type : '';
    if (!fields.amountType) fields.amount = '';
    const store = stores.find(row => row.store_id === item.store_id) || {};
    fields.storeShortName = store.store_short_name || '';
    fields.storeAddress = store.address || '';
    fields.storeNearestStation = store.nearest_station || '';
    return fields;
  }};
})(window);
