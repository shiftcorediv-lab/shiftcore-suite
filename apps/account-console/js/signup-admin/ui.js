import {
  userNameBox,
  employeeCodeBox,
  accountMetaArea,
  entryBannerArea,
  messageBox,
  requestListArea,
  detailSubmittedAt,
  detailApplicantName,
  detailApplicantEmail,
  detailApplicantType,
  detailCompanyName,
  detailPhone,
  detailNote,
  roleSelect,
  organizationIdInput,
  allowedModulesInput,
  statusSelect,
  workStatusSelect,
  approveBtn,
  rejectBtn
} from "./dom.js";

const ACCOUNT_TYPE_LABELS = {
  employee: "弊社内人員",
  member: "弊社内人員",
  internal: "弊社内人員",
  admin: "管理者",
  dev: "開発管理者",
  developer: "開発管理者",
  partner_individual: "アライアンス個人",
  alliance_individual: "アライアンス個人",
  partner_company: "アライアンス法人",
  partner_company_admin: "アライアンス法人 管理者",
  alliance_company: "アライアンス法人",
  alliance_company_admin: "アライアンス法人 管理者",
  agency: "代理店"
};

const STATUS_LABELS = {
  active: "有効",
  inactive: "停止",
  pending: "確認待ち",
  pending_approval: "承認待ち"
};

const WORK_STATUS_LABELS = {
  on: "稼働対象",
  off: "稼働対象外",
  active: "稼働対象",
  inactive: "稼働対象外",
  available: "稼働対象",
  unavailable: "稼働対象外"
};

function normalizeKey(value) {
  return String(value || "").trim();
}

function labelFromMap(value, map, fallback = "未設定") {
  const key = normalizeKey(value);
  if (!key) return fallback;
  return map[key] || key;
}

export function setInfoBox(target, text, type = "") {
  target.textContent = text;
  target.className = "info-box";
  if (type) target.classList.add(type);
}

export function showMessage(text, type = "") {
  messageBox.textContent = text;
  messageBox.className = "message";
  if (type) messageBox.classList.add(type);
}

export function renderAccountInfo(currentUser) {
  setInfoBox(
    userNameBox,
    currentUser.displayName || "ユーザー情報を取得できませんでした",
    currentUser.displayName ? "success" : "error"
  );

  setInfoBox(
    employeeCodeBox,
    currentUser.employeeCode || "アカウントコードを取得できませんでした",
    currentUser.employeeCode ? "success" : "error"
  );

  accountMetaArea.innerHTML = "";

  const roleBadge = document.createElement("span");
  roleBadge.className = "badge";
  roleBadge.textContent = "アカウント種別：" + labelFromMap(currentUser.role, ACCOUNT_TYPE_LABELS);

  const workStatusBadge = document.createElement("span");
  workStatusBadge.className = "badge";
  workStatusBadge.textContent = "稼働対象状態：" + labelFromMap(currentUser.workStatus, WORK_STATUS_LABELS);

  accountMetaArea.appendChild(roleBadge);
  accountMetaArea.appendChild(workStatusBadge);
}

export function setupShiftCoreEntryBanner(params) {
  if ((params.from || "") !== "shiftcore") return;

  const banner = document.createElement("div");
  banner.style.margin = "0 auto 16px";
  banner.style.padding = "12px 14px";
  banner.style.borderRadius = "12px";
  banner.style.background = "#eef3ff";
  banner.style.border = "1px solid #cfdcff";
  banner.style.fontSize = "14px";
  banner.style.lineHeight = "1.6";
  banner.innerHTML = `
  <div><strong>Account Consoleから移動しました</strong></div>
`;
  entryBannerArea.appendChild(banner);
}

export function renderRequestList(requests, onSelect) {
  requestListArea.innerHTML = "";

  if (!Array.isArray(requests) || requests.length === 0) {
    requestListArea.innerHTML = "<div class='request-item'><div class='request-item-header'>申請はありません</div></div>";
    return;
  }

  requests.forEach((request) => {
    const item = document.createElement("div");
    item.className = "request-item";

    const header = document.createElement("div");
    header.className = "request-item-header";
    header.textContent = request.submitted_at || "";

    const sub = document.createElement("div");
    sub.className = "request-item-sub";
    sub.textContent = `${request.applicant_name || ""} / ${request.applicant_email || ""}`;

    const button = document.createElement("button");
    button.className = "open-btn";
    button.type = "button";
    button.textContent = "詳細を見る";
    button.addEventListener("click", () => onSelect(request));

    item.appendChild(header);
    item.appendChild(sub);
    item.appendChild(button);
    requestListArea.appendChild(item);
  });
}

export function renderRequestDetail(request) {
  detailSubmittedAt.textContent = request?.submitted_at || "未選択";
  detailApplicantName.textContent = request?.applicant_name || "未選択";
  detailApplicantEmail.textContent = request?.applicant_email || "未選択";
  detailApplicantType.textContent = labelFromMap(request?.applicant_type, ACCOUNT_TYPE_LABELS, "未選択");
  detailCompanyName.textContent = request?.company_name || "";
  detailPhone.textContent = request?.phone || "";
  detailNote.textContent = request?.note || "";
}

export function applyApprovalDefaults(request) {
  const type = String(request?.applicant_type || "").trim();
  const companyName = String(request?.company_name || "").trim();

  if (type === "employee" || type === "member" || type === "internal") {
    roleSelect.value = "employee";
    organizationIdInput.value = "internal";
    allowedModulesInput.value = "pmo";
    statusSelect.value = "active";
    workStatusSelect.value = "on";
    return;
  }

  if (type === "partner_individual" || type === "alliance_individual") {
    roleSelect.value = "partner_individual";
    organizationIdInput.value = companyName;
    allowedModulesInput.value = "pmo";
    statusSelect.value = "active";
    workStatusSelect.value = "on";
    return;
  }

  if (type === "partner_company_admin" || type === "alliance_company_admin") {
    roleSelect.value = "partner_company_admin";
    organizationIdInput.value = companyName;
    allowedModulesInput.value = "partner_hub";
    statusSelect.value = "active";
    workStatusSelect.value = "on";
    return;
  }

  roleSelect.value = "";
  organizationIdInput.value = "";
  allowedModulesInput.value = "";
  statusSelect.value = "active";
  workStatusSelect.value = "on";
}

export function getApprovalSummary() {
  return [
    `アカウント種別：${labelFromMap(roleSelect.value, ACCOUNT_TYPE_LABELS)}`,
    `所属ID / 所属名：${organizationIdInput.value.trim() || "未入力"}`,
    `利用可能機能：${allowedModulesInput.value.trim() || "未入力"}`,
    `アカウント状態：${labelFromMap(statusSelect.value, STATUS_LABELS)}`,
    `稼働対象状態：${labelFromMap(workStatusSelect.value, WORK_STATUS_LABELS)}`
  ].join("\n");
}

export function setActionButtonsEnabled(enabled) {
  approveBtn.disabled = !enabled;
  rejectBtn.disabled = !enabled;
}
