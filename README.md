# 委託進度查詢

這是一個由 GitHub Pages 提供的靜態查詢網站。GitHub Actions 每 15 分鐘透過 Notion View Query 讀取排單，將有效委託轉成公開 JSON；訪客的查詢完全在瀏覽器內完成。

## Program flow

1. GitHub Actions 使用 `NOTION_TOKEN` 查詢 `NOTION_SOURCES_JSON` 中的 Notion View。
2. 同步程式保留「未著手」與「進行中」資料，並依 View 順序計算前方尚未著手的不同委託人人數。
3. 程式產生 `site/data/commissions.json`，測試通過後發布整個 `site` 目錄。
4. 訪客輸入 Facebook／Plurk ID、網址或委託名稱；瀏覽器把輸入正規化後，直接比對公開資料。

## Repository settings

- Actions Secret：`NOTION_TOKEN`
- Actions Variable：`NOTION_SOURCES_JSON`
- Pages source：GitHub Actions

`NOTION_SOURCES_JSON` 範例：

```json
[
  {
    "year": 2026,
    "databaseId": "2bb06d491a5d8104aec7d129bd11f58d",
    "viewId": "2bb06d491a5d81e1a899000c0ed05023"
  }
]
```

新增年度時，把新資料庫分享給同一個 Notion connection，再把新年度的 Database／View ID 加進這個陣列即可，不需要修改同步程式。

## Local checks

```sh
npm ci
npm test
npm run build
```

真正同步還需要在目前的 shell 設定 `NOTION_TOKEN` 與 `NOTION_SOURCES_JSON`，再執行 `npm run sync`。

