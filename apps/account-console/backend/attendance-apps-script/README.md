# ShiftCore 勤怠API

`Code.gs` は、ShiftCore勤怠ダッシュボード用のGoogle Apps Script Web APIです。

## 本番リソース

- 勤怠管理スプレッドシート: 「ShiftCore 勤怠管理」
- 位置情報スプレッドシート: 「ShiftCore 位置情報（限定閲覧）」
- WebアプリURL: `https://script.google.com/macros/s/AKfycbzYSk46G7ZZx55vQIOC5pRqyA15rn15ORbTe_f72PVxmj5v0EISBbL4tpGA_ehOtnBnAQ/exec`

## 運用上の注意

- 正式な打刻時刻はApps Script側の日本時間で記録します。
- 位置情報は別ファイルへ保存し、原則7日で削除します。`setupAttendanceTriggers` を一度実行して、通知と自動削除のトリガーを登録してください。
- 管理者通知先は勤怠管理ブックの `管理者` シートを優先します。未作成または空の場合は、Apps Scriptの実行所有者へ通知します。
- `Code.gs` を変更した場合はApps Script側へ反映し、既存Webアプリの新バージョンを作成してください。デプロイIDは変更しません。
- 公開範囲は「全員」ですが、各API操作はFirebase IDトークンを既存ログイン基盤で検証します。

## 直属承認接続

- Account Console側と勤怠API側のScript Propertiesへ、同一の十分に長いランダム値を `ATTENDANCE_APPROVAL_SERVICE_SECRET` として設定します。値をソース、シート、ログへ保存しないでください。
- 勤怠GASからAccount GASへは既存Account Webアプリの `/exec` URLを直接呼び出します。ログイン用Cloudflare Workerは許可アクションが限定されているため、直属承認契約の中継には使用しません。
- 新規申請では `applicant_internal_user_id`、`request_version`、`approval_reviewer_internal_user_id`、`applicant_organization_version` 列を自動追加して保存します。既存の承認待ち行は自動変換せず、本人確認後の再申請が必要です。
- Account Consoleと勤怠APIの両方を反映するまで、実効承認へ切り替えないでください。片側だけの反映では新規申請または承認をfail-closedで拒否します。
