# 拾光 · Facebook 媒體保存

Windows 電腦版 Chrome Manifest V3 擴充功能。依據 `docs/FB_Download_Predev` 的需求／架構／關卡實作，控制頁視覺參照根目錄「靜態介面.html」。原型檔案保留不變。

**目前是 P0 可行性驗證版，不是完整下載產品。** 完整下載、增量下載、父子全選、分類掃描與自動恢復尚未實作。未通過真實 Facebook P0 前不進入 P1–P5。

## 在電腦上安裝

1. 在 Chrome 開啟 `chrome://extensions`，開啟「開發人員模式」。
2. 點「載入未封裝項目」，選本專案的 `dist` 資料夾（請先建置，或解壓 P0 安裝包）。
3. 使用自己已登入的 Facebook；擴充功能不索取帳密。
4. 點 Facebook 右下角「拾光 · 開啟下載工作頁」，另開原 URL，保留來源分頁。
5. 在新工作頁載入照片，再點「拾光 · 檢視樣本與選擇資料夾」。控制頁按「讀取工作頁」。
6. 選一個樣本、選本機資料夾，按「驗證所選樣本」。檢查最後確認內容，確認後才授權媒體網域並開始下載。
7. 完成後在資料夾開啟照片／影片，人工確認畫質與音軌。保持控制頁開啟直至處理完成。

目標辨識目前只接受 `https://www.facebook.com/profile.php?id=數字ID` 或數字 ID 路徑。別名頁、混合動態、直接照片／影片頁無可靠帳號身份時阻擋。目標名稱取頁面 h1，仍需人工核對；不把登入者當成目標。

僅取 DOM 中附穩定媒體 ID、直接 `*.fbcdn.net` HTTPS 來源的最多 20 個樣本。每次驗證一個；縮圖可能不是原圖。blob 影片、DASH／分離音軌、重導向來源及尚未載入內容不支援。來源回應 HTML、206 部分內容、429、空檔或長度不符都不標成功。

## 開發與檢查

使用 Node 24.22.1、pnpm 12.15.0；版本鎖在 `pnpm-lock.yaml`。

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

本機若尚未安裝 Node，可使用這次下載並經官方 SHA-256 核對的 `.tools/node-v24.22.1-win-x64`。`.tools` 不屬於交付程式，沒有改動系統 PATH。啟動新 PowerShell 時可暫時設定：

```powershell
$env:PATH = "$PWD\.tools\node-v24.22.1-win-x64;$env:PATH"
.\node_modules\pnpm\pnpm.exe run build
```

## 檔案與中斷

每次保存至 `根目錄/目標名_ID/P0驗證_時間_UUID/`。該次目錄內有 `media.partial`、完成的媒體（成功時）與 `probe.json`。此實驗刻意保留 partial 供核對，最多佔約兩份樣本的磁碟空間；程式以串流複製，不把整部影片存入 JS 記憶體。

最後檔案關閉且大小核對後才提交 complete。中斷紀錄為 running／interrupted，不可視為成功；JSON 或檔案缺失也不得當成功。於「批次紀錄 → 核對既有 P0 紀錄」重新選擇含 probe.json 的子目錄核對。這僅核對提交狀態與大小，不包含雜湊、內容有效性或位元組續傳；未完成樣本須回 Facebook 重新讀取來源再跑。

不覆寫舊批次、不讀 Cookie、不設後端或資料庫、不保存含權杖的媒體 URL。控制頁持有目錄授權；service worker 僅處理工作分頁與 session 路由。關閉瀏覽器後不會繼續下載。

## 文件

- [P0 進度與驗證紀錄](docs/P0_實作與驗證.md)
- [需求與驗收規格](docs/FB_Download_Predev/01_需求與驗收規格.md)
- [開發任務清單](docs/FB_Download_Predev/05_開發任務清單.md)
- [測試任務清單](docs/FB_Download_Predev/06_測試任務清單.md)
