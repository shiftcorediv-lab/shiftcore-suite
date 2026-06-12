# ShiftCore Suite

ShiftCore関連アプリをまとめる統合リポジトリです。

## 統合対象

- Account Console
- PMO / Pick My Off
- OrderCase
- Persona Gacha

## 統合対象外

- Hirotimer

Hirotimerは単体ツールとして独立管理します。

## 現在の移行方針

まずは既存リポジトリを削除せず、ファイルコピーで安全に統合します。

Git履歴の統合は行いません。

## 移行状況

| アプリ | 配置先 | 状態 |
|---|---|---|
| Persona Gacha | apps/persona-gacha/ | 表示OK |
| PMO / Pick My Off | apps/pmo/ | 表示OK。直接アクセス時のユーザー情報取得は要確認 |
| OrderCase | apps/ordercase/ | URL表示OK。API通信・権限表示は要確認 |
| Account Console | apps/account-console/ | 動作OK |
| Hirotimer | 統合対象外 | 独立管理 |
