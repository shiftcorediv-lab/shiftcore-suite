# 03 権限設計 本番Shadow反映手順

- 作成日: 2026-08-10
- 状態: 第48版本番組織Shadow初期化・内部監査完了、実効権限切替は未実施
- 原則: この反映では既存の実効権限を変更しない

## 0. 本番正本との直接比較

2026-08-10にAccount GAS本番プロジェクトを一時領域へ読み取り取得し、ローカル正本とファイル単位で直接比較した。

- 初回比較時点の本番既存ファイルとの差分は `api.js`、`authorization.js`、`config.js` の3ファイルだった。その後のClaude監査対応で `account_console_users.js` を03対象へ追加した。
- ローカルで追加されるファイルは `authorization_change_logs.js`、`organization_assignments.js`、`organization_authorization.js`、`organization_bootstrap.js` の4ファイルだけだった。
- 2026-08-12の公開直前再比較では、既存4ファイルと新規4ファイルだけが差分で、その他の本番GAS 14ファイルはローカル正本と一致した。`account_console_users.js` のH-1修正も追加差分として確認済み。
- 既存URLの直前復帰基準はAccount GAS第44版とする。
- 比較は読み取り専用で実施し、本番ソース、データ、設定、デプロイは変更していない。

## 1. 反映対象

### Account GAS

- 既存変更: `api.js`、`authorization.js`、`config.js`、`account_console_users.js`
- 新規: `authorization_change_logs.js`
- 新規: `organization_assignments.js`
- 新規: `organization_authorization.js`
- 新規: `organization_bootstrap.js`

既存ファイルの変更内訳は次のとおり。

- `api.js`: 組織設定の取得・更新APIルーティングだけを追加する。
- `authorization.js`: 旧実効権限を維持した組織Shadow応答と `ordercase.case.create` の候補比較だけを追加する。
- `config.js`: 組織6列、監査ログ、Shadow・bootstrap用Script Property、権限候補コードの定数だけを追加する。
- `account_console_users.js`: 通常更新を組織更新と同じScriptLockで直列化し、行全体ではなく許可列だけを書き込む。組織6列は通常更新経路から変更しない。

### Account Consoleフロント

- `account-console.html` の組織設定欄
- `css/account-console.css`
- `js/account-console/api.js`
- `js/account-console/dom.js`
- `js/account-console/main.js`
- `js/account-console/ui.js`

`account-console.html` には03以外の既存未コミット差分があるため、コミット時は03の組織設定部分だけを選択する。その他のHTMLや共有テーマ差分を03へ混ぜない。

### コミット時の除外条件

- `account-console.html` はファイル丸ごとではなく、組織設定欄と03用モジュール更新だけを選択する。
- 同ファイルのテーマ参照先は公開時点の `origin/main` を正とし、ローカルの別作業による参照先変更を03へ含めない。
- `account_console_users.js` はH-1の競合修正を03対象へ含める。初回比較時に存在した空白だけの差分は含めず、ScriptLockと列単位書込みの実体差分だけを選択する。
- Account Console、OrderCase、ShiftBuilder等に残る共有テーマ・画面調整・PMO・資料の別作業差分は03対象外とする。
- `.clasp.json`、ルート `.gitignore`、`_shared/` は、本資料に列挙した03の正式対象として別途確認されない限り03コミットへ含めない。
- 最終コミット作成前に `origin/main` を基準として03差分だけのパッチを再構成し、ファイル一覧と内容を再監査する。
- 本番GAS操作は `account-console/backend/account-apps-script/.clasp.json` だけを使用する。apps直下の未追跡 `.clasp.json` は過去の比較用一時フォルダを指すため使用せず、03コミットにも含めない。

### テスト・資料

- `tests/authorization-shadow.test.mjs`
- 新規 `tests/account-console-update-concurrency.test.mjs`
- 新規 `tests/authorization-change-logs.test.mjs`
- 新規 `tests/organization-authorization.test.mjs`
- 03設計・移行・ロードマップ・内部監査・本手順

## 2. 本番データ変更

`users_master` の末尾へ次の6列だけを追加する。既存行は空欄のままにする。

1. `organization_level`
2. `direct_manager_user_id`
3. `executive_reviewer_user_id`
4. `organization_version`
5. `organization_updated_at`
6. `organization_updated_by`

`authorization_change_logs` を次の16列のヘッダーだけで作成する。

1. `authorization_change_log_id`
2. `authorization_event_id`
3. `occurred_at`
4. `event_type`
5. `request_id`
6. `actor_internal_user_id`
7. `target_internal_user_id`
8. `reviewer_internal_user_id`
9. `before_json`
10. `after_json`
11. `reason`
12. `result`
13. `error_code`
14. `source`
15. `previous_log_hash`
16. `log_hash`

準備処理は既存列を削除・移動・上書きしない。同名列の重複や既存監査シートのヘッダー不足があれば停止する。

監査ログの最終行ハッシュとデータ行数はScript Property `AUTHORIZATION_LOG_ANCHOR` にも保存する。これにより、シート内のハッシュ連鎖だけでは分からない末尾行の切り詰めも検出する。

## 3. 安全な実行順

### 初回役員候補の業務決定

- 初回役員は、えいちが指定した有効な社内利用者2名だけを対象とする。
- 本番Account Consoleで両名の本人表示と内部IDを読み取り照合済み。
- 既存の役職欄に「役員」と表示される別利用者は、今回の初回役員へ含めないと業務決定された。
- 既存の `position`、`role`、アカウント種別から新しい `organization_level` を自動設定しない。
- 氏名、メールアドレス、内部IDは公開リポジトリへ記録せず、承認された本番実行時の一時プロパティにだけ使用する。

1. 本番GASとローカル正本を直接比較し、送信差分を確定する。（2026-08-12公開直前再確認済み）
2. Script Property `ORGANIZATION_SHADOW_ENABLED=false` を先に設定する。
3. Account GASをpushし、新バージョンを既存URLへ公開する。
4. 組織Shadowが `false` の状態で、既存ログイン・既存権限API・Account Console一覧を確認する。
5. Script Propertiesへ一時的に次を設定する。
   - `ORGANIZATION_BOOTSTRAP_ENABLED=true`
   - `ORGANIZATION_BOOTSTRAP_ACTOR_ID=<実行する役員候補の内部ID>`
   - `ORGANIZATION_BOOTSTRAP_REASON=<承認済みの初期導入理由>`
6. Apps Scriptエディタから `setupOrganizationAuthorizationStorage` を手動実行する。
7. 追加6列が空で、監査シートにschema初期化ログだけがあることを再読取する。
8. `AUTHORIZATION_LOG_ANCHOR` がschema初期化ログの件数と末尾ハッシュに一致することを確認する。
9. Script Propertiesへ `AUTHORIZATION_INTEGRITY_RECIPIENT_IDS=<役員2名と独立監査担当の内部IDをCSV>`、`AUTHORIZATION_INTEGRITY_EXECUTIVE_IDS=<役員2名の内部IDをCSV>`、`AUTHORIZATION_INDEPENDENT_AUDITOR_ID=<独立監査担当の内部ID>` を設定する。メールアドレスは固定保存せず、送信時に人員マスターのactive利用者から解決する。
10. `assertAuthorizationIntegrityRecipientRoles_` で役員2名と、それらとは別の独立監査担当が全員含まれることを確認する。この検証は日次トリガー作成関数からも必ず実行される。
11. `sendAuthorizationIntegrityTestNotification` を手動実行し、3名全員で実際の着信を確認する。存在しない、停止中、メール不正の利用者は関数側で拒否する。
12. `setupAuthorizationIntegrityDailyTrigger` を手動実行し、毎日6時台の検査トリガーが1件だけ存在することを確認する。
13. `runAuthorizationIntegrityAudit` を手動実行し、正常終了を確認する。監査シート自体がない場合も異常通知を試みる。
14. 役員候補2名の内部IDと組織6列の変更前値を読み取り、承認記録へ一時保存する。公開リポジトリには保存しない。
15. `ORGANIZATION_BOOTSTRAP_EXECUTIVE_IDS=<2人以上の役員候補IDをCSV>` を設定する。
16. Apps Scriptエディタから `runOrganizationExecutiveBootstrap` を手動実行する。
17. 役員候補だけがversion 1で設定され、相互または循環する別役員承認者になっていることを再読取する。
18. 成功後に実行許可がfalse、一時プロパティが削除、組織Shadowがtrueになったことを確認する。
19. 共通権限APIで旧実効権限が変わらず、組織Shadowだけが返ることを確認する。
20. Account Consoleフロントを公開し、役員テストアカウントで組織設定欄の読取だけを確認する。
21. 他の利用者は、個別確認後にAccount Consoleから1人ずつ設定する。初回反映と同時には行わない。

## 4. 即時停止

異常時は最初に `ORGANIZATION_SHADOW_ENABLED=false` とする。これにより組織Shadowだけを止め、旧実効権限を維持する。

次にAccount Consoleフロントを直前版へ戻し、必要ならGASを直前デプロイ版へ戻す。追加列と監査ログシートは削除せず、証拠として残す。

GASを監査関数が存在しない版へ戻す場合は、先に `removeAuthorizationIntegrityDailyTrigger` を実行して日次トリガーを削除する。監査ログと `AUTHORIZATION_LOG_ANCHOR` は削除しない。

## 4.1 アンカー保存中断時の復旧

監査ログ追記後・アンカー保存前の中断など、シート内のハッシュ連鎖は正常だがアンカーだけが不一致の場合に限り再基線化できる。

1. `ORGANIZATION_SHADOW_ENABLED=false` とし、組織変更を停止する。
2. 監査シートのバックアップと現状のアンカー値を別保管する。
3. ハッシュ連鎖、未完了イベント、復旧要求に異常がないことを別担当者が確認する。
4. Script Propertiesへ `AUTHORIZATION_ANCHOR_REBASE_ENABLED=true` と `AUTHORIZATION_ANCHOR_REBASE_REASON=<承認済み理由>` を設定する。
5. `rebaselineAuthorizationLogAnchor` を手動実行する。ハッシュ連鎖等に異常があれば拒否される。成功時は `audit.anchor.rebaseline` イベントと承認理由を監査ログへ追記し、その行を含む新アンカーを保存する。
6. 実行後は許可がfalse、理由プロパティが削除され、再基線化イベント、新アンカー、監査シート末尾が一致することを再読取する。
7. `runAuthorizationIntegrityAudit` の正常終了を確認後、別承認で組織Shadowを再開する。

## 5. 初回役員設定のロールバック

初回役員設定直後で、他の利用者をまだ1人も設定していない場合だけ実行できる。

1. `ORGANIZATION_SHADOW_ENABLED=false` にする。
2. 初回実行直前に保存した読み取り控えと、`authorization_change_logs` の `organization.bootstrap` 成功イベントに記録された対象IDを照合する。両方が一致した場合だけ、その対象IDをロールバック用の役員IDとして使用する。
3. bootstrapの実行許可、照合済み役員ID、実行者ID、理由を再設定する。実行者は対象役員本人または設定済みの独立監査担当に限定し、bootstrapと同じ本人メール照合を行う。氏名・メールではなく内部IDを使い、公開リポジトリには保存しない。
4. `runOrganizationExecutiveBootstrapRollback` をApps Scriptエディタから実行する。
5. 対象役員がversion 1であり、設定済み利用者が対象役員だけの場合に限り空欄へ戻す。
6. 監査ログ、空欄復元、実行許可false、一時プロパティ削除を再読取する。

他利用者の設定開始後はこの一括ロールバックを拒否する。以後は監査ログを根拠に個別の変更として戻す。

## 6. 公開後の確認

- 既存ログイン
- Account Console一覧
- 既存 `allowed_modules`、OrderCase旧権限、ShiftBuilder旧権限
- 共通権限APIの `modules` が旧判定のままであること
- 共通応答へ直属管理者ID・役員承認者IDが含まれないこと
- 組織Shadow停止時も旧権限が返ること
- 監査ログの開始・成功イベントとハッシュ連結
- `runAuthorizationIntegrityAudit` が正常終了し、未完了イベント・復旧要求・ハッシュ不一致が0件であること
- Account Consoleで編集不可対象が無効表示になること
- 外部人員、自己変更、同格以上、別系統、版競合が拒否されること
- 組織Shadow停止中は組織変更APIも拒否されること

## 7. 実行しないもの

- 新権限を実効権限として使う切替
- 既存role・旧権限列の削除
- OrderCase・ShiftBuilder・勤怠GASの権限切替
- 役員候補以外の一括割当
- 正確な位置情報閲覧権限の割当
- commit、push、本番GAS反映、公開（それぞれ明示承認まで実行しない）

## 8. developer全権・業務名簿非表示変更のロールバック

この節は、developer全権化、developerアカウント変更監査、ShiftBuilder／PMOのdeveloper非表示を反映する場合に使用する。反映実行前に、次の復帰基準を読み取り記録する。版番号やコミットSHAは推測で埋めず、実際のデプロイ一覧と公開履歴から転記する。

| 系統 | 反映直前の復帰基準 | 記録者・日時 |
|---|---|---|
| Account GAS | デプロイ版番号: `49` | Codex読み取り確認・2026-08-15 |
| PMO GAS | デプロイ版番号: `23` | Codex読み取り確認・2026-08-15 |
| ShiftBuilder GAS | デプロイ版番号: `38` | Codex読み取り確認・2026-08-15 |
| OrderCase GAS | デプロイ版番号: `51` | Codex読み取り確認・2026-08-15 |
| 静的フロント | 直前の公開コミットSHA: `454500070df1c720825e2688db78ff08bfe7865b` | GitHub Pages成功確認・2026-08-15 |

### 8.1 反映順序

1. 上表の4系統GASと静的フロントの復帰基準を記録する。
2. 4系統GASを反映し、各既存URLで認証・既存操作・developer権限・非developer拒否を確認する。
3. GASの確認完了後に静的フロントを公開する。
4. Dashboardでdeveloperに全入口が表示され、各入口のGASが拒否しないことを確認する。

GASを先行し、静的フロントを後にする。逆順にすると、フロントだけがdeveloperへ全入口を表示し、未更新GASがアクセスを拒否する不整合期間が生じる。

### 8.1.1 2026-08-15 本番正本との再比較

4系統GASを一時領域へ読み取り取得し、ローカル正本とファイル単位で比較した。デプロイID、利用者情報、認証情報は記録しない。

- Account GAS: `account_console_users.js`、`api.js`、`authorization.js`、`organization_assignments.js`、`pmo_roster.js`、`signup_admin.js`、`signup_user_write.js` の7ファイルが差分。
- PMO GAS: `shiftcore_roster.js` の1ファイルだけが差分。
- ShiftBuilder GAS: `ShiftBuilderService.js`、`api.js`、`repositore.js`、`utils.js` の4ファイルが差分。
- OrderCase GAS: 6ファイルに差分があるが、本変更の対象は `Service_OrderCasePermissions.js` の1ファイルだけ。ほか5ファイルは本番第51版とローカルブランチの既存差分であり、本変更へ含めない。

OrderCaseはリポジトリ正本フォルダから直接一括pushしない。本番第51版を新しい一時領域へ取得し、`Service_OrderCasePermissions.js`だけをSHA固定済み内容へ置き換えた専用反映束を作り、その束の全ファイルを第51版と再比較して、差分が1ファイルだけであることを確認してから反映する。

静的フロントの復帰基準はGitHub Pages成功コミット `454500070df1c720825e2688db78ff08bfe7865b`。ローカル作業ブランチはmainと分岐しているため直接pushしない。最新mainを基礎にした一時worktreeまたは専用ブランチへ、8.2の4ファイルの必要ハンクだけを適用し、公開差分を再確認する。

### 8.2 静的フロントの復帰

静的フロントで本変更に直接関係するH-1の6ファイルは次のとおり。

- `apps/account-console/js/common/access-policy.mjs`
- `apps/account-console/js/dashboard/modules.js`
- `apps/account-console/js/dashboard/main.js`
- `apps/account-console/dashboard.html`
- `apps/account-console/js/signup-admin/main.js`
- `apps/account-console/signup-admin.html`

異常時は、新規の修正コミットを作成して上表の直前公開コミットから上記6ファイルの内容と読み込み版番号を復元し、通常のGitHub Pages公開経路で反映する。履歴を残すため、公開済みコミットのreset、強制push、履歴改変は行わない。ほかの同時公開差分がある場合はファイル単位で一括復元せず、本変更のハンクだけを戻す。

### 8.3 GASの復帰

1. フロントの新規公開を停止する。
2. Account、PMO、ShiftBuilder、OrderCaseの順に、上表へ記録した反映直前版を各既存URLへ再指定する。
3. 各URLのpingまたは認証済み読取、既存権限、developer以外の利用者の既存操作を確認する。
4. 4系統すべての復帰確認後、静的フロントを8.2の手順で直前状態へ戻す。

組織Shadow自体の異常も伴う場合は、先に `ORGANIZATION_SHADOW_ENABLED=false` とし、既存の第4節と第44版復帰基準を併用する。監査ログ、アンカー、既存シート、既存配置履歴は削除しない。

### 8.4 データ復帰の扱い

本変更は、利用者、権限割当、配置、PMO月次行、監査シートのデータ移行を伴わない。したがって、反映中に本番データ変更を行っていなければ、4系統GASと静的フロントを直前版へ戻すコード復帰だけで完全に戻る。

作成済みPMO月次シートのdeveloper該当行を別途移行する場合は本節の対象外とし、別の承認、バックアップ、変更前後件数、個別ロールバック手順を用意する。

## 9. 2026-08-15 developer権限変更の反映記録

- Account GAS: 第50版。既存URLのpingで `success=true`、`message=pong` を確認。
- PMO GAS: 第24版。既存URLのpingで `success=true`、`message=pong` を確認。
- ShiftBuilder GAS: 第39版。既存URLのpingで `success=true`、`ok=true` を確認。
- OrderCase GAS: 第52版。ping actionは未実装のため、認証必須の `getOrderCasePermission` がJSONで応答し、IDトークンなしを拒否することを確認。
- 静的フロント: mainコミット `d2b865d28094ab8eb8dfc085182bfbca58749f8d`。GitHub Pages run `31871164600` が成功。
- Pages公開後、`dashboard.html` → `dashboard/main.js` → `dashboard/modules.js` → `common/access-policy.mjs` の読込版番号と、developerへ4入口を返す実装をHTTPで再確認した。
- 反映前後の本番件数は一致した。role=developer 1件、developer配置36件（有効扱い4件）、既存PMO月次該当行2件。データ削除・移行は行っていない。
- 独立監査は、えいちの決定により全反映完了後のまとめ監査へ延期した。

### 9.1 2026-08-17 developer既存配置の移行

- 独立監査後の読み取りで、有効扱い4行が重複のない4セルにあり、developer非表示後は各セルの不足数が1ずつ増えることを確認した。
- えいちの別承認により、4行を理由付きでアーカイブした。削除は行わず、`shift_audit_logs` へ変更前後と理由を4行記録した。
- 反映後はdeveloper配置36行のうちactive 0行。理由付きアーカイブ4行と対応する監査ログ4行を再読取した。

### 9.2 2026-08-17 独立監査是正の最終反映

- 本番Account GAS第50版を一時領域へ読み取り取得し、ローカル正本との差分が `organization_authorization.js`、`organization_assignments.js`、`authorization_change_logs.js` の3ファイルだけであることを確認した。
- 正規のAccount GASフォルダから反映し、既存URLを第51版へ更新した。pingのJSON正常応答、デプロイ版番号、第51版の再取得ソースとローカル正本22ファイルの完全一致を確認した。
- 最新main `d2b865d` を基礎とする専用公開ブランチへ、`signup-admin.html` と `js/signup-admin/main.js` の版番号2行だけを適用した。テーマその他の差分は含めていない。
- 静的フロント公開コミットは `95c8db0cf1e238b662645e35a62f5766e275b47d`。GitHub Pages run `31971757746` は成功した。
- 実配信URLでHTMLが `main.js?v=20260812-developer-1`、main.jsが `navigation.js?v=20260812-developer-1` を参照し、旧navigation版番号が残っていないことを確認した。
- 利用者、権限、配置、案件、必要人数、シートデータは変更していない。

## 10. 実効切替前提機能2件のShadow反映結果

- Account GASの既存URLは第52版 `03 executive bulk shadow API 2026-08-17`、OrderCase GASの既存URLは第53版 `03 case create capability guard 2026-08-17` を参照することを、認証済みデプロイ一覧で確認した。
- Accountは複数役員一括更新action、OrderCaseは案件登録専用capabilityガードを反映した。シート列追加、権限割当、組織階層、案件、店舗、配置、利用者データの変更は行っていない。
- ローカル正本のAccount Console、OrderCase、ShiftBuilder、PMO全122テストは成功、失敗・スキップ0件。
- 今回の監査環境から既存URLへのHTTP再確認は完了できていない。実行許可レビューの時間切れであり、本番応答失敗とは判定しない。デプロイ版指定の確認とHTTP到達確認を区別して記録する。
- H-6の単一更新暫定回避はShadow中だけ維持する。developer全権が単一更新APIから一括検証を迂回できる競合を避けるため、実効権限切替前に役員グラフ変更を一括更新APIへ限定し、迂回拒否テストを追加する。
- 異常時の復帰基準はAccount第51版、OrderCase第52版。本変更はデータ移行を伴わないため、書込みを伴う本番検証を行っていなければコード復帰だけで戻る。

## 11. 実効権限切替機構（第57版反映済み・切替未実施）

切替実装の独立監査、main統合、Account GAS第57版への反映、既存URLのping、反映後ソース一致は完了した。Script Properties設定と実効切替は未実施であり、次の操作にはえいちの別決裁を必要とする。

1. Apps Scriptエディタから `runAuthorizationEffectiveCutoverPreview` を実行し、実行ログの `AUTHORIZATION_CUTOVER_PREVIEW` に続く件数結果で、`ok=true`、`unconfigured_users=0`、`invalid_users=0`、`unknown_migrated_users=0` を確認する。この関数は内部ID一覧を出力せず、権限modeとScript Propertiesを変更しない。
2. Script Propertiesへ `AUTHORIZATION_CUTOVER_MIGRATED_USER_IDS=<移行確認済みactive内部利用者IDのCSV>`、`AUTHORIZATION_CUTOVER_ACTOR_ID=<実行者内部ID>`、`AUTHORIZATION_CUTOVER_REASON=<承認済み理由>`、`AUTHORIZATION_CUTOVER_ENABLED=true` を設定する。IDやメールを公開資料へ転記しない。
3. えいちの切替実行決裁後に `runAuthorizationEffectiveCutover` を1回だけ実行する。関数は切替前整合性監査、active内部developer本人照合、Script Lock、移行件数、監査開始ログを再検証してから `AUTHORIZATION_ENFORCEMENT_MODE=effective` とする。
4. 直後に共通権限APIで `mode=effective`、`legacy_fallback=false` と対象テストアカウントの許可・拒否を確認し、`runAuthorizationIntegrityAudit` を手動実行する。切替操作ログと監査結果を保存し、7日間の日次監視を開始する。
5. 異常時は `AUTHORIZATION_CUTOVER_ACTOR_ID` と理由を設定し、`runAuthorizationEffectiveRollback` を実行する。ロールバック関数は監査ログの成否より先に `AUTHORIZATION_ENFORCEMENT_MODE=shadow` へ戻す。再試行には今回限りの例外を適用せず、新たな例外決裁または第三者監査担当の再決裁を必要とする。

PR #45はsquash mergeされ、GitHub mainは `4d3d9eca431a41a5a5313841eac1153895ef7d9a` となった。本番第56版を読み取り取得した結果、mainとの差分は今回対象の `authorization.js`、`config.js` と、対象外の `account_console_logs.js` 先頭空行だけだった。対象外空行を維持して今回の2ファイルだけを重ね、Account GAS第57版 `03 effective authorization cutover implementation 2026-08-22` として既存URLへ反映した。pingは `success=true`、`message=pong`、反映後に再取得した23ファイルは送信元と完全一致した。Script Property設定、本番実効切替、切替直後の補償監査、7日間監視は未実施である。

第57版反映後、`clasp run previewAuthorizationEffectiveCutover` はstorage `NOT_FOUND`で結果を取得できず、Apps Scriptエディタの通常実行も関数戻り値を表示しないことを確認した。件数を検証できないまま切替準備へ進まないため、件数だけを実行ログへ出す `runAuthorizationEffectiveCutoverPreview` と回帰テストを追加し、Account Console全142テストが成功した。第58版への反映と実行結果確認が完了するまで、Script Properties設定と実効切替は行わない。

## 12. 2026-08-23 実効切替後のShadow復帰

- 第59版で切替前監査を正常化した後、えいちの決裁により実効切替を1回実行し、直後の整合性監査まで完了した。
- 切替後の読み取り確認で、移行済みID集合の件数確認だけでは旧管理対象権限と新割当の同等性を保証できず、割当0件を意図的な剥奪として通過させることが判明した。旧権限を持つ利用者の業務アクセス喪失を避けるため、実効運用と7日間監視は開始せず、えいちの承認後に手動ロールバックした。
- ロールバック後は `AUTHORIZATION_ENFORCEMENT_MODE=shadow`、`AUTHORIZATION_CUTOVER_ENABLED=false`、一時的な実行者・理由が残っていないことを実画面で確認し、`runAuthorizationIntegrityAudit` も例外なく完了した。権限割当データ自体は変更していない。
- 今回限りの監査独立性例外は失効済みである。再切替前に、読み取り専用の旧権限同等性診断を本番反映・実行し、不足・余剰capabilityとscope差を0件にするか、各差分を意図的な変更として個別承認する。続いて新たな監査例外決裁または第三者監査担当の再決裁、独立監査、切替決裁を経る。件数プレビューだけで再切替しない。

## 13. 2026-08-24 移行診断の第60版反映・実行結果

- PR #49をmainへ統合した後、本番第59版を一時領域へ読み取り取得した。差分は今回対象の `authorization.js` と、対象外の `account_console_logs.js` 先頭空行だけだったため、対象外空行を維持して診断関数を含む `authorization.js` だけを重ねた。
- Account GAS第60版 `03 legacy authorization migration preview 2026-08-24` を作成し、既存WebアプリURLを第60版へ更新した。デプロイ版番号、既存URLのping正常応答、反映後に再取得した23ファイルと送信元の完全一致を確認した。
- `clasp run`はstorage `NOT_FOUND`となったため再試行せず、Apps Scriptエディタから `runAuthorizationLegacyAssignmentMigrationPreview` を1回実行した。実行ログは開始と完了を記録し、内部ID・氏名・メール・利用者一覧を出力していない。
- 診断はShadowのまま完了し、active内部利用者9名、旧管理対象権限あり8名、新管理対象割当あり1名、追加が必要な利用者8名、削除が必要な利用者1名、不足capability 104件、余剰capability 4件、不足scope 18件、余剰scope 0件、不正利用者・不正割当0件、`ok=false`だった。
- 第60版反映と診断では、権限割当、Script Properties、組織、利用者、申請データを変更していない。`ok=false`のため実効切替、補償監査、7日間監視は開始しない。次工程は差分の移行案または個別承認単位への分解であり、再切替には別途監査独立性と切替の決裁を必要とする。

## 14. 2026-08-24 移行計画プレビューの第61版反映・実行結果

- PR #51の最終独立再監査は承認され、merge commit `ea69585a88c6fa49b27205d42574af6d2df94589` としてmainへ統合した。本番第60版との差分は今回対象の `authorization.js` と、対象外の `account_console_logs.js` 先頭空行だけだったため、対象外空行を維持して `authorization.js` だけを重ねた。
- Account GAS第61版 `03 authorization migration plan preview 2026-08-24` を作成し、既存WebアプリURLを第61版へ更新した。デプロイ版番号、既存URLのping正常応答、反映後に再取得した23ファイルと送信元の完全一致を確認した。
- Apps Scriptエディタから `runAuthorizationLegacyAssignmentMigrationPlanPreview` を1回実行した。実行ログは開始、件数と計画ハッシュだけを含む `AUTHORIZATION_LEGACY_MIGRATION_PLAN`、完了の順で記録され、内部ID、割当ID、氏名、メール、対象一覧を出力していない。
- 本番計画はShadowのまま、Account Console 36行追加、OrderCase 56行追加、Shift 12行追加・4行アーカイブ・3行維持、合計104行追加・4行アーカイブ・3行維持、不正利用者・不正割当0件だった。計画ハッシュは `DWyknJz-j34g4h7CYmpo04WXfkPJRSaqe_VvmkrDbYA` である。
- 本節では権限割当、Script Properties、組織、利用者、申請データ、監査ログ、実効modeを変更していない。一括移行本体は未実装、権限移行は未実施である。実効切替機構は実装・本番反映済みだが、Shadowからの再切替は未実施である。権限移行と再切替は、それぞれ既存の独立監査・監査独立性条件と、えいちの別決裁を必要とする。

## 15. 旧権限同等の一括移行実行条件

一括移行本体は独立監査、main統合、Account GAS第62版へのコード反映まで完了したが、権限割当を書き換える移行実行は未実施である。コード反映と移行実行を同じ決裁で扱わない。

1. Account GASへ反映後、読み取り専用プレビューを再実行し、計画ハッシュが `DWyknJz-j34g4h7CYmpo04WXfkPJRSaqe_VvmkrDbYA`、追加104行、アーカイブ4行、維持3行、不正利用者・不正割当0件であることを確認する。異なる場合はScript Propertiesを設定せず停止する。
2. 権限移行のえいち決裁後に限り、Script Propertiesへ移行実行者、理由、承認済み計画ハッシュ、一回許可を設定する。実値、内部ID、メールを公開資料へ記録しない。
3. 移行開始から事後確認完了まで、権限割当シートの手動編集と、同じシートへ書き込む他処理を停止する。Script LockはApps Script間の協調には使えるが、人がGoogle Sheetsを直接編集する操作を遮断しない。
4. Apps Scriptエディタから `runAuthorizationLegacyAssignmentMigrationApply` を1回だけ実行する。関数はShadow、Script Lock、active内部developer本人照合、承認ハッシュ、事前整合性監査を再確認し、一回許可を消費してから書き込む。事後監査は現在処理中のイベントだけを未完了判定から除外し、他の異常検出を維持する。
5. startedとsuccessが同じ監査イベントで記録され、実行後プレビューが追加0行・アーカイブ0行・不正0件となることを確認する。success後にerrorまたはrecovery_requiredがある場合は時系列上で最後の終端状態を採用し、成功扱いしない。権限割当行数、active／archived件数、実効modeがShadowであることも読み取り確認する。
6. `AUTHORIZATION_MIGRATION_RECOVERY_REQUIRED` または `recovery_required` が出た場合は再実行せず、実効切替を禁止し、追加行とアーカイブ対象行を固定ハッシュ時点の計画および監査ログと照合して手動復旧を判断する。
7. 権限移行完了後も直ちに再切替しない。読み取り専用診断と切替プレビュー、独立監査、既存の監査独立性条件、えいちの再切替決裁を別工程として実施する。

## 16. 2026-08-24 一括移行本体の第62版反映・再プレビュー結果

- PR #53の最終独立再監査は承認され、squash merge後のmain統合commit `a8837ab7c152476aabf91877134b8b0e82149d06` としてmainへ統合した。
- 本番第61版との差分は今回対象の `authorization.js`、`authorization_change_logs.js`、`config.js` と、対象外の `account_console_logs.js` 先頭差分だけだった。対象外差分を維持し、今回対象3ファイルだけを第61版ソースへ重ねた。
- Account GAS第62版 `03 guarded authorization migration apply 2026-08-24` を作成し、既存WebアプリURLを第62版へ更新した。既存URLのpingは `success=true`、`message=pong` を返し、反映後に再取得した23ファイルは送信元と完全一致した。
- Apps Scriptエディタから `runAuthorizationLegacyAssignmentMigrationPlanPreview` を1回実行し、開始、件数と計画ハッシュ、完了を確認した。結果はShadow、計画ハッシュ `DWyknJz-j34g4h7CYmpo04WXfkPJRSaqe_VvmkrDbYA`、Account Console 36行追加、OrderCase 56行追加、Shift 12行追加・4行アーカイブ・3行維持、合計104行追加・4行アーカイブ・3行維持、不正利用者・不正割当0件で、承認済み計画と一致した。
- 本節では権限割当、Script Properties、組織、利用者、申請データ、監査ログ、実効modeを変更していない。権限移行とShadowからの再切替は未実施である。移行用Script Propertiesの設定と移行関数の実行は、えいちの別決裁まで行わない。

## 17. 2026-08-24 旧権限同等の一括移行実行結果

- えいちの別決裁後、移行中は権限割当シートを手動編集しないよう依頼し、移行実行者、理由、承認済み計画ハッシュ、一回許可をScript Propertiesへ設定した。他writerの実行有無は未確認である。内部ユーザーID、メール、設定値の実値は本記録へ転記していない。
- Apps Scriptエディタから `runAuthorizationLegacyAssignmentMigrationApply` を1回だけ実行した。実行ログは開始と完了を記録し、例外、`AUTHORIZATION_MIGRATION_RECOVERY_REQUIRED`、`recovery_required` は表示されなかった。
- 実行直後の読み取り専用計画プレビューは `mode=shadow`、`ok=true`、追加0行、アーカイブ0行、維持107行、Account Console・OrderCase・Shiftの追加・アーカイブ0行、不正利用者0件、不正割当0件だった。移行前の固定計画である追加104行、Shift 4行アーカイブ、既存3行維持は解消された。
- Script Propertiesは `AUTHORIZATION_MIGRATION_ENABLED=false`、`AUTHORIZATION_ENFORCEMENT_MODE=shadow` で、移行実行者、理由、承認済み計画ハッシュの一時設定は削除済みだった。
- Codexが本工程で実行した業務データ変更は、固定計画に基づく権限割当104行の追加と既存Shift割当4行のアーカイブだけである。利用者、組織、申請データ、実効modeを変更する操作は行っていない。内部ユーザーID、割当ID、氏名、メール、対象一覧は公開ログと本記録へ含めていない。
- 権限移行完了後もShadow運用を維持する。読み取り専用の移行診断と切替プレビュー、独立監査、既存の監査独立性条件、えいちの再切替決裁が完了するまで `runAuthorizationEffectiveCutover` を実行しない。

## 18. 2026-08-24 実効切替プレビューの停止・再確認結果

- 権限移行後の初回 `runAuthorizationEffectiveCutoverPreview` は `ok=false`、`mode=shadow`、active内部利用者9名、旧管理対象権限あり8名、設定済み0名、未設定9名、不正利用者0件、未知の移行済みID 0件だった。確認済み利用者集合が未設定のため、切替準備を停止した。
- Google Sheets正本の `users_master` を必要列に限定して読み取り、実装と同じactive・内部利用者判定で9名・重複なしを確認した。内部ユーザーID、氏名、メール、対象一覧は公開ログと本記録へ含めていない。
- えいちの別決裁後、9名を `AUTHORIZATION_CUTOVER_MIGRATED_USER_IDS` へ設定した。`AUTHORIZATION_CUTOVER_ENABLED=false`、`AUTHORIZATION_ENFORCEMENT_MODE=shadow` は維持し、Codexは実効切替、権限割当、利用者、組織、申請データを変更する操作を行っていない。
- 設定後の再プレビューは `ok=true`、`mode=shadow`、active内部利用者9名、旧管理対象権限あり8名、設定済み9名、未設定0名、不正利用者0件、未知の移行済みID 0件だった。
- 本節の合格結果は実効切替の決裁または実行ではない。固定差分の独立監査と既存の監査独立性条件を確認し、えいちが別途決裁するまで `AUTHORIZATION_CUTOVER_ENABLED=true` の設定と `runAuthorizationEffectiveCutover` の実行を行わない。
