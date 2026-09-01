// ===== 登録申請シート取得ここから =====
function getSignupRequestsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SIGNUP_REQUESTS_SHEET_NAME);

  if (!sheet) {
    throw new Error(SIGNUP_REQUESTS_SHEET_NAME + " シートが見つかりません");
  }

  return sheet;
}
// ===== 登録申請シート取得ここまで =====


// ===== 登録申請ヘッダー取得ここから =====
function getSignupRequestHeaders_() {
  return [
    "request_id",
    "submitted_at",
    "applicant_email",
    "applicant_name",
    "applicant_type",
    "company_name",
    "phone",
    "note",
    "request_status",
    "notification_sent",
    "notification_sent_at",
    "reviewed_at",
    "reviewed_by",
    "linked_internal_user_id"
  ];
}
// ===== 登録申請ヘッダー取得ここまで =====


// ===== 登録申請ヘッダー整備ここから =====
function ensureSignupRequestsHeader_() {
  const sheet = getSignupRequestsSheet();
  const headers = getSignupRequestHeaders_();

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const isSame = headers.every(function(header, index) {
    return String(currentHeaders[index] || "").trim() === header;
  });

  if (!isSame) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}
// ===== 登録申請ヘッダー整備ここまで =====


// ===== ヘッダーマップ取得ここから =====
function getHeaderMap_(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    return {};
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const map = {};

  headers.forEach(function(header, index) {
    const key = String(header || "").trim();
    if (key) {
      map[key] = index + 1;
    }
  });

  return map;
}
// ===== ヘッダーマップ取得ここまで =====


// ===== 登録申請ID発番ここから =====
function createSignupRequestId_() {
  const now = new Date();
  const datePart = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd");
  const sheet = getSignupRequestsSheet();
  const lastRow = sheet.getLastRow();

  let maxSeq = 0;

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    values.forEach(function(row) {
      const id = String(row[0] || "").trim();
      const match = id.match(/^REQ-(\d{8})-(\d{4})$/);

      if (match && match[1] === datePart) {
        const seq = Number(match[2]);
        if (seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });
  }

  const nextSeq = String(maxSeq + 1).padStart(4, "0");
  return "REQ-" + datePart + "-" + nextSeq;
}
// ===== 登録申請ID発番ここまで =====


// ===== 既存本登録メール存在確認ここから =====
function existsUserByEmail_(email) {
  const targetEmail = String(email || "").trim().toLowerCase();

  if (!targetEmail) {
    return false;
  }

  const users = getUsersData();
  return users.some(function(user) {
    return String(user.email || "").trim().toLowerCase() === targetEmail;
  });
}
// ===== 既存本登録メール存在確認ここまで =====


// ===== 承認待ち重複確認ここから =====
function hasPendingSignupRequest_(email) {
  const targetEmail = String(email || "").trim().toLowerCase();
  const sheet = getSignupRequestsSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  const headerMap = getHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getDisplayValues();

  return values.some(function(row) {
    const rowEmail = String(row[(headerMap["applicant_email"] || 1) - 1] || "").trim().toLowerCase();
    const rowStatus = String(row[(headerMap["request_status"] || 1) - 1] || "").trim();

    return rowEmail === targetEmail && rowStatus === "pending_approval";
  });
}
// ===== 承認待ち重複確認ここまで =====


// ===== 申請入力チェックここから =====
function validateSignupPayload_(payload) {
  const applicantEmail = normalizeText(payload.applicantEmail);
  const applicantName = normalizeText(payload.applicantName);
  const applicantType = normalizeText(payload.applicantType);
  const phone = normalizeText(payload.phone);

  if (!applicantEmail) {
    return { success: false, message: "メールアドレスを取得できていません" };
  }

  if (!applicantName) {
    return { success: false, message: "氏名を入力してください" };
  }

  if (!applicantType) {
    return { success: false, message: "申請区分を選択してください" };
  }

  if (!phone) {
    return { success: false, message: "業務連絡可能な電話番号を入力してください" };
  }

  return { success: true };
}
// ===== 申請入力チェックここまで =====


// ===== 仮登録通知ここから =====
function notifySignupRequest_(requestData) {
  if (!Array.isArray(SIGNUP_NOTIFICATION_EMAILS) || SIGNUP_NOTIFICATION_EMAILS.length === 0) {
    return {
      success: false,
      message: "通知先メールアドレスが未設定です"
    };
  }

  const recipients = SIGNUP_NOTIFICATION_EMAILS.filter(function(email) {
    return String(email || "").trim() !== "";
  });

  if (recipients.length === 0) {
    return {
      success: false,
      message: "通知先メールアドレスが未設定です"
    };
  }

  const subject = "【Another Portal】新しい利用申請が届きました";

  const body =
    "新しい利用申請が届きました。\n\n" +
    "【申請ID】\n" + requestData.request_id + "\n\n" +
    "【申請日時】\n" + requestData.submitted_at + "\n\n" +
    "【氏名】\n" + requestData.applicant_name + "\n\n" +
    "【メールアドレス】\n" + requestData.applicant_email + "\n\n" +
    "【申請区分】\n" + requestData.applicant_type + "\n\n" +
    "【会社名 / 所属名】\n" + (requestData.company_name || "なし") + "\n\n" +
    "【業務連絡可能な電話番号】\n" + requestData.phone + "\n\n" +
    "【備考】\n" + (requestData.note || "なし") + "\n";

  sendAccountMail_({
    to: recipients.join(","),
    subject: subject,
    body: body
  });

  return {
    success: true
  };
}
// ===== 仮登録通知ここまで =====


// ===== 仮登録申請保存ここから =====
function submitSignupRequest(payload) {
  try {
    const validation = validateSignupPayload_(payload);
    if (!validation.success) {
      return validation;
    }

    const applicantEmail = normalizeText(payload.applicantEmail).toLowerCase();
    const applicantName = normalizeText(payload.applicantName);
    const applicantType = normalizeText(payload.applicantType);
    const companyName = normalizeText(payload.companyName);
    const phone = normalizeText(payload.phone);
    const note = normalizeText(payload.note);
    const lock = LockService.getScriptLock();

    if (!lock.tryLock(10000)) {
      throw new Error("SIGNUP_REQUEST_LOCK_TIMEOUT");
    }

    let rowData;

    try {
      ensureSignupRequestsHeader_();

      if (existsUserByEmail_(applicantEmail)) {
        return {
          success: false,
          message: "このメールアドレスはすでに登録済みです"
        };
      }

      if (hasPendingSignupRequest_(applicantEmail)) {
        return {
          success: false,
          message: "このメールアドレスでは承認待ちの申請がすでに存在します"
        };
      }

      const sheet = getSignupRequestsSheet();
      const requestId = createSignupRequestId_();
      const submittedAt = getNowIsoStringJst();

      rowData = {
        request_id: requestId,
        submitted_at: submittedAt,
        applicant_email: applicantEmail,
        applicant_name: applicantName,
        applicant_type: applicantType,
        company_name: companyName,
        phone: phone,
        note: note,
        request_status: "pending_approval",
        notification_sent: false,
        notification_sent_at: "",
        reviewed_at: "",
        reviewed_by: "",
        linked_internal_user_id: ""
      };

      const headers = getSignupRequestHeaders_();
      const row = headers.map(function(header) {
        return rowData[header];
      });

      const targetRow = Math.max(sheet.getLastRow() + 1, 2);
      sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    } finally {
      lock.releaseLock();
    }

    let notificationSent = false;

    try {
      const notifyResult = notifySignupRequest_(rowData);
      notificationSent = notifyResult.success === true;

      if (notificationSent) {
        markSignupRequestNotificationSent_(rowData.request_id);
      }
    } catch (notificationError) {
      notificationSent = false;
    }

    return {
      success: true,
      message: "利用申請を受け付けました",
      requestId: rowData.request_id,
      notificationSent: notificationSent
    };

  } catch (error) {
    return {
      success: false,
      message: "利用申請処理中にエラーが発生しました: " + error.message
    };
  }
}
// ===== 仮登録申請保存ここまで =====

function markSignupRequestNotificationSent_(requestId) {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return false;
  }

  try {
    const request = getSignupRequestById_(requestId);
    if (!request) return false;

    const sheet = getSignupRequestsSheet();
    const headerMap = getHeaderMap_(sheet);
    const lastColumn = sheet.getLastColumn();
    const rowValues = sheet.getRange(request.row, 1, 1, lastColumn).getValues()[0];

    if (headerMap["notification_sent"]) {
      rowValues[headerMap["notification_sent"] - 1] = true;
    }
    if (headerMap["notification_sent_at"]) {
      rowValues[headerMap["notification_sent_at"] - 1] = getNowIsoStringJst();
    }

    sheet.getRange(request.row, 1, 1, lastColumn).setValues([rowValues]);
    return true;
  } finally {
    lock.releaseLock();
  }
}
