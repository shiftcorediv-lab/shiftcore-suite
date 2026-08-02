/****************************************************
 * Util_Response.gs
 * APIレスポンス・POST解析
 ****************************************************/

function parsePostBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('POST body が空です。');
  }

  return JSON.parse(e.postData.contents);
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}