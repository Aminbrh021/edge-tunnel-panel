# Edge Tunnel Panel

یک پیاده‌سازی مستقل و بازنویسی‌شده از ایده‌های عمومی فایل ارسالی: پنل مدیریت کاربران، D1، اشتراک VLESS روی WebSocket و تونل TCP در Cloudflare Workers.

## فایل‌ها
- `worker.js` — کد اصلی Worker و پنل
- `schema.sql` — اسکیمای D1
- `wrangler.toml` — تنظیمات نمونه Wrangler

## نصب سریع
1. یک D1 Database بسازید و ID آن را در `wrangler.toml` قرار دهید.
2. مقدارهای `ADMIN_PASSWORD` و `ADMIN_SESSION` را تغییر دهید.
3. `npx wrangler d1 execute edge-tunnel-db --remote --file=./schema.sql`
4. `npx wrangler deploy`
5. آدرس `/panel` را باز کنید.

## نکته مهم
این پروژه عمداً یک بازنویسی مستقل است و کد اختصاصی، watermark/DRM یا مکانیزم‌های محافظتی فایل ارسالی را کپی یا دور نمی‌زند. قبل از استفاده عملی، احراز هویت، مدیریت secretها، محدودیت مصرف، logging و کنترل دسترسی را برای محیط واقعی تقویت کنید.
