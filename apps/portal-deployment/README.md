# Another Portal deployment

Another Portal の静的フロントを Blue／Green の二つの非公開Workerへ配置し、共通入口のRouter WorkerからService Bindingで切り替えるための構成です。

## ローカル確認

```bash
npm install
npm run check
```

`npm run build` は、現在のGitコミットから公開対象の静的ファイルだけを `dist/` へ集め、`release.json` を生成します。`backend`、`tests`、`docs`、Markdownは公開物へ含めません。

## 公開順序

1. `npm run check`
2. 待機枠へ `dist/` を配置
3. TEST環境で待機枠を確認
4. Routerの `ACTIVE_SLOT` を切り替える
5. 共通入口で本番確認

公開先の変更は、次のように設定、検証、公開を分けて実行します。

```bash
npm run route:green
npm run check:router
npm run deploy:router
```

GreenからBlueへ戻す場合は `npm run route:blue` を使用します。切替設定の差分を確認し、切替理由と確認結果をGit履歴へ残します。

具体的な公開・巻き戻し条件は [`../BLUE_GREEN_DEPLOYMENT_DESIGN.md`](../BLUE_GREEN_DEPLOYMENT_DESIGN.md) を参照してください。

Cloudflareへのログイン、Worker公開、Custom Domain設定、Firebase許可ドメイン変更は、対象アカウントと影響を確認してから個別に実施します。
