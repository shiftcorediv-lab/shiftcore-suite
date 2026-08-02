/****************************************************
 * Config.gs
 * OrderCase API v1 定数
 ****************************************************/

const ORDERCASE_SPREADSHEET_ID = '1NvPCKfzasWo76PqWyG-5uwUqkyLultrSAy09kGuNM1k';
const SHIFTBUILDER_SPREADSHEET_ID = '1qdHuqJZVbA0CNYkZNkET8voEzXpLLxMLtUNSwZZYdr0';

const SHEET_CASES = 'cases';
const SHEET_CASE_DATES = 'case_dates';
const SHEET_CASE_TYPES = 'case_types';
const SHEET_STORES_MASTER = 'stores_master';
const SHEET_SETTINGS = 'settings';
const SHEET_CASE_CHANGE_LOGS = 'case_change_logs';
const SHEET_SHIFT_ASSIGNMENTS = 'shift_assignments';

const DEFAULT_CASE_STATUS = 'received';
const DEFAULT_FOR_SHIFT_BUILDER = 'TRUE';
const DEFAULT_ARCHIVED = 'FALSE';
const DEFAULT_ALLOCATION_STATUS = 'unallocated';

const CHANGE_TYPE_CORRECTION = 'correction';
const CHANGE_TYPE_CONDITION_CHANGE = 'condition_change';
const CHANGE_TYPE_STATUS_CHANGE = 'status_change';
const CHANGE_TYPE_INTERNAL_NOTE = 'internal_note';
const CHANGE_TYPE_OTHER = 'other';

/****************************************************
 * OrderCase 権限連携設定 ここから
 ****************************************************/
const SHIFTCORE_ACCOUNT_API_URL = 'https://script.google.com/macros/s/AKfycbx83rAzXDfQPJUEu9tX4dpULH4QHYUoqfaTnfzzySkW3KjGVbcH4tnq9PKCCvfuEx6eRA/exec';

const ORDERCASE_MODULE_KEY = 'ordercase';

const ORDERCASE_PERMISSION_ALL = 'all';
const ORDERCASE_PERMISSION_EDIT = 'edit';
const ORDERCASE_PERMISSION_VIEW = 'view';
const ORDERCASE_PERMISSION_VIEW_WITHOUT_AMOUNT = 'view_without_amount';

const ORDERCASE_AMOUNT_FIELDS = [
  'amount',
  'amount_type',
  'tax_type',
  'amount_memo'
];
/****************************************************
 * OrderCase 権限連携設定 ここまで
 ****************************************************/