/****************************************************
 * config.js
 * OrderCase 共通設定
 ****************************************************/

window.ORDERCASE_CONFIG = {
  API_URL: window.ShiftCoreEnvironment.endpoint(
    'ordercaseApi',
    'https://ordercaseapiproxyworker.shiftcore-div.workers.dev'
  ),

  FIREBASE_CONFIG: {
    apiKey: "AIzaSyAXDhMT1IP1xQ9f0WiOIjmmfBHoQDWZ0dI",
    authDomain: "shiftcore-div.firebaseapp.com",
    projectId: "shiftcore-div",
    storageBucket: "shiftcore-div.firebasestorage.app",
    messagingSenderId: "882342275588",
    appId: "1:882342275588:web:bab610608d1bc00453e351"
  },

  LOGIN_URL: window.ShiftCoreEnvironment.withEnvironment('../account-console/')
};
