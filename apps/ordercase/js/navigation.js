/****************************************************
 * navigation.js
 * OrderCase 共通ナビゲーション
 ****************************************************/


/****************************************************
 * 定数 ここから
 ****************************************************/
const ORDERCASE_DASHBOARD_URL = '../account-console/dashboard.html';
/****************************************************
 * 定数 ここまで
 ****************************************************/


/****************************************************
 * renderOrderCaseHeader ここから
 * 共通ヘッダーを描画
 ****************************************************/
function renderOrderCaseHeader(activePage, subtitle) {
  const header = document.getElementById('ordercaseHeader');

  if (!header) {
    return;
  }

  const pages = [
    {
      key: 'index',
      label: '案件登録',
      href: './index.html'
    },
    {
      key: 'cases',
      label: '案件一覧',
      href: './cases.html'
    },
    {
      key: 'dashboard',
      label: 'Dashboardへ戻る',
      href: ORDERCASE_DASHBOARD_URL
    }
  ];

  const links = pages.map(function(page) {
    const activeClass = page.key === activePage ? ' active' : '';

    return `<a class="nav-link${activeClass}" href="${page.href}">${page.label}</a>`;
  }).join('');

  header.innerHTML = `
    <h1>OrderCase</h1>
    <p>${escapeHtml(subtitle || '')}</p>
    <nav class="top-nav">
      ${links}
    </nav>
  `;
}
/****************************************************
 * renderOrderCaseHeader ここまで
 ****************************************************/
