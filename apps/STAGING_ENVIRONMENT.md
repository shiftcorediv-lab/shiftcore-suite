# ShiftCore ステージング環境

最終更新: 2026-08-31

## 目的

本番と同じフロントコードを使いながら、GAS、スプレッドシート、通知先を完全に分離して、案件作成から実績報告・修正・差戻しまで確認するための環境です。本番データは複製していません。

## 入口

- ポータル: `https://shiftcorediv-lab.github.io/shiftcore-suite/apps/account-console/?shiftcore_env=staging`
- URLの `shiftcore_env=staging` は同じタブの間だけ保持されます。
- テスト環境では全ページ上部に黄色の `TEST環境` バナーを表示します。
- テスト用APIが未設定・不正な場合、本番APIへフォールバックせず停止します。

## テスト役

|役割|氏名|メール|ユーザーID|組織階層|稼働対象|
|---|---|---|---|---|---|
|進行・予備管理者|開発者|`shiftcore.div@gmail.com`|`U0000`|役員|対象|
|デモ管理者|髙尾|`takao@another-inc.jp`|`U0002`|役員|対象外|
|デモ管理者|山岸|`yamagishi@another-inc.jp`|`U0003`|マネージャー|対象外|
|デモ管理者|藤井|`fujii@another-inc.jp`|`U0004`|リーダー|対象外|
|作業者|細見大樹|`hosomi@another-inc.jp`|`U0001`|メンバー|対象|

- 組織経路は `開発者 ↔ 髙尾 → 山岸 → 藤井 → 細見` です。
- 髙尾・山岸・藤井は、人員マスター、Order、Shift、勤怠管理、実績報告管理を操作できます。
- Shiftの現場配置候補は細見大樹だけです。管理者3名は稼働対象外です。
- 細見大樹の直属承認者は藤井です。予定開始後の入店など、直属承認が必要な打刻を実演する場合は藤井で承認します。
- 業務データは匿名のテスト案件・テスト店舗だけを使用します。
- Firebase Authenticationは既存プロジェクトを共用しますが、認証後の利用者・権限判定はテスト用Account GASとテスト用人員マスターで行います。

## Googleリソース

Driveフォルダ: `https://drive.google.com/drive/folders/1O6l1LFVRnzht8MB-BhhUd8J6iwTPvFCv`

|用途|スプレッドシートID|Apps Script ID|WebアプリデプロイID|
|---|---|---|---|
|Account|`1Two-pmrk1mOilTam9d2Q4-6dK5IB3lHlYzxu_fSYiMg`|`1pD7ibjkJD4w5LDSQ9WHuK7UKlDOC7OaFj07IKowAQ1TfVsOhbUz-EYdA`|`AKfycbw0YEA6zX1G5SeBRgmw4LBDZzysYzNQFV9YJrrJlM1Iz34sNHLX1kIcW-Kd8ZoD6Hnkgw`|
|OrderCase|`1086BUxyzTldQcynvjI59Bkx2eXid5LyZCqKrg-JrgGI`|`15tYPXiv5QJYRF85BbxnmPzW0-bjKbGtdG7OTTlou9OOnIf0DuV9SV1rZ`|`AKfycbydvA5StNhjHqDRVc40ga3s3nzGRiYqyoY_TPNrAvVRqJ0vaHax1Jnv-_ylByN8Je2MPQ`|
|ShiftBuilder|`1hXEgfa5two09SsDyJ10Ez1Xe1ajI2ILNWd145C3G_HQ`|`1rcBcofYShFMmUwlpCGHDhUlJN7mrd-CAcUbltcmElUjXNlcB-848eKX4`|`AKfycbx3S77Mx_yKOUl2BXjuVSUg3PkJtnsTSgo8vNGsXvveZbwF7DjLAUeFHhbplbF_-NtXAA`|
|PMO|`1DL0c5V8iHTrUrutBOCcCs8NHOV3LDZjBpt_BIM5XleA`|`1R-xXd_pTM1Szj3Tw1nSGrOWdANgeVEhlW5Ili7cIEp5PttA_xjOnErSD`|`AKfycbxi4aViRJdx7Fw5Y3mRuyOR06ffjDdiAKzwgcv1SOVzjw7rExyXWAZ4EXtHrfQTTKxl`|
|Attendance|`1sct9PnbZeh9Qds3OGj_E2aHEjc5GpuGUe0E9KEPP11M`|`1EuPI0a7GOJMWCGDvWWfV67ZEPNc05CxJ5ETNhCI3LL0R5F03Ar7So4lb`|`AKfycbzARtxHt7O1W7e4f16VMLuBdkizN7wq8rOJhhuN9JgvMLBDk5fzIwCDBKV9L1Smdl4`|
|位置情報|`17SJfHlGJzxBB5h83r5ZAxisJx7aWm90FetP6zGF2hNM`|-|-|

## Script Properties

値そのものをコード・この文書・ログへ記録しません。`ATTENDANCE_APPROVAL_SERVICE_SECRET` はAccountとAttendanceへ同じ十分に長い値を設定します。

- Account: `SHIFTCORE_ENVIRONMENT`, `ACCOUNT_SPREADSHEET_ID`, `NOTIFICATION_EMAIL_OVERRIDE`, `PMO_V2_FRONT_URL`, `ATTENDANCE_APPROVAL_SERVICE_SECRET`
- OrderCase: `SHIFTCORE_ENVIRONMENT`, `ORDERCASE_SPREADSHEET_ID`, `SHIFTBUILDER_SPREADSHEET_ID`, `SHIFTCORE_ACCOUNT_API_URL`, `NOTIFICATION_EMAIL_OVERRIDE`
- ShiftBuilder: `SHIFTCORE_ENVIRONMENT`, `ACCOUNT_SPREADSHEET_ID`, `SHIFTBUILDER_SPREADSHEET_ID`, `ORDERCASE_SPREADSHEET_ID`, `PMO_SPREADSHEET_ID`, `NOTIFICATION_EMAIL_OVERRIDE`
- PMO: `SHIFTCORE_ENVIRONMENT`, `PMO_SPREADSHEET_ID`, `SHIFTCORE_LOGIN_API_URL`, `SHIFTCORE_ROSTER_API_URL`
- Attendance: `SHIFTCORE_ENVIRONMENT`, `SHIFTCORE_LOGIN_API_URL`, `SHIFTCORE_ACCOUNT_API_URL`, `SHIFTBUILDER_API_URL`, `NOTIFICATION_EMAIL_OVERRIDE`, `ATTENDANCE_APPROVAL_SERVICE_SECRET`

テスト通知は全サービスで `shiftcore.div@gmail.com` だけへ送ります。

## E2E確認順

1. 管理者でドコモテスト案件を作成する。
2. ShiftBuilderで細見大樹をアサインし、開始・終了時刻を設定する。
3. 作業者で出発、位置情報確認、入店、終了報告を行う。
4. 対象案件を実績テンプレートへ対応付け、実績報告を提出する。
5. 個人ダッシュボードに本人の成績だけが表示されることを確認する。
6. 本人修正で改訂履歴が残ることを確認する。
7. 管理者差戻し後に再提出でき、旧版・新版をCSV履歴で確認できることを確認する。
8. 予定開始以降の入店、0時以降の終了、直属承認、通信失敗復帰、同日複数案件、狭い画面を回帰確認する。

## 上司向け実演シナリオ

既存の `CASE-202608-0001` と細見大樹の第4版実績は、管理画面・集計・履歴の説明に使います。打刻は「本日」の予定だけを扱うため、実演当日に新しい案件を1件作成します。

### 実演前の準備

1. 参加者全員が各自の会社Googleアカウントでポータルへ一度ログインします。
2. 全画面上部に黄色の `TEST環境` と `本番データには接続していません` が出ることを確認します。
3. 管理者用端末と細見用端末は、Googleアカウントが混ざらない別ブラウザープロファイルで開きます。
4. 説明開始前に、Dashboard、人員マスター、Order案件一覧、Shift、勤怠管理、実績報告管理を一度開いておきます。
5. Shiftは既存データを説明する場合 `2026-08`、当日案件を使う場合は実演当月へ合わせます。

初回表示の目安は、本人ダッシュボードが約8〜10秒、Shiftの月切替が約20秒です。ShiftBuilderの最新予定同期はさらに時間がかかる場合がありますが、Dashboardや管理画面の操作を止める処理ではありません。

### 30分の実演順

1. **人員マスター（3分）**
   髙尾、山岸、藤井が管理者、細見が作業者であることと、利用可能機能を見せます。
2. **Order（5分）**
   `STGデモ-YYYYMMDD` のような名称で本日分のドコモ案件を1件作ります。開始は現在時刻の30分後、終了は90分後を目安にすると、承認待ちを挟まず打刻できます。
3. **実績対象設定（2分）**
   実績報告管理の「実績報告の対象案件」で、作成した案件をドコモ用テンプレートへ一度だけ対応付けます。日付・人員ごとの再設定は不要です。
4. **Shift（5分）**
   当月を表示し、作成した案件へ細見をアサインします。案件軸と人員軸の両方を見せます。
5. **勤怠・打刻（5分）**
   細見の端末で、出発、位置情報確認、入店を行います。管理者の勤怠管理で「稼働中」へ変わることを確認し、細見の端末で終了報告へ進みます。
6. **実績報告（5分）**
   細見の端末で数値・定性項目を入力して提出し、本人ダッシュボードへ本人の成績だけが出ることを見せます。
7. **実績管理（5分）**
   管理者が日別・月別・店舗別・人員別・案件別を切り替え、詳細、差戻し、通常CSV、修正履歴CSV、項目追加・停止後も残る過去回答を説明します。

### 実演時の注意

- 勤怠管理が0件でも故障ではありません。当日分のOrderとShiftがまだない場合は正常な空表示です。
- 実績報告そのものに承認工程はありません。「差戻し」は修正依頼で、修正前後の内容は版として両方残ります。
- 予定開始後の入店を行うと直属承認が必要になります。通常の通し実演では開始時刻を未来に設定し、承認フローは別枠で説明します。
- 黄色のTEST表示がない画面ではデモ操作を続けません。「本番表示へ戻る」は押しません。
- デモごとに新しい案件名を使い、過去の終了済み勤怠を打刻用に再利用しません。

## 更新ルール

- 本番GASのScript IDと本番の固定値はコード内の安全判定にだけ使います。
- ステージングGASは `SHIFTCORE_ENVIRONMENT=staging` と必要な専用設定がない限り起動しません。
- 本番シートへの書込み、本番データのコピー、通知先の実利用者追加は禁止です。
- Another Portalの事務所風UIは凍結対象であり、ステージング構築にも混ぜません。
