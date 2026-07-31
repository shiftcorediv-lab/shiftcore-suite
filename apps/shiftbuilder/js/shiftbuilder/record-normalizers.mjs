export function firstRecordValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

export function getInternalUserId(source) {
  return firstRecordValue(source, [
    "internal_user_id",
    "internalUserId",
    "user_id",
    "userId",
    "id"
  ]);
}

export function getAssignmentId(source) {
  return firstRecordValue(source, ["assignment_id", "assignmentId"]);
}
