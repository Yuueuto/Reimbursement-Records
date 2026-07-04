# Reimbursement Records

出差代墊費用與委員交通方式管理網站，使用 Cloudflare Worker、Static Assets 與 D1。

## 本機啟動

1. 執行 `npm install`
2. 複製 `.dev.vars.example` 為 `.dev.vars`，設定密碼與 session secret
3. 執行 `npm run db:migrate:local`
4. 執行 `npm run dev`

正式部署前會建立 D1、更新 database ID，並使用 `wrangler secret put` 安全設定密碼；不會把密碼提交到版本控制。
