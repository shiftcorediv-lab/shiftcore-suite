# Another Portal 開発凍結・再開メモ

更新日: 2026-08-23  
状態: ローカル実装を保存して開発凍結。本番未反映。

## 1. 開発思想

Another Portalは、一般的な社内チャットや業務SaaSではない。

核となる体験は「会社という街に出勤する」。APで出勤した人が、温かい2D見下ろし型の会社空間へ現れ、人の存在、話しかけやすさ、会社としての一体感を自然に感じられる入口を作る。

ゲーム化そのものを目的にせず、仕事へゲーム的な軽さと分かりやすさを取り入れる。特定作品のキャラクター、ロゴ、地形、家具は複製せず、90年代の風変わりで温かい街RPGを思わせるAnother Portal固有の表現を育てる。

## 2. APとの境界

- APは社員、組織、店舗、シフト、勤怠、業務情報の正データを持つ。
- Another PortalはAPの上位体験レイヤーであり、正データを独自に再定義しない。
- APは「会社の状態を管理する場所」。Another Portalは「会社を感じる場所」。
- 個人用のAI秘書室とは分離する。
- `users_master.work_status` をライブ在席状態として使わない。

混ぜてはいけない状態:

| 状態 | 正を持つ場所 |
|---|---|
| 勤務状態 | AP |
| 話しかけやすさ | Another Portal |
| 接続状態 | Another Portal |

## 3. 守るべき実装原則

- スマホファースト。店舗・現場スタッフが片手で使えることを優先する。
- 出勤保存をPortal障害で失敗へ戻さない。
- APの外部通信は勤怠保存中に待たず、Outboxから非同期配信する。
- WebhookはHMAC署名、時刻制限、本文上限、重複排除、競合拒否を維持する。
- IDトークン、メール、位置情報をWebhookや遷移URLへ含めない。
- 認証トークンをDBへ保存せず、ログへ出さない。
- 古いイベントで新しい在席状態を巻き戻さない。
- 店舗IDが未確定な間は、勤務場所種別を表示文言から推測しない。
- チャット、音声、文字起こし、ナレッジ化は権限と保持方針を決めてから追加する。

## 4. ローカル実装済み

### AP勤怠側

- 出勤・退勤イベント生成
- `Portal連携Outbox`
- HMAC-SHA256署名付き配信
- 1分トリガー、最大10回、上限6時間の再送
- 恒久エラーと一時エラーの分離
- 直接雇用者を対象にした暫定Portal遷移

### Another Portal側

- 2Dオフィスの1画面プロトタイプ
- D1の `ap_events` / `presence`
- `POST /api/v1/integrations/ap/events`
- `GET /api/v1/bootstrap`
- Firebaseログイン
- AP利用者検証
- 同一組織の勤務中メンバー取得
- Webhook未着時のAP勤怠照合
- 読込、未認証、利用対象外、接続失敗、空状態の画面

## 5. 本番未実施・未確認

- 本番ホスト、D1、Secret、Script Propertiesの設定
- `Portal連携Outbox` の本番スプレッドシート作成
- Apps Scriptトリガー作成とデプロイ
- Portalのデプロイ・公開
- 本番GoogleアカウントによるE2E
- Firebase承認済みドメインの本番設定
- WebSocket、相談状態変更、チャット、音声通話
- 店舗マスターの安定した `store_id`

直近のローカル接続障害は、Cloudflareローカル環境へAP URLを渡していなかったことが原因。`vite.config.ts` を修正済みだが、修正後の実アカウントE2Eは未確認。

## 6. 再開前に決めること

1. Another Portalへ入れる範囲を、全active内部人員とするか `portal.access` 保有者だけにするか。
2. 本番ホスト名とFirebase承認済みドメイン。
3. Outboxシート追加とトリガー作成を本番で許可するか。
4. リアルタイム同期をCloudflare Durable Objects等で実装するか。
5. 店舗勤務者を共通オフィス、店舗別エリアのどちらへ置くか。

## 7. 再開時の最初の縦切り

本番設定やWebSocketへ進む前に、テスト用環境で次の一本を通す。

`AP出勤 → Outbox登録 → Portal遷移 → Firebase認証 → bootstrap → 本人がオフィスへ出現`

このE2Eが安定するまで、チャット、音声、ナレッジ機能へ広げない。

## 8. 触ってはいけない箇所

- APを正とするデータ境界
- Outboxによる勤怠とPortal障害の分離
- Webhook署名・冪等性・時系列保護
- トークン、メール、位置情報を連携データから外す方針
- 個人用AI秘書室との分離
- ユーザーの既存未コミット差分

## 9. 再開時のテスト条件

最低限、以下をすべて通す。

```bash
cd apps/another-portal
npm test
npm run lint
npm run build
npm audit --omit=dev

cd ..
node --test account-console/tests/*.test.mjs
```

追加で、テスト用GoogleアカウントによるE2Eと、Webhookの新規・重複・競合・再送を確認する。本番デプロイ、Secret設定、トリガー作成は別承認とする。

## 10. 推奨実行環境

- 推奨モデル: `gpt-5.6-sol`
- Reasoning: `high`
- 理由: AP、Firebase、Cloudflare D1、リアルタイム同期をまたぐ認証・整合性・障害分離の判断が中心で、単一画面の実装より境界設計の精度が重要なため。
- 作業範囲: まず上記E2Eの完成まで。WebSocket以降は別スコープに分ける。

## 11. 凍結時の確認結果

- Another Portal: 14テスト成功
- Account Console: 98テスト成功
- Another Portal lint: 成功
- Another Portal build: 成功
- 本番依存の脆弱性: 0件
- commit / push / deploy: 未実行

詳細なAPI契約は [`AP_INTEGRATION_API.md`](./AP_INTEGRATION_API.md) を参照。
