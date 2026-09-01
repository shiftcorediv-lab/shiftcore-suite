# ShiftCore ステージング環境

最終更新: 2026-09-02

## 目的

本番と同じフロントコードを使いながら、GAS、スプレッドシート、通知先を分離し、案件作成から実績報告・修正・差戻しまで確認するための環境です。本番データは複製しません。

## 入口

- ポータル: `https://shiftcorediv-lab.github.io/shiftcore-suite/apps/account-console/?shiftcore_env=staging`
- URLの `shiftcore_env=staging` は同じタブの間だけ保持されます。同一サイト内の新規タブ導線はURLへ環境を明示して継承します。
- テスト環境では全ページ上部に黄色の `TEST環境` バナーを表示します。
- テスト用APIが未設定・不正な場合、本番APIへフォールバックせず停止します。
- 黄色のTEST表示がない画面では操作を続けません。

## 公開文書へ記載しない情報

次の情報は、権限制限された非公開の運用台帳で管理します。このリポジトリ、GitHub Pages、コード、テスト出力、画面キャプチャへ転記しません。

- テスト担当者の実名、メールアドレス、内部ユーザーID
- 組織階層、直属承認経路、デモ用アカウントの割当
- Driveフォルダ、Spreadsheet、Apps Script、Webアプリの管理ID
- Script Propertiesの値、サービス間秘密、通知先アドレス

テスト担当者は、非公開台帳に登録された「管理者」「直属承認者」「作業者」の役割だけを使います。業務データは匿名のテスト案件・テスト店舗に限定します。

## 環境分離

- Firebase Authenticationは既存プロジェクトを共用します。
- 認証後の利用者・権限判定はテスト用Account GASとテスト用人員マスターで行います。
- Account、OrderCase、ShiftBuilder、PMO、Attendanceは、テスト専用GASとテスト専用スプレッドシートを使います。
- 通知先はテスト専用の上書き先だけに限定します。
- TEST画面から送るShift更新は、画面とGASの環境が一致しない場合、保存前に拒否します。

## Script Properties

値は非公開の運用台帳と各GASのScript Propertiesで管理します。

- Account: `SHIFTCORE_ENVIRONMENT`, `ACCOUNT_SPREADSHEET_ID`, `NOTIFICATION_EMAIL_OVERRIDE`, `PMO_V2_FRONT_URL`, `ATTENDANCE_APPROVAL_SERVICE_SECRET`, `PMO_ROSTER_SERVICE_SECRET`
- OrderCase: `SHIFTCORE_ENVIRONMENT`, `ORDERCASE_SPREADSHEET_ID`, `SHIFTBUILDER_SPREADSHEET_ID`, `SHIFTCORE_ACCOUNT_API_URL`, `NOTIFICATION_EMAIL_OVERRIDE`
- ShiftBuilder: `SHIFTCORE_ENVIRONMENT`, `ACCOUNT_SPREADSHEET_ID`, `SHIFTBUILDER_SPREADSHEET_ID`, `ORDERCASE_SPREADSHEET_ID`, `PMO_SPREADSHEET_ID`, `NOTIFICATION_EMAIL_OVERRIDE`
- PMO: `SHIFTCORE_ENVIRONMENT`, `PMO_SPREADSHEET_ID`, `SHIFTCORE_LOGIN_API_URL`, `SHIFTCORE_ROSTER_API_URL`, `PMO_ROSTER_SERVICE_SECRET`
- Attendance: `SHIFTCORE_ENVIRONMENT`, `SHIFTCORE_LOGIN_API_URL`, `SHIFTCORE_ACCOUNT_API_URL`, `SHIFTBUILDER_API_URL`, `NOTIFICATION_EMAIL_OVERRIDE`, `ATTENDANCE_APPROVAL_SERVICE_SECRET`

## E2E確認順

1. 管理者が匿名のテスト案件を作成する。
2. ShiftBuilderでテスト作業者をアサインし、開始・終了時刻を設定する。
3. 作業者が出発、位置情報確認、入店、終了報告を行う。
4. 対象案件を実績テンプレートへ対応付け、実績報告を提出する。
5. 個人ダッシュボードに本人の成績だけが表示されることを確認する。
6. 本人修正で改訂履歴が残ることを確認する。
7. 管理者差戻し後に再提出でき、旧版・新版をCSV履歴で確認できることを確認する。
8. 予定開始以降の入店、0時以降の終了、直属承認、通信失敗復帰、同日複数案件、狭い画面を回帰確認する。
9. ShiftからOrder詳細を新規タブで開き、TESTバナーとテスト用API接続が維持されることを確認する。

## 実演前の確認

1. 参加者は非公開台帳で割り当てられた各自のテストアカウントを使います。
2. 全画面上部に黄色の `TEST環境` と `本番データには接続していません` が出ることを確認します。
3. 管理者用端末と作業者用端末は、Googleアカウントが混ざらない別ブラウザープロファイルで開きます。
4. Dashboard、人員マスター、Order案件一覧、Shift、勤怠管理、実績報告管理を一度開き、接続先と権限を確認します。
5. 実演ごとに新しい匿名案件名を使い、過去の終了済み勤怠を打刻用に再利用しません。

## 実演時の注意

- 勤怠管理が0件でも故障とは限りません。当日分のOrderとShiftがない場合は正常な空表示です。
- 実績報告そのものに承認工程はありません。「差戻し」は修正依頼で、修正前後の内容は版として両方残ります。
- 予定開始後の入店は直属承認が必要です。通常の通し実演では開始時刻を未来に設定し、承認フローは別枠で説明します。
- 「本番表示へ戻る」は実演中に押しません。

## 更新ルール

- 本番GASのScript IDと本番の固定値は、コード内の環境安全判定に必要な場合だけ使用します。
- ステージングGASは `SHIFTCORE_ENVIRONMENT=staging` と必要な専用設定がない限り起動しません。
- 本番シートへの書込み、本番データのコピー、通知先への実利用者追加は禁止です。
- Another Portalの事務所風UIは凍結対象であり、ステージング構築にも混ぜません。
- Google資産や担当者の変更は、公開文書ではなく非公開の運用台帳だけを更新します。
