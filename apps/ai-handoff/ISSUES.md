# 課題ID一覧

- 更新: 2026-08-02
- 管理: Claude（監査役）
- 基線: HEAD `139d109`
- 根拠: `260801_ShiftCoreSuite_監査報告_Claude.md`

このファイルは、`README.md` の命名規則で使う「課題ID」の定義表です。
指摘の記号が何を指すかは、ここを引いてください。

---

## 記号の意味

| 接頭辞 | 分類 |
|---|---|
| `S-` | セキュリティ（クライアント側） |
| `C-` | 横断の一貫性・共通化 |
| `F-` | 壊れやすさ・バグ候補（クライアント側） |
| `G-` | GAS（サーバ側） |
| `W-` | Cloudflare Worker・デプロイ構成 |
| `Q-` | えいちの判断待ち（欠陥ではなく意思決定事項） |

### ID採番の訂正（2026-08-02）

GAS系に数字と英字が混在していたため、英字へ統一した。

| 旧ID | 新ID | 備考 |
|---|---|---|
| `G-1` | `G-F` | ファイル名等での使用実績なし。安全に変更 |

以後、GAS系は英字（`G-A` 〜）で統一する。

---

## 状態の凡例

| 状態 | 意味 |
|---|---|
| 未着手 | 指摘のみ。指示書なし |
| 指示書あり | 指示書を作成済み。承認待ちまたは実装待ち |
| 実装中 | Codexが作業中 |
| 解消済み | 修正を確認済み |
| 取り下げ | 誤指摘。根拠とともに撤回 |

---

## G-：GAS（サーバ側）

| ID | 内容 | 深刻度 | 状態 | 根拠 |
|---|---|---|---|---|
| **G-A** | **signup系3アクションが完全に無認証。`approveSignupRequest` が idToken を受け取らず、匿名で admin ロールのアカウントを発行できる** | **最重要** | **承認済み（実装待ち）** `approved/…_06_approved.md` | `account-apps-script/api.js:145`、`signup_admin.js:59` |
| G-B | PMOの非Secureアクション3つが、URLクエリの `role` を信頼して権限判定している。**クライアント参照0件の死にコード** | 高 | **承認済み（実装待ち）** `approved/…_04_approved.md` | `pmo-apps-script/api.js` doGet、`pmo_admin.js:4` |
| G-C | PMOの `submitShiftRequest` が無認証。他人名義の希望休提出が可能 | 高 | 未着手（クライアント認証導入が必要） | `pmo-apps-script/api.js` doPost |
| **G-K** | **`getLatestShiftRequest` が無認証GETで任意ユーザーの希望休を返す。`offDates` / `memo` / `applicationId` / `employeeCode` を含む。userId列挙で全社員分を取得可能** | **高** | 未着手（クライアント認証導入が必要） | `pmo-apps-script/api.js` doGet、`request.js` |
| G-D | `checkLoginUserByEmail` が無認証で任意メールのユーザー情報を返す（アカウント列挙） | 中 | 未着手 | `account-apps-script/api.js:67`、`users.js:208` |
| G-E | `getPmoAdminMetaSecure` が二重定義（後の定義が有効。前者は死にコード） | 低 | **承認済み（G-B指示書に含む）** | `pmo-apps-script/monthly_sheet.js:323, 605` |
| G-F | GASがバージョン管理外だった（旧ID `G-1`） | 中 | **解消済み** | `clasp` で3本を `backend/` 配下へ取り込み済み |
| G-G | `requireAccountConsoleOperator_` が2ファイルに重複定義（現時点で内容は完全一致） | 低 | **承認済み（G-A指示書に含む）** | `account_console_users.js:332`、`account_console_accounts.js:3` |
| G-H | `approval.workStatus` が画面で必須入力なのに保存されない（`workStatus: "on"` 固定） | 低 | 未着手（Q-2の判断待ち） | `signup_user_write.js:94` |
| G-I | `engagement_status` が signup 経由のユーザーだけ空になる | 低 | 未着手 | `signup_user_write.js` の `rowObject` にキーなし |
| G-J | ACCOUNT GAS に `LockService` がなく、同時承認・連番採番に競合の余地 | 中 | **G-Aから分離。未着手** | `account-apps-script` 全体で0件。PMOは使用あり |

## W-：Worker・デプロイ構成

| ID | 内容 | 深刻度 | 状態 | 根拠 |
|---|---|---|---|---|
| **W-1** | **ACCOUNT GAS がスイート全体の身元認証局であり、login-proxy Worker が素通しプロキシ。G-Aの影響範囲を全アプリへ拡大する** | **最重要** | 指示書あり（承認待ち） | Worker実ソース、`Code.gs:1,47`、`pmo-apps-script/config.js:8` |
| W-2 | G-A に到達できるURLが4つある（本番 / 孤児@37 / @HEAD / Worker） | 高 | 指示書あり（承認待ち） | `clasp deployments` 実行結果 |
| W-3 | コード内から参照されていないデプロイが5つ稼働中。すべて `ANYONE_ANONYMOUS` | 中 | えいち作業待ち | 同上 |
| W-4 | ShiftBuilder と勤怠のGASが別Googleアカウント所有。ソースをレビューできない | 中 | 未着手 | `clasp list` に該当なし |

## S-：セキュリティ（クライアント側）

| ID | 内容 | 深刻度 | 状態 | 根拠 |
|---|---|---|---|---|
| S-1 | 身元と権限をURLクエリから組み立てる画面が5つ | 中 | 未着手（G-A〜G-C解消後に降格見込み） | 各 `query.js`、`signup-admin/main.js:26-30` |
| S-2 | signup-admin のAPIが資格情報を送らない | — | **G-Aへ統合** | — |
| S-3 | PMOアプリが完全に無認証 | — | **G-B / G-Cへ統合** | — |
| S-4 | 反射型XSS 3箇所（URLクエリを未エスケープで `innerHTML`） | 高 | **承認済み（実装待ち）** `approved/…_04_approved.md` | `pmo/js/ui.js:77`、`account-portal/ui.js:63`、`pmo-portal/ui.js:56-58` |
| S-5 | idToken を含むセッションを `console.log` へ出力 | 中 | 未着手 | `shiftbuilder/js/shiftbuilder/main.js:2844` |

## F-：壊れやすさ（クライアント側）

| ID | 内容 | 深刻度 | 状態 | 根拠 |
|---|---|---|---|---|
| F-1 | OrderCase の認証が永久ハングしうる。`onAuthStateChanged` の購読解除もしていない | 高 | 未着手 | `ordercase/js/auth-session.js:50-71` |
| F-2 | `common/auth-session.js` の `waitForAuthUser` にタイムアウトがない | 中 | 未着手 | `account-console/js/common/auth-session.js` |
| F-3 | attendance-admin に権限判定がない | — | **取り下げ** | GAS側 `requireAdmin_` で正しく防御されていた |

## C-：横断の一貫性

| ID | 内容 | 深刻度 | 状態 |
|---|---|---|---|
| C-1 | 認証実装が4系統（shared / common / dashboard / ordercase compat） | 構造 | 未着手 |
| C-2 | Firebase設定が4箇所に重複（値は現在一致） | 低 | 未着手 |
| C-3 | `escapeHtml` が3重定義、pmo と persona-gacha では未定義 | 低 | 未着手 |
| C-4 | `query.js` が5重複 | 低 | 未着手（S-1とセット） |
| C-5 | キャッシュバスティングが不統一（account-console は9種類混在、pmo はほぼ未適用）。**`main.js` が下位モジュールを版数なしでimportしており、HTMLのエントリ更新だけでは配信されない** | 中 | 一部をS-4指示書で対応 |
| **C-6** | `pmo-admin/config.js` の `MANAGE_ALLOWED_ROLES` は `dev` を含むが、PMO GAS は `admin` / `developer` のみ許可。`dev` ロールは画面に入れてAPIで拒否される | 低 | 未着手 |
| **C-7** | ACCOUNT GAS に `getPmoAdminMeta` / `exportMonthlyExcel` / `createMonthlyRequestSheet` の分岐があるが、対応する関数本体がなく呼ぶと例外になる | 低 | 未着手 |

## Q-：えいちの判断待ち

| ID | 内容 | 必要なこと |
|---|---|---|
| Q-1 | signup承認の正式な権限条件はロールか `account_console` モジュールか | **管理担当者への `account_console` 付与状況の実データ確認** |
| Q-2 | `approval.workStatus`（G-H）を画面から外すか、保存に反映するか | 業務上の仕様判断 |
| Q-3 | `allowed_modules` の正式なキー一覧 | 許容値検証を入れる前提 |
| Q-4 | `organizationId` にマスタ存在確認が必要か | 業務上の仕様判断 |
| Q-5 | `engagement_status`（G-I）を是正するか | 影響範囲の確認 |
| Q-6 | PMO・ORDERCASE の孤児デプロイ3つの用途（W-3） | アーカイブ可否 |
| Q-7 | ShiftBuilder・勤怠のGASを持つアカウント（W-4） | 心当たりの確認 |

---

## 未確認領域

指摘として確定していないが、監査が及んでいない範囲。

| 内容 | 備考 |
|---|---|
| `ordercaseapiproxyworker` の処理内容 | OrderCaseクライアントの実際の接続先 |
| スプレッドシート・Driveの共有設定 | G-B で無認証にシートURLが取得できるため連鎖しうる |
| Firebase の承認済みドメイン、Firestore/Storageルール | リポジトリ外 |
| GASの残り約80%（全7,512行のうち精読は約1,500行） | `account_console_users.js` 718行、`Service_Cases.js` 1,134行など |
| account-console の10 HTMLページ | インラインスクリプトの有無 |

---

## 更新ルール

1. 新しい指摘は、分類の接頭辞に続けて次の英字・数字を割り当てる
2. **既存IDの意味を変えない。** 統合・取り下げの場合は行を残し、状態欄に記録する
3. 指示書のファイル名に使うIDは、この表に載っているものだけとする
4. 状態が変わったら、この表を更新する
