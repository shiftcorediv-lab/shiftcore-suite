/****************************************************
 * Test_OrderCase.gs
 * GAS上で直接実行するテスト
 ****************************************************/

function testCreateCase() {
  const payload = {
    target_month: '2026-06',
    request_date: '2026-05-22',
    reply_deadline: '2026-05-31',

    case_type: 'event_sales',
    input_mode: 'dates',

    agency_name: 'テスト代理店',
    store_name: 'テスト連携店舗',
    store_area: '関西',

    work_location: 'テスト会場 1F催事スペース',
    work_area: '関西',
    work_start_time: '10:00',
    work_end_time: '18:00',
    meeting_time: '09:30',
    meeting_place: '正面入口前',

    required_lines: 1,
    people_per_line: 2,
    required_skill: 'multi_complete',

    amount: '',
    amount_type: '',
    tax_type: '',
    amount_memo: '金額は後日確認',

    client_memo: '先方メモテスト',
    internal_memo: '社内メモテスト',
    operation_memo: '黒パンツ着用',

    created_by: 'テスト登録者',
    created_by_email: '',

    case_dates: [
      {
        work_date: '2026-06-08',
        required_lines: 1,
        people_per_line: 2,
        memo: ''
      },
      {
        work_date: '2026-06-09',
        required_lines: 1,
        people_per_line: 2,
        memo: '2日目'
      }
    ]
  };

  const result = createCase_(payload);
  Logger.log(JSON.stringify(result, null, 2));
}

function testBuildShiftAssignmentArchivePlan() {
  const values = [
    [
      'assignment_id',
      'case_id',
      'assignment_status',
      'change_reason_type',
      'change_memo',
      'updated_at',
      'updated_by',
      'archived'
    ],
    ['A1', 'CASE-1', 'draft', '', '', '', '', false],
    ['A2', 'CASE-1', 'archived', '', '', '', '', true],
    ['A3', 'CASE-1', 'archived', 'case_cancelled', '', '', '', false],
    ['A4', 'CASE-1', 'archived', 'case_archived', '', '', '', false],
    ['A5', 'CASE-2', 'draft', '', '', '', '', false]
  ];
  const plan = buildShiftAssignmentArchivePlan_(values, 'CASE-1');

  if (JSON.stringify(plan.active_row_numbers) !== JSON.stringify([2])) {
    throw new Error('active row plan が不正です。');
  }

  if (JSON.stringify(plan.repair_row_numbers) !== JSON.stringify([4, 5])) {
    throw new Error('repair row plan が不正です。');
  }

  if (JSON.stringify(plan.target_row_numbers) !== JSON.stringify([2, 4, 5])) {
    throw new Error('target row plan が不正です。');
  }

  console.log(JSON.stringify(plan));
}

function testBuildAlternateTimeWorkerPayload() {
  const payload = {
    work_start_time: '10:00',
    work_end_time: '18:00',
    amount: '20000',
    amount_type: 'per_person_day',
    alternate_work_start_time: '10:30',
    alternate_work_end_time: '17:30',
    alternate_amount_enabled: true,
    alternate_amount: '18000',
    case_dates: [{ work_date: '2026-08-10', memo: '' }]
  };
  const normal = buildSinglePersonCasePayload_(payload, {
    case_group_id: 'CG-1', copy_index: 1, copy_count: 3
  }, { use_alternate_conditions: false });
  const alternate = buildSinglePersonCasePayload_(payload, {
    case_group_id: 'CG-1', copy_index: 3, copy_count: 3
  }, { use_alternate_conditions: true });

  if (normal.work_start_time !== '10:00' || normal.amount !== '20000') {
    throw new Error('基本コマの時刻または単価が不正です。');
  }
  if (alternate.work_start_time !== '10:30' || alternate.work_end_time !== '17:30') {
    throw new Error('異なる時間帯の時刻が不正です。');
  }
  if (alternate.amount !== '18000') {
    throw new Error('異なる時間帯の単価が不正です。');
  }
}

function testValidateWorkTimeRange() {
  validateWorkTimeRange_('10:00', '18:00', 'テスト時間');

  let failed = false;
  try {
    validateWorkTimeRange_('18:00', '10:00', 'テスト時間');
  } catch (error) {
    failed = true;
  }
  if (!failed) throw new Error('終了時刻が開始時刻以前の入力を拒否できていません。');
}

function testPerCaseAmountIsStoredOnce() {
  const payload = {
    amount: '300000',
    amount_type: 'per_case',
    case_dates: []
  };
  const first = buildSinglePersonCasePayload_(payload, {
    case_group_id: 'CG-1', copy_index: 1, copy_count: 3
  });
  const second = buildSinglePersonCasePayload_(payload, {
    case_group_id: 'CG-1', copy_index: 2, copy_count: 3
  });

  if (first.amount !== '300000' || second.amount !== '') {
    throw new Error('案件一式の総額が兄弟コマへ重複保存されています。');
  }
}

function auditCancelledCaseAssignmentsDryRun() {
  const audit = auditCaseAssignmentsByStatusesDryRun_(['cancelled']);
  const result = {
    cancelled_case_count: audit.inactive_case_count,
    affected_case_count: audit.affected_case_count,
    active_assignment_count: audit.active_assignment_count,
    partial_repair_count: audit.partial_repair_count,
    cases: audit.cases
  };

  console.log(JSON.stringify(result));
  return result;
}

function auditInactiveCaseAssignmentsDryRun() {
  const result = auditCaseAssignmentsByStatusesDryRun_(['cancelled', 'archived']);
  console.log(JSON.stringify(result));
  return result;
}

function auditCaseAssignmentsByStatusesDryRun_(statuses) {
  const normalizedStatuses = (statuses || []).map(function(status) {
    return String(status || '').trim().toLowerCase();
  }).filter(function(status) {
    return status;
  });
  const inactiveCases = getSheetObjects_(SHEET_CASES)
    .map(function(caseRow) {
      return {
        case_id: String(caseRow.case_id || '').trim(),
        status: String(caseRow.status || '').trim().toLowerCase()
      };
    })
    .filter(function(caseRow) {
      return caseRow.case_id && normalizedStatuses.indexOf(caseRow.status) !== -1;
    });
  const values = getShiftAssignmentsSheetForOrderCase_().getDataRange().getValues();
  const cases = inactiveCases.map(function(caseRow) {
    const plan = buildShiftAssignmentArchivePlan_(values, caseRow.case_id);
    return {
      case_id: caseRow.case_id,
      status: caseRow.status,
      active_assignment_count: plan.active_row_numbers.length,
      partial_repair_count: plan.repair_row_numbers.length,
      assignment_ids: plan.assignment_ids
    };
  }).filter(function(item) {
    return item.active_assignment_count > 0 || item.partial_repair_count > 0;
  });
  const statusCounts = inactiveCases.reduce(function(counts, caseRow) {
    counts[caseRow.status] = (counts[caseRow.status] || 0) + 1;
    return counts;
  }, {});

  return {
    inactive_case_count: inactiveCases.length,
    status_counts: statusCounts,
    affected_case_count: cases.length,
    active_assignment_count: cases.reduce(function(total, item) {
      return total + item.active_assignment_count;
    }, 0),
    partial_repair_count: cases.reduce(function(total, item) {
      return total + item.partial_repair_count;
    }, 0),
    cases: cases
  };
}
