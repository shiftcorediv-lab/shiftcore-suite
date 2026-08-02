# Codex作業指示書：G-B PMOの無認証アクションを撤去する

- 状態: レビュー待ち（えいちの承認待ち）
- 作成者: Claude
- 作成日: 2026-08-02
- 前提文書: `ISSUES.md` の G-B / G-C
- 置き換える版: なし
- 実装: 未実施
- commit: 未実施
- push: 未実施
- deploy: 未実施

> **本書は `approved/` へ移されるまで実装指示ではない**（`README.md` 共通ルール5）。

---

## 1. 要約

**この作業は「認証を追加する」ではなく「使われていない危険なアクションを削除する」である。**

対象4アクションは、リポジトリ内のクライアントから**参照が1件もない**。削除してもどの画面も壊れない。

| アクション | 種別 | クライアント参照 | 危険性 |
|---|---|---|---|
| `getPmoAdminMeta` | GET | **0件** | URLクエリの `role` を信頼 |
| `getPmoMonthlyTable` | GET | **0件** | 同上 |
| `exportMonthlyExcel` | GET | **0件** | 同上。全社員の希望休をExcel出力 |
| `createMonthlyRequestSheet` | POST | **0件** | 認証なしでシート作成 |

**規模は小さく、リスクも低い。** GASの `api.js` から分岐を消すだけで済む見込み。

---

## 2. 確認済み事実

### 2-1. 非Secure版は `role` をURLクエリから受け取っている

`apps/pmo/backend/pmo-apps-script/api.js` の `doGet`

```js
if (action === "exportMonthlyExcel") {
  const targetYearMonth = normalizeText(getParam_(e, "targetYearMonth"));
  const role = normalizeText(getParam_(e, "role"));        // ← URLクエリ
  return jsonResponse_(exportMonthlyExcel(targetYearMonth, role));
}
```

`apps/pmo/backend/pmo-apps-script/pmo_admin.js:4`

```js
function canManagePmoByRole_(role) {
  const normalizedRole = normalizeText(role).toLowerCase();
  return normalizedRole === "admin" || normalizedRole === "developer";   // 文字列比較のみ
}
```

デプロイは `"access": "ANYONE_ANONYMOUS"`。次のリクエストで全社員の希望休一覧がExcelとして取得できる。

```
GET <PMO_GAS_URL>/exec?action=exportMonthlyExcel&targetYearMonth=2026-08&role=admin
```

### 2-2. クライアントは既にSecure版へ移行済み

`apps/account-console/js/pmo-admin/api.js` が使うアクション

```
getPmoAdminMetaSecure
exportMonthlyExcelSecure
getPmoMonthlyTableSecure
```

**非Secure版を呼ぶクライアントは存在しない**（`grep -rn` で全数確認。`backend/` を除外して0件）。

Secure版は `requirePmoAdminUser_(idToken)` を通り、ログインプロキシ経由で身元を解決してから `role` を検証している。正しい実装が既に稼働している。

### 2-3. `createMonthlyRequestSheet` も呼び出し元がない

`doPost` に定義されているが、リポジトリ内のクライアントから参照0件。認証もない。

---

## 3. 作業内容

### 3-1. `doGet` から3分岐を削除

`apps/pmo/backend/pmo-apps-script/api.js`

削除するもの。

- `if (action === "getPmoAdminMeta") { ... }`
- `if (action === "getPmoMonthlyTable") { ... }`
- `if (action === "exportMonthlyExcel") { ... }`

**残すもの。**

- `ping`
- `getLatestShiftRequest` ← **G-K として別課題。今回は触らない**

### 3-2. `doPost` から1分岐を削除

- `if (action === "createMonthlyRequestSheet") { ... }`

**残すもの。**

- `getPmoAdminMetaSecure`
- `getPmoMonthlyTableSecure`
- `exportMonthlyExcelSecure`
- `submitShiftRequest` ← **G-C として別課題。今回は触らない**

### 3-3. 関数本体の扱い

`pmo_admin.js` の `getPmoAdminMeta(targetYearMonth, role)` と `exportMonthlyExcel(targetYearMonth, role)` は、**削除しない。**

理由: Secure版がこれらを内部から呼んでいる。

```js
// monthly_sheet.js
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

### 3-4. G-E の解消（同ファイル群のため同時に実施）

`apps/pmo/backend/pmo-apps-script/monthly_sheet.js` に `getPmoAdminMetaSecure` が**2回定義されている**（323行目と605行目）。

JavaScriptでは後の定義が有効になるため、**323行目は死にコード**である。差分はレスポンスに `currentUser: auth.user` を含むかどうか。

**605行目を残し、323行目を削除する。** 削除箇所にコメントを残すこと。

```js
// getPmoAdminMetaSecure の重複定義を削除（旧323行目）。有効な定義は下方に1つ。
```

**内容は変更しない。重複解消のみ。**

---

## 4. 触らない範囲

- `getLatestShiftRequest`（**G-K**）— PMOアプリが使用中。認証追加にはクライアント側のFirebase認証導入が必要。別課題
- `submitShiftRequest`（**G-C**）— 同上
- `ping`
- Secure版3アクション — 正しく守られている
- `auth_guard.gs.js` — 正しい実装
- ACCOUNT GAS、OrderCase GAS、勤怠 GAS
- `apps/pmo/js/` 配下のクライアント — 本作業では変更不要
- 無関係な整形・リファクタリング

---

## 5. 完了条件

### 自動確認

1. `node --check` が変更ファイルを通る（GASのため参考値）
2. 既存テスト21件が pass

```bash
node --test shared/tests/*.test.mjs apps/shiftbuilder/tests/*.test.mjs
```

3. `grep` で非Secure版のルーター分岐が消えていること

```bash
cd apps/pmo/backend/pmo-apps-script
grep -n 'action === "getPmoAdminMeta"\|action === "getPmoMonthlyTable"\|action === "exportMonthlyExcel"\|action === "createMonthlyRequestSheet"' api.js
```

**何も出力されないこと。** `…Secure` 側にはヒットしない書き方であることに注意。

4. `getPmoAdminMetaSecure` の定義が1つになっていること

```bash
grep -c "^function getPmoAdminMetaSecure" monthly_sheet.js
```

**`1` が返ること。**

### 手で確認（えいち）

5. **PMO管理画面（pmo-admin）が引き続き動作する** — 月一覧、月次テーブル、Excel出力
6. **PMOアプリ（一般利用者）が引き続き動作する** — 希望休の参照と提出。今回は触らないが回帰確認として
7. 撤去したアクションが到達不能になっていること

```bash
curl -s '<PMO_GAS_URL>/exec?action=exportMonthlyExcel&targetYearMonth=2026-08&role=admin'
```

`Unknown GET action` が返り、Excel出力のURLやデータを含まないこと。

```bash
curl -s '<PMO_GAS_URL>/exec?action=getPmoAdminMeta&targetYearMonth=2026-08&role=admin'
```

同様に `Unknown GET action` が返ること。

---

## 6. 残る課題（本作業の対象外）

**この作業だけではPMOの無認証問題は解消しない。**

| ID | 内容 | 必要な作業 |
|---|---|---|
| **G-K** | `getLatestShiftRequest` が無認証GETで任意ユーザーの希望休を返す。`offDates` / `memo` / `applicationId` / `employeeCode` を含む | PMOクライアントへFirebase認証を導入したうえで、Secure版へ移行 |
| **G-C** | `submitShiftRequest` が無認証。他人名義の提出が可能 | 同上 |

**PMOクライアント（`apps/pmo/js/`）には現在Firebase認証が一切ない**（`idToken` / `Authorization` の使用0件）。したがってG-KとG-Cの解消は、クライアントへの認証導入を伴う中規模の作業になる。本作業とは分離する。

---

## 7. 完了報告

`ai-handoff/archive/` へ結果文書を追加すること。`README.md` の命名規則に従う。

加えて次を明示すること。

- 削除した分岐の一覧
- G-E（重複定義）を解消したか、どちらの定義を残したか
- 第5章の確認項目のうち、実施できた項目とできなかった項目
- **実施できなかった確認を、実施済みとして書かないこと**
- deploy を実施した場合、どのデプロイを更新したか
