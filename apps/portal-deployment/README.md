# Another Portal deployment

Another Portal の実運用画面とメンテナンス画面を二つの非公開Workerへ分け、共通入口のRouter WorkerからService Bindingで切り替えるための構成です。内部名称は既存運用との互換性のため `blue`／`green` のまま維持します。

利用者向け共通入口: `https://another-portal-router.shiftcore-div.workers.dev/`

2026-09-04時点では、Blueが実運用、Greenがメンテナンス専用です。Greenを選ぶと、Another Portalの青／赤ブランドを使った「メンテナンス中」画面を返し、業務画面や静的ファイルは配信しません。独自ドメインや会社Cloudflareアカウントは使用しません。

## ローカル確認

```bash
npm install
npm run check
```

`npm run build` は、現在のGitコミットから公開対象の静的ファイルだけを `dist/` へ集め、`release.json` を生成します。`backend`、`tests`、`docs`、Markdownは公開物へ含めません。

## 通常公開

1. `npm run check`
2. TEST環境で公開候補を確認
3. Blueへ公開
4. 共通入口で本番確認

Greenは通常公開の待機枠として使いません。本番停止が必要なときだけ、次のように設定、検証、公開を分けてメンテナンス表示へ切り替えます。

```bash
npm run route:green
npm run check:router
npm run deploy:router
```

メンテナンス終了後は `npm run route:blue` で実運用へ戻します。切替設定の差分を確認し、切替理由と確認結果をGit履歴へ残します。Blueのリリース不具合はGreenへ切り戻すのではなく、Blue Workerの安全な版へロールバックします。

具体的な公開・巻き戻し条件は [`../BLUE_GREEN_DEPLOYMENT_DESIGN.md`](../BLUE_GREEN_DEPLOYMENT_DESIGN.md) を参照してください。

Cloudflareへのログイン、Worker公開、Firebase許可ドメイン変更は、対象アカウントと影響を確認してから個別に実施します。
