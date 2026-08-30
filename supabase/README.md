# הרצת Supabase — עזר תורה (פרויקט חדש, מאובטח עם Supabase Auth)

תיקייה זו מכילה את כל מה שצריך כדי להקים את צד-השרת של המערכת בפרויקט Supabase חדש:

```
supabase/
├── config.toml                     הגדרות CLI + Edge Functions
├── migrations/
│   └── 0001_init.sql               טבלת app_state + RLS + טריגר + seed
└── functions/
    ├── self-service/index.ts       פורטל עדכון עצמי לתורם (מאובטח בטוקן)
    └── yemot-ivr/index.ts          Webhook לתרומות טלפוניות (אופציונלי)
```

**מודל האבטחה:** כל בסיס הנתונים נשמר ב-`app_state` (שורת `main`) + שורות נוכחות. ה-RLS **חוסם לחלוטין** את המפתח האנונימי ומתיר גישה **רק למשתמשים מחוברים** דרך Supabase Auth. כך נתוני התורמים כבר לא חשופים לכל האינטרנט.

---

## מה להריץ עכשיו — שלב אחר שלב

### 0. דרישות מקדימות
- פרויקט Supabase חדש (יצרת) — צריך ממנו: **Project URL**, **anon key**, ו-**Reference ID**.
  Dashboard → Project Settings → API (ל-URL ו-anon) ; → General (ל-Reference ID).
- Supabase CLI מותקן: `npm i -g supabase` (או `brew install supabase/tap/supabase`).

### 1. חיבור ה-CLI לפרויקט
```bash
cd supabase                 # התיקייה הזו
supabase login              # פותח דפדפן להזדהות
supabase link --project-ref <YOUR_PROJECT_REF>
```
> אפשר גם לעדכן את `project_id` ב-`config.toml` לאותו ref.

### 2. הרצת המיגרציה (יצירת הטבלה + RLS)
```bash
supabase db push
```
**לחלופין ידני** (בלי CLI): Dashboard → SQL Editor → New query → הדבק את תוכן `migrations/0001_init.sql` → Run.

### 3. פריסת ה-Edge Functions
```bash
supabase functions deploy self-service
supabase functions deploy yemot-ivr      # אופציונלי — רק אם יש תרומות טלפוניות
```
> `SUPABASE_URL` ו-`SUPABASE_SERVICE_ROLE_KEY` מוזרקים אוטומטית לפונקציות.
> להגנת ה-webmook של ימות (אופציונלי):
> `supabase secrets set YEMOT_WEBHOOK_SECRET=<סיסמה-שתבחר>`

### 4. הגדרת Auth (משתמשים)
1. Dashboard → **Authentication → Providers → Email** → ודא שמופעל.
2. Dashboard → **Authentication → Users → Add user** → צור את המשתמש הראשון שלך (מייל + סיסמה).
   > המשתמש הראשון שמתחבר לאפליקציה הופך אוטומטית ל**מנהל ראשי (superadmin)**.
3. **חשוב:** Dashboard → **Authentication → Sign In / Providers** → כבה **"Allow new users to sign up"**, כדי שרק מנהל יוכל להוסיף משתמשים.
4. הוספת משתמשים נוספים בהמשך: צור אותם ב-Dashboard (Add user), ואז במערכת (פאנל ניהול → משתמשים) הוסף שורה עם אותו **מייל** והגדר תפקיד. הסיסמה מנוהלת ב-Supabase Auth בלבד.

### 5. חיבור האפליקציה (index.html) לפרויקט החדש
עדכן שתי שורות בראש `index.html` (שורות 18–19) לערכים של הפרויקט החדש:
```js
const SUPABASE_URL = "https://<YOUR_PROJECT_REF>.supabase.co";
const SUPABASE_KEY = "<YOUR_ANON_KEY>";   // מפתח anon — מותר שיהיה פומבי, ה-RLS מגן
```

### 6. בדיקה
- פתח את `index.html`, התחבר עם המשתמש שיצרת → אתה אמור להיכנס כמנהל ראשי.
- נסה DevTools בלי התחברות: `await _sb.from('app_state').select('*')` → אמור להחזיר ריק/שגיאה (זו ההוכחה שה-RLS עובד).

---

## פעולות אבטחה נוספות מומלצות
- **הימות/נדרים/EmailJS:** הכנס את המפתחות דרך פאנל הניהול במערכת (אל תשאיר את הישנים — הם נחשפו וכדאי להחליף בשירותים עצמם).
- **מפתחות ישנים:** אם הפרויקט הישן עדיין קיים — מחק אותו או החלף בו את ה-JWT secret, כי המפתח הישן פורסם.
- **גיבוי:** Dashboard → Database → Backups (מופעל אוטומטית בתוכניות בתשלום).

## מבנה השורה `app_state`
| id | data (jsonb) | updated_at |
|---|---|---|
| `main` | כל בסיס הנתונים של האפליקציה | זמן עדכון אחרון |
| `presence_*` | נוכחות משתמש מחובר | heartbeat |
