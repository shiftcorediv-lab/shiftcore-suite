const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;
const CSV_FORMULA_PREFIX = /^[=+\-@]/;

function firstValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function csvValue(value) {
  let text = String(value ?? "");
  if (CSV_FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function sanitizeFilenamePart(value, fallback = "名称未設定") {
  const sanitized = String(value || "")
    .replace(INVALID_FILENAME_CHARS, " ")
    .replace(/\s+/g, "")
    .trim();
  return sanitized || fallback;
}

export function buildCaseCsvFilename(caseItem, targetMonth) {
  const yymm = String(targetMonth || "").replace("-", "").slice(-4);
  const caseName = firstValue(caseItem, [
    "shiftcore_display_name", "shiftcoreDisplayName", "title"
  ]);
  return `(株)弊社名_${sanitizeFilenamePart(yymm, "年月未設定")}${sanitizeFilenamePart(caseName, "案件名未設定")}シフト.csv`;
}

export function buildCaseCsv(caseItem, dates = []) {
  const headers = ["案件ID", "案件名", "取引先", "エリア"];
  const values = [
    caseItem?.caseId || "",
    firstValue(caseItem, ["shiftcore_display_name", "shiftcoreDisplayName", "title"]),
    caseItem?.client || "",
    caseItem?.area || ""
  ];

  dates.forEach((dateItem) => {
    const cell = caseItem?.cells?.[dateItem.date] || {};
    const assigned = Array.isArray(cell.assigned)
      ? cell.assigned.filter((member) => {
          const status = firstValue(member, ["assignment_status", "assignmentStatus"]);
          const pending = member?.is_pending === true || member?.isPending === true;
          return !pending && status !== "saving" && status !== "archived";
        })
      : [];
    const names = assigned.map((member) => {
      const separatedName = [
        firstValue(member, ["family_name", "familyName"]),
        firstValue(member, ["given_name", "givenName"])
      ].filter(Boolean).join(" ");
      return separatedName || firstValue(member, ["display_name", "displayName", "name"]) || "氏名未設定";
    });
    const label = dateItem.label || dateItem.date;
    headers.push(`${label} 必要人数`, `${label} 配置人数`, `${label} 配置者`);
    values.push(Number(cell.required || 0), assigned.length, names.join("・"));
  });

  return `\uFEFF${headers.map(csvValue).join(",")}\r\n${values.map(csvValue).join(",")}\r\n`;
}

export function buildPersonnelExportFilename(person, targetMonth, extension) {
  const name = sanitizeFilenamePart(person?.displayName, "氏名未設定");
  return `AnotherPortal_${name}_${targetMonth || "年月未設定"}.${extension}`;
}

export function collectPersonnelAssignments(person, shiftData) {
  const casesById = new Map(
    (Array.isArray(shiftData?.cases) ? shiftData.cases : [])
      .map((caseItem) => [String(caseItem.caseId || ""), caseItem])
  );
  const assignments = [];

  Object.entries(person?.assignmentsByDate || {}).forEach(([date, entries]) => {
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const caseItem = casesById.get(String(entry.caseId || "")) || {};
      assignments.push({
        date,
        caseId: String(entry.caseId || ""),
        title: entry.caseDisplayTitle || entry.caseTitle || entry.caseId || "案件名未設定",
        client: entry.client || caseItem.client || "",
        area: entry.area || caseItem.area || "",
        location: firstValue(caseItem, [
          "work_location", "workLocation", "meeting_place", "meetingPlace", "venue", "address"
        ]),
        startTime: firstValue(entry, [
          "start_time", "startTime", "work_start_time", "workStartTime"
        ]) || firstValue(caseItem, [
          "start_time", "startTime", "work_start_time", "workStartTime", "meeting_time", "meetingTime"
        ]),
        endTime: firstValue(entry, [
          "end_time", "endTime", "work_end_time", "workEndTime"
        ]) || firstValue(caseItem, [
          "end_time", "endTime", "work_end_time", "workEndTime"
        ]),
        assignmentId: entry.assignmentId || ""
      });
    });
  });

  return assignments.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.startTime.localeCompare(b.startTime) ||
    a.caseId.localeCompare(b.caseId)
  );
}

function escapeIcsText(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function formatIcsDate(date) {
  return String(date || "").replaceAll("-", "");
}

function formatIcsDateTime(date, time) {
  const normalizedTime = String(time || "").replace(/[^0-9]/g, "").padEnd(4, "0").slice(0, 4);
  return `${formatIcsDate(date)}T${normalizedTime}00`;
}

function nextDate(date) {
  const [year, month, day] = String(date).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function buildPersonnelIcs(person, shiftData, now = new Date()) {
  const assignments = collectPersonnelAssignments(person, shiftData);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//ShiftCore//ShiftBuilder//JA",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(`${person?.displayName || "人員"} シフト`)}`,
    "X-WR-TIMEZONE:Asia/Tokyo"
  ];

  assignments.forEach((assignment, index) => {
    const stableId = assignment.assignmentId || `${assignment.caseId}-${assignment.date}-${index}`;
    const description = [
      assignment.caseId ? `案件ID: ${assignment.caseId}` : "",
      assignment.client ? `取引先: ${assignment.client}` : "",
      assignment.area ? `エリア: ${assignment.area}` : ""
    ].filter(Boolean).join("\n");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(stableId)}@shiftcore`);
    lines.push(`DTSTAMP:${stamp}`);
    if (assignment.startTime && assignment.endTime) {
      const endDate = assignment.endTime <= assignment.startTime
        ? nextDate(assignment.date)
        : assignment.date;
      lines.push(`DTSTART;TZID=Asia/Tokyo:${formatIcsDateTime(assignment.date, assignment.startTime)}`);
      lines.push(`DTEND;TZID=Asia/Tokyo:${formatIcsDateTime(endDate, assignment.endTime)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(assignment.date)}`);
      lines.push(`DTEND;VALUE=DATE:${formatIcsDate(nextDate(assignment.date))}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(`【Another Portal】${assignment.title}`)}`);
    if (assignment.location) lines.push(`LOCATION:${escapeIcsText(assignment.location)}`);
    if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
