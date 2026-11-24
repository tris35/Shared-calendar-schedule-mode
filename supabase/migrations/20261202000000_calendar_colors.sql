-- 行程颜色和 Google 日历一样：没有自己颜色的行程，用它所在的 Google 日历的颜色
ALTER TABLE google_calendars ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_color TEXT;
