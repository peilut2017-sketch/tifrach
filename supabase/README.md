# הרצת Supabase — עזר תורה (פרויקט חדש, מאובטח עם Supabase Auth)

תיקייה זו מכילה את כל מה שצריך כדי להקים את צד-השרת של המערכת בפרויקט Supabase חדש:

```
supabase/
├── config.toml                     הגדרות CLI + Edge Functions
├── migrations/
│   ├── 0001_init.sql               טבלת app_state + RLS + טריגר + seed
│   ├── 0002_edge_atomic_writes.sql פונקציות SQL אטומיות ל-Edge Functions
│   └── 0003_delete_hardening.sql   מחיקה מותרת רק לשורות נוכחות (לא לשורת main)
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

### 2. הרצת המיגרציות (טבלה + RLS + פונקציות אטומיות)
```bash
supabase db push
```
**לחלופין ידני** (בלי CLI): Dashboard → SQL Editor → New query → הדבק את תוכן `migrations/0001_init.sql` → Run, ואז את `migrations/0002_edge_atomic_writes.sql` → Run, ואז את `migrations/0003_delete_hardening.sql` → Run.

> **מיגרציה 0003 (3.9.26):** עד עכשיו כל משתמש מחובר יכול היה למחוק את שורת `main` (כל בסיס הנתונים) בקריאת API אחת. אחרי המיגרציה מותר למחוק רק שורות נוכחות. מומלץ להריץ, אין תלות בקוד.

> **חשוב:** מיגרציה 0002 נדרשת ל-Edge Functions העדכניות — הן כותבות דרך פונקציות SQL אטומיות (`append_pending_edit`, `append_donor_donation`) במקום לשכתב את כל בסיס הנתונים, כך ששמירה של צוות במקביל לא תימחק. אחרי הרצתה יש לפרוס מחדש את הפונקציות (`supabase functions deploy`).

### 3. פריסת ה-Edge Functions
```bash
supabase functions deploy self-service   # עמוד עצמי + טופס הוספת תורם פתוח (?addDonor=1)
supabase functions deploy admin-users    # יצירת משתמשים מפאנל הניהול (מנהל ראשי בלבד)
supabase functions deploy yemot-ivr      # אופציונלי — רק אם יש תרומות טלפוניות
```
> `admin-users` דורש שהמשתמש המחובר יהיה **מנהל ראשי** ברשימת המשתמשים של המערכת — הבדיקה נעשית בצד השרת. בלי לפרוס אותה, יצירת משתמשים אפשרית רק דרך ה-Dashboard.
> `SUPABASE_URL` ו-`SUPABASE_SERVICE_ROLE_KEY` מוזרקים אוטומטית לפונקציות.
> להגנת ה-webmook של ימות (אופציונלי):
> `supabase secrets set YEMOT_WEBHOOK_SECRET=<סיסמה-שתבחר>`

### 4. הגדרת Auth (משתמשים)
1. Dashboard → **Authentication → Providers → Email** → ודא שמופעל.
2. Dashboard → **Authentication → Users → Add user** → צור את המשתמש הראשון שלך (מייל + סיסמה).
   > המשתמש הראשון שמתחבר לאפליקציה הופך אוטומטית ל**מנהל ראשי (superadmin)**.
3. **חשוב:** Dashboard → **Authentication → Sign In / Providers** → כבה **"Allow new users to sign up"**, כדי שרק מנהל יוכל להוסיף משתמשים.
3b. **לאיפוס סיסמה:** Dashboard → **Authentication → URL Configuration** → הגדר **Site URL** לכתובת שבה האתר מתארח (וגם ב-Redirect URLs). בלי זה קישור "שכחתי סיסמה" במייל לא יחזיר את המשתמש לאתר.
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
- **עמוד עצמי / טופס ציבורי:** תורמים → "עוד" → "עמוד עצמי לתורם" → **בדיקת חיבור לשרת → בדוק עכשיו**. הבדיקה מדווחת אם הפונקציה פרוסה ובאיזו גרסה, אם היא קוראת את בסיס הנתונים, ואם פונקציות ה-SQL ממיגרציה 0002 זמינות.

### 7. פתרון תקלות — "הקישור נפתח אבל השליחה נכשלה"
הטופס נטען (כלומר הפונקציה פרוסה והטוקן תקין) אבל בלחיצה על "שליחת הפרטים" מתקבלת שגיאה. מאז גרסה `2026-09-02b` הודעת השגיאה כוללת את הסיבה מהשרת, למשל:
| מה כתוב בסוגריים | מה זה אומר | מה לעשות |
|---|---|---|
| `save failed: read failed …` / `write failed: permission denied` | הפונקציה לא מצליחה לכתוב ל-`app_state` | ודא ש-`SUPABASE_SERVICE_ROLE_KEY` מוזרק (ברירת מחדל כן) ושהפונקציה פרוסה בפרויקט הנכון (אותו URL כמו ב-`index.html`) |
| `save failed: write contention` | כמה שמירות במקביל בדיוק באותו רגע | לנסות שוב |
| `unknown action` בבדיקת החיבור | פרוסה גרסה ישנה של הפונקציה | `supabase functions deploy self-service` |
| ⚠ "פונקציות ה-SQL ממיגרציה 0002 אינן זמינות" | המיגרציה לא רצה בפרויקט הזה | הדבק את `migrations/0002_edge_atomic_writes.sql` ב-SQL Editor והרץ. עד אז השליחה עובדת במסלול חלופי (compare-and-swap) — בטוח, רק איטי יותר |

הלוגים המלאים: Dashboard → Edge Functions → self-service → **Logs** (כל כשל כתיבה נרשם שם עם הסיבה).

---

## מודל ההרשאות — מה נאכף איפה
- **כניסה:** רק חשבונות שנוצרו ב-Supabase Auth (ואף אחד לא יכול להירשם לבד — ראה סעיף 4). ה-RLS חוסם את המפתח האנונימי לחלוטין.
- **תפקידים (מנהל ראשי / מנהל / עורך / מבקר):** נאכפים **בצד הלקוח** (כפתורים מוסתרים, פעולות חסומות). ברמת בסיס הנתונים כל חשבון מחובר יכול לעדכן את שורת `main`, כי גם "מבקר" כותב אליה באופן לגיטימי (הודעות צ'אט, אישורי קריאה, מועד התחברות). המשמעות: מי שיש לו חשבון במערכת הוא איש צוות מהימן — אל תיצור חשבונות לאנשים שאינם כאלה.
- **מחיקה:** אחרי מיגרציה 0003 אף חשבון לא יכול למחוק את שורת `main` דרך ה-API.
- **מחיקה מרובה של תורמים:** מנהל ראשי בלבד, עד 100 בפעולה, אחרי אימות סיסמה מול Supabase Auth.
- **Edge Functions:** `self-service` ו-`yemot-ivr` כותבות דרך פונקציות SQL אטומיות (או compare-and-swap) ולעולם לא דורסות שמירה מקבילה; `admin-users` דורשת JWT של מנהל ראשי.

## פעולות אבטחה נוספות מומלצות
- **הימות/נדרים/EmailJS:** הכנס את המפתחות דרך פאנל הניהול במערכת (אל תשאיר את הישנים — הם נחשפו וכדאי להחליף בשירותים עצמם).
- **מפתחות ישנים:** אם הפרויקט הישן עדיין קיים — מחק אותו או החלף בו את ה-JWT secret, כי המפתח הישן פורסם.
- **גיבוי:** Dashboard → Database → Backups (מופעל אוטומטית בתוכניות בתשלום).

## מבנה השורה `app_state`
| id | data (jsonb) | updated_at |
|---|---|---|
| `main` | כל בסיס הנתונים של האפליקציה | זמן עדכון אחרון |
| `presence_*` | נוכחות משתמש מחובר | heartbeat |
