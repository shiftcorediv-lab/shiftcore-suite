// ===== ShiftBuilder personnel-axis-view-model.js ここから =====

import { getConsecutiveWorkAlert } from "./consecutive-work-alert.js";

function firstValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function normalizePerson(source = {}) {
  const id = firstValue(source, [
    "internal_user_id",
    "internalUserId",
    "user_id",
    "userId",
    "id"
  ]);

  if (!id) {
    return null;
  }

  const separatedName = [
    firstValue(source, ["family_name", "familyName"]),
    firstValue(source, ["given_name", "givenName"])
  ].filter(Boolean).join(" ");

  return {
    id,
    displayName: separatedName || firstValue(source, [
        "display_name",
        "displayName",
        "name",
        "full_name",
        "fullName"
      ]) || id,
    accountCode: firstValue(source, [
      "account_code",
      "accountCode",
      "employee_code",
      "employeeCode"
    ]),
    personType: firstValue(source, ["person_type", "personType"]),
    contractType: firstValue(source, ["contract_type", "contractType"]),
    baseArea: firstValue(source, ["base_area", "baseArea", "area"])
  };
}

function mergePerson(current, incoming) {
  if (!current) {
    return incoming;
  }

  return {
    ...current,
    displayName:
      current.displayName && current.displayName !== current.id
        ? current.displayName
        : incoming.displayName,
    accountCode: current.accountCode || incoming.accountCode,
    personType: current.personType || incoming.personType,
    contractType: current.contractType || incoming.contractType,
    baseArea: current.baseArea || incoming.baseArea
  };
}

export function buildPersonnelAxisViewModel(
  shiftData,
  candidates = [],
  previousMonthData = null,
  isPreviousMonthDataAvailable = false
) {
  const dates = Array.isArray(shiftData?.dates) ? shiftData.dates : [];
  const cases = Array.isArray(shiftData?.cases) ? shiftData.cases : [];
  const peopleById = new Map();

  candidates.forEach((candidate) => {
    const person = normalizePerson(candidate);

    if (person) {
      peopleById.set(person.id, {
        ...person,
        assignmentsByDate: {}
      });
    }
  });

  cases.forEach((caseItem) => {
    dates.forEach((dateItem) => {
      const cell = caseItem.cells?.[dateItem.date];
      const assignedMembers = Array.isArray(cell?.assigned) ? cell.assigned : [];

      assignedMembers.forEach((member) => {
        const normalized = normalizePerson(member);

        if (!normalized) {
          return;
        }

        const current = peopleById.get(normalized.id);
        const merged = mergePerson(current, normalized);
        const person = {
          ...merged,
          assignmentsByDate: current?.assignmentsByDate || {}
        };
        const dateAssignments = person.assignmentsByDate[dateItem.date] || [];

        dateAssignments.push({
          caseId: String(caseItem.caseId || ""),
          caseTitle: String(caseItem.title || caseItem.caseId || "案件名未設定"),
          caseDisplayTitle: firstValue(caseItem, [
            "shiftcore_display_name",
            "shiftcoreDisplayName"
          ]) || String(caseItem.title || caseItem.caseId || "案件名未設定"),
          client: String(caseItem.client || ""),
          area: String(caseItem.area || ""),
          assignmentId: firstValue(member, ["assignment_id", "assignmentId"])
        });

        person.assignmentsByDate[dateItem.date] = dateAssignments;
        peopleById.set(person.id, person);
      });
    });
  });

  const people = Array.from(peopleById.values())
    .map((person) => {
      const assignedDates = Object.keys(person.assignmentsByDate).filter(
        (date) => person.assignmentsByDate[date].length > 0
      );
      const assignmentCount = assignedDates.reduce(
        (total, date) => total + person.assignmentsByDate[date].length,
        0
      );
      const conflictDaysCount = assignedDates.filter(
        (date) => person.assignmentsByDate[date].length > 1
      ).length;

      return {
        ...person,
        assignedDaysCount: assignedDates.length,
        assignmentCount,
        conflictDaysCount,
        consecutiveAlertsByDate: isPreviousMonthDataAvailable
          ? Object.fromEntries(
              assignedDates.map((date) => [
                date,
                getConsecutiveWorkAlert({
                  previousMonthData,
                  currentMonthData: shiftData,
                  internalUserId: person.id,
                  workDate: date
                })
              ])
            )
          : {},
        targetDays: null
      };
    })
    .sort((a, b) => {
      const nameOrder = a.displayName.localeCompare(b.displayName, "ja");

      return nameOrder || a.id.localeCompare(b.id, "ja");
    });

  return {
    dates,
    people
  };
}

// ===== ShiftBuilder personnel-axis-view-model.js ここまで =====
