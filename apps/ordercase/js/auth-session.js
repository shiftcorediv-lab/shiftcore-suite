/****************************************************
 * auth-session.js
 * Firebaseログイン状態確認・idToken取得
 ****************************************************/


/****************************************************
 * Firebase SDK 読み込み ここから
 ****************************************************/
function loadFirebaseScript_(src) {
  return new Promise(function(resolve, reject) {
    const existing = document.querySelector('script[src="' + src + '"]');

    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = function() {
      reject(new Error('Firebase SDKの読み込みに失敗しました: ' + src));
    };

    document.head.appendChild(script);
  });
}

async function ensureFirebaseLoaded_() {
  await loadFirebaseScript_('https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js');
  await loadFirebaseScript_('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth-compat.js');

  if (!firebase.apps.length) {
    firebase.initializeApp(window.ORDERCASE_CONFIG.FIREBASE_CONFIG);
  }
}
/****************************************************
 * Firebase SDK 読み込み ここまで
 ****************************************************/


/****************************************************
 * requireOrderCaseLogin ここから
 * ログイン済みユーザーを要求し、idTokenを返す
 ****************************************************/
async function requireOrderCaseLogin() {
  await ensureFirebaseLoaded_();

  return new Promise(function(resolve) {
    firebase.auth().onAuthStateChanged(async function(user) {
      if (!user) {
        const currentUrl = window.location.href;
        const loginUrl = new URL(window.ORDERCASE_CONFIG.LOGIN_URL);
        loginUrl.searchParams.set('redirect', currentUrl);

        window.location.href = loginUrl.toString();
        return;
      }

      const idToken = await user.getIdToken();

      window.ORDERCASE_AUTH = {
        firebaseUser: user,
        idToken: idToken,
        email: user.email || ''
      };

      resolve(window.ORDERCASE_AUTH);
    });
  });
}
/****************************************************
 * requireOrderCaseLogin ここまで
 ****************************************************/


/****************************************************
 * getOrderCaseIdToken ここから
 ****************************************************/
async function getOrderCaseIdToken() {
  if (window.ORDERCASE_AUTH && window.ORDERCASE_AUTH.idToken) {
    return window.ORDERCASE_AUTH.idToken;
  }

  const auth = await requireOrderCaseLogin();
  return auth.idToken;
}
/****************************************************
 * getOrderCaseIdToken ここまで
 ****************************************************/
