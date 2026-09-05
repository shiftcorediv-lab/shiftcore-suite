/****************************************************
 * Service_AgenciesMaster.gs
 * agencies_master の処理
 ****************************************************/

const AGENCIES_MASTER_HEADERS = [
  'agency_id',
  'agency_name',
  'agency_short_name',
  'preferred_member_ids',
  'ng_member_ids',
  'preferred_note',
  'ng_note',
  'contact_name',
  'phone',
  'email',
  'memo',
  'status',
  'provisional',
  'created_from_case_id',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by'
];

function getAgencyMasterRows_() {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_AGENCIES_MASTER);
  if (sheet) return getSheetObjects_(SHEET_AGENCIES_MASTER);

  // 移行前の公開でも既存画面を壊さない読取専用フォールバック。
  const agencies = {};
  getSheetObjects_(SHEET_STORES_MASTER).forEach(function(store) {
    const name = String(store.agency_name || '').trim();
    const key = normalizeMasterName_(name);
    if (!key || agencies[key]) return;
    agencies[key] = {
      agency_id: String(store.agency_id || '').trim(),
      agency_name: name,
      status: 'active',
      provisional: 'TRUE'
    };
  });
  return Object.keys(agencies).map(function(key) { return agencies[key]; });
}

function requireAgenciesMasterSheet_() {
  if (!getSpreadsheet_().getSheetByName(SHEET_AGENCIES_MASTER)) {
    throw new Error('代理店マスターの初期移行が必要です。管理者へ連絡してください。');
  }
}

function getActiveAgenciesMaster_() {
  return getAgencyMasterRows_().filter(function(row) {
    return String(row.status || 'active') === 'active';
  });
}

function getAgenciesMasterForManagement_() {
  return getAgencyMasterRows_();
}

function findAgencyMasterById_(agencyId) {
  const target = String(agencyId || '').trim();
  if (!target) return null;
  return getAgencyMasterRows_().find(function(row) {
    return String(row.agency_id || '').trim() === target;
  }) || null;
}

function findAgencyMasterByName_(agencyName) {
  const target = normalizeMasterName_(agencyName);
  if (!target) return null;
  return getAgencyMasterRows_().find(function(row) {
    return normalizeMasterName_(row.agency_name) === target;
  }) || null;
}

function normalizeAgencyStatus_(value) {
  const status = String(value || 'active').trim();
  if (status === 'active' || status === 'archived') return status;
  throw new Error('代理店状態は「有効」または「アーカイブ」を指定してください。');
}

function normalizeAgencyMemberIds_(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\s,、]+/);
  const seen = {};
  const normalized = [];

  source.forEach(function(item) {
    const memberId = String(item || '').trim();
    const key = memberId.toLowerCase();
    if (!memberId || seen[key]) return;
    if (memberId.length > 100 || !/^[A-Za-z0-9@._+-]+$/.test(memberId)) {
      throw new Error('指名・NGにはメンバー内部IDまたはアカウントコードを指定してください。');
    }
    seen[key] = true;
    normalized.push(memberId);
  });

  if (normalized.length > 100) {
    throw new Error('指名・NGは各100名まで指定できます。');
  }

  return normalized.join(',');
}

function validateAgencyMemberRules_(preferredMemberIds, ngMemberIds) {
  const ngKeys = String(ngMemberIds || '').split(',').map(function(value) {
    return value.toLowerCase();
  }).filter(Boolean);
  const duplicated = String(preferredMemberIds || '').split(',').find(function(value) {
    return value && ngKeys.indexOf(value.toLowerCase()) !== -1;
  });
  if (duplicated) {
    throw new Error('同じメンバーを指名とNGの両方には登録できません: ' + duplicated);
  }
}

function generateAgencyId_() {
  const ids = [];
  getAgencyMasterRows_().forEach(function(row) {
    ids.push(String(row.agency_id || ''));
  });
  getSheetObjects_(SHEET_STORES_MASTER).forEach(function(row) {
    ids.push(String(row.agency_id || ''));
  });
  const maxNumber = ids.reduce(function(maxValue, value) {
    const match = /^AG-(\d+)$/.exec(value.trim());
    return match ? Math.max(maxValue, Number(match[1])) : maxValue;
  }, 0);
  return 'AG-' + String(maxNumber + 1).padStart(4, '0');
}

function buildAgencyMasterRecord_(payload, current, context) {
  const source = current || {};
  const input = payload || {};
  const preferredMemberIds = normalizeAgencyMemberIds_(input.preferred_member_ids);
  const ngMemberIds = normalizeAgencyMemberIds_(input.ng_member_ids);
  validateAgencyMemberRules_(preferredMemberIds, ngMemberIds);

  const record = {
    agency_name: String(input.agency_name || '').trim(),
    agency_short_name: String(input.agency_short_name || '').trim(),
    preferred_member_ids: preferredMemberIds,
    ng_member_ids: ngMemberIds,
    preferred_note: String(input.preferred_note || '').trim(),
    ng_note: String(input.ng_note || '').trim(),
    contact_name: String(input.contact_name || '').trim(),
    phone: String(input.phone || '').trim(),
    email: String(input.email || '').trim().toLowerCase(),
    memo: String(input.memo || '').trim(),
    status: normalizeAgencyStatus_(input.status || source.status),
    provisional: String(input.provisional !== undefined ? input.provisional : source.provisional || 'FALSE').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE',
    created_from_case_id: String(source.created_from_case_id || input.created_from_case_id || '').trim(),
    updated_at: new Date(),
    updated_by: String(context && context.user && (context.user.name || context.user.email) || input.updated_by || '').trim()
  };

  if (!record.agency_name) throw new Error('代理店名は必須です。');
  if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) {
    throw new Error('メールアドレスの形式を確認してください。');
  }
  return record;
}

function assertUniqueAgencyName_(agencyName, excludedAgencyId) {
  const target = normalizeMasterName_(agencyName);
  const duplicate = getAgencyMasterRows_().find(function(row) {
    return normalizeMasterName_(row.agency_name) === target &&
      String(row.agency_id || '').trim() !== String(excludedAgencyId || '').trim();
  });
  if (duplicate) {
    throw new Error('同じ代理店名がすでに登録されています: ' + duplicate.agency_name);
  }
}

function createAgencyMaster_(payload, context) {
  requireAgenciesMasterSheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    assertUniqueAgencyName_(payload && payload.agency_name, '');
    const now = new Date();
    const record = buildAgencyMasterRecord_(payload, {}, context);
    record.agency_id = generateAgencyId_();
    record.created_at = now;
    record.created_by = record.updated_by;
    record.updated_at = now;
    appendObjectRow_(SHEET_AGENCIES_MASTER, record);
    return record;
  } finally {
    lock.releaseLock();
  }
}

function countActiveStoresForAgency_(agencyId) {
  return getSheetObjects_(SHEET_STORES_MASTER).filter(function(row) {
    return String(row.agency_id || '').trim() === String(agencyId || '').trim() &&
      String(row.status || 'active') === 'active';
  }).length;
}

function syncAgencyNameToStores_(agencyId, agencyName) {
  const sheet = getSheet_(SHEET_STORES_MASTER);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(function(value) { return String(value || '').trim(); });
  const idIndex = headers.indexOf('agency_id');
  const nameIndex = headers.indexOf('agency_name');
  if (idIndex === -1 || nameIndex === -1) return;
  let changed = false;
  for (let index = 1; index < values.length; index++) {
    if (String(values[index][idIndex] || '').trim() !== String(agencyId || '').trim()) continue;
    values[index][nameIndex] = agencyName;
    changed = true;
  }
  if (changed) sheet.getRange(2, 1, values.length - 1, headers.length).setValues(values.slice(1));
}

function updateAgencyMaster_(payload, context) {
  requireAgenciesMasterSheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const agencyId = String(payload && payload.agency_id || '').trim();
    if (!agencyId) throw new Error('代理店IDが必要です。');
    const sheet = getSheet_(SHEET_AGENCIES_MASTER);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(function(value) { return String(value || '').trim(); });
    const idIndex = headers.indexOf('agency_id');
    let targetIndex = -1;
    for (let index = 1; index < values.length; index++) {
      if (String(values[index][idIndex] || '').trim() === agencyId) { targetIndex = index; break; }
    }
    if (targetIndex < 1) throw new Error('代理店が見つかりません: ' + agencyId);
    const current = {};
    headers.forEach(function(header, index) { current[header] = values[targetIndex][index]; });
    assertUniqueAgencyName_(payload.agency_name, agencyId);
    const record = buildAgencyMasterRecord_(payload, current, context);
    if (record.status === 'archived' && countActiveStoresForAgency_(agencyId) > 0) {
      throw new Error('有効な店舗が残っているため代理店をアーカイブできません。');
    }
    headers.forEach(function(header, index) {
      if (Object.prototype.hasOwnProperty.call(record, header)) values[targetIndex][index] = record[header];
    });
    sheet.getRange(targetIndex + 1, 1, 1, headers.length).setValues([values[targetIndex]]);
    syncAgencyNameToStores_(agencyId, record.agency_name);
    return Object.assign({ agency_id: agencyId }, record);
  } finally {
    lock.releaseLock();
  }
}

function ensureAgencyMaster_(payload, caseId) {
  const agencyId = String(payload && payload.agency_id || '').trim();
  const agencyName = String(payload && payload.agency_name || '').trim();
  let agency = agencyId ? findAgencyMasterById_(agencyId) : null;
  if (!agency && agencyName) agency = findAgencyMasterByName_(agencyName);
  if (agency) {
    if (String(agency.status || 'active') === 'archived') {
      throw new Error('この代理店はアーカイブ済みです。代理店マスターで復元してください。');
    }
    return agency;
  }
  if (!agencyName) throw new Error('代理店名は必須です。');
  requireAgenciesMasterSheet_();
  const now = new Date();
  const record = {
    agency_id: generateAgencyId_(),
    agency_name: agencyName,
    agency_short_name: '',
    preferred_member_ids: '',
    ng_member_ids: '',
    preferred_note: '',
    ng_note: '',
    contact_name: '',
    phone: '',
    email: '',
    memo: '案件登録時に自動仮登録',
    status: 'active',
    provisional: 'TRUE',
    created_from_case_id: String(caseId || ''),
    created_at: now,
    created_by: '',
    updated_at: now,
    updated_by: ''
  };
  appendObjectRow_(SHEET_AGENCIES_MASTER, record);
  return record;
}

function buildAgenciesMasterMigrationPlan_() {
  const stores = getSheetObjects_(SHEET_STORES_MASTER);
  const grouped = {};
  stores.forEach(function(store) {
    const name = String(store.agency_name || '').trim();
    const key = normalizeMasterName_(name);
    if (!key) return;
    if (!grouped[key]) grouped[key] = { agency_name: name, stores: [] };
    grouped[key].stores.push(store);
  });
  return Object.keys(grouped).sort().map(function(key) {
    const group = grouped[key];
    const legacyIds = group.stores.map(function(store) { return String(store.agency_id || '').trim(); }).filter(Boolean);
    return {
      agency_name: group.agency_name,
      preferred_agency_id: legacyIds.sort()[0] || '',
      store_ids: group.stores.map(function(store) { return String(store.store_id || '').trim(); }).filter(Boolean),
      legacy_agency_ids: legacyIds
    };
  });
}

// 本番データへは公開とは別の承認を得て、Apps Scriptエディタから一度だけ実行する。
function setupAgenciesMasterFromStores() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = getSpreadsheet_();
    let agencySheet = spreadsheet.getSheetByName(SHEET_AGENCIES_MASTER);
    if (!agencySheet) {
      agencySheet = spreadsheet.insertSheet(SHEET_AGENCIES_MASTER);
      agencySheet.getRange(1, 1, 1, AGENCIES_MASTER_HEADERS.length).setValues([AGENCIES_MASTER_HEADERS]);
    }
    const existing = getSheetObjects_(SHEET_AGENCIES_MASTER);
    const existingByName = {};
    existing.forEach(function(row) { existingByName[normalizeMasterName_(row.agency_name)] = row; });
    const plan = buildAgenciesMasterMigrationPlan_();
    const created = [];
    const usedAgencyIds = {};
    existing.forEach(function(row) { usedAgencyIds[String(row.agency_id || '').trim()] = true; });
    plan.forEach(function(item) {
      const key = normalizeMasterName_(item.agency_name);
      if (existingByName[key]) return;
      const now = new Date();
      let agencyId = item.preferred_agency_id;
      if (!agencyId || usedAgencyIds[agencyId]) agencyId = generateAgencyId_();
      usedAgencyIds[agencyId] = true;
      const record = {
        agency_id: agencyId,
        agency_name: item.agency_name,
        agency_short_name: '',
        preferred_member_ids: '',
        ng_member_ids: '',
        preferred_note: '',
        ng_note: '',
        contact_name: '',
        phone: '',
        email: '',
        memo: '店舗マスターから移行',
        status: 'active',
        provisional: 'FALSE',
        created_from_case_id: '',
        created_at: now,
        created_by: Session.getActiveUser().getEmail(),
        updated_at: now,
        updated_by: Session.getActiveUser().getEmail()
      };
      appendObjectRow_(SHEET_AGENCIES_MASTER, record);
      existingByName[key] = record;
      created.push(record.agency_id);
    });

    const storeSheet = getSheet_(SHEET_STORES_MASTER);
    const values = storeSheet.getDataRange().getValues();
    const headers = values[0].map(function(value) { return String(value || '').trim(); });
    const agencyIdIndex = headers.indexOf('agency_id');
    const agencyNameIndex = headers.indexOf('agency_name');
    for (let index = 1; index < values.length; index++) {
      const agency = existingByName[normalizeMasterName_(values[index][agencyNameIndex])];
      if (agency && agencyIdIndex !== -1) values[index][agencyIdIndex] = agency.agency_id;
    }
    if (values.length > 1) storeSheet.getRange(2, 1, values.length - 1, headers.length).setValues(values.slice(1));
    return { created_count: created.length, agency_count: Object.keys(existingByName).length, updated_store_count: Math.max(values.length - 1, 0) };
  } finally {
    lock.releaseLock();
  }
}
