# Codexレビュー：S-4 反射型XSS修正

- 状態: 要改訂
- 作成者: Codex
- 作成日: 2026-08-02
- 前提文書: `inbox/20260802_S-4_反射型XSS修正_01_claude-draft.md`
- 置き換える版: なし
- 実装: 未実施
- commit: 未実施
- push: 未実施
- deploy: 未実施

---

## 1. 結論

指摘された3箇所は現行コード上で確認でき、`innerHTML` をやめて `textContent` でDOMを組み立てる修正方針も妥当である。セキュリティ修正として実装を推奨する。

ただし、現指示書のキャッシュバスティング手順では、変更した `ui.js` が利用者へ確実に配信されない可能性がある。公開後も脆弱な旧モジュールがキャッシュから使われる余地があるため、ここは必須改訂とする。

---

## 2. 必須修正

### [P1] エントリポイントだけでなく `ui.js` のimport URLも更新する

3つのエントリモジュールはいずれも、現在は版数なしで `./ui.js` をimportしている。

- `pmo/js/main.js:24`
- `account-console/js/account-portal/main.js:3`
- `account-console/js/pmo-portal/main.js:3`

HTML側の `main.js?v=...` だけを更新しても、再取得されたmain.jsが従来と同じ `./ui.js` URLをimportするため、ブラウザや配信キャッシュに残った旧ui.jsを再利用する可能性がある。

次の両方を更新すること。

1. 各 `main.js` のimportを `./ui.js?v=<今回の統一版>` に変更する
2. 各HTMLのエントリ `main.js?v=` も更新し、新しいmain.js自体を取得させる

対象HTML:

- `pmo/index.html`
- `account-console/account-portal.html`
- `account-console/pmo-portal.html`

版数文字列は触った範囲で1種類に統一し、完了報告へ記録する。

---

## 3. テスト手順の修正

### [P2] 攻撃文字列をURLエンコードする

手動確認URLは、ブラウザやチャットによる解釈差を避けるため、`module` 値をURLエンコードして記載すること。例:

```text
?from=shiftcore&module=%3Cimg%20src%3Dx%20onerror%3Dalert%281%29%3E
```

確認条件は現版どおり、アラートが出ず、デコード後の文字列がテキストとして表示されること。

### [P2] キャッシュを残した通常更新でも新コードが配信されることを確認する

開発者ツールでキャッシュを無効化した確認だけでは、キャッシュバスティングの検証にならない。通常の再読み込みで、新しい版数付き `ui.js` が取得されていることをNetwork表示等で確認する項目を追加する。

---

## 4. 妥当と確認した点

- `pmo/js/ui.js` の `params.module` がURLクエリ由来で、テンプレート文字列から `innerHTML` へ入る
- `account-console/js/account-portal/ui.js` に同型の問題がある
- `account-console/js/pmo-portal/ui.js` の `moduleName`、`role`、`workStatus` がURL由来である
- pmo-portalのdeveloper判定もURL由来なので、XSS防御のガードにならない
- `textContent` によるDOM構築は、表示を維持しつつ注入を防ぐ適切な最小修正である
- `&gt;` ではなく `>` をテキストとして設定する注意は正しい
- 新しい `escapeHtml` を増やさず、S-1や共通化へ範囲を広げない判断は妥当

なお、`account-console/js/signup-admin/ui.js` にも `banner.innerHTML` はあるが、内容は固定文字列だけでURL値を展開していないため、今回と同じ反射型XSSではない。対象3箇所という集計は正しい。

---

## 5. Git状態

再レビュー時のブランチは `codex/attendance-dashboard`、HEADは `32323f8`。既存のShiftBuilder文書差分と未追跡ファイルがあるため、実装時はS-4対象ファイルだけを扱い、既存差分を混ぜないこと。

---

## 6. 判定

**要改訂。** 修正方式はそのまま採用してよい。キャッシュバスティングを「HTMLのmain.js」と「main.js内のui.js import」の二段で行う手順へ直せば、実装承認候補になる。

