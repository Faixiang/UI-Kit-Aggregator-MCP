# UI Kit Aggregator MCP

UI Kit Aggregator 是一個 Model Context Protocol（MCP）服務。只要你的 AI 程式設計助手支援 MCP，就可以透過它，在搭建概念站、品牌站、落地頁，或需要動效與元件時，到 8 個公開目錄裡搜尋可用的元件、動效片段、安裝方式和運動提示詞。

每一條內容都會先經過同一套許可證門禁，通過後才會把正文交給助手。這樣做是為了讓更多人能清楚、正確地使用這些官方資源，而不是讓助手在未說明授權的情況下直接複製貼上。

本專案不擁有這 8 個目錄，只從官方介面取內容，不會把整庫鏡像下來。

## 為什麼要做這個

用 AI 做網站時，很常見的需求是：「幫我做一個有光暈的按鈕」「找一個 bento grid」「給首頁加文字進場動畫」。這些現成材料其實已經存在，只是分散在不同官方目錄裡，例如 Aceternity UI、React Bits、Magic UI、Cult UI、Uiverse，以及 Anime.js、Motion Prompt、MotionSites。

問題不在「有沒有東西可用」，而在「怎麼正確地用」：

- 每個來源的專長不同。有的是可安裝的 React 元件，有的是動畫引擎，有的只是提示詞，不能當成同一類東西隨便貼進專案。
- 授權條件也不一樣。有的是 MIT，有的附加 Commons Clause，有的允許用在最終產品，但不允許再發佈成元件庫或販售模板包。還有一部分是付費內容，沒有金鑰就不能取正文。
- 如果助手跳過這些差異，就可能用錯授權、取到不該取的付費內容，或在授權不明時仍然把原始碼帶出來。

所以這個服務把「搜尋」和「許可證檢查」做成同一條路：助手先搜，門禁再決定這條結果是可以取用、需要保留額外聲明、缺少金鑰所以要問你，還是必須攔截。沒有可以跳過門禁的參數。

沒有付費金鑰時，免費目錄仍可正常使用，服務不會因此停擺。

## 它適合誰

- 使用 Cursor、Claude Code，或其他支援 MCP 的 AI 程式設計助手，想在做網站時快速找到可安裝的官方元件。
- 需要同時查閱多個 UI／動效來源，但不想自己記住每家的授權和安裝方式。
- 希望助手在遇到付費內容時先問你要不要設定金鑰，而不是默默失敗或偷偷略過。

## 八個來源分別做什麼

1. **MotionSites**  
   面向概念站的 AI 整頁設計提示詞庫，例如落地頁、SaaS 行銷頁和作品集。適合需要完整頁面設計提示時使用，不是可直接貼上的 UI 元件。本服務只提供官方入口，不會抓取或返回鎖定的提示詞正文。完整提示詞需透過 MotionSites 官方會員、外掛或官方 MCP 取得。

2. **React Bits**  
   React 動畫元件，包括文字特效、背景和介面微互動，支援 JavaScript 或 TypeScript，以及 CSS 或 Tailwind。適合需要可複製貼上的 React 元件時使用。免費目錄為 MIT + Commons Clause。Pro 內容需要環境變數 `REACTBITS_LICENSE_KEY`；沒有金鑰時不會默默失敗，而是詢問你要設定金鑰還是跳過。安裝示例：`npx shadcn@latest add @react-bits/<Name>-TS-TW`

3. **Uiverse**  
   社群提供的 HTML、CSS、Tailwind 和 React 片段，包括懸停效果、按鈕和卡片。適合小型、獨立的 UI 小部件。許可證一般為 MIT。若片段裡帶有第三方資源（例如 Font Awesome），狀態會是 `flagged`，並保留原聲明。標註 all rights reserved，或屬於付費 Uiverse AI Design Systems 的內容會被攔截。可選配置 `GITHUB_TOKEN`，以便按標籤搜尋更準確。

4. **Anime.js**  
   輕量 JavaScript 動畫引擎，用於時間線、緩動，以及給 DOM、CSS 或 SVG 做動畫。適合需要動畫庫及其官方文件和示例時使用，不是元件庫。許可證為 MIT。安裝：`npm i animejs`，然後 `import { animate } from 'animejs'`。

5. **Aceternity UI**  
   React 與 Tailwind 元件庫，偏進階視覺效果，包括 3D、視差、spotlight、aurora、光暈和著色器視覺。適合精緻、電影感的 UI 區塊。免費目錄可直接取用；All-Access／付費項需要環境變數 `ACETERNITY_PRO_TOKEN`，缺失時會詢問你要設定還是跳過。Aceternity License 允許用於個人和商業最終產品及修改，但不允許把元件當作原始碼、主題或模板再分發。安裝示例：`npx shadcn@latest add @aceternity/<name>`

6. **Motion Prompt**  
   給 AI 描述動畫、鏡頭運動和頁面轉場的效果名詞庫與可複製提示詞，並提供動作演示。適合要命名效果、複製提示詞和查看運動示例時使用，不是可安裝的 UI 元件。許可證為 MIT。官方演示形如：https://showheyohtaki.github.io/motion-prompt/#001

7. **Cult UI**  
   來自官方 Cult UI registry、有辨識度的 React／shadcn 風格元件。適合複製貼上 Cult 元件，不是通用動畫引擎。許可證為 MIT。安裝示例：`npx shadcn@latest add @cult-ui/{name}`

8. **Magic UI**  
   官方免費／MIT 目錄中的 React 與 Tailwind 動畫元件。適合複製貼上 Magic UI 免費區塊。Magic UI Pro 是獨立的付費許可，不是本服務的來源，不會被編入索引，也不會提示「要不要加金鑰」。安裝示例：`npx shadcn@latest add @magicui/{name}`

## 提供哪些工具

- `list_sources`：列出全部 8 個來源、各自專長、許可證摘要，以及需要哪些環境變數。想先了解能用什麼時，從這裡開始。
- `search_ui_kits`：在全部或指定來源中搜尋。每條結果已經過門禁，包含合規狀態、簡介、官方連結，以及安裝或打開方式。這是最常用的入口。
- `get_item`：確定要用哪一條之後，取該條的文件摘錄、官方示例或元件原始碼（仍會先過門禁）。
- `get_license`：只查看條款、署名和聲明文本，不拉取原始碼。
- `check_compliance`：檢查擬定用途是否合規，例如用在客戶行銷網站，還是再發佈成元件庫或出售模板包。

典型流程是：你向助手描述需要什麼，助手用 `search_ui_kits` 搜尋，再對選定的那一條呼叫 `get_item`，把官方安裝方式和可用原始碼放進你的專案。若用途比較敏感，可以先讓助手跑一次 `check_compliance`。

## 許可證門禁如何運作

每一條內容都必須經過門禁，才能帶正文離開工具。門禁會記錄來源、條目、許可證名稱與連結、署名、狀態、原因、警告、聲明文本和條款連結。狀態有四種：

- `allowed`：許可證明確且用途允許，返回正文。
- `flagged`：基礎許可證已知，但還有額外義務（例如 Uiverse 片段中的第三方字體聲明）。正文仍可返回，原聲明必須保留。
- `blocked`：攔截並省略正文，只保留原因和條款連結。正文不會出現在原因或其他欄位裡。
- `needs_token`：缺少所需金鑰，省略正文，並詢問你是要設定金鑰，還是跳過這一條。

缺金鑰時不會默默失敗，也不會在工具呼叫裡收集金鑰。助手應清楚告訴你：這段特定內容需要哪一種產品的金鑰（例如 Aceternity All-Access 或 React Bits Pro）、對應的環境變數名稱，以及官方註冊連結，再問你要設定還是跳過。只有在你確認並且金鑰已經設定好之後，才可以重新取得。如果你選擇跳過，就停止，不要拉取。

官方註冊／取得金鑰地址：

- Aceternity All-Access：https://ui.aceternity.com/pricing 、https://ui.aceternity.com/pro ，金鑰頁 https://ui.aceternity.com/dashboard/token
- React Bits Pro：https://www.reactbits.dev/pro 、https://pro.reactbits.dev/docs/installation

以下情況一律是 `blocked`，不會改成「要不要加金鑰」：

- 許可證無法確定
- MotionSites 的提示詞正文
- Magic UI Pro，以及其他本服務明確不支援的付費目錄
- 不允許的再分發，例如把 React Bits 或 Aceternity 的元件再發佈成元件庫，或出售模板包

「用在客戶行銷網站」一般視為最終產品，通常可以；「再發佈為元件庫」或「出售模板包」屬於再分發，會被攔截。

## 安裝與使用方法

需要 Node.js 20 或更新版本。

先克隆本倉庫，安裝依賴並啟動：

```bash
git clone https://github.com/Faixiang/UI-Kit-Aggregator-MCP
cd UI-Kit-Aggregator-MCP
npm install
npm start
```

預設會透過標準輸入輸出（stdio）提供服務，由編輯器在需要時自行啟動。啟動前請把下面設定裡的路徑，換成你本機專案中 `dist/index.js` 的實際位置。

在 Cursor 的 MCP 設定（專案內常見為 `.cursor/mcp.json`，或 Cursor 使用者層級 MCP 設定）中加入：

```json
{
  "mcpServers": {
    "ui-kit-aggregator": {
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

Claude Code 使用專案或使用者目錄下的 `.mcp.json`，欄位結構相同。設定後請重載 MCP，或重啟客戶端。

若你希望先由本機自己開一個 HTTP 服務，再讓客戶端連上去，可以執行：

```bash
MCP_TRANSPORT=http npm start
```

預設監聽 `http://127.0.0.1:3847/mcp`，健康檢查為 `http://127.0.0.1:3847/health`。客戶端可改為使用這個網址。不要在已載入付費金鑰時，把這個連接埠暴露到公網。

可選環境變數（不要寫進倉庫，也不要發到聊天裡；如需使用，請在本機環境或 MCP 設定的 `env` 中設定）：

- `ACETERNITY_PRO_TOKEN`：未設定時，Aceternity 免費目錄仍可用，付費項會變成 `needs_token`。
- `REACTBITS_LICENSE_KEY`：未設定時，React Bits 免費目錄仍可用，Pro 內容會變成 `needs_token`。
- `GITHUB_TOKEN`：可改善 Uiverse 的標籤搜尋，通常只需公開倉庫權限。

沒有這些金鑰時，免費目錄仍可正常使用。
