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
import { setEmailBox, showMessage } from "./ui.js?v=20260903-loading-1";
import { goToLogin } from "./navigation.js";
import { submitSignupRequest } from "./api.js";
import { auth, onAuthStateChanged } from "../login/auth.js";
import { setActivity } from "../common/activity.js";

function resolveAuthenticatedUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise(resolve => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user || null);
    });
  });
}

function buildPayload() {
  const familyName = familyNameInput.value.trim();
  const givenName = givenNameInput.value.trim();

  return {
    // 入力は分けつつ、既存API契約に合わせて送信時に氏名を連結する。
    applicantName: `${familyName}${givenName}`,
    applicantType: applicantTypeSelect.value,
    companyName: companyNameInput.value.trim(),
    phone: phoneInput.value.trim(),
    note: noteInput.value.trim()
  };
}

function validatePayload(payload, email) {
  if (!email) {
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

let authenticatedUser = null;
let loggedInEmail = "";

resolveAuthenticatedUser().then(user => {
  authenticatedUser = user;
  loggedInEmail = String(user?.email || "").trim().toLowerCase();
  setEmailBox(loggedInEmail, loggedInEmail ? "success" : "error");
  submitBtn.disabled = !loggedInEmail;
});

submitBtn.disabled = true;

submitBtn.addEventListener("click", async () => {
  const payload = buildPayload();
  const errorMessage = validatePayload(payload, loggedInEmail);

  if (errorMessage) {
    showMessage(errorMessage, "error");
    return;
  }

  submitBtn.disabled = true;
  setActivity(submitBtn, true, "利用申請を送信中...");
  showMessage("利用申請を送信中...");

  try {
    const idToken = await authenticatedUser.getIdToken();
    const result = await submitSignupRequest(payload, idToken);

    if (!result.success) {
      showMessage(result.message || "利用申請に失敗しました", "error");
      setActivity(submitBtn, false, "利用申請を送信");
      submitBtn.disabled = false;
      return;
    }

    setActivity(submitBtn, false, "利用申請を送信");
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
    setActivity(submitBtn, false, "利用申請を送信");
    submitBtn.disabled = false;
  }
});

backToLoginBtn.addEventListener("click", () => {
  goToLogin();
});
