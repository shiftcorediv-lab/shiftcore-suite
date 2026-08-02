# G-B PMO無認証アクション撤去：実装結果

- 状態: ローカル実装・自動検証完了、GAS反映未実施
- 作成者: Codex
- 作成日: 2026-08-02
- 前提文書: `approved/20260802_G-B_PMO死活アクション撤去_04_approved.md`
- 着手時HEAD: `01ad54a`
- ブランチ: `codex/attendance-dashboard`
- 実装: 完了
- commit: 未実施
- push: 未実施
- deploy: 未実施

---

## 1. 更新前状態

`clasp deployments` の読み取り結果:

- PMO本番デプロイ: `AKfycbyTQlhU9…` **@22**
- PMO @HEADデプロイ: `AKfycbxwSCE…` @HEAD

公開状態は変更していない。更新前バージョン番号は @22 として記録した。

## 2. 変更内容

`apps/pmo/backend/pmo-apps-script/api.js` から次の公開分岐を削除した。

- GET `getPmoAdminMeta`
- GET `getPmoMonthlyTable`
- GET `exportMonthlyExcel`
- POST `createMonthlyRequestSheet`

`getLatestShiftRequest`、`submitShiftRequest`、Secure版3アクションは残した。

`apps/pmo/backend/pmo-apps-script/monthly_sheet.js` の重複した `getPmoAdminMetaSecure` は、旧323行目側を削除し、`currentUser` を含む後方の定義を残した。

`apps/pmo/backend/pmo-apps-script/pmo_admin.js` には、ロール判定関数がSecure版から検証済みroleを受ける内部関数であり、ルーターから直接公開しない旨を追記した。

## 3. 確認結果

### 完了

- 変更したGAS JavaScriptの `node --check`: 成功
- 非Secure版4分岐が `api.js` から消えたこと: 確認
- `getPmoAdminMetaSecure` 定義数: **1**
- 既存テスト: **21件 pass / 0件 fail**
- `git diff --check`: 成功
- クライアント設定のPMOデプロイID: `AKfycbyTQlhU9…` と照合

### 未実施

- PMO GAS @22から新バージョンへの更新
- 新デプロイに対する4アクションの到達不能テスト
- PMO管理画面の月一覧・月次テーブル・Excel出力の実画面回帰確認
- 一般PMO画面の希望休参照・提出の実画面回帰確認
- リポジトリ外の呼び出し元が存在しないことの確認

## 4. 残る課題

- G-K `getLatestShiftRequest` の無認証GET
- G-C `submitShiftRequest` の無認証POST
- C-6 `dev` ロールのクライアント・GAS間不一致
- C-7 ACCOUNT GAS側の死んだPMO分岐
