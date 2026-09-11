// 月間表示は参照専用。打刻対象の選択とは状態を共有しない。
export function monthlyShiftDays(today, schedules) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || "")) return [];
  const [year, month] = today.split("-").map(Number);
  if (month < 1 || month > 12) return [];
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => {
    const date = `${today.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`;
    return { date, day: index + 1, items: schedules.filter(row => row["勤務日"] === date) };
  });
}

export function renderMonthlyShift(container, data, formatTime) {
  if (!container) return;
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  if (!Array.isArray(data.monthSchedules)) {
    container.textContent = "月間シフトを確認中です。";
    return;
  }
  const days = monthlyShiftDays(data.today, data.monthSchedules);
  if (!days.length) { container.textContent = "月間シフトの日付を確認できませんでした。"; return; }
  const month = data.today.slice(0, 7);
  const selected = container.dataset.month === month && days.some(day => day.date === container.dataset.selectedDate)
    ? container.dataset.selectedDate : data.today;
  container.dataset.month = month;
  container.dataset.selectedDate = selected;
  const offset = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  container.innerHTML = `<p class="monthly-shift-month">${Number(month.slice(0, 4))}年${Number(month.slice(5))}月</p>
    <div class="monthly-shift-grid">${["日", "月", "火", "水", "木", "金", "土"].map(day => `<span class="monthly-weekday">${day}</span>`).join("")}
    ${'<span aria-hidden="true"></span>'.repeat(offset)}${days.map(day => `<button type="button" data-monthly-date="${day.date}" aria-label="${day.date}、予定${day.items.length}件" aria-pressed="${day.date === selected}" ${day.date === data.today ? 'aria-current="date"' : ''}><span>${day.day}</span><small>${day.items.length ? `${day.items.length}件` : "—"}</small></button>`).join("")}</div>
    <div class="monthly-shift-detail" aria-live="polite"></div>`;
  const showDay = date => {
    const day = days.find(item => item.date === date);
    if (!day) return;
    container.dataset.selectedDate = date;
    container.querySelectorAll("[data-monthly-date]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.monthlyDate === date)));
    container.querySelector(".monthly-shift-detail").innerHTML = `<h3>${Number(date.slice(5, 7))}月${day.day}日の予定</h3>` + (day.items.length
      ? day.items.map(item => `<div class="monthly-shift-item"><strong>${escape(item["稼働場所"] || "場所未定")}</strong><span>${escape(formatTime(item))}</span></div>`).join("")
      : '<p>稼働予定はありません。</p>');
  };
  container.onclick = event => {
    const button = event.target.closest("[data-monthly-date]");
    if (button && container.contains(button)) showDay(button.dataset.monthlyDate);
  };
  showDay(selected);
}
