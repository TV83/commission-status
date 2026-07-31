# 委託進度查詢

這是一個由 GitHub Pages 提供的靜態查詢網站。GitHub Actions 每 15 分鐘透過 Notion API 讀取排單，將有效委託轉成公開 JSON；訪客的查詢完全在瀏覽器內完成。

## Program flow

1. GitHub Actions 使用 `NOTION_TOKEN` 查詢 `NOTION_SOURCES_JSON` 中的 Notion View，取得欄位資料。
2. 同步程式從公開 Notion 頁面的唯讀 View 設定取得 `page_sort`，也就是畫面手動拖曳後的 Page ID 順序。
3. 程式用 Page ID 把兩份資料配對，只保留「未著手」與「進行中」，再計算前方尚未著手的不同委託人人數。
4. 若任何 View 資料缺少可靠排序，工作流程會停止，既有成功版本繼續在線，不會發布猜測的人數。
5. 程式產生 `site/data/commissions.json`，測試通過後發布整個 `site` 目錄。
6. 訪客輸入 Facebook／Plurk ID、網址或委託名稱；瀏覽器把輸入正規化後，直接比對公開資料。

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

`page_sort` 來自 Notion 網站使用的公開唯讀介面，而不是官方公開 Data API。它讓網站不必新增「排隊序號」欄位；若 Notion 日後更改該介面，同步會安全失敗並保留上一版，屆時需更新讀取程式。

## Local checks

```sh
npm ci
npm test
npm run build
```

真正同步還需要在目前的 shell 設定 `NOTION_TOKEN` 與 `NOTION_SOURCES_JSON`，再執行 `npm run sync`。
