import {
  monthTitle,
  calendarGrid,
  selectedDatesBox,
  noHolidayHint,
  submitBtn,
  noHolidayBtn,
  clearSelectionBtn,
  noteInput
} from "./dom.js";
import {
  currentDate,
  selectedDates,
  noHolidayRequested,
  currentUser,
  setNoHolidayRequested,
  addSelectedDate,
  deleteSelectedDate
} from "./state.js";

export function formatDateKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getTargetYearMonth() {
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function isUserInactive() {
  return currentUser.workStatus === "off";
}

export function toggleDate(dateKey) {
  if (selectedDates.has(dateKey)) {
    deleteSelectedDate(dateKey);
  } else {
    addSelectedDate(dateKey);
  }
}

export function updateSubmitButtonState() {
  const hasUser = !!currentUser.userId && !!currentUser.displayName && !!currentUser.employeeCode;
  const hasSelection = noHolidayRequested || selectedDates.size > 0;
  const canSubmit = hasUser && hasSelection && !isUserInactive();

  submitBtn.disabled = !canSubmit;
  noHolidayBtn.disabled = isUserInactive();
  clearSelectionBtn.disabled = isUserInactive();
  noteInput.disabled = isUserInactive();
}

export function renderSelectedDates() {
  const dates = Array.from(selectedDates).sort();

  if (noHolidayRequested) {
    selectedDatesBox.textContent = "希望休なし";
    noHolidayHint.textContent = "この月は希望休なしとして送信されます";
    return;
  }

  selectedDatesBox.textContent = dates.length ? dates.join(", ") : "未選択";
  noHolidayHint.textContent = "";
}

export function renderCalendar() {
  calendarGrid.innerHTML = "";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  monthTitle.textContent = `${year}年${month + 1}月`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const totalDays = lastDay.getDate();

  for (let i = 0; i < startWeekday; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "day-cell empty";
    calendarGrid.appendChild(emptyCell);
  }

  for (let day = 1; day <= totalDays; day++) {
    const cell = document.createElement("div");
    const dateObj = new Date(year, month, day);
    const weekday = dateObj.getDay();
    const dateKey = formatDateKey(dateObj);

    cell.className = "day-cell";
    cell.textContent = day;

    if (weekday === 0) cell.classList.add("sun");
    if (weekday === 6) cell.classList.add("sat");
    if (selectedDates.has(dateKey)) cell.classList.add("selected");
    if (isUserInactive()) cell.classList.add("disabled");

    if (!isUserInactive()) {
      cell.addEventListener("click", () => {
        setNoHolidayRequested(false);
        toggleDate(dateKey);
        renderCalendar();
        renderSelectedDates();
        updateSubmitButtonState();
      });
    }

    calendarGrid.appendChild(cell);
  }
}
