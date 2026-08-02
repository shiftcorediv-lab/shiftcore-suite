# Codexレビュー：G-B PMOの無認証アクション撤去

- 状態: 軽微な改訂後に承認可能
- 作成者: Codex
- 作成日: 2026-08-02
- 前提文書: `inbox/20260802_G-B_PMO死活アクション撤去_01_claude-draft.md`
- 置き換える版: なし
- 実装: 未実施
- commit: 未実施
- push: 未実施
- deploy: 未実施

---

## 1. 結論

PMO GASの公開ルーターから未使用の非Secure分岐4つを削除する方針は妥当であり、実装を推奨する。Secure版の内部関数は残し、重複した `getPmoAdminMetaSecure` の旧定義だけを削除する判断も正しい。

ただし、リポジトリ内参照0件から「どの画面も壊れない」と断定している点と、撤去確認が4アクションを網羅していない点は改訂が必要である。

---

## 2. 修正事項

### [P1] 「削除してもどの画面も壊れない」という断定を弱める

確認できたのは、**現在のリポジトリ管理下のクライアントから参照0件**という事実である。リポジトリ外の旧画面、ブックマーク、手動運用、別アカウント所有コードからの呼び出しは未確認である。

次の表現へ変更すること。

> 現在のリポジトリ管理下の画面はSecure版を使用しており、コード照合上は影響しない。リポジトリ外の利用は未確認のため、デプロイ前に運用確認し、更新前バージョンへ戻せる状態を確保する。

### [P2] 到達不能テストを4アクションすべてに追加する

現在の手動確認は `exportMonthlyExcel` と `getPmoAdminMeta` の2件だけである。次も必要である。

- GET `getPmoMonthlyTable`
- POST `createMonthlyRequestSheet`

`createMonthlyRequestSheet` は実データを作らないよう、撤去後の新デプロイに対し、無効なダミー値で `Unknown POST action` が先に返ることを確認する。

### [P2] 対象URLをPMO GASと明記する

ACCOUNT GASの `api.js` にも `getPmoAdminMeta`、`exportMonthlyExcel`、`createMonthlyRequestSheet` という同名分岐が残っている。ただし、現在取り込まれているACCOUNT GASファイル群には対応する関数本体がなく、呼び出すと例外になる状態である。

G-Bの実際の公開対象は、クライアント設定が参照するPMO GAS `AKfycbyTQlhU9…` である。手動テストが誤ってACCOUNT GASへ向かないよう、`<PMO_GAS_URL>` を実デプロイIDと照合する手順を追加すること。

ACCOUNT GAS側の死んだPMO分岐は、G-Bへ混ぜず別の整合性課題として記録するのが安全である。

---

## 3. 追加で確認した不一致（本作業の対象外）

`account-console/js/pmo-admin/config.js` は管理可能ロールへ `dev` を含めるが、PMO GASの `requirePmoAdminUser_` と `canManagePmoByRole_` は `admin` / `developer` のみを許可する。

したがって、`dev` はクライアント上で管理画面へ進めてもSecure APIで拒否される。非Secure分岐撤去が原因ではないため、本作業では変更せず別課題にする。

---

## 4. 妥当と確認した点

- PMO GASに対象4分岐が存在する
- 現在の管理クライアントはSecure版3アクションを使用する
- 一般PMOクライアントが使う `getLatestShiftRequest` / `submitShiftRequest` を残す判断
- Secure版が内部で `getPmoAdminMeta` / `getPmoMonthlyTable` / `exportMonthlyExcel` を呼ぶため、関数本体を残す判断
- `getPmoAdminMetaSecure` は同一ファイルに2定義あり、後方定義だけが `currentUser` を返す
- 後方定義を残して前方定義を削除する判断
- G-K / G-Cを別作業とし、「本作業だけではPMOの無認証問題は解消しない」と明示する点

---

## 5. Git状態

再レビュー時、`apps/pmo/backend/` は未追跡であり、現在のブランチは `codex/attendance-dashboard`、HEADは `32323f8` だった。実装前にGAS取り込みの基線とコミット対象を確定する必要がある。

---

## 6. 判定

**軽微な改訂後に承認可能。** 外部利用を未確認と明示し、4アクションすべての撤去テストを追加すれば実装してよい。

