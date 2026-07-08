-- 名冊管理：委員名單、地點名單（可於畫面人工增減），並讓費用/委員紀錄可存地點
CREATE TABLE IF NOT EXISTS roster_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS roster_places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE expenses ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE expenses ADD COLUMN location_address TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN location_address TEXT NOT NULL DEFAULT '';

INSERT INTO roster_people (name) VALUES
 ('曹祥雲'),('蔣任翔'),('劉述懿'),('黃小玲'),('翁仁芳'),('俞怡中'),('陳成業'),
 ('蘇怡仁'),('蔡明學'),('魏鋕志'),('巫昌陽'),('楊鈞賀'),('陳應南'),('陳泉錫'),
 ('李月碧'),('徐國鈞'),('謝文雄'),('包蒼龍'),('林瑞龍'),('廖俊儒'),('周宇輝'),
 ('王建興'),('許龍池'),('陳偉嵩'),('蔡葉榮'),('徐振德'),('楊啟文');

INSERT INTO roster_places (name, address) VALUES
 ('中華民國排球協會','臺北市中山區朱崙街20號802室'),
 ('Curves可爾姿有限公司','新北市永和區永和路2段57號8樓'),
 ('中華民國山岳協會','臺北市中山區恆安里中山北路二段185號10樓'),
 ('大無限健康事業股份有限公司','桃園市桃園區新埔六街77號7樓之5'),
 ('八里國際高爾夫球場','新北市林口區嘉寶里寶斗厝坑91號'),
 ('空軍清泉崗高爾夫球場','臺中市清水區國防用地和睦路二段305號'),
 ('台中國際高爾夫球場','臺中市北屯區民政里北坑巷21之8號'),
 ('舒適圈健身中心','桃園市龜山區文化三路327-1號'),
 ('好時光女生運動樂園','台北市中山區中山北路3段1號2樓'),
 ('高級中等學校體育總會','臺北市中山區朱崙街20號13樓'),
 ('中華民國籃球協會','臺北市中山區朱崙街20號603室'),
 ('立益高爾夫球場','新竹縣關西鎮東山里湖肚55號'),
 ('中華民國大專院校體育總會','臺北市中山區朱崙街20號13樓'),
 ('中華民國桌球協會','臺北市中山區朱崙街20號901室');
