# Codex作業指示書：G-B PMOの無認証アクションを撤去する（改訂版）

- 状態: **承認済み（実装可）**
- 作成者: Claude
- 承認者: えいち
- 承認日: 2026-08-02
- 作成日: 2026-08-02
- 前提文書: `reviewed/20260802_G-B_PMO死活アクション撤去_02_codex-review.md`
- 置き換える版: `archive/20260802_G-B_PMO死活アクション撤去_01_claude-draft.md`
- 実装: 未実施
- commit: 未実施
- push: 未実施
- deploy: 未実施

> **えいちの承認済み。本書に従って実装してよい。**
>
> ただし着手前に、`apps/pmo/backend/` と `apps/ai-handoff/` がコミット済みであることを確認すること（第2章）。

---

## 0. 前版からの訂正

Codexの指摘を実コードで照合した。**指摘は全件事実だった。**

| # | Codexの指摘 | 検証結果 | 対応 |
|---|---|---|---|
| P1 | 「どの画面も壊れない」は断定しすぎ。確認できたのはリポジトリ内参照0件のみ | **正しい** | 表現を訂正 |
| P2 | 撤去確認が4アクション中2件しかない | **正しい** | 4件へ拡張 |
| P2 | ACCOUNT GAS にも同名分岐が存在し、テスト対象を取り違えうる | **正しい**（`account-apps-script/api.js:26, 33, 132`。**対応する関数本体は存在せず、呼ぶと例外**） | 対象URLの照合手順を追加 |
| 参考 | `dev` ロールの不一致 | **正しい**（クライアント `["admin","developer","dev"]` / GAS `admin`・`developer` のみ） | 新規ID **C-6** として記録。本作業では触らない |

---

## 1. 要約

**この作業は「認証を追加する」ではなく「使われていない危険なアクションを削除する」である。**

| アクション | 種別 | リポジトリ内クライアント参照 | 危険性 |
|---|---|---|---|
| `getPmoAdminMeta` | GET | 0件 | URLクエリの `role` を信頼 |
| `getPmoMonthlyTable` | GET | 0件 | 同上 |
| `exportMonthlyExcel` | GET | 0件 | 同上。全社員の希望休をExcel出力 |
| `createMonthlyRequestSheet` | POST | 0件 | 認証なしでシート作成 |

規模は小さく、GASの `api.js` からルーター分岐を消すだけで済む見込み。

---

## 2. 基線

- ブランチ: `codex/attendance-dashboard`
- **実装開始時に `git rev-parse --short HEAD` を実行し、その値を完了報告へ記録すること**

前版は基線を `139d109` と固定したが陳腐化した。**ハッシュを固定せず、着手時点の実測を記録する。**

前提として、`apps/pmo/backend/` と `apps/ai-handoff/` がコミット済みであること。未追跡のまま着手しないこと。

---

## 3. 確認済み事実

### 3-1. 非Secure版は `role` をURLクエリから受け取る

`apps/pmo/backend/pmo-apps-script/api.js` の `doGet`

```js
if (action === "exportMonthlyExcel") {
  const targetYearMonth = normalizeText(getParam_(e, "targetYearMonth"));
  const role = normalizeText(getParam_(e, "role"));        // ← URLクエリ
  return jsonResponse_(exportMonthlyExcel(targetYearMonth, role));
}
```

`pmo_admin.js:4`

```js
function canManagePmoByRole_(role) {
  const normalizedRole = normalizeText(role).toLowerCase();
  return normalizedRole === "admin" || normalizedRole === "developer";   // 文字列比較のみ
}
```

デプロイは `"access": "ANYONE_ANONYMOUS"`。

### 3-2. クライアントは既にSecure版へ移行済み

`apps/account-console/js/pmo-admin/api.js` が使うのは `getPmoAdminMetaSecure` / `exportMonthlyExcelSecure` / `getPmoMonthlyTableSecure` の3つのみ。

Secure版は `requirePmoAdminUser_(idToken)` を通り、ログインプロキシ経由で身元を解決してから `role` を検証している。

### 3-3. 影響範囲の正確な表現（Codex P1）

**確認できたのは、現在のリポジトリ管理下のクライアントから参照0件という事実のみである。**

前版の「削除してもどの画面も壊れない」は断定しすぎだった。次へ訂正する。

> 現在のリポジトリ管理下の画面はSecure版を使用しており、コード照合上は影響しない。
> **リポジトリ外の旧画面、ブックマーク、手動運用、別アカウント所有コードからの呼び出しは未確認である。**
> デプロイ前に運用確認し、更新前バージョンへ戻せる状態を確保すること。

**具体的には、実装前に「更新前のバージョン番号」を控えておくこと。** 問題が出たらそのバージョンで再デプロイすれば戻せる。

---

## 4. 作業内容

### 4-1. `doGet` から3分岐を削除

`apps/pmo/backend/pmo-apps-script/api.js`

削除するもの。

- `if (action === "getPmoAdminMeta") { ... }`
- `if (action === "getPmoMonthlyTable") { ... }`
- `if (action === "exportMonthlyExcel") { ... }`

**残すもの。**

- `ping`
- `getLatestShiftRequest` ← **G-K として別課題。今回は触らない**

### 4-2. `doPost` から1分岐を削除

- `if (action === "createMonthlyRequestSheet") { ... }`

**残すもの。**

- `getPmoAdminMetaSecure` / `getPmoMonthlyTableSecure` / `exportMonthlyExcelSecure`
- `submitShiftRequest` ← **G-C として別課題。今回は触らない**

### 4-3. 関数本体は削除しない

`pmo_admin.js` の `getPmoAdminMeta(targetYearMonth, role)` と `exportMonthlyExcel(targetYearMonth, role)`、`monthly_sheet.js` の `getPmoMonthlyTable` は**残す。**

理由: Secure版が内部から呼んでいる。

```js
function getPmoAdminMetaSecure(targetYearMonth, idToken) {
  const auth = requirePmoAdminUser_(idToken);
  if (!auth.success) return auth;
  const meta = getPmoAdminMeta(targetYearMonth, auth.user.role);   // ← 検証済みroleを渡す
```

**ルーターからの直接到達だけを断つ。** 関数自体は、検証済みの `role` を受け取る内部関数として残る。

その旨をコメントで明示すること。

```js
// この関数はSecure版から検証済みroleを受けて呼ばれる内部関数である。
// doGet/doPostのルーターから直接公開しないこと。
function canManagePmoByRole_(role) {
```

### 4-4. G-E の解消（同ファイル群のため同時に実施）

`apps/pmo/backend/pmo-apps-script/monthly_sheet.js` に `getPmoAdminMetaSecure` が2回定義されている（**323行目と605行目**）。後の定義が有効なため、323行目は死にコード。差分はレスポンスに `currentUser: auth.user` を含むかどうか。

**605行目を残し、323行目を削除する。** 削除箇所にコメントを残すこと。

```js
// getPmoAdminMetaSecure の重複定義を削除（旧323行目）。有効な定義は下方に1つ。
```

**内容は変更しない。重複解消のみ。**

---

## 5. 触らない範囲

- `getLatestShiftRequest`（**G-K**）— PMOアプリが使用中。別課題
- `submitShiftRequest`（**G-C**）— 同上
- `ping`
- Secure版3アクション
- `auth_guard.gs.js`
- **ACCOUNT GAS の死んだPMO分岐**（`account-apps-script/api.js:26, 33, 132`）— **新規ID C-7 として記録。本作業では触らない**
- **`dev` ロールの不一致**（C-6）— 本作業では触らない
- ACCOUNT GAS、OrderCase GAS、勤怠 GAS
- `apps/pmo/js/` 配下のクライアント
- **既存のShiftBuilder文書差分**（`apps/shiftbuilder/docs/` の未コミット2件）
- 無関係な整形・リファクタリング

---

## 6. 完了条件

### 6-1. 対象URLの照合（Codex P2・必須）

**ACCOUNT GAS にも同名の分岐が存在する。** テストを誤ってそちらへ向けないこと。

実装・テストの対象は **PMO GAS** である。着手前に照合すること。

```bash
grep -n "GAS_API_URL" apps/pmo/js/config.js
```

ここに出るURLのデプロイIDが、テスト対象の `<PMO_GAS_URL>` である。**現在は `AKfycbyTQlhU9…`。** 撤去後は新しいバージョンを反映したデプロイのURLを使う。

### 6-2. 自動確認

1. 既存テスト21件が pass

```bash
node --test shared/tests/*.test.mjs apps/shiftbuilder/tests/*.test.mjs
```

2. PMO GAS のルーターから4分岐が消えていること

```bash
cd apps/pmo/backend/pmo-apps-script
grep -n 'action === "getPmoAdminMeta"\|action === "getPmoMonthlyTable"\|action === "exportMonthlyExcel"\|action === "createMonthlyRequestSheet"' api.js
```

**何も出力されないこと。** `…Secure` 側にはヒットしない書き方であることに注意。

3. `getPmoAdminMetaSecure` の定義が1つになっていること

```bash
grep -c "^function getPmoAdminMetaSecure" monthly_sheet.js
```

**`1` が返ること。**

### 6-3. 手で確認（えいち）

4. **PMO管理画面（pmo-admin）が引き続き動作する** — 月一覧、月次テーブル、Excel出力
5. **PMOアプリ（一般利用者）が引き続き動作する** — 希望休の参照と提出

### 6-4. 撤去確認（Codex P2・4アクション全件）

新デプロイの `<PMO_GAS_URL>` に対して実施する。

```bash
curl -s '<PMO_GAS_URL>/exec?action=getPmoAdminMeta&targetYearMonth=2026-08&role=admin'
curl -s '<PMO_GAS_URL>/exec?action=getPmoMonthlyTable&targetYearMonth=2026-08&role=admin'
curl -s '<PMO_GAS_URL>/exec?action=exportMonthlyExcel&targetYearMonth=2026-08&role=admin'
```

**3件とも `Unknown GET action` が返り、データ・シートURL・Excel出力URLを含まないこと。**

```bash
curl -s -X POST '<PMO_GAS_URL>/exec' \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"createMonthlyRequestSheet","targetYearMonth":"","roster":[]}'
```

**`Unknown POST action` が返ること。** `targetYearMonth` を空にすることで、万一分岐が残っていても実データのシートが作られないようにしている。**有効な年月を渡してテストしないこと。**

---

## 7. 残る課題（本作業の対象外）

**この作業だけではPMOの無認証問題は解消しない。**

| ID | 内容 | 必要な作業 |
|---|---|---|
| **G-K** | `getLatestShiftRequest` が無認証GETで任意ユーザーの希望休を返す（`offDates` / `memo` / `applicationId` / `employeeCode`） | PMOクライアントへFirebase認証を導入し、Secure版へ移行 |
| **G-C** | `submitShiftRequest` が無認証。他人名義の提出が可能 | 同上 |

**PMOクライアント（`apps/pmo/js/`）には現在Firebase認証が一切ない**（`idToken` / `Authorization` の使用0件）。G-KとG-Cの解消はクライアントへの認証導入を伴う中規模の作業になる。

### 本作業で新たに記録した課題

| ID | 内容 |
|---|---|
| **C-6** | `pmo-admin/config.js` は `MANAGE_ALLOWED_ROLES` に `dev` を含むが、PMO GAS は `admin` / `developer` のみ許可。`dev` ロールは画面に入れてAPIで拒否される |
| **C-7** | ACCOUNT GAS に `getPmoAdminMeta` / `exportMonthlyExcel` / `createMonthlyRequestSheet` の分岐が存在するが、対応する関数本体がなく呼ぶと例外になる |

---

## 8. 完了報告

`ai-handoff/archive/` へ結果文書を追加すること。加えて次を明示すること。

- **着手時の `git rev-parse --short HEAD` の値**
- **更新前のGASバージョン番号**（戻せる状態の確保）
- 削除した分岐の一覧
- G-E（重複定義）でどちらの定義を残したか
- 第6章の確認項目のうち、実施できた項目とできなかった項目
- **実施できなかった確認を、実施済みとして書かないこと**
- deploy を実施した場合、どのデプロイを更新したか
