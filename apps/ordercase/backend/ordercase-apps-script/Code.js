/****************************************************
 * Code.gs
 * API入口だけを置く
 ****************************************************/

function doGet(e) {
  return handleGet_(e);
}

function doPost(e) {
  try {
    return handlePost_(e);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        code: 'DO_POST_UNCAUGHT_ERROR',
        message: error && error.message ? error.message : String(error)
      }, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
