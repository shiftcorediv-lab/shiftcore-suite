# Another Portal deployment

Another Portal の同じ実運用画面を二つの非公開Workerへ配置し、共通入口のRouter WorkerからService Bindingで切り替えるための構成です。内部名称は既存Cloudflare設定との互換性のため `blue`／`green` のまま維持します。

利用者向け共通入口: `https://another-portal-router.shiftcore-div.workers.dev/`

運用上の呼称は **Blue／Red** です。Redは内部設定上のGreenを指します。どちらも同じ機能を持つ実運用ポータルで、Blueは青基調、Redは赤基調で表示します。片方の保守中はもう片方へ事前に切り替えるため、利用者は共通入口のURLを変えずに利用を継続できます。選択中の枠が接続失敗または5xxになった場合は待機枠へ自動退避します。独自ドメインや会社Cloudflareアカウントは使用しません。

## ローカル確認

```bash
npm install
npm run check
```

`npm run build` は、現在のGitコミットから公開対象の静的ファイルだけを `dist/` へ集め、`release.json` を生成します。`backend`、`tests`、`docs`、Markdownは公開物へ含めません。

## 通常公開

1. `npm run check`
2. TEST環境で公開候補を確認
3. 利用中でない枠へ公開
4. 待機枠を確認
5. Routerを切り替え
6. 共通入口で本番確認

BlueからRedへ切り替える場合は、設定、検証、公開を分けます。RedからBlueへ戻す場合は `npm run route:blue` を使います。

```bash
npm run route:red
npm run check:router
npm run deploy:router
```

切替設定の差分を確認し、切替理由と確認結果をGit履歴へ残します。緊急停止画面はBlueとRedの両方が利用できない場合に限り、Routerの安全側の応答として使用します。

具体的な公開・巻き戻し条件は [`../BLUE_GREEN_DEPLOYMENT_DESIGN.md`](../BLUE_GREEN_DEPLOYMENT_DESIGN.md) を参照してください。

Cloudflareへのログイン、Worker公開、Firebase許可ドメイン変更は、対象アカウントと影響を確認してから個別に実施します。
