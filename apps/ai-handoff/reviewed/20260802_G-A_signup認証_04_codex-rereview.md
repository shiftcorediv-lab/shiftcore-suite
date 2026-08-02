# Codex再レビュー：G-A signup承認の認証追加（改訂版）

- 状態: 要改訂
- 作成者: Codex
- 作成日: 2026-08-02
- 前提文書: `inbox/20260802_G-A_signup認証_03_claude-revised.md`
- 置き換える版: なし
- 実装: 未実施
- commit: 未実施
- push: 未実施
- deploy: 未実施

---

## 1. 結論

前版への主要な指摘は適切に反映され、認証追加の設計は実装可能な水準に近づいた。ただし、**旧デプロイを残したまま完了扱いできる点**と、**監査記録へ空の操作者IDが入りうる点**が残るため、現版のまま承認することは推奨しない。

セキュリティ修正の本体は妥当であり、下記を直した改訂版を承認候補とする。

---

## 2. 必須修正

### [P1] 孤児の固定版デプロイが残る限り、G-Aは解消しない

文書は到達経路2の `AKfycbyvUOQ…` @37 が修正前コードを配信し続けると認識している。一方、完了報告では「Kが未完了なら完了と書かない」としており、Nのアーカイブを完了条件にしていない。

これでは、本番URLとWorkerを直しても、既知の旧URLから匿名承認を継続できる。**G-Aのセキュリティ完了条件は、Kではなく到達経路1〜4がすべて閉じた時点**でなければならない。

改訂案:

1. @37の孤児デプロイのアーカイブ、または同等の到達不能化を必須条件にする
2. @HEADは最新コード反映後に認証必須になったことを実リクエストで確認する
3. えいちの手作業が未実施なら、Codex側の実装完了とG-Aの解消を分けて記録する
4. 旧URLそれぞれに対するトークンなし攻撃テストを完了条件へ追加する

### [P1] `reviewed_by` に空文字が入る可能性を排除する

`buildLoginUserResponse()` は `internal_user_id` プロパティを常に返すが、値が非空であることまでは保証していない。現版の「必ず返す」は、プロパティの存在と有効値を混同している。

`requireSignupAdminOperator_` または承認・却下処理で、次を検証すること。

```js
const reviewedBy = normalizeText(operator && operator.internal_user_id);

if (!reviewedBy) {
  return { success: false, message: "操作者IDを確認できません" };
}
```

監査列へメールアドレス等を暗黙に代入する仕様変更は行わず、ID欠損ユーザーは操作を拒否するのが安全である。

---

## 3. 訂正が必要な説明

### [P2] `status=active` は実効上の新規制限ではない

`resolveCurrentUserByIdToken()` は最終的に `checkLoginUserByEmail()` を呼び、同関数は `status !== active` のユーザーへ `ok: false` を返す。したがって、`resolved.ok === true` を通過した時点でactive条件は既に満たされている。

専用ガード内でactiveを再確認する防御的実装は残してよいが、「この1点だけ新たに条件を厳しくする」という説明は正確でない。既存の認証解決経路にactive制限が既にある、と訂正すること。

根拠:

- `account-console/backend/account-apps-script/token_auth.js:73-80`
- `account-console/backend/account-apps-script/users.js:208-231`

### [P2] `clasp status` は本番ソースとの差分確認にならない

手順D末尾の「`npx @google/clasp status` で差分がないことを確認」は目的とコマンドが一致していない。`clasp status` は主にpush対象・無視対象の状態確認であり、デプロイ済み版やリモートHEADとの内容一致を証明しない。

本番・リモートとの同一性が必要なら、別の一時ディレクトリへ対象プロジェクトを取得してdiffするか、Apps Scriptのバージョンとデプロイの対応を確認する手順を明記すること。

---

## 4. スコープ調整の提案

### [P2] LockServiceはG-Aから分離する

競合問題G-Jは実在するが、認証穴の閉鎖とは独立している。G-AはWorker、クライアント、GAS、複数デプロイを順に切り替えるだけでも作業・検証範囲が広い。

「任意ステップ」を同じ指示書へ入れると、完了範囲とコミット単位が曖昧になる。G-Aを先に閉じ、G-Jは独立した承認・コミットで実施することを推奨する。

---

## 5. 妥当と確認した点

- 現行の一覧・承認・却下が無認証であるという問題認識
- 旧GETを残してPOST版を追加し、クライアント移行確認後に旧GETを削除する段階移行
- `reviewedBy` をクライアントから受け取らず、検証済み操作者から決定する方針
- 現行クライアントと同じ `role OR account_console` 条件を専用ガードでサーバ側へ移す方針
- `role` と `status` に既存許容値定数を使う方針
- 操作直前に `getIdToken()` を取得し、非冪等操作を自動再試行しない方針
- Worker許可リストを補助防御、GAS認証を本体とする整理
- 重複した `requireAccountConsoleOperator_` の一本化
- `workStatus`、`allowed_modules`、`organizationId`、`engagement_status` の仕様問題を本作業で勝手に変更しない判断

---

## 6. 現在のGit・ソース状態に関する実装前ブロッカー

再レビュー時の確認結果:

- ブランチ: `codex/attendance-dashboard`
- HEAD: `32323f8`
- `apps/account-console/backend/account-apps-script/` はディレクトリ全体が未追跡
- `apps/pmo/backend/`、`apps/ai-handoff/` も未追跡
- 文書が基線としている `139d109` と現在のHEADは一致しない

これは文書内容の欠陥とは別だが、この状態で実装・コミットするとGAS一式を新規ファイルとして扱うことになる。着手前に、えいちまたはClaudeが意図した基線・ブランチと、未追跡GASを誰がどのコミットへ収録するかを確定する必要がある。

既存のShiftBuilder文書差分には触れないこと。

---

## 7. 判定

**要改訂。** 最低限、次の3点を直せば実装承認候補になる。

1. 旧固定版デプロイの閉鎖をG-A全体の必須完了条件にする
2. `internal_user_id` の非空検証を追加する
3. active条件と `clasp status` の説明を訂正する

