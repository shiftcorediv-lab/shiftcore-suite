# G-A signup承認の認証追加：実装結果

- 状態: ローカル実装・自動検証完了、外部反映未実施、G-A未解消
- 作成者: Codex
- 作成日: 2026-08-02
- 前提文書: `approved/20260802_G-A_signup認証_06_approved.md`
- 着手時HEAD: `01ad54a`
- ブランチ: `codex/attendance-dashboard`
- 実装: ローカル完了
- commit: 未実施
- push: 未実施
- deploy: 未実施

---

## 1. 完了状態の区別

| 区分 | 状態 | 理由 |
|---|---|---|
| ローカルコード実装 | **完了** | Worker、GAS、クライアントの最終コードを反映し、自動検証済み |
| 承認文書上の「Codex実装完了」 | **未完了** | Worker・GAS・静的クライアントの外部反映と本番回帰確認が未実施 |
| G-A解消 | **未完了** | 孤児デプロイのアーカイブと到達経路1〜4の攻撃テストが未実施 |

**孤児デプロイのアーカイブが終わるまで、G-Aは閉じていない。**

## 2. 更新前状態

`clasp deployments` の読み取り結果:

- ACCOUNT本番: `AKfycbx83rAzXDfQPJUE…` **@37**
- 孤児固定版: `AKfycbyvUOQHkNWSxiBz…` **@37**
- @HEAD: `AKfycbzS0Etn9kdeI_I3…` @HEAD

公開状態は変更していない。

## 3. 実装内容

### Worker（手順A・B）

`workers/shiftcore-login-proxy/worker.js` を新規作成した。

許可アクション:

- `checkLoginUserByEmail`
- `resolveCurrentUserByIdToken`

無効JSONは400、許可外アクションは403 `ACTION_NOT_ALLOWED` を返す。

承認文書に掲載されたソースを基線に作成した。Cloudflareダッシュボードの現行版との直接比較は未実施。

### ACCOUNT GAS（手順D・E・H・I・K）

- `requireAccountConsoleOperator_` の重複定義を削除し、`account_console_users.js` の1定義へ一本化
- `requireSignupAdminOperator_` を追加
- 現行クライアントと同じ `admin/dev/developer OR account_console` 権限をサーバ側で検証
- active状態を多層防御として再確認
- `internal_user_id` の非空検証を追加
- 一覧取得をPOST `getSignupRequestsSecure` + `idToken` へ変更
- 承認・却下で `idToken` を必須化
- クライアント由来の `reviewedBy` を廃止し、検証済み `operatorId` を使用
- `role` / `status` を既存許容値定数で検証
- 旧GET `getSignupRequests` 分岐を削除
- `allowed_modules`、`organizationId`、`approval.workStatus` の既存仕様は変更せず、未確定事項をコメント化

### クライアント（手順F）

- 一覧・承認・却下の直前に `requireAuthenticatedSession()` からIDトークンを取得
- 一覧取得を認証付きPOSTへ移行
- `reviewedBy` の送信を削除
- 非冪等操作の自動再試行は追加していない
- キャッシュ版数を `20260802-signup-auth-1` に統一

## 4. 手順A〜M

| 手順 | 状態 | 備考 |
|---|---|---|
| A Workerソース取り込み | ローカル完了 | 新規ファイル作成。ダッシュボード現行版との比較は未実施 |
| B Worker許可リスト | ローカル完了 | 応答テスト済み。公開未実施 |
| C 全アプリ回帰確認 | 未実施 | Worker未反映 |
| D 重複ガード一本化 | 完了 | 定義数1を確認 |
| E 認証付き一覧POST追加 | 完了 | ローカル最終コードへ反映 |
| F クライアント移行 | 完了 | ローカル最終コードへ反映 |
| G 本番POST利用確認 | 未実施 | 公開未実施 |
| H 承認・却下認証必須化 | 完了 | ローカル最終コードへ反映 |
| I payload許容値検証 | 完了 | role/status |
| J 実アカウント確認 | 未実施 | 実データを操作していない |
| K 旧GET削除 | 完了 | ローカル最終コードへ反映 |
| L 孤児デプロイのアーカイブ | **未実施** | えいちの手作業 |
| M 全経路攻撃テスト | 未実施 | 外部反映・L完了後に実施 |

## 5. 確認結果

### 完了

- 変更したJavaScriptの `node --check`: 成功
- Worker OPTIONS: 204
- Worker無効JSON: 400 `INVALID_JSON`
- Worker許可外アクション: 403 `ACTION_NOT_ALLOWED`
- signup操作者ガードのモック確認:
  - トークンなし: 拒否
  - admin + 有効ID: 許可
  - account_consoleモジュール + 有効ID: 許可
  - 権限なし: 拒否
  - 操作者IDなし: 拒否
- 旧GETルーター分岐: 0件
- `requireAccountConsoleOperator_` 定義数: 1
- クライアントの `reviewedBy` 送信: 0件
- 既存テスト: **21件 pass / 0件 fail**
- `git diff --check`: 成功

### 未実施

- WorkerのCloudflare反映
- Worker反映後のログイン・勤怠・PMO・ShiftBuilder回帰確認
- ACCOUNT GASの段階デプロイ
- 静的クライアントの公開
- 正規管理者による一覧・承認・却下
- `reviewed_by` の実シート確認
- 権限なしアカウントの実環境確認
- 不正role/statusの本番拒否確認
- 旧GETの本番閉鎖確認
- 到達経路1〜4の攻撃テスト
- 孤児デプロイ2つのアーカイブ

## 6. G-A解消に残る作業

1. Worker、クライアント、ACCOUNT GASを承認文書の段階順で反映する
2. 各段階の回帰確認を行う
3. えいちが孤児固定版 @37 と @HEADをアーカイブする
4. 到達経路1〜4すべてで匿名承認が拒否されることを実測する

この4項目が終わるまで、**G-A解消とは報告しない。**

## 7. 承認文書の訂正3件への見解

異論なし。

- `internal_user_id` は値の非空を明示検証した
- active条件は新規制限ではなく多層防御として扱った
- `clasp status` を本番一致確認には使用していない
