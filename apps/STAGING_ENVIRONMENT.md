# ShiftCore ステージング環境

最終更新: 2026-08-30

## 目的

本番と同じフロントコードを使いながら、GAS、スプレッドシート、通知先を完全に分離して、案件作成から実績報告・修正・差戻しまで確認するための環境です。本番データは複製していません。

## 入口

- ポータル: `https://shiftcorediv-lab.github.io/shiftcore-suite/apps/account-console/?shiftcore_env=staging`
- URLの `shiftcore_env=staging` は同じタブの間だけ保持されます。
- テスト環境では全ページ上部に黄色の `TEST環境` バナーを表示します。
- テスト用APIが未設定・不正な場合、本番APIへフォールバックせず停止します。

## テスト役

- 作業者: 細見大樹 / `hosomi@another-inc.jp` / `U0001`
- 管理者: 開発者 / `shiftcore.div@gmail.com` / `U0000`
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

## 更新ルール

- 本番GASのScript IDと本番の固定値はコード内の安全判定にだけ使います。
- ステージングGASは `SHIFTCORE_ENVIRONMENT=staging` と必要な専用設定がない限り起動しません。
- 本番シートへの書込み、本番データのコピー、通知先の実利用者追加は禁止です。
- Another Portalの事務所風UIは凍結対象であり、ステージング構築にも混ぜません。
