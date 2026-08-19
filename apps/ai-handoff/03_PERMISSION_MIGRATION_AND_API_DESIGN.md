# 03 権限移行・API詳細設計

- 更新日: 2026-08-10
- 前提: `03_PERMISSION_DESIGN_PROPOSAL.md` の基本方針と4段階の組織階層、全社閲覧、直属承認をえいち承認済み
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
9. 自由入力の `position` や勤怠独自roleから組織階層を自動推定しない。
10. 全社閲覧と直属承認を別の判定として実装する。
11. 自分自身または同格以上の階層・権限を変更できないよう、対象利用者の階層も検証する。
12. 既存利用者の組織階層・直属管理者・Shift編集権限は、自動推定せずAccount Consoleで1人ずつ手動設定する。
13. 正確な位置情報の閲覧者は役員が個別に決定し、組織階層だけでは自動付与しない。
14. `developer` は組織階層と別軸のシステム特権として全アプリ・全操作を許可する。個別権限列へ依存させない一方、停止中アカウント、自己変更禁止、データ整合性検証、監査記録は維持する。
15. `developer` は認証・管理・監査主体として保持するが、ShiftBuilderの配置候補・人員軸・配置済み表示とPMOの新規月次人員対象には含めない。上流APIと各アプリの受取処理の両方で除外する。作成済みPMO月次シートはroleを保持しないため、推測で書き換えず、実データ確認後に別移行する。

### 組織階層契約（正式案）

組織階層は `executive`、`manager`、`leader`、`member` の4段階を正式値とする。既存 `role`、自由入力 `position`、`grade_role`、ShiftBuilderの旧 `manager` は変換元にも権限判定にも使わない。

直属関係は利用者IDで管理し、表示名やメールを参照キーにしない。申請承認では、操作者IDが対象者の直属管理者IDと一致することをサーバー側で確認する。上位者や全社閲覧権限者であっても、直属管理者でなければ承認を許可しない。

役員本人の申請は自己承認を禁止し、あらかじめ指定された別の役員だけが承認できるようにする。申請者、承認者、対象、変更前後、理由、日時、結果をサーバー側の監査ログへ残し、役員の申請・承認は他の役員または監査担当へ通知する。ログは談合の発見と抑止には有効だが、それだけで談合を完全に阻止するものではない。高リスク操作は申請者と承認者を必ず分離し、定期レビューとログ改ざん検知を併用する。

### `users_master` 追加列（正式案）

既存列の意味を変えず、末尾へ次の列を追加する。列が存在しない間は旧判定を維持し、空欄を推測で補完しない。

| 列 | 必須条件 | 値・規則 |
|---|---|---|
| `organization_level` | 内部利用者で必須 | `executive`、`manager`、`leader`、`member` |
| `direct_manager_user_id` | member／leader／managerで必須 | activeな内部利用者の `internal_user_id`。member→leader、leader→manager、manager→executiveのみ許可 |
| `executive_reviewer_user_id` | 申請を行うexecutiveで必須 | 自分以外のactiveなexecutive。役員本人の申請承認だけに使用 |
| `organization_version` | 組織設定済み利用者で必須 | 1から始まる整数。更新競合検知のたびに加算 |
| `organization_updated_at` | 組織設定済み利用者で必須 | サーバー時刻 |
| `organization_updated_by` | 組織設定済み利用者で必須 | IDトークンから解決した操作者の `internal_user_id` |

external／partner系利用者は `organization_level` を自動設定しない。内部階層へ参加させる業務決裁があるまでは組織権限を持たない。

役員の `direct_manager_user_id` は空欄とし、役員間の申請承認先をそこへ流用しない。役員同士を直属関係として循環させないため、`executive_reviewer_user_id` を分離する。

### 組織設定の拒否条件

サーバー側は保存直前に次をすべて検証する。

1. 対象者と直属管理者・役員承認者が存在し、activeである。
2. 自分自身を直属管理者または役員承認者に指定していない。
3. member→leader、leader→manager、manager→executiveの組合せである。
4. 直属関係をたどって同じ利用者へ戻る循環がない。
5. 操作者が対象者を変更できる階層にあり、自分自身または同格以上を昇格・降格・停止できない。
6. マネージャーの任命・解除、役員承認者の設定、全社権限方針の変更は役員本人だけが行う。
7. 最後のactiveな役員を降格・停止できない。
8. リクエストの `organization_version` が保存時の値と一致する。
9. 変更理由が空欄でない。

初回導入時だけは、えいちがAccount Consoleで1人ずつ設定する。初回の役員作成は通常APIの自己昇格経路を使わず、対象、理由、実施者、確認者を記録した移行操作として別承認する。

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
| `ordercase.case.create` | 案件登録 |
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

`attendance.team.view` はリーダー以上へ全社範囲で付与できるが、`attendance.request.review` は直属関係の追加検証を必須とする。capabilityを持つだけで全社の申請を承認できる設計にはしない。

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
| `all` | 現行比較として従来能力を記録するが、新体系では個人の組織階層確認が必須 | `case.create`、`case.edit`、`amount.edit`、`rank.edit`、店舗管理・アーカイブの正式割当 |
| `edit` | 現行比較として従来能力を記録するが、新体系へ自動確定しない | リーダーなら `case.create` と `amount.view`、マネージャーなら追加で `case.edit`、`amount.edit`、店舗管理・アーカイブ |
| `view` | `ordercase.view`、`ordercase.amount.view` | データ範囲 |
| `view_without_amount` | `ordercase.view` | データ範囲 |
| 空欄・未知値 | なし | モジュールを残すか |

既存 `edit` は2人。案件登録と編集を分離するため、既存値だけから新権限を自動確定しない。比較期間中は旧APIが従来操作を許可し、新API候補との差を記録する。

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
    "organization_level": "leader",
    "direct_manager_user_id": "U0009",
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

`organization_level` と `direct_manager_user_id` は正式列名とする。ただし、列追加とAPI実装は影響範囲・移行対象・ロールバック手順の別承認後に行う。フロントへ直属管理者IDを常時返す必要がない画面では省略し、`executive_reviewer_user_id` は本人の申請画面と役員向け組織管理画面以外へ返さない。

フロントへメール、電話、他人の権限割当全件を返さない。各アプリGASはAccount APIの応答をそのまま信用せず、対象操作・対象データIDと照合する。

### Account Console組織設定API（正式案）

組織情報と操作権限を同じ更新APIへ混ぜない。どちらもIDトークンを再検証し、画面から送られた操作者ID・階層・権限を信用しない。

#### `getOrganizationAssignment`

- 用途: Account Console編集画面の初期表示。
- 入力: `target_internal_user_id`。
- 出力: 対象者の階層、直属管理者、役員承認者、`organization_version`。候補となる管理者は必要最小限のID・表示名・階層だけ返す。
- 許可: Account Console閲覧権限。正確な位置情報や他モジュールの権限は返さない。

#### `updateOrganizationAssignment`

```json
{
  "action": "updateOrganizationAssignment",
  "target_internal_user_id": "U0001",
  "organization_level": "leader",
  "direct_manager_user_id": "U0009",
  "executive_reviewer_user_id": "",
  "expected_organization_version": 3,
  "reason": "組織変更のため"
}
```

- マネージャーは直属配下となるmember／leaderだけを設定できる。manager／executiveは変更できない。
- 役員はmanagerの任命・解除と配下関係を設定できる。役員自身の階層変更と最後の役員の解除は通常APIで許可しない。
- 保存はScript Lock内で再読取、検証、更新、監査ログ記録まで行う。
- 成功時は新しい `organization_version` と変更後の値だけを返す。
- 組織情報と `permission_assignments` の同時変更は行わない。片方だけ成功する曖昧な更新を避ける。

#### `accountConsoleBulkUpdateExecutives`

役員の追加・解除・承認者付替えは、1人ずつ保存すると途中で承認者グラフが分断されるため、専用APIで全対象をまとめて更新する。

- 入力: 必須の `reason` と、最大20件の `changes`。各変更は対象内部ID、変更後の組織3項目、`expected_organization_version` を持つ。
- 許可: Shadow期間はactiveな内部 `developer` だけ。役員本人や同格者へ自己・相互変更権限を追加しない。
- 対象: 変更前または変更後がexecutiveである利用者だけ。操作者自身、停止中、外部人員、重複対象を拒否する。
- 検証: 更新後もactiveな役員を2人以上維持し、全役員が1つの承認循環を構成し、直属関係を含む新しい組織不整合がないことを保存前に確認する。
- 一貫性: Script Lock内で操作者と全対象を再読取し、全行を書いた後にシート全体を再照合する。1行でも書込み・照合・成功ログに失敗した場合は全対象を変更前へ戻し、復元後も全行を再照合する。
- 監査: 全変更を1つの `authorization_event_id` と `request_id` で束ね、`organization.executive.bulk_update` の開始・成功または失敗をハッシュ連鎖ログへ記録する。
- このAPIは組織Shadowの保守APIであり、候補権限を実効権限へ切り替えない。通常画面への接続と本番反映は別承認とする。

#### `reviewApprovalRequest`

```json
{
  "action": "reviewApprovalRequest",
  "request_id": "REQ-0001",
  "decision": "approve",
  "expected_request_version": 2,
  "comment": "確認済み"
}
```

承認対象の業務データは04以降の各機能が保持する。共通判定は次の順で行う。

1. 申請者と承認者が別人である。
2. 申請者がmember／leader／managerなら、承認者が申請者の `direct_manager_user_id` と一致する。
3. 申請者がexecutiveなら、承認者が `executive_reviewer_user_id` と一致し、双方がactiveなexecutiveである。
4. 申請が未処理で、`expected_request_version` が一致する。
5. 承認直前にも組織関係を再読取する。申請後に異動していた場合は自動承認せず、経路再確認状態へ移す。
6. 結果と理由を監査ログへ記録してから成功を返す。

上位階層、全社閲覧、システム `admin`／`developer`、対象機能の編集権限だけでは代理承認できない。緊急時の代理承認を将来設ける場合も、通常APIへ例外分岐を混ぜず、別権限・理由・期限・通知を持つbreak-glass操作として別決裁する。

### `authorization_change_logs` シート契約（正式案）

Shadow比較ログとは用途が違うため、`authorization_shadow_logs` へ混在させない。

| 列 | 内容 |
|---|---|
| `authorization_change_log_id` | `ACL-` から始まる一意ID |
| `authorization_event_id` | 同じ変更の `started` と完了結果を結ぶ `ACE-` から始まる一意ID |
| `occurred_at` | サーバー時刻 |
| `event_type` | `organization.update`、`organization.executive.bulk_update`、`permission.update`、`approval.review`、`break_glass` |
| `request_id` | 申請がある場合のID |
| `actor_internal_user_id` | 実行者 |
| `target_internal_user_id` | 対象者 |
| `reviewer_internal_user_id` | 承認者。該当しない場合は空欄 |
| `before_json` | 変更前の許可項目だけをJSON化 |
| `after_json` | 変更後の許可項目だけをJSON化 |
| `reason` | 必須理由。認証情報・位置情報・私的情報を書かない |
| `result` | `started`、`success`、`rejected`、`conflict`、`error`、`recovery_required` |
| `error_code` | 拒否・失敗時の共通コード |
| `source` | `account_console`、対象アプリ、移行作業識別子 |
| `previous_log_hash` | 直前ログのハッシュ |
| `log_hash` | 本行の主要項目と `previous_log_hash` から生成 |

通常UI・通常APIにはログ更新・削除機能を設けない。ハッシュ鎖は改ざんそのものを物理的に止めるものではなく、行の変更・削除を検知しやすくする仕組みである。日次で末尾ハッシュと件数を別保存先へ退避し、高リスクイベントは関係役員または監査担当へ即時通知する。

Google Sheetsの複数シート更新はDBトランザクションではない。そこで、変更前に `started` ログの保存が成功したことを確認し、その後に業務データを更新し、最後に同じ `authorization_event_id` の完了ログを追記する。各行の `authorization_change_log_id` は別IDとする。業務更新後に完了ログまたは通知が失敗した場合は `recovery_required` として復旧キューへ残し、黙って通常成功にはしない。定期検査で `started` のまま残ったイベントと、更新後データに対応する完了ログの欠落を検知する。

役員本人の申請運用には、自分以外のactiveな役員が最低1人必要である。activeな役員が1人だけの場合、役員本人の申請は承認経路なしとして拒否し、自己承認やシステム管理者による代行へ自動フォールバックしない。役員が2人だけの場合は相互談合をシステムだけで排除できないため、全役員への通知に加えて、承認権を持たない独立した監査担当へも必ず通知する。3人以上の場合も、申請者・承認者を除くactiveな役員と監査担当へ通知する。

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
| `ORGANIZATION_LEVEL_INVALID` | 階層値・上下関係が不正 | 400 |
| `DIRECT_MANAGER_INVALID` | 直属管理者が不在・停止・不適合 | 400 |
| `ORGANIZATION_CYCLE` | 直属関係が循環する | 409 |
| `SELF_APPROVAL_FORBIDDEN` | 自己承認 | 403 |
| `REVIEWER_MISMATCH` | 直属管理者または指定役員ではない | 403 |
| `SELF_ESCALATION_FORBIDDEN` | 自分自身の昇格・権限追加 | 403 |
| `TARGET_LEVEL_FORBIDDEN` | 同格以上の対象を変更しようとした | 403 |
| `LAST_EXECUTIVE_PROTECTED` | 最後の役員を解除しようとした | 409 |
| `VERSION_CONFLICT` | 組織・申請の版が更新済み | 409 |
| `AUDIT_WRITE_FAILED` | 必須監査ログを保存できない | 503相当 |

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

- `permission_assignments` と `authorization_shadow_logs` の空基盤、Account APIの読み取り専用Shadow応答は反映済み。
- `users_master` の組織列と `authorization_change_logs` は未追加。実装承認までは追加しない。
- 既存APIの許可・拒否は変えない。

### Stage 2: Shadow判定

- 旧判定と新判定を同じ操作で計算する。
- 利用者へは旧判定を適用する。
- 不一致は個人情報を抑えた監査ログへ記録する。
- capabilityだけでなくscopeの差も比較する。
- 日次重複判定はJSTの専用日付列で行い、書込みはScript Lockで直列化する。
- ログシート欠落や記録失敗は旧判定へ影響させず、`shadow.healthy` と `logging_available` で検知する。

### Stage 3: 重大箇所から新判定へ切替

1. 組織列と監査ログを追加し、えいちが1人ずつ手動設定する。設定中も実効権限は旧判定のままにする
2. 直属関係、循環、自己昇格、最後の役員、版競合をShadow検証する
3. ShiftBuilder `self` の本人限定取得
4. Account Consoleの組織・権限変更操作
5. OrderCase金額・アーカイブ
6. ShiftBuilder確定・公開
7. 勤怠管理・位置情報と直属承認

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
- `apps/account-console/backend/account-apps-script/permission_assignments.js`
- `apps/account-console/backend/account-apps-script/authorization.js`
- 新規候補 `organization_assignments.js`
- 新規候補 `authorization_change_logs.js`
- 新規候補 `approval_authorization.js`
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
5. 既存のShift専用 `manager` 1人と、組織上のマネージャーを混同せず個別割当できるか。
6. 既存利用者の階層・直属管理者・Shift編集権限は、Account Consoleで1人ずつ手動設定する。個別の割当内容は運用時に確認する。
7. 正確な位置情報閲覧者は、役員が個別に決定する。

1〜5は実データ上の対象者をAccount Consoleで確認して決める。資料には個人名を残さない。役員本人の申請は、指定された別の役員による承認、自己承認拒否、監査ログ、関係役員への通知を必須とする。

## 13. 実装開始条件

- 本資料のシート列・権限コード・段階移行が承認済み。
- 既存利用者の個別割当が確認済み、またはShadow判定だけを先行する範囲が承認済み。
- 本番GASの正本とデプロイ先が再確認済み。
- ロールバック方法とテストアカウントが準備済み。

条件が揃うまでは、認証・権限・シート列・API契約を変更しない。
