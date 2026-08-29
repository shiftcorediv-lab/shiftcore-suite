// ===== 承認完了メール送信ここから =====
function sendSignupApprovedMail_(email, name) {
  const targetEmail = normalizeText(email);

  if (!targetEmail) {
    return;
  }

  MailApp.sendEmail({
    to: targetEmail,
    subject: "【Another Portal】利用申請が承認されました",
    body:
      (name || "申請者") + " 様\n\n" +
      "Another Portal の利用申請が承認されました。\n" +
      "ログイン後、利用可能なモジュールをご確認ください。"
  });
}
// ===== 承認完了メール送信ここまで =====
