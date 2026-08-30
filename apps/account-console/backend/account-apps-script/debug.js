// ===== MailApp 権限確認ここから =====
function testSendMailApp() {
  sendAccountMail_({
    to: "hosomi.biz@gmail.com",
    subject: "ShiftCore MailApp test",
    body: "MailApp の権限確認テストです。"
  });
}
// ===== MailApp 権限確認ここまで =====

function testExternalRequestPermission_AccountApi() {
  const response = UrlFetchApp.fetch("https://www.google.com");
  Logger.log(response.getResponseCode());
}

/****************************************************
 * testAuthorizeMailApp ここから
 * MailApp の初回承認用
 ****************************************************/
function testAuthorizeMailApp() {
  sendAccountMail_({
    to: "shiftcore.div@gmail.com",
    subject: "ShiftCore MailApp 承認テスト",
    body: "MailApp の送信権限確認テストです。"
  });
}
/****************************************************
 * testAuthorizeMailApp ここまで
 ****************************************************/
