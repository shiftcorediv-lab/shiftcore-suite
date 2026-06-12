import {
  userNameBox,
  employeeCodeBox,
  roleBox,
  accountMetaArea,
  entryBannerArea,
  monthSelect,
  monthHint,
  manageHint,
  messageBox,
  requestTableArea,
  developerToolsCard,
  openMonthlyBtn,
  openRequestBtn,
  refreshTableBtn,
  downloadCsvBtn
} from "./dom.js";

export function setInfoBox(target, text, type = "") {
  target.textContent = text;
  target.className = "info-box";
  if (type) {
    target.classList.add(type);
  }
}

export function showMessage(text, type = "") {
  messageBox.textContent = text;
  messageBox.className = "message";
  if (type) {
    messageBox.classList.add(type);
  }
}

export function renderAccountInfo(currentUser) {
  setInfoBox(
    userNameBox,
    currentUser.displayName || "ユーザー情報を取得できませんでした",
    currentUser.displayName ? "success" : "error"
  );

  setInfoBox(
    employeeCodeBox,
    currentUser.employeeCode || "社員コードを取得できませんでした",
    currentUser.employeeCode ? "success" : "error"
  );

  setInfoBox(
    roleBox,
    currentUser.role || "未設定",
    currentUser.role ? "success" : "error"
  );

  if (accountMetaArea) {
    accountMetaArea.innerHTML = "";
  }
}

export function setupShiftCoreEntryBanner(params) {
  if (!entryBannerArea) return;
  entryBannerArea.innerHTML = "";
}

export function renderMonthOptions(months, selectedYearMonth) {
  monthSelect.innerHTML = "";

  if (!Array.isArray(months) || months.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "選択可能な月がありません";
    monthSelect.appendChild(option);
    monthSelect.disabled = true;
    monthHint.textContent = "選択可能な月がありません。";
    return;
  }

  monthSelect.disabled = false;

  months.forEach((month, index) => {
    const option = document.createElement("option");

    let value = "";
    let label = "";

    if (typeof month === "string") {
      value = month;
      const parts = month.split("-");
      label = parts.length === 2 ? parts[0] + "年" + Number(parts[1]) + "月" : month;
    } else {
      value = month?.value || "";
      label = month?.label || value;
    }

    option.value = value;
    option.textContent = label;

    if (value === selectedYearMonth) {
      option.selected = true;
    }

    monthSelect.appendChild(option);

    if (index === 0 && !selectedYearMonth) {
      monthSelect.value = value;
    }
  });

  if (!monthSelect.value && monthSelect.options.length > 0) {
    monthSelect.selectedIndex = 0;
  }

  monthHint.textContent = "存在する月のみ選択できます。";
}

export function updateManageState(canManage, currentUser = null) {
  const role = String(currentUser?.role || "").trim().toLowerCase();
  const isDeveloper = role === "developer";

  refreshTableBtn.disabled = !canManage;
  downloadCsvBtn.disabled = !canManage;

  if (openMonthlyBtn) {
    openMonthlyBtn.disabled = !isDeveloper;
  }

  if (openRequestBtn) {
    openRequestBtn.disabled = !isDeveloper;
  }

  if (developerToolsCard) {
    developerToolsCard.style.display = isDeveloper ? "block" : "none";
  }

  manageHint.textContent = canManage
    ? "対象月を選択後、一覧を更新すると最新状態を読み込みます。"
    : "このアカウントには管理権限がありません。";
}

export function renderEmptyTable(message = "対象月を選択すると一覧を表示します。") {
  requestTableArea.className = "table-placeholder";
  requestTableArea.textContent = message;
}

function createCell(text, tagName = "td") {
  const cell = document.createElement(tagName);
  cell.textContent = text == null ? "" : String(text);
  return cell;
}

function normalizeTableHeaderLabel(header) {
  const value = String(header || "").trim();

  if (value === "employee_code") return "社員番号";

  return value;
}

function createTableHeader(headers) {
  const thead = document.createElement("thead");
  const row = document.createElement("tr");

  headers.forEach((header) => {
    row.appendChild(createCell(normalizeTableHeaderLabel(header), "th"));
  });

  thead.appendChild(row);
  return thead;
}

function createTableBody(rows) {
  const tbody = document.createElement("tbody");

  rows.forEach((rowData) => {
    const row = document.createElement("tr");

    rowData.forEach((cellValue) => {
      row.appendChild(createCell(cellValue));
    });

    tbody.appendChild(row);
  });

  return tbody;
}

export function renderMonthlyTable(tableData) {
  if (!tableData || !Array.isArray(tableData.headers) || tableData.headers.length === 0) {
    renderEmptyTable("表示できる一覧データがありません。");
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "spreadsheet-table-wrap";

  const table = document.createElement("table");
  table.className = "spreadsheet-table";

  table.appendChild(createTableHeader(tableData.headers));
  table.appendChild(createTableBody(Array.isArray(tableData.rows) ? tableData.rows : []));

  wrapper.appendChild(table);

  requestTableArea.className = "";
  requestTableArea.innerHTML = "";
  requestTableArea.appendChild(wrapper);
}
