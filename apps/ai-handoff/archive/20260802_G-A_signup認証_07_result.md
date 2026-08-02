# G-A signup承認の認証追加：実装結果

- 状態: Codex実装完了、外部反映・攻撃テスト完了、G-A解消
- 作成者: Codex
- 作成日: 2026-08-02
- 前提文書: `approved/20260802_G-A_signup認証_06_approved.md`
- 着手時HEAD: `01ad54a`
- ブランチ: `codex/attendance-dashboard`
- 実装: ローカル完了
- commit: `2075b8e`（公開時 `fb8884c`）
- push: 完了
- deploy: Worker `6c23e849-eb57-44de-bc6b-79c6ee72accf`、ACCOUNT `@38`、GitHub Pages 完了

---

## 1. 完了状態の区別

| 区分 | 状態 | 理由 |
|---|---|---|
| ローカルコード実装 | **完了** | Worker、GAS、クライアントの最終コードを反映し、自動検証済み |
| 承認文書上の「Codex実装完了」 | **完了** | Worker・GAS・静的クライアントを外部反映し、遮断確認済み |
| G-A解消 | **完了** | 孤児固定版をアーカイブし、到達経路1〜4の匿名承認がすべて失敗 |

**「Codex実装完了」と「G-A解消」の双方を、別条件で確認した。**

## 2. 更新前状態

`clasp deployments` の読み取り結果:

- ACCOUNT本番: `AKfycbx83rAzXDfQPJUE…` **@37**
- 孤児固定版: `AKfycbyvUOQHkNWSxiBz…` **@37**
- @HEAD: `AKfycbzS0Etn9kdeI_I3…` @HEAD

更新後はACCOUNT本番を `@38` へ更新した。孤児固定版はアーカイブ済み、@HEAD URLも404で到達不能。

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
| A Workerソース取り込み | 完了 | リポジトリへ取り込み済み |
| B Worker許可リスト | 完了 | Cloudflare本番へ反映済み |
| C 全アプリ回帰確認 | 一部完了 | 許可済みログイン経路と遮断を確認。実アカウントでの全画面操作は未確認 |
| D 重複ガード一本化 | 完了 | 定義数1を確認 |
| E 認証付き一覧POST追加 | 完了 | ローカル最終コードへ反映 |
| F クライアント移行 | 完了 | ローカル最終コードへ反映 |
| G 本番POST利用確認 | 完了 | 公開JSがPOST `getSignupRequestsSecure` を使用 |
| H 承認・却下認証必須化 | 完了 | ローカル最終コードへ反映 |
| I payload許容値検証 | 完了 | role/status |
| J 実アカウント確認 | 未実施 | 実データを操作していない |
| K 旧GET削除 | 完了 | ローカル最終コードへ反映 |
| L 孤児デプロイのアーカイブ | **完了** | 固定版@37は404。@HEAD URLも404 |
| M 全経路攻撃テスト | **完了** | 経路1〜4すべてで匿名承認失敗 |

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
- Worker本番: 無効JSON 400、許可外アクション 403、許可済みログイン照合はACCOUNTへ到達
- ACCOUNT本番@38: トークンなし承認を「ログイン情報がありません」で拒否
- 旧GET: `Unknown GET action`、申請者情報なし
- 孤児固定版@37: HTTP 404
- @HEAD URL: HTTP 404
- GitHub Pages: build/deploy成功。公開JSで認証付きPOSTと `idToken` を確認

### 未実施

- 正規管理者による一覧・承認・却下
- `reviewed_by` の実シート確認
- 権限なしアカウントの実環境確認
- 不正role/statusの本番拒否確認
- ログイン・勤怠・PMO・ShiftBuilderの実アカウントによる全画面回帰確認

## 6. G-A解消後に残る運用確認

1. 正規管理者で一覧・承認・却下を実操作する
2. `reviewed_by` に正しい `internal_user_id` が記録されることを確認する
3. 権限なしアカウントで画面が拒否されることを確認する

匿名承認と旧GETによる情報開示は閉じているため、**G-Aは解消**と判定する。上記は正系と監査記録の運用確認として残す。

## 7. 承認文書の訂正3件への見解

異論なし。

- `internal_user_id` は値の非空を明示検証した
- active条件は新規制限ではなく多層防御として扱った
- `clasp status` を本番一致確認には使用していない
