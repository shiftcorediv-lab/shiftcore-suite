/****************************************************
 * loading.js
 * OrderCase 共通ローディング表示
 ****************************************************/


/****************************************************
 * showLoading ここから
 ****************************************************/
function showLoading(text) {
  const loadingText = document.getElementById('loadingText');
  const loadingOverlay = document.getElementById('loadingOverlay');

  if (loadingText) {
    loadingText.textContent = text || '読み込み中...';
  }

  if (loadingOverlay) {
    loadingOverlay.classList.add('show');
  }
}
/****************************************************
 * showLoading ここまで
 ****************************************************/


/****************************************************
 * hideLoading ここから
 ****************************************************/
function hideLoading() {
  const loadingOverlay = document.getElementById('loadingOverlay');

  if (loadingOverlay) {
    loadingOverlay.classList.remove('show');
  }
}
/****************************************************
 * hideLoading ここまで
 ****************************************************/
