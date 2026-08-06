# Claude向け独立監査依頼：03着手前の安全修正

- 作成日: 2026-08-06
- 作成者: Codex
- 対象タスク: `03 権限設計`
- 監査段階: Claude最終独立再監査済み（03着手可、本番反映は現行GAS照合まで保留）
- 実装状態: ローカル変更のみ

## 1. 依頼

03権限設計へ入る前にCodexが行った安全修正を、Codexの結論を前提にせず独立監査すること。

今回は監査のみとする。コード、シート、本番データ、GAS、設定を変更しない。commit、push、PR、GAS反映、デプロイ、公開を行わない。

## 2. 変更目的

Codexは、業務判断を先取りしない範囲として次の3点を修正した。

1. 共通ログイン応答へ既存の `shiftbuilder_permission` を追加
2. 登録申請管理画面をURLクエリ由来のroleではなく、認証済みAccount API応答で判定
3. 実績報告で指定された勤怠記録がログイン本人のものか確認

登録申請管理画面のキャッシュ更新番号も変更した。

## 3. 変更ファイル

- `apps/account-console/backend/account-apps-script/users.js`
- `apps/account-console/backend/account-apps-script/account_console_users.js`（機能変更なし、末尾改行のみ）
- `apps/account-console/backend/attendance-apps-script/Code.gs`
- `apps/account-console/js/common/access-policy.mjs`
- `apps/account-console/js/dashboard/modules.js`
- `apps/account-console/js/dashboard/main.js`
- `apps/account-console/dashboard.html`
- `apps/account-console/js/signup-admin/api.js`
- `apps/account-console/js/signup-admin/config.js`
- `apps/account-console/js/signup-admin/navigation.js`
- `apps/account-console/js/signup-admin/main.js`
- `apps/account-console/signup-admin.html`
- `apps/account-console/tests/access-policy.test.mjs`
- `apps/account-console/tests/backend-security.test.mjs`
- `apps/ai-handoff/03_PERMISSION_DESIGN_ROADMAP.md`

## 4. Codex内部監査の結果

結論は「条件付き」。本番反映はまだ止めるべきと判定した。

### 解消済みP1: 既存管理者を締め出す可能性

初回変更では `signup_admin.js` の登録申請管理条件を次のように変更していた。

- 変更前: `admin/developer` または `account_console`
- 変更後: `admin/developer` かつ `account_console`

この変更は取り消した。現在の画面とAPIは既存仕様どおり、`admin/developer` または `account_console` を許可する。正式条件は03で決める。

確認事項:

- 既存の登録申請管理担当者が全員、対象roleとモジュールの両方を持つか。
- モジュールだけで委任された管理担当者が存在しないか。
- roleだけで旧URLから利用していた管理担当者が存在しないか。
- これは既存仕様の修正か、新しい権限仕様への変更か。

### P2: 実績報告の業務条件が不足

`Code.gs` で `record_id` とログインメールの一致を確認するようにした。他人の勤怠記録IDは拒否できる。

ただし、次は未検証・未実装である。

- 対象勤怠が終了済みか。
- `planId` が対象勤怠または当日の予定と対応するか。
- 同じ勤怠記録へ複数回報告してよいか。
- 過去日や取消済み記録への報告を許可するか。

### 解消済みP2: 変更箇所の直接テストがない

Account Consoleの権限ポリシー、共通ログイン応答、実績報告の本人・他人・存在しない記録を直接検証するテストを追加した。

## 5. 独立監査の必須項目

1. `shiftbuilder_permission` の追加で不要な個人情報や権限値が公開されないか。
2. Account APIを参照するOrderCase、ShiftBuilder、勤怠、Dashboardに回帰がないか。
3. `ACCOUNT_CONSOLE_ADMIN_ROLES` がGASの全ファイルで安全に共有できるか。
4. Account Console本体、登録申請管理、Dashboardの条件が本当に一致したか。
5. 既存管理担当者を締め出す可能性と、必要な移行確認。
6. URLクエリ由来のrole表示が、API側の権限突破に使えないか。
7. 実績報告の本人判定で、既存の勤怠シート見出しと値形式に対応できるか。
8. 本人メールの大文字小文字・空白正規化が一貫しているか。
9. 正当な実績報告を誤拒否する条件がないか。
10. 終了済み、対象予定、二重報告の条件を03前に直すべきか、04の業務判断へ残すべきか。
11. キャッシュ更新番号が必要な読込経路をすべて更新できているか。
12. 段階反映時に旧フロントと新GAS、または新フロントと旧GASが混在した場合の影響。
13. 今回の変更だけを検証する最小テスト案。
14. 無関係な未コミット差分を巻き込んでいないか。

## 6. 変更していない重要事項

- ShiftBuilderの配置、確定、公開から勤怠予定へ流す状態条件
- ShiftBuilder GASの権限判定
- 勤怠GAS独自の `manager`、`team_leader`、`leader`、`executive`、`labor`、`hr`、`dev`
- 既存ユーザー・既存データ
- API契約、シート列、Firebase設定
- GAS、本番、公開環境

これらを今回の修正に含めるべきだったかも監査するが、業務判断を推測して実装しないこと。

## 7. 確認済みの作業状態

- 対象JavaScriptとGASの構文確認: 成功
- `git diff --check`: 成功
- 全対象テスト: 29件成功（共有認証、Account Console、ShiftBuilder）
- 実行コマンド（`apps` から）: `node --test ../shared/tests/*.test.mjs account-console/tests/*.test.mjs shiftbuilder/tests/*.test.mjs`
- Account Console・勤怠GASの追加直接テスト: 8件成功
- commit: 未実施
- push: 未実施
- PR: 未実施
- GAS反映・デプロイ・公開: 未実施
- 本番データ変更: 未実施

## 8. 報告形式

最初に次のいずれかで結論を示す。

- 03着手前修正として承認可能
- 条件付き承認
- 差戻し

問題は重大度順に並べ、各項目へ次を含める。

1. 何が起きるか
2. 利用者への影響
3. 根拠ファイル・行
4. おすすめ対応

最後に、次を分ける。

- 03前に直す
- 03の権限設計で決める
- 04の業務仕様で決める
- 本番データ確認が必要

## 9. 初回Claude監査後の修正

初回Claude監査は「条件付き承認」だった。指摘を受け、次を修正した。

- Account Console本体と登録申請管理APIのrole必須化を取り消し、既存API条件へ戻した。正式条件は03で決める。
- 登録申請管理画面はURLクエリのroleではなく、IDトークンからAccount APIで再取得した利用者情報を使うようにした。
- 画面とAPIは、既存仕様どおり `admin/developer` または `account_console` で一致させた。
- `shiftbuilder_permission` に既知値以外が入っていてもDashboard入口を維持した。ShiftBuilder側の最終防御は未確認のため、03でGASを確認して正式設計する。
- 権限判定を `js/common/access-policy.mjs` へ分離し、直接テストを追加した。
- 共通ログイン応答と実績報告本人確認の直接テストを追加した。
- URLクエリ由来の利用者情報は、認証済み利用者情報の取得前に権限表示へ使わないようにした。

第1回再監査後、変更済み `config.js` を参照する全importのキャッシュ更新番号を統一し、存在しない勤怠記録の直接テストを追加した。最終再監査では最新差分を正本とし、以前の監査時点を現状と混同しないこと。
