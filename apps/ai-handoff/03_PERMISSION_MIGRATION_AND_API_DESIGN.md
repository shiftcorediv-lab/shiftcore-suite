# 03 権限移行・API詳細設計

- 更新日: 2026-08-07
- 前提: `03_PERMISSION_DESIGN_PROPOSAL.md` の基本方針6点をえいち承認済み
- 状態: 実装前設計
- 本番変更: 未実施

## 1. 目的

既存利用者を締め出さず、既存の過剰権限を意図せず固定化せずに、操作権限とデータ範囲を正式な共通契約へ移行する。

## 2. 移行原則

1. `role` から操作権限を自動生成しない。
2. 空欄・未知値を強い権限へ変換しない。
3. 新権限の追加直後は、旧権限の挙動を変えない比較期間を置く。
4. 旧判定と新判定が違う場合は、利用者へ影響を出す前に記録して確認する。
5. 個人単位の最終割当は業務担当者が確認する。
6. 個人名・メール・トークンを引き継ぎ資料や監査ログへ残さない。
7. API／GASを先に守り、画面はその応答へ後から合わせる。
8. 旧列は全利用者の移行完了と一運用期間の安定確認まで削除しない。

## 3. 権限コード案

新しい値は `role` ではなく、操作を表す `capability_code` として追加する。

アプリへ入れるかどうかは、移行期間中は既存 `allowed_modules` を正本とする。`module.access` は割当可能なcapabilityとして新設しない。

### Account Console

| capability_code | 利用者向け表示 |
|---|---|
| `account.view` | 利用者閲覧 |
| `account.profile.edit` | 基本情報編集 |
| `account.permission.edit` | 権限編集 |
| `account.status.edit` | 利用者停止・再開 |
| `account.signup.review` | 登録申請承認・却下 |
| `audit.view` | 変更履歴閲覧 |

### OrderCase

| capability_code | 利用者向け表示 |
|---|---|
| `ordercase.view` | 案件閲覧 |
| `ordercase.amount.view` | 金額閲覧 |
| `ordercase.case.edit` | 案件条件編集 |
| `ordercase.amount.edit` | 金額編集 |
| `ordercase.rank.edit` | 案件ランク変更 |
| `ordercase.store.edit` | 店舗作成・編集 |
| `ordercase.case.archive` | 案件キャンセル・アーカイブ |
| `ordercase.store.archive` | 店舗アーカイブ・復元 |

### ShiftBuilder

| capability_code | 利用者向け表示 |
|---|---|
| `shift.view.all` | 全体シフト閲覧 |
| `shift.view.self` | 本人予定閲覧 |
| `shift.draft.edit` | 下書き配置・解除・入替 |
| `shift.confirm` | シフト確定 |
| `shift.publish` | シフト公開 |
| `shift.distribute` | シフト配布 |
| `shift.reopen` | 確定・公開取消 |
| `shift.override` | 保護状態の例外操作 |

### 勤怠・報告

| capability_code | 利用者向け表示 |
|---|---|
| `attendance.self.report` | 本人の打刻・申請・実績報告 |
| `attendance.team.view` | 担当範囲の勤怠閲覧 |
| `attendance.request.review` | 修正申請承認・却下 |
| `attendance.settings.edit` | 勤怠設定変更 |
| `attendance.location.precise.view` | 正確な位置情報閲覧 |

04待ちの操作コードは、業務仕様確定まで作成しない。

## 4. データ範囲

| scope_type | scope_value | 意味 |
|---|---|---|
| `all` | 空欄 | 全社 |
| `organization` | `organization_id` | 指定所属 |
| `area` | エリアコードまたは正式名称 | 指定エリア |
| `self` | 空欄 | ログイン本人 |

同じ操作を複数組織・複数エリアへ許可する場合は、割当行を分ける。

## 5. `permission_assignments` シート契約案

列順をAPI契約として固定する。

| 列 | 必須 | 例・規則 |
|---|---|---|
| `permission_assignment_id` | 必須 | `PA-` から始まる一意ID |
| `internal_user_id` | 必須 | `users_master` の既存ID |
| `module_code` | 必須 | `account_console`、`ordercase`、`shift`、`attendance` |
| `capability_code` | 必須 | 本資料の許容コード |
| `scope_type` | 必須 | `all`、`organization`、`area`、`self` |
| `scope_value` | 条件付き | organization／areaで必須 |
| `status` | 必須 | `active`、`inactive` |
| `valid_from` | 任意 | ISO日付。空欄は開始制限なし |
| `valid_to` | 任意 | ISO日付。空欄は終了制限なし |
| `updated_at` | 必須 | サーバー時刻 |
| `updated_by` | 必須 | IDトークン由来の操作者IDまたはメール |
| `memo` | 任意 | 業務上の付与理由。秘密情報は記載しない |

一意制約相当:

```text
internal_user_id + module_code + capability_code + scope_type + scope_value
```

同じ組合せを重複作成しない。履歴は行の上書きだけに頼らず、既存 `account_change_logs` または新しい権限変更ログへ記録する。

`all` と `self` の `scope_value` は空欄を必須とする。

### `authorization_shadow_logs` シート契約

`checked_date` はJSTの `YYYY-MM-DD` を文字列で保存し、日次重複判定の正本とする。`checked_at` は表示・追跡用の日時であり、重複判定には使わない。

capability差分に加え、`legacy_scopes`、`assigned_scopes`、`legacy_only_scopes`、`assigned_only_scopes` を保存する。本人限定・組織限定など、操作対象範囲だけが変わる移行もShadow監査で検知する。

比較は、その利用者・モジュールに有効な候補行が1件以上あるモジュールだけを対象とする。候補行がないモジュールは「全権限喪失」ではなく「未移行」と扱う。

## 6. 既存値からの初期変換案

### Account Console

`account_console` 保有者は現在6人。そのうち2人は `member` である。

自動確定しない。初期比較用には次を候補として生成する。

| 現在値 | 比較用候補 | 本番切替前の扱い |
|---|---|---|
| `account_console` あり | `account.view`、`account.profile.edit`、`account.permission.edit`、`account.status.edit`、`account.signup.review`、`audit.view` | 現行APIと同等。個人ごとに削る権限を確認 |
| なし | 付与なし | 自動付与しない |

roleは候補生成に使わない。

### OrderCase

| 既存値 | 自動移行できる権限 | 個別確認が必要 |
|---|---|---|
| `all` | `ordercase.view`、`ordercase.amount.view`、`ordercase.case.edit`、`ordercase.amount.edit`、`ordercase.rank.edit`、`ordercase.store.edit`、`ordercase.case.archive`、`ordercase.store.archive` | データ範囲 |
| `edit` | `ordercase.view`、`ordercase.amount.view`、`ordercase.case.edit`、`ordercase.store.edit` | `amount.edit`、`case.archive`、`store.archive` を残すか |
| `view` | `ordercase.view`、`ordercase.amount.view` | データ範囲 |
| `view_without_amount` | `ordercase.view` | データ範囲 |
| 空欄・未知値 | なし | モジュールを残すか |

既存 `edit` は2人。比較期間中は旧APIが従来操作を許可するが、新API候補では破壊的操作を未割当として差分記録する。

### ShiftBuilder

| 既存値 | 初期変換 |
|---|---|
| `all` | `shift.view.all`、`shift.draft.edit`、`shift.confirm`、`shift.publish`、`shift.distribute`、`shift.reopen`、`shift.override` |
| `manager` | `shift.view.all`、`shift.draft.edit`、`shift.confirm`、`shift.publish`、`shift.distribute` |
| `edit` | `shift.view.all`、`shift.draft.edit` |
| `view` | `shift.view.all` |
| `self` | `shift.view.self` |
| 空欄・未知値 | なし。自動付与しない |

空欄は有効利用者6人。現在の本番GASでも既知権限値がないため利用を拒否している。業務確認前に `view` や `self` へ補完しない。

### 勤怠

独自roleから自動移行しない。正式roleと独自roleの対応が未定義だからである。

比較期間中は現行判定を維持しつつ、次の候補を記録する。

- 現行 `isAdmin_` がtrue: `attendance.team.view`、`attendance.request.review`、`attendance.settings.edit` 候補
- 現行 `canViewPreciseLocation_` がtrue: `attendance.location.precise.view` 候補
- 全有効ユーザー: `attendance.self.report` 候補

最終割当は所属範囲と労務責任者を確認して確定する。

## 7. 共通権限API応答案

Account APIへ、認証済み本人の権限コンテキストを返すactionを追加する候補。

```json
{
  "ok": true,
  "user": {
    "internal_user_id": "U0000",
    "status": "active",
    "role": "member",
    "organization_id": "ORG-001",
    "base_area": "関西",
    "allowed_modules": ["ordercase", "shift"]
  },
  "authorization": {
    "version": 1,
    "mode": "shadow",
    "source": "legacy_shadow",
    "legacy_fallback": true,
    "modules": {
      "ordercase": {
        "capabilities": ["ordercase.view", "ordercase.amount.view"],
        "scopes": [{ "type": "all", "value": "" }]
      },
      "shift": {
        "capabilities": ["shift.view.all"],
        "scopes": [{ "type": "all", "value": "" }]
      }
    },
    "candidate_modules": {
      "ordercase": {
        "capabilities": ["ordercase.view"],
        "scopes": [{ "type": "organization", "value": "ORG-001" }]
      },
      "shift": {
        "capabilities": ["shift.view.self"],
        "scopes": [{ "type": "self", "value": "" }]
      }
    },
    "shadow": {
      "enabled": true,
      "healthy": true,
      "logging_available": true,
      "differences": []
    }
  }
}
```

Shadow期間は `modules` が現在の実効権限、`candidate_modules` が新権限候補である。新権限切替の別承認まで `candidate_modules` を操作可否へ使わない。

Shadow候補の読込・検証・ログ記録は旧判定から例外隔離する。いずれかが失敗しても `ok: true` と旧権限を返し、`shadow.healthy: false` で監視する。Script Property `AUTHORIZATION_SHADOW_ENABLED=false` により、再デプロイなしでShadow処理を緊急停止できる。

勤怠は既存の独自roleと位置情報権限を別途棚卸しするまでShadow比較対象外とする。

フロントへメール、電話、他人の権限割当全件を返さない。各アプリGASはAccount APIの応答をそのまま信用せず、対象操作・対象データIDと照合する。

## 8. 共通エラー契約

| code | 意味 | HTTP相当 |
|---|---|---|
| `AUTH_REQUIRED` | IDトークンなし | 401 |
| `AUTH_INVALID` | IDトークン不正・期限切れ | 401 |
| `USER_INACTIVE` | 停止ユーザー | 403 |
| `MODULE_FORBIDDEN` | アプリ利用不可 | 403 |
| `CAPABILITY_FORBIDDEN` | 操作権限なし | 403 |
| `SCOPE_FORBIDDEN` | 対象データが範囲外 | 403または存在非開示の404相当 |
| `AUTHORIZATION_STALE` | 権限版が古い | 409。再取得を促す |

GAS WebアプリはHTTPステータスを常に使い分けられないため、JSONの `code` を正本とする。

## 9. サーバー側判定手順

```text
1. IDトークン検証
2. users_masterで本人・active確認
3. allowed_modulesでアプリ入口確認
4. capability確認
5. scope確認
6. 対象データの現在状態確認
7. 更新直前に再確認
8. 変更と操作者を監査ログへ記録
```

IDを指定する操作では、IDの存在だけでなく、その行が操作者のscope内かを確認する。

## 10. 段階移行

### Stage 0: 設計・件数確認

- 本資料と個人別移行確認を確定する。
- シート、API、本番は変更しない。

### Stage 1: 保存先と読取API追加

- `permission_assignments` をヘッダーだけで追加する。
- Account APIへ読み取り専用の権限コンテキストを追加する。
- 既存APIの許可・拒否は変えない。

### Stage 2: Shadow判定

- 旧判定と新判定を同じ操作で計算する。
- 利用者へは旧判定を適用する。
- 不一致は個人情報を抑えた監査ログへ記録する。
- capabilityだけでなくscopeの差も比較する。
- 日次重複判定はJSTの専用日付列で行い、書込みはScript Lockで直列化する。
- ログシート欠落や記録失敗は旧判定へ影響させず、`shadow.healthy` と `logging_available` で検知する。

### Stage 3: 重大箇所から新判定へ切替

1. ShiftBuilder `self` の本人限定取得
2. Account Consoleの権限変更操作
3. OrderCase金額・アーカイブ
4. ShiftBuilder確定・公開
5. 勤怠管理・位置情報

### Stage 4: フロント統一

- Dashboardと各画面を共通権限応答へ合わせる。
- 操作不可理由を表示する。

### Stage 5: 後方互換終了

- 全利用者の移行と一運用期間の安定を確認する。
- 旧列を参照するコードを段階的に廃止する。
- 旧列の削除は別承認とする。

## 11. 変更予定ファイル

実装時に再確認する候補であり、現時点では変更しない。

### Account Console／Account API

- `apps/account-console/backend/account-apps-script/config.js`
- `apps/account-console/backend/account-apps-script/api.js`
- `apps/account-console/backend/account-apps-script/token_auth.js`
- `apps/account-console/backend/account-apps-script/account_console_users.js`
- 新規候補 `permission_assignments.js`
- 新規候補 `authorization.js`
- `apps/account-console/js/account-console/main.js`
- `apps/account-console/js/account-console/ui.js`
- `apps/account-console/js/common/access-policy.mjs`
- `apps/account-console/js/dashboard/modules.js`

### OrderCase

- `apps/ordercase/backend/ordercase-apps-script/Service_OrderCasePermissions.js`
- `apps/ordercase/backend/ordercase-apps-script/Api_Get.js`
- `apps/ordercase/backend/ordercase-apps-script/Api_Post.js`
- 店舗APIの権限判定ファイル
- `apps/ordercase/index.html`
- `apps/ordercase/edit.html`
- `apps/ordercase/stores.html`

### ShiftBuilder

- 本番GASの `config.js`、`utils.js`、`api.js`、`ShiftBuilderService.js`、`repositore.js`
- GAS正本をリポジトリへ保存する場所
- `apps/shiftbuilder/js/shiftbuilder/api.js`
- `apps/shiftbuilder/js/shiftbuilder/main.js`
- `apps/shiftbuilder/js/shiftbuilder/permissions.js`
- 確定・公開の新規UI／状態管理ファイル候補

### 勤怠

- `apps/account-console/backend/attendance-apps-script/Code.gs`
- `apps/account-console/js/attendance-admin/main.js`
- `apps/account-console/js/dashboard/main.js`

### テスト

- Account APIの権限表読取・自己昇格防止
- OrderCaseの操作別権限
- ShiftBuilder GASの本人限定・状態遷移
- 勤怠承認・位置情報分離
- 旧判定と新判定の比較fixture

## 12. 反映前の必須確認

1. `account_console` 保有6人のうち、誰に権限編集まで必要か。
2. OrderCase `edit` 2人に、金額編集・案件アーカイブ・店舗アーカイブが必要か。
3. ShiftBuilder空欄6人は、利用継続が必要か。必要なら `self`、`view`、`edit` のどれか。
4. `all` 4人全員へ例外解除権限が必要か。
5. `manager` 1人へ確定・公開・配布をすべて許可するか。
6. 組織・エリア制限を最初の移行から適用するか、全体権限の分離後に適用するか。
7. 勤怠承認者と正確な位置情報閲覧者。

これらは実データ上の対象者をAccount Consoleで確認して決める。資料には個人名を残さない。

## 13. 実装開始条件

- 本資料のシート列・権限コード・段階移行が承認済み。
- 既存利用者の個別割当が確認済み、またはShadow判定だけを先行する範囲が承認済み。
- 本番GASの正本とデプロイ先が再確認済み。
- ロールバック方法とテストアカウントが準備済み。

条件が揃うまでは、認証・権限・シート列・API契約を変更しない。
