# QA — בדיקות אוטומטיות

בדיקות דפדפן (Playwright + Chromium) שמריצות את `index.html` מול שרת Supabase מדומה (`fake-sb.js`), כולל ערוץ Realtime מדומה לשני משתמשים, ובדיקות יחידה ל-Edge Functions.

```bash
cd qa
npm install
npx playwright install chromium        # או: export CHROME_PATH=/path/to/chrome
npm run build:edge                     # מתרגם את ה-Edge Functions לבדיקת היחידה
npm test                               # מרים שרת סטטי על :8123 ומריץ הכל
```

| קובץ | מה נבדק |
|---|---|
| `smoke.js` | כל העמודים והמודאלים, זרימות עיקריות (תורם, תרומה, עתידיות, ייבוא, בקשות ממתינות, היסטוריה) |
| `qa-flows.js` | ייבוא Excel/נדרים, תאריכים עבריים, עמוד עצמי, טופס ציבורי, בדיקת חיבור |
| `qa-merge.js` | מנוע המיזוג התלת-כיווני (12 תרחישים) |
| `qa-sync-e2e.js` | עליית מערכת, שמירה עם CAS, כתיבות מקבילות, poll, רענון לפני סנכרון, אישור עדכון עצמי |
| `qa-chat.js` | שני משתמשים בצ'אט: Realtime, אישורי קריאה, הקלדה, קבוצות, תיוג, עריכה/מחיקה, מובייל |
| `qa-xss.js` | מטענים זדוניים בכל שדה — 0 הרצות |
| `qa-viewer.js` | תפקיד מבקר: כפתורי עריכה מוסתרים |
| `qa-viewports.js` / `qa-mobile*.js` / `qa-overflow.js` | 11 גדלי מסך: ללא גלילה רוחבית, כפתור השמירה נגיש |
| `qa-routing-cache.js` | קישורי עומק, היסטוריה, Escape/מיקוד, מטמון IndexedDB |
| `qa-keyboard.js` | ניווט מקלדת: כניסה, תפריט, מודאלים, Ctrl+K |
| `qa-clickall.js` | לחיצה על כל handler בכל עמוד/מודאל — 0 חריגות |
| `qa-a11y.js` | axe-core על כל עמוד ומודאל, מחשב + טלפון |
| `qa-perf.js` | זמני רינדור עם 3,000 תורמים |
| `test-edge.js` | Edge Function `self-service`: RPC, נפילה ל-CAS, טוקנים, diag |
