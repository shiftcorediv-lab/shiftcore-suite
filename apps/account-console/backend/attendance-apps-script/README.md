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
