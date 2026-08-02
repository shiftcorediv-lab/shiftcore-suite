// ===== PMOv2 URL生成ここから =====
function buildPmoV2Url(loginUser) {
  const query = [
    ["from", "shiftcore"],
    ["module", "pmo"],
    ["userId", String(loginUser.userId || "").trim()],
    ["displayName", String(loginUser.displayName || "").trim()],
    ["employeeCode", String(loginUser.employeeCode || "").trim()],
    ["role", String(loginUser.role || "").trim()],
    ["workStatus", String(loginUser.workStatus || "").trim()]
  ]
    .map(function(pair) {
      return (
        encodeURIComponent(pair[0]) +
        "=" +
        encodeURIComponent(pair[1])
      );
    })
    .join("&");

  return PMO_V2_FRONT_URL + "?" + query;
}
// ===== PMOv2 URL生成ここまで =====