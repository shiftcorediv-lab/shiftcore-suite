# Another Portal — AP連携API設計 v0.1

更新日: 2026-08-23  
状態: 2026-08-23付で開発凍結。Webhook受信基盤とbootstrap APIはローカル実装済み、本番未反映。

## 0. 実装状況

2026-08-23時点で、Another Portal側に以下をローカル実装済み。

- `POST /api/v1/integrations/ap/events`
- HMAC-SHA256署名検証
- タイムスタンプの5分制限
- 64KiB本文上限
- イベント形式検証
- `event_id` による重複排除と本文競合拒否
- D1の `ap_events` と `presence`
- 古いイベントによる在席状態の巻き戻り防止
- Drizzleスキーマと初回マイグレーション
- Firebase IDトークンをAPで検証する `GET /api/v1/bootstrap`
- 組織単位の勤務中メンバー取得と本人の接続時刻更新
- Webhook未着時のAP勤怠照合フォールバック
- IDトークンを保存・ログ出力しない上流API呼び出し
- Portal画面のFirebaseログインとbootstrap実データ描画
- 読込中、未認証、利用対象外、AP接続失敗の画面状態

AP勤怠側にも以下をローカル実装済み。

- `clockIn` / `clockOut` 成功後のイベント生成
- `Portal連携Outbox` の自動作成と重複登録防止
- HMAC-SHA256署名付き配信
- 1分トリガーによる再送
- 最大10回、上限6時間の段階的バックオフ
- 4xx恒久エラーと再送対象エラーの分離
- Portal配信失敗を勤怠保存失敗へ戻さない処理
- 位置情報、メール、IDトークンをイベントへ含めないテスト
- 直接雇用者だけを対象にした、出勤成功後のPortal遷移（暫定アクセス境界）
- HTTPSかつ認証情報を含まない遷移先URLの検証

未実装は、WebSocket、相談状態変更、テキストチャット。ローカルコードのみで、本番スプレッドシート、Script Properties、Secret、トリガー、デプロイは未変更。

## 1. 結論

APの勤怠記録を正とし、Another Portalはそのイベントから「いま会社にいる人」の表示用データを作る。

ただし、以下の3状態は混ぜない。

| 状態 | 正を持つ場所 | 例 |
|---|---|---|
| 勤務状態 | AP | 未開始、稼働中、終了済み |
| 話しかけやすさ | Another Portal | 相談可能、集中中、休憩中、対応不可 |
| 接続状態 | Another Portal | 接続中、切断、最終確認時刻 |

`users_master.work_status` はライブの勤怠・在席状態として使わない。現行実装では `on / off` の固定的な就業属性として扱われているためである。

## 2. 確認済みの既存AP

### 認証

- Firebase IDトークンをクライアントから送信している。
- Account APIの `resolveCurrentUserByIdToken` がトークンを検証し、`users_master` の利用者へ解決する。
- 主な人物識別子は `internal_user_id`、`employee_code`、`organization_id`、`email`。

### 勤怠

- 勤怠APIは `clockIn` と `clockOut` を持つ。
- 勤怠の正データは `勤怠記録` シート。
- 開始済みかつ終了前の記録が「現在稼働中」を示す。
- `clockIn` と `clockOut` は同日・同一人物の重複操作を成功扱いにする。
- 勤務場所はShiftBuilder由来の `稼働場所` を保持するが、現状は安定した `store_id` が勤怠レスポンスに含まれない。
- 位置情報は勤怠確認用の別データであり、Another Portalへ送らない。

確認元:

- `account-console/backend/attendance-apps-script/Code.gs`
- `account-console/backend/account-apps-script/api.js`
- `account-console/backend/account-apps-script/token_auth.js`
- `account-console/backend/account-apps-script/users.js`
- `account-console/js/dashboard/main.js`

## 3. MVPの処理フロー

### 3.1 出勤

1. 利用者がAPで「出勤 / 稼働開始」を押す。
2. AP勤怠APIが勤怠記録の保存を完了する。
3. APが `attendance.started` を連携Outboxへ保存する。
4. AP画面は配信結果を待たず、許可対象者をAnother Portalへ遷移させる。
5. Another Portalは自身でFirebase認証状態を取得する。（ローカル実装済み）
6. Another Portalのbootstrap APIが現在利用者とオフィス状態を返す。（APIはローカル実装済み）
7. Webhookが未着の場合、bootstrap APIがAP勤怠APIを照会して表示を補正する。（ローカル実装済み）
8. Outboxの未配信イベントは定期処理で配信・再送する。

勤怠保存が成功し、Portal配信だけ失敗した場合でも、出勤自体を失敗へ戻してはならない。

### 3.2 退勤

1. 利用者がAPで「退勤 / 稼働終了」を押す。
2. AP勤怠APIが終了時刻を保存する。
3. APが `attendance.ended` をOutboxへ保存する。
4. Another Portalは対象者を退勤状態へ更新する。
5. 接続中の本人には退勤完了を通知し、オフィス画面を読み取り専用にする。
6. WebSocket切断だけを退勤とは扱わない。

## 4. AP → Another Portal Webhook

### エンドポイント

```http
POST /api/v1/integrations/ap/events
Content-Type: application/json
X-AP-Timestamp: 1787398000
X-AP-Event-Id: evt_01...
X-AP-Signature: v1=<hex HMAC-SHA256>
```

署名対象:

```text
<timestamp>.<raw request body>
```

署名鍵はAPのScript PropertiesとAnother PortalのSecretに保存する。ソースコード、URL、ログへ含めない。

### `attendance.started`

```json
{
  "schema_version": 1,
  "event_id": "evt_01K2...",
  "event_type": "attendance.started",
  "occurred_at": "2026-08-22T09:12:34+09:00",
  "organization_id": "org_another",
  "subject": {
    "internal_user_id": "usr_00123",
    "employee_code": "AN0123",
    "display_name": "あおい"
  },
  "attendance": {
    "record_id": "attendance-uuid",
    "work_date": "2026-08-22",
    "started_at": "2026-08-22T09:12:34+09:00",
    "ended_at": null,
    "state": "working"
  },
  "workplace": {
    "store_id": null,
    "label": "Another 店",
    "kind": "unknown"
  }
}
```

### `attendance.ended`

```json
{
  "schema_version": 1,
  "event_id": "evt_01K3...",
  "event_type": "attendance.ended",
  "occurred_at": "2026-08-22T18:07:12+09:00",
  "organization_id": "org_another",
  "subject": {
    "internal_user_id": "usr_00123",
    "employee_code": "AN0123",
    "display_name": "あおい"
  },
  "attendance": {
    "record_id": "attendance-uuid",
    "work_date": "2026-08-22",
    "started_at": "2026-08-22T09:12:34+09:00",
    "ended_at": "2026-08-22T18:07:12+09:00",
    "state": "ended"
  },
  "workplace": {
    "store_id": null,
    "label": "Another 店",
    "kind": "unknown"
  }
}
```

### Webhook応答

新規受付:

```json
{
  "ok": true,
  "event_id": "evt_01K2...",
  "accepted": true,
  "duplicate": false
}
```

受信済みの `event_id`:

```json
{
  "ok": true,
  "event_id": "evt_01K2...",
  "accepted": true,
  "duplicate": true
}
```

`event_id` を一意制約にし、同じイベントを複数回適用しない。配信方式はat-least-once（1回以上届く可能性がある）を前提にする。

### 拒否条件

| HTTP | code | 条件 |
|---|---|---|
| 400 | `INVALID_EVENT` | 必須項目不足、型不正 |
| 401 | `SIGNATURE_INVALID` | 署名不一致 |
| 401 | `TIMESTAMP_EXPIRED` | 現在時刻との差が5分超 |
| 409 | `EVENT_CONFLICT` | 同じevent_idで本文が異なる |
| 422 | `UNSUPPORTED_SCHEMA` | schema_version未対応 |
| 500 | `INTERNAL_ERROR` | 一時的な受信処理失敗 |

4xxは内容を修正するまで自動再送しない。5xxと通信失敗は指数バックオフで再送する。

## 5. AP側Outbox

勤怠記録とWebhook送信の間でイベントが消えないよう、APへ `Portal連携Outbox` を追加する。

| 列 | 内容 |
|---|---|
| `event_id` | イベント一意ID |
| `event_type` | `attendance.started` など |
| `occurred_at` | APで状態が確定した時刻 |
| `payload_json` | 送信本文 |
| `payload_hash` | 本文改変・衝突検出用 |
| `delivery_status` | `pending / delivered / dead` |
| `attempt_count` | 試行回数 |
| `next_attempt_at` | 次回試行時刻 |
| `last_status_code` | 最終HTTPステータス |
| `last_error` | 秘密情報を除いた最終エラー |
| `delivered_at` | 配信完了時刻 |

勤怠記録の保存後、Outbox保存に失敗した場合はエラーをログへ残し、勤怠レスポンスには `portal_sync: "pending_recovery"` を返す。勤怠記録自体は成功扱いのままにする。

## 6. AP画面 → Another Portal

遷移URLへIDトークン、メール、社員番号を含めない。

```text
https://<another-portal-host>/?from=ap&entry=clock-in
```

Another Portalは同じFirebaseプロジェクトのクライアント認証から、自身で最新IDトークンを取得する。

APの `clockIn` 成功レスポンスへ追加する情報:

```json
{
  "ok": true,
  "record": {},
  "portal": {
    "entry_url": "https://<another-portal-host>/?from=ap&entry=clock-in",
    "sync": "queued",
    "event_id": "evt_01K2..."
  }
}
```

`entry_url` はAP側設定から取得し、クライアント入力値を使わない。

## 7. Another Portal クライアントAPI

すべてFirebase IDトークンをAuthorizationヘッダーで送る。

```http
Authorization: Bearer <Firebase ID token>
```

### `GET /api/v1/bootstrap`

初期表示に必要な本人、勤務状態、オフィス、在席者をまとめて返す。

```json
{
  "ok": true,
  "server_now": "2026-08-22T09:12:36+09:00",
  "me": {
    "internal_user_id": "usr_00123",
    "display_name": "えいち",
    "attendance_state": "working",
    "availability": "available",
    "connection_state": "online",
    "workplace": {
      "store_id": null,
      "label": "Another 店",
      "kind": "unknown"
    }
  },
  "office": {
    "office_id": "org_another:main",
    "name": "アナザーオフィス",
    "members": []
  },
  "reconciled_from_ap": false
}
```

本人のPortal勤務状態が未作成または古い場合、サーバーは受け取ったIDトークンを一時的に使い、AP勤怠APIの `getDashboardData` を照会する。トークンは保存・ログ出力しない。

### `PATCH /api/v1/me/availability`

利用者が話しかけやすさだけを変更する。

```json
{
  "availability": "focus",
  "message": "14時ごろ戻ります"
}
```

許容値:

- `available`: 相談可能
- `focus`: 集中中
- `break`: 休憩中
- `do_not_disturb`: 対応不可

このAPIで `attendance_state` は変更できない。

### `POST /api/v1/me/heartbeat`

WebSocketを利用できない場合の接続維持用。通常はWebSocketのping/pongを使う。

## 8. リアルタイムイベント

MVPで必要なサーバー → クライアント通知:

| type | 用途 |
|---|---|
| `presence.snapshot` | 接続直後の全体状態 |
| `presence.joined` | 出勤者が現れた |
| `presence.updated` | 勤務・相談・接続状態が変わった |
| `presence.left` | 退勤した |
| `avatar.position` | 同じ部屋での移動 |
| `conversation.invited` | 「ちょっといい？」の通知 |

移動イベントは保存対象にせず、最後の位置だけ短期間保持する。勤務状態変更はAPイベント由来でなければ受け付けない。

## 9. 状態変換

| AP勤怠記録 | Another Portal `attendance_state` | 画面 |
|---|---|---|
| 当日記録なし | `not_started` | オフィス外 |
| 実開始あり・実終了なし | `working` | オフィスまたは勤務店舗に表示 |
| 実終了あり | `ended` | 退勤表示後、オフィス外 |

通信切断は `connection_state = offline` にするだけで、`attendance_state` は変更しない。

`workplace.label` の文字列だけから店舗勤務かどうかを推測しない。`store_id` または正式な場所種別がAPから渡るまでは `kind = unknown` とする。

## 10. データ最小構成

Another Portal側に最低限必要なデータ:

### `ap_events`

- `event_id` 一意
- `event_type`
- `schema_version`
- `payload_hash`
- `occurred_at`
- `received_at`
- `processed_at`

### `presence`

- `organization_id`
- `internal_user_id`
- `attendance_record_id`
- `attendance_state`
- `availability`
- `availability_message`
- `workplace_store_id`
- `workplace_label`
- `workplace_kind`
- `connected_at`
- `last_seen_at`
- `updated_at`

一意制約は `(organization_id, internal_user_id)`。

## 11. 権限案

既存の権限定義には `another_portal` がない。実装時にAccount Consoleへ次を追加する案とする。

- `portal.access`
- `portal.presence.view`
- `portal.message.send`
- `portal.voice.start`
- `portal.knowledge.view`
- `portal.knowledge.manage`

MVPで必要なのは先頭3つまで。音声・ナレッジ権限を初期MVPへ混ぜない。

## 12. MVPで決める必要がある不足情報

### 実装前に必須

1. 本番Another Portalのホスト名。
2. APの勤怠Apps Scriptへ `internal_user_id` を確実に渡せること。
3. Outboxを勤怠スプレッドシートへ追加してよいか。
4. Another Portalへ入れる利用者範囲。現在のローカル実装は内部人員だけを許可し、AP画面の遷移は直接雇用者だけに絞っている。最終的に全active社員か、`portal.access` 保有者だけかを決める。

### 後続でもよい

1. 店舗マスターの安定した `store_id` と勤務場所種別。
2. 店舗勤務者を同じ仮想オフィスに置くか、店舗別エリアに置くか。
3. 休憩状態をAP勤怠として持つか、Portalの相談状態として持つか。
4. 音声通話・文字起こし・ナレッジ保存の保持期間と閲覧権限。

## 13. 実装順

1. [完了・ローカル] 勤怠APIへイベント生成とOutboxを追加する。
2. [完了・ローカル] Another Portalへ署名検証付きWebhook受信APIを追加する。
3. [完了・ローカル] `ap_events` と `presence` を実装する。
4. [完了・ローカル] APの出勤成功後にPortalへ遷移する。
5. [完了・ローカル] bootstrap APIとAP照合フォールバックを追加する。
6. WebSocketで在席者の参加・更新・退勤を配信する。
7. 相談状態の変更APIを追加する。

チャット、音声、ナレッジ化は、この出勤同期が安定してから着手する。
