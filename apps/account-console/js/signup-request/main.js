import {
  familyNameInput,
  givenNameInput,
  applicantTypeSelect,
  companyNameInput,
  phoneInput,
  noteInput,
  submitBtn,
  backToLoginBtn
} from "./dom.js";
import { setEmailBox, showMessage } from "./ui.js";
import { goToLogin } from "./navigation.js";
import { submitSignupRequest } from "./api.js";

function getLoggedInEmail() {
  const raw = sessionStorage.getItem("shiftcore_signup_email");

  if (!raw) {
    return "";
  }

  return String(raw).trim().toLowerCase();
}

function buildPayload(email) {
  const familyName = familyNameInput.value.trim();
  const givenName = givenNameInput.value.trim();

  return {
    applicantEmail: email,
    // 申請APIは従来どおり applicantName だけを受け取るため、入力は分けつつ送信時に連結する。
    applicantName: `${familyName}${givenName}`,
    applicantType: applicantTypeSelect.value,
    companyName: companyNameInput.value.trim(),
    phone: phoneInput.value.trim(),
    note: noteInput.value.trim()
  };
}

function validatePayload(payload) {
  if (!payload.applicantEmail) {
    return "ログイン中メールアドレスを取得できていません";
  }

  if (!familyNameInput.value.trim() || !givenNameInput.value.trim()) {
    return "姓と名を入力してください";
  }

  if (!payload.applicantType) {
    return "アカウント種別を選択してください";
  }

  if (!payload.phone) {
    return "業務連絡可能な電話番号を入力してください";
  }

  return "";
}

const loggedInEmail = getLoggedInEmail();
setEmailBox(loggedInEmail, loggedInEmail ? "success" : "error");

submitBtn.addEventListener("click", async () => {
  const payload = buildPayload(loggedInEmail);
  const errorMessage = validatePayload(payload);

  if (errorMessage) {
    showMessage(errorMessage, "error");
    return;
  }

  submitBtn.disabled = true;
  showMessage("利用申請を送信中...");

  try {
    const result = await submitSignupRequest(payload);

    if (!result.success) {
      showMessage(result.message || "利用申請に失敗しました", "error");
      submitBtn.disabled = false;
      return;
    }

    showMessage("利用申請を受け付けました", "success");
    familyNameInput.disabled = true;
    givenNameInput.disabled = true;
    applicantTypeSelect.disabled = true;
    companyNameInput.disabled = true;
    phoneInput.disabled = true;
    noteInput.disabled = true;
  } catch (error) {
    console.error(error);
    showMessage("利用申請に失敗しました", "error");
    submitBtn.disabled = false;
  }
});

backToLoginBtn.addEventListener("click", () => {
  goToLogin();
});
