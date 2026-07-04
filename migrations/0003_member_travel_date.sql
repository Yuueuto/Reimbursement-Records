-- 委員交通資料新增「日期」欄位，讓每天的委員可分開記錄與篩選
ALTER TABLE members ADD COLUMN travel_date TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_members_date ON members(travel_date DESC);
