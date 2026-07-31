import {
  buildCaseCsv,
  buildCaseCsvFilename,
  buildPersonnelExportFilename,
  buildPersonnelIcs,
  collectPersonnelAssignments
} from "./export-utils.mjs?v=20260801-authfix-1";
import { escapeHtml } from "./utils.js?v=20260801-authfix-1";

let activeMenu = null;
let restoreFocusTarget = null;

function downloadBlob(content, type, filename) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function closeExportMenu({ restoreFocus = false } = {}) {
  activeMenu?.remove();
  activeMenu = null;
  if (restoreFocus) restoreFocusTarget?.focus();
  restoreFocusTarget = null;
}

function positionMenu(menu, anchor, point) {
  const anchorRect = anchor.getBoundingClientRect();
  const left = point?.x ?? anchorRect.left;
  const top = point?.y ?? anchorRect.bottom;
  const margin = 8;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin))}px`;
  menu.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin))}px`;
}

function openMenu({ anchor, title, actions, point }) {
  closeExportMenu();
  restoreFocusTarget = anchor;
  const menu = document.createElement("div");
  menu.className = "row-export-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", `${title}の出力メニュー`);
  menu.innerHTML = `
    <div class="row-export-menu-title">${escapeHtml(title)}</div>
    ${actions.map((action, index) => `
      <button type="button" role="menuitem" data-action-index="${index}">
        ${escapeHtml(action.label)}
      </button>
    `).join("")}
  `;
  document.body.appendChild(menu);
  activeMenu = menu;
  positionMenu(menu, anchor, point);

  const buttons = Array.from(menu.querySelectorAll('[role="menuitem"]'));
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const action = actions[Number(button.dataset.actionIndex)];
      closeExportMenu();
      action.run();
    });
  });
  menu.addEventListener("keydown", (event) => {
    const currentIndex = buttons.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      buttons[(currentIndex + offset + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeExportMenu({ restoreFocus: true });
    }
  });
  buttons[0]?.focus();
}

export function openCaseExportMenu({ anchor, point, caseItem, shiftData, onStatus }) {
  openMenu({
    anchor,
    point,
    title: caseItem.title || caseItem.caseId || "案件",
    actions: [{
      label: "この案件をCSV出力",
      run: () => {
        downloadBlob(
          buildCaseCsv(caseItem, shiftData.dates),
          "text/csv;charset=utf-8",
          buildCaseCsvFilename(caseItem, shiftData.month)
        );
        onStatus?.(`${caseItem.title || caseItem.caseId}のCSVを出力しました。`);
      }
    }]
  });
}

function drawCalendar(canvas, person, shiftData) {
  const month = String(shiftData.month || "");
  const [year, monthNumber] = month.split("-").map(Number);
  const assignmentsByDate = new Map();
  collectPersonnelAssignments(person, shiftData).forEach((assignment) => {
    const current = assignmentsByDate.get(assignment.date) || [];
    current.push(assignment);
    assignmentsByDate.set(assignment.date, current);
  });

  const width = 1680;
  const headerHeight = 180;
  const weekdayHeight = 60;
  const cellWidth = width / 7;
  const cellHeight = 210;
  const height = headerHeight + weekdayHeight + cellHeight * 6 + 70;
  const context = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#172033";
  context.font = '700 52px "Hiragino Sans", "Yu Gothic", sans-serif';
  context.fillText(`${person.displayName}  ${year}年${monthNumber}月 シフト`, 48, 78);
  context.fillStyle = "#667085";
  context.font = '28px "Hiragino Sans", "Yu Gothic", sans-serif';
  context.fillText(`ShiftCore / ${shiftData.area === "all" ? "全エリア" : shiftData.area || "エリア未設定"}`, 48, 132);

  ["月", "火", "水", "木", "金", "土", "日"].forEach((weekday, index) => {
    context.fillStyle = index === 5 ? "#2764a5" : index === 6 ? "#c33c54" : "#344054";
    context.font = '700 28px "Hiragino Sans", "Yu Gothic", sans-serif';
    context.textAlign = "center";
    context.fillText(weekday, index * cellWidth + cellWidth / 2, headerHeight + 40);
  });
  context.textAlign = "left";

  const firstDay = new Date(year, monthNumber - 1, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  for (let cellIndex = 0; cellIndex < 42; cellIndex += 1) {
    const column = cellIndex % 7;
    const row = Math.floor(cellIndex / 7);
    const x = column * cellWidth;
    const y = headerHeight + weekdayHeight + row * cellHeight;
    const day = cellIndex - mondayOffset + 1;
    context.fillStyle = column === 5 ? "#f4f8fc" : column === 6 ? "#fff5f6" : "#ffffff";
    context.fillRect(x, y, cellWidth, cellHeight);
    context.strokeStyle = "#d0d5dd";
    context.strokeRect(x, y, cellWidth, cellHeight);
    if (day < 1 || day > daysInMonth) continue;

    const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    context.fillStyle = column === 5 ? "#2764a5" : column === 6 ? "#c33c54" : "#344054";
    context.font = '700 28px "Hiragino Sans", "Yu Gothic", sans-serif';
    context.fillText(String(day), x + 14, y + 36);
    const dayAssignments = assignmentsByDate.get(date) || [];
    dayAssignments.slice(0, 4).forEach((assignment, assignmentIndex) => {
      const label = assignment.title.length > 13 ? `${assignment.title.slice(0, 12)}…` : assignment.title;
      context.fillStyle = "#eef4ff";
      context.fillRect(x + 12, y + 52 + assignmentIndex * 36, cellWidth - 24, 30);
      context.fillStyle = "#244c87";
      context.font = '22px "Hiragino Sans", "Yu Gothic", sans-serif';
      context.fillText(label, x + 18, y + 75 + assignmentIndex * 36);
    });
    if (dayAssignments.length > 4) {
      context.fillStyle = "#667085";
      context.font = '20px "Hiragino Sans", "Yu Gothic", sans-serif';
      context.fillText(`ほか${dayAssignments.length - 4}件`, x + 18, y + 202);
    }
  }
  context.fillStyle = "#667085";
  context.font = '22px "Hiragino Sans", "Yu Gothic", sans-serif';
  context.fillText("※時刻はICSまたはShiftBuilderで確認してください。", 48, height - 28);
}

export function openPersonnelExportMenu({
  anchor,
  point,
  person,
  shiftData,
  onStatus,
  onSendIcs
}) {
  const email = String(person.email || "").trim();
  const hasAssignments = Number(person.assignmentCount || 0) > 0;
  openMenu({
    anchor,
    point,
    title: person.displayName || person.id || "人員",
    actions: [
      {
        label: "月間カレンダー画像を出力",
        run: () => {
          const canvas = document.createElement("canvas");
          drawCalendar(canvas, person, shiftData);
          canvas.toBlob((blob) => {
            if (!blob) {
              onStatus?.("カレンダー画像を生成できませんでした。");
              return;
            }
            downloadBlob(blob, "image/png", buildPersonnelExportFilename(person, shiftData.month, "png"));
            onStatus?.(`${person.displayName}のカレンダー画像を出力しました。`);
          }, "image/png");
        }
      },
      {
        label: "ICSを出力",
        run: () => {
          downloadBlob(
            buildPersonnelIcs(person, shiftData),
            "text/calendar;charset=utf-8",
            buildPersonnelExportFilename(person, shiftData.month, "ics")
          );
          onStatus?.(`${person.displayName}のICSを出力しました。`);
        }
      },
      {
        label: "ICSをメール送信",
        run: () => {
          if (!email) {
            onStatus?.(`${person.displayName}には送信先メールアドレスが登録されていません。`);
            return;
          }
          if (!hasAssignments) {
            onStatus?.(`${person.displayName}には対象月のアサインがありません。`);
            return;
          }
          onStatus?.("メール送信の確認中...");
          onSendIcs?.(person);
        }
      }
    ]
  });
}

export function openPersonnelBulkMenu({
  anchor,
  point,
  people,
  shiftData,
  onStatus,
  onSendAllIcs
}) {
  const targets = (Array.isArray(people) ? people : []).filter(
    (person) => String(person.email || "").trim() && Number(person.assignmentCount || 0) > 0
  );
  openMenu({
    anchor,
    point,
    title: `${shiftData.month || "対象月"} 人員一括`,
    actions: [{
      label: `ICSを一括メール送信（${targets.length}名）`,
      run: () => {
        if (!targets.length) {
          onStatus?.("メール送信できるアサイン済み人員がいません。");
          return;
        }
        onSendAllIcs?.(targets);
      }
    }]
  });
}

document.addEventListener("pointerdown", (event) => {
  if (activeMenu && !activeMenu.contains(event.target)) closeExportMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeMenu) {
    event.preventDefault();
    closeExportMenu({ restoreFocus: true });
  }
});
window.addEventListener("scroll", () => closeExportMenu(), true);
window.addEventListener("resize", () => closeExportMenu());
