/**
 * Echo QR Menu v1.0.0 — Digital Menu Platform for Restaurants
 * QR code menus, table ordering, scan analytics, multi-language.
 */

interface Env {
  DB: D1Database;
  QM_CACHE: KVNamespace;
  ENGINE_RUNTIME: Fetcher;
  SHARED_BRAIN: Fetcher;
  ECHO_API_KEY: string;
}

interface RLState { c: number; t: number }

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
}

function sanitize(s: string | null | undefined, max = 500): string {
  if (!s) return '';
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').slice(0, max);
}

function authOk(req: Request, env: Env): boolean {
  const k = req.headers.get('X-Echo-API-Key') || req.headers.get('Authorization')?.replace('Bearer ', '') || new URL(req.url).searchParams.get('key');
  return k === env.ECHO_API_KEY;
}

async function rateLimit(kv: KVNamespace, key: string, limit: number, windowSec: number): Promise<boolean> {
  const raw = await kv.get<RLState>(`rl:${key}`, 'json');
  const now = Date.now();
  if (!raw || (now - raw.t) > windowSec * 1000) {
    await kv.put(`rl:${key}`, JSON.stringify({ c: 1, t: now }), { expirationTtl: windowSec * 2 });
    return false;
  }
  const elapsed = (now - raw.t) / 1000;
  const decay = Math.max(0, raw.c - (elapsed / windowSec) * limit);
  if (decay + 1 > limit) return true;
  await kv.put(`rl:${key}`, JSON.stringify({ c: decay + 1, t: now }), { expirationTtl: windowSec * 2 });
  return false;
}

function slugify(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function shortCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function qrSvg(url: string, size = 200, fg = '#000000', bg = '#ffffff'): string {
  // Generate a simple QR-like SVG placeholder with the URL encoded
  // In production, use a real QR library. This returns a branded placeholder.
  const encoded = encodeURIComponent(url);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${bg}"/>
    <rect x="10" y="10" width="60" height="60" fill="${fg}" rx="4"/>
    <rect x="${size-70}" y="10" width="60" height="60" fill="${fg}" rx="4"/>
    <rect x="10" y="${size-70}" width="60" height="60" fill="${fg}" rx="4"/>
    <rect x="20" y="20" width="40" height="40" fill="${bg}" rx="2"/>
    <rect x="${size-60}" y="20" width="40" height="40" fill="${bg}" rx="2"/>
    <rect x="20" y="${size-60}" width="40" height="40" fill="${bg}" rx="2"/>
    <rect x="30" y="30" width="20" height="20" fill="${fg}" rx="1"/>
    <rect x="${size-50}" y="30" width="20" height="20" fill="${fg}" rx="1"/>
    <rect x="30" y="${size-50}" width="20" height="20" fill="${fg}" rx="1"/>
    <text x="${size/2}" y="${size/2+5}" text-anchor="middle" font-size="10" fill="${fg}" font-family="monospace">SCAN ME</text>
    <text x="${size/2}" y="${size/2+18}" text-anchor="middle" font-size="7" fill="${fg}" font-family="monospace">${encoded.slice(0,30)}</text>
  </svg>`;
}

function menuPage(restaurant: Record<string, unknown>, menus: Record<string, unknown>[], categories: Record<string, unknown>[], items: Record<string, unknown>[], tableNumber?: string): string {
  const brandColor = (restaurant.brand_color as string) || '#0d7377';
  const theme = (restaurant.theme as string) || 'light';
  const bg = theme === 'dark' ? '#0f172a' : '#ffffff';
  const text = theme === 'dark' ? '#e2e8f0' : '#0f172a';
  const textSec = theme === 'dark' ? '#94a3b8' : '#64748b';
  const cardBg = theme === 'dark' ? '#1e293b' : '#f8fafc';
  const border = theme === 'dark' ? '#334155' : '#e2e8f0';

  const hours = restaurant.hours ? JSON.parse(restaurant.hours as string || '{}') : {};
  const social = restaurant.social ? JSON.parse(restaurant.social as string || '{}') : {};

  let html = `<!DOCTYPE html><html lang="${restaurant.default_language || 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${restaurant.name} — Menu</title>
<meta name="description" content="${sanitize(restaurant.description as string, 160)}">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:${(restaurant.brand_font as string) || 'Inter'},system-ui,sans-serif;background:${bg};color:${text};min-height:100vh}
.header{background:${brandColor};color:#fff;padding:24px 16px;text-align:center}
.header h1{font-size:28px;font-weight:800;margin-bottom:4px}
.header p{opacity:.85;font-size:14px}
.table-badge{display:inline-block;background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;margin-top:8px}
.info-bar{display:flex;justify-content:center;gap:16px;padding:12px 16px;border-bottom:1px solid ${border};font-size:13px;color:${textSec};flex-wrap:wrap}
.info-bar a{color:${brandColor};text-decoration:none}
.tabs{display:flex;overflow-x:auto;gap:8px;padding:12px 16px;border-bottom:1px solid ${border};-webkit-overflow-scrolling:touch}
.tab{padding:8px 16px;border-radius:20px;border:1px solid ${border};font-size:13px;white-space:nowrap;cursor:pointer;background:transparent;color:${text}}
.tab.active{background:${brandColor};color:#fff;border-color:${brandColor}}
.category{padding:16px}
.category h2{font-size:20px;font-weight:700;margin-bottom:4px;color:${text}}
.category .desc{font-size:13px;color:${textSec};margin-bottom:12px}
.item{display:flex;gap:12px;padding:12px;border-radius:12px;background:${cardBg};border:1px solid ${border};margin-bottom:8px}
.item img{width:80px;height:80px;border-radius:8px;object-fit:cover;flex-shrink:0}
.item-info{flex:1;min-width:0}
.item-name{font-weight:600;font-size:15px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.item-desc{font-size:13px;color:${textSec};margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.item-meta{display:flex;gap:8px;margin-top:4px;flex-wrap:wrap}
.badge{font-size:11px;padding:2px 8px;border-radius:10px;display:inline-block}
.badge-featured{background:#fef3c7;color:#92400e}
.badge-popular{background:#fee2e2;color:#991b1b}
.badge-new{background:#d1fae5;color:#065f46}
.badge-spicy{background:#fecaca;color:#991b1b}
.badge-veg{background:#d1fae5;color:#065f46}
.badge-gf{background:#e0e7ff;color:#3730a3}
.price{font-weight:700;color:${brandColor};font-size:16px;margin-top:4px}
.compare{text-decoration:line-through;color:${textSec};font-size:13px;margin-right:4px}
.allergens{font-size:11px;color:${textSec};margin-top:2px}
.wifi{text-align:center;padding:16px;background:${cardBg};margin:16px;border-radius:12px;border:1px solid ${border}}
.wifi h3{font-size:14px;margin-bottom:4px}
.wifi code{font-size:18px;font-weight:700;color:${brandColor};background:${bg};padding:4px 12px;border-radius:6px}
.footer{text-align:center;padding:24px 16px;font-size:12px;color:${textSec};border-top:1px solid ${border}}
.footer a{color:${brandColor}}
</style></head><body>`;

  // Header
  html += `<div class="header">`;
  if (restaurant.logo_url) html += `<img src="${restaurant.logo_url}" alt="${restaurant.name}" style="height:48px;margin-bottom:8px;border-radius:8px">`;
  html += `<h1>${restaurant.name}</h1>`;
  if (restaurant.description) html += `<p>${restaurant.description}</p>`;
  if (tableNumber) html += `<div class="table-badge">Table ${tableNumber}</div>`;
  html += `</div>`;

  // Info bar
  html += `<div class="info-bar">`;
  if (restaurant.phone) html += `<a href="tel:${restaurant.phone}">${restaurant.phone}</a>`;
  if (restaurant.address) html += `<span>${restaurant.address}</span>`;
  if (restaurant.website) html += `<a href="${restaurant.website}" target="_blank">Website</a>`;
  html += `</div>`;

  // Menu tabs
  if (menus.length > 1) {
    html += `<div class="tabs">`;
    menus.forEach((menu, i) => {
      html += `<button class="tab${i === 0 ? ' active' : ''}" onclick="showMenu(${menu.id})">${menu.name}</button>`;
    });
    html += `</div>`;
  }

  // Categories and items
  menus.forEach((menu, mi) => {
    const menuCats = categories.filter(c => c.menu_id === menu.id);
    html += `<div class="menu-section" id="menu-${menu.id}" style="${mi > 0 ? 'display:none' : ''}">`;
    menuCats.forEach(cat => {
      const catItems = items.filter(i => i.category_id === cat.id && i.available);
      if (catItems.length === 0) return;
      html += `<div class="category"><h2>${cat.name}</h2>`;
      if (cat.description) html += `<div class="desc">${cat.description}</div>`;
      catItems.forEach(item => {
        const tags: string[] = JSON.parse(item.tags as string || '[]');
        const allergens: string[] = JSON.parse(item.allergens as string || '[]');
        const dietary: string[] = JSON.parse(item.dietary as string || '[]');
        const variants: { name: string; price: number }[] = JSON.parse(item.variants as string || '[]');
        html += `<div class="item">`;
        if (item.image_url) html += `<img src="${item.image_url}" alt="${item.name}" loading="lazy">`;
        html += `<div class="item-info"><div class="item-name">${item.name}`;
        if (item.featured) html += ` <span class="badge badge-featured">Featured</span>`;
        if (item.popular) html += ` <span class="badge badge-popular">Popular</span>`;
        if (item.new_item) html += ` <span class="badge badge-new">New</span>`;
        if ((item.spicy_level as number) > 0) html += ` <span class="badge badge-spicy">${'🌶️'.repeat(item.spicy_level as number)}</span>`;
        html += `</div>`;
        if (item.description) html += `<div class="item-desc">${item.description}</div>`;
        html += `<div class="item-meta">`;
        dietary.forEach(d => { html += `<span class="badge badge-${d === 'vegetarian' || d === 'vegan' ? 'veg' : d === 'gluten-free' ? 'gf' : 'veg'}">${d}</span>`; });
        html += `</div>`;
        if (item.calories || item.prep_time_min) {
          html += `<div style="font-size:11px;color:${textSec};margin-top:2px">`;
          if (item.calories) html += `${item.calories} cal`;
          if (item.calories && item.prep_time_min) html += ` · `;
          if (item.prep_time_min) html += `${item.prep_time_min} min`;
          html += `</div>`;
        }
        if (allergens.length) html += `<div class="allergens">Allergens: ${allergens.join(', ')}</div>`;
        html += `<div class="price">`;
        if (item.compare_price) html += `<span class="compare">$${(item.compare_price as number).toFixed(2)}</span>`;
        html += `$${(item.price as number).toFixed(2)}</div>`;
        if (variants.length) {
          html += `<div style="font-size:12px;color:${textSec};margin-top:2px">`;
          variants.forEach(v => { html += `<span style="margin-right:8px">${v.name}: $${v.price.toFixed(2)}</span>`; });
          html += `</div>`;
        }
        html += `</div></div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
  });

  // WiFi
  if (restaurant.wifi_name) {
    html += `<div class="wifi"><h3>Free WiFi</h3><div>Network: <code>${restaurant.wifi_name}</code></div>`;
    if (restaurant.wifi_password) html += `<div style="margin-top:4px">Password: <code>${restaurant.wifi_password}</code></div>`;
    html += `</div>`;
  }

  // Footer
  html += `<div class="footer"><p>Powered by <a href="https://echo-ept.com/qr-menu">Echo QR Menu</a></p></div>`;

  // Menu tab switching JS
  html += `<script>
function showMenu(id){
  document.querySelectorAll('.menu-section').forEach(s=>s.style.display='none');
  document.getElementById('menu-'+id).style.display='block';
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  event.target.classList.add('active');
}
</script></body></html>`;
  return html;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });

    const url = new URL(req.url);
    const p = url.pathname;
    const m = req.method;

    try {
      /* ══════════════════ PUBLIC ══════════════════ */

      if (p === '/health' || p === '/') return json({ status: 'ok', service: 'echo-qr-menu', version: '1.0.0', timestamp: new Date().toISOString() });

      /* ── QR Code scan → render menu ── */
      if (m === 'GET' && p.startsWith('/m/')) {
        const code = p.split('/')[2];
        if (!code) return json({ error: 'Invalid code' }, 400);
        if (await rateLimit(env.QM_CACHE, `scan:${req.headers.get('CF-Connecting-IP') || 'u'}`, 30, 60)) return json({ error: 'Rate limited' }, 429);

        const qr = await env.DB.prepare('SELECT * FROM qr_codes WHERE short_code = ? AND status = ?').bind(code, 'active').first();
        if (!qr) return new Response('Menu not found', { status: 404 });

        const restaurant = await env.DB.prepare('SELECT * FROM restaurants WHERE id = ? AND status = ?').bind(qr.restaurant_id, 'active').first();
        if (!restaurant) return new Response('Restaurant not found', { status: 404 });

        // Custom redirect URL
        if (qr.custom_url) {
          // Still record scan
          (async () => {
            await env.DB.prepare('INSERT INTO scans (qr_id, restaurant_id, ip_hash, user_agent, country, city, device, table_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(qr.id, qr.restaurant_id, req.headers.get('CF-Connecting-IP')?.slice(0, 8) || '', sanitize(req.headers.get('User-Agent'), 200), req.headers.get('CF-IPCountry') || '', req.headers.get('CF-IPCity') || '', /mobile/i.test(req.headers.get('User-Agent') || '') ? 'mobile' : 'desktop', qr.table_number).run();
            await env.DB.prepare('UPDATE qr_codes SET total_scans = total_scans + 1, last_scanned_at = datetime(\'now\') WHERE id = ?').bind(qr.id).run();
            await env.DB.prepare('UPDATE restaurants SET total_scans = total_scans + 1 WHERE id = ?').bind(qr.restaurant_id).run();
          })();
          return Response.redirect(qr.custom_url as string, 302);
        }

        // Load menu data
        let menus;
        if (qr.menu_id) {
          menus = await env.DB.prepare('SELECT * FROM menus WHERE id = ? AND status = ? ORDER BY sort_order').bind(qr.menu_id, 'active').all();
        } else {
          menus = await env.DB.prepare('SELECT * FROM menus WHERE restaurant_id = ? AND status = ? ORDER BY sort_order').bind(qr.restaurant_id, 'active').all();
        }
        const menuIds = menus.results.map((m: Record<string, unknown>) => m.id);
        let categories: Record<string, unknown>[] = [];
        let items: Record<string, unknown>[] = [];
        if (menuIds.length) {
          const placeholders = menuIds.map(() => '?').join(',');
          categories = (await env.DB.prepare(`SELECT * FROM categories WHERE menu_id IN (${placeholders}) AND status = ? ORDER BY sort_order`).bind(...menuIds, 'active').all()).results;
          items = (await env.DB.prepare(`SELECT * FROM items WHERE menu_id IN (${placeholders}) AND available = 1 ORDER BY sort_order`).bind(...menuIds).all()).results;
        }

        // Record scan async
        (async () => {
          await env.DB.prepare('INSERT INTO scans (qr_id, restaurant_id, ip_hash, user_agent, country, city, device, table_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(qr.id, qr.restaurant_id, req.headers.get('CF-Connecting-IP')?.slice(0, 8) || '', sanitize(req.headers.get('User-Agent'), 200), req.headers.get('CF-IPCountry') || '', req.headers.get('CF-IPCity') || '', /mobile/i.test(req.headers.get('User-Agent') || '') ? 'mobile' : 'desktop', qr.table_number).run();
          await env.DB.prepare('UPDATE qr_codes SET total_scans = total_scans + 1, last_scanned_at = datetime(\'now\') WHERE id = ?').bind(qr.id).run();
          await env.DB.prepare('UPDATE restaurants SET total_scans = total_scans + 1 WHERE id = ?').bind(qr.restaurant_id).run();
        })();

        const html = menuPage(restaurant, menus.results, categories, items, qr.table_number as string);
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
      }

      /* ── Public menu JSON API ── */
      if (m === 'GET' && p.startsWith('/menu/')) {
        const slug = p.split('/')[2];
        const restaurant = await env.DB.prepare('SELECT * FROM restaurants WHERE slug = ? AND status = ?').bind(slug, 'active').first();
        if (!restaurant) return json({ error: 'Not found' }, 404);
        const menus = await env.DB.prepare('SELECT * FROM menus WHERE restaurant_id = ? AND status = ? ORDER BY sort_order').bind(restaurant.id, 'active').all();
        const menuIds = menus.results.map((m: Record<string, unknown>) => m.id);
        let categories: Record<string, unknown>[] = [];
        let items: Record<string, unknown>[] = [];
        if (menuIds.length) {
          const ph = menuIds.map(() => '?').join(',');
          categories = (await env.DB.prepare(`SELECT * FROM categories WHERE menu_id IN (${ph}) AND status = ? ORDER BY sort_order`).bind(...menuIds, 'active').all()).results;
          items = (await env.DB.prepare(`SELECT * FROM items WHERE menu_id IN (${ph}) AND available = 1 ORDER BY sort_order`).bind(...menuIds).all()).results;
        }
        return json({ success: true, data: { restaurant, menus: menus.results, categories, items } });
      }

      /* ── Place order (public) ── */
      if (m === 'POST' && p === '/order') {
        if (await rateLimit(env.QM_CACHE, `order:${req.headers.get('CF-Connecting-IP') || 'u'}`, 5, 60)) return json({ error: 'Rate limited' }, 429);
        const b = await req.json() as Record<string, unknown>;
        const restaurantId = b.restaurant_id as number;
        if (!restaurantId) return json({ error: 'restaurant_id required' }, 400);
        const orderItems = b.items as { item_id: number; qty: number; notes?: string }[];
        if (!orderItems?.length) return json({ error: 'items required' }, 400);
        // Calculate totals
        const itemIds = orderItems.map(i => i.item_id);
        const ph = itemIds.map(() => '?').join(',');
        const dbItems = (await env.DB.prepare(`SELECT id, price, name FROM items WHERE id IN (${ph})`).bind(...itemIds).all()).results;
        const priceMap = new Map(dbItems.map((i: Record<string, unknown>) => [i.id as number, i.price as number]));
        let subtotal = 0;
        const enriched = orderItems.map(oi => {
          const price = priceMap.get(oi.item_id) || 0;
          const lineTotal = price * oi.qty;
          subtotal += lineTotal;
          return { ...oi, price, line_total: lineTotal, name: dbItems.find(d => d.id === oi.item_id)?.name };
        });
        const tax = Math.round(subtotal * 0.0825 * 100) / 100; // 8.25% Texas tax
        const tip = b.tip as number || 0;
        const total = Math.round((subtotal + tax + tip) * 100) / 100;
        const r = await env.DB.prepare('INSERT INTO orders (restaurant_id, table_number, qr_id, customer_name, customer_phone, items, subtotal, tax, tip, total, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(restaurantId, sanitize(b.table_number as string, 10), b.qr_id || null, sanitize(b.customer_name as string, 100), sanitize(b.customer_phone as string, 20), JSON.stringify(enriched), subtotal, tax, tip, total, sanitize(b.notes as string, 500), 'pending').run();
        // Update item order counts
        for (const oi of orderItems) {
          await env.DB.prepare('UPDATE items SET total_orders = total_orders + ? WHERE id = ?').bind(oi.qty, oi.item_id).run();
        }
        await env.DB.prepare('UPDATE restaurants SET total_orders = total_orders + 1 WHERE id = ?').bind(restaurantId).run();
        return json({ success: true, order_id: r.meta.last_row_id, subtotal, tax, tip, total }, 201);
      }

      /* ── Submit review (public) ── */
      if (m === 'POST' && p === '/review') {
        if (await rateLimit(env.QM_CACHE, `review:${req.headers.get('CF-Connecting-IP') || 'u'}`, 3, 300)) return json({ error: 'Rate limited' }, 429);
        const b = await req.json() as Record<string, unknown>;
        const restaurantId = b.restaurant_id as number;
        const rating = b.rating as number;
        if (!restaurantId || !rating || rating < 1 || rating > 5) return json({ error: 'restaurant_id and rating (1-5) required' }, 400);
        await env.DB.prepare('INSERT INTO reviews (restaurant_id, item_id, customer_name, rating, comment, status) VALUES (?, ?, ?, ?, ?, ?)').bind(restaurantId, b.item_id || null, sanitize(b.customer_name as string, 100), rating, sanitize(b.comment as string, 1000), 'pending').run();
        // Update item avg_rating if item review
        if (b.item_id) {
          await env.DB.prepare('UPDATE items SET review_count = review_count + 1, avg_rating = (SELECT AVG(rating) FROM reviews WHERE item_id = ? AND status = ?) WHERE id = ?').bind(b.item_id, 'approved', b.item_id).run();
        }
        return json({ success: true }, 201);
      }

      /* ── QR Code SVG (public) ── */
      if (m === 'GET' && p.startsWith('/qr/')) {
        const code = p.split('/')[2];
        const size = parseInt(url.searchParams.get('size') || '200');
        const fg = url.searchParams.get('fg') || '#000000';
        const bg = url.searchParams.get('bg') || '#ffffff';
        const menuUrl = `https://echo-qr-menu.bmcii1976.workers.dev/m/${code}`;
        const svg = qrSvg(menuUrl, Math.min(size, 500), fg, bg);
        return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' } });
      }

      /* ══════════════════ AUTH REQUIRED ══════════════════ */
      if (!authOk(req, env)) return json({ error: 'Unauthorized' }, 401);

      /* ── Restaurants CRUD ── */
      if (m === 'GET' && p === '/restaurants') {
        const tenant = url.searchParams.get('tenant_id') || 'default';
        const rows = await env.DB.prepare('SELECT * FROM restaurants WHERE tenant_id = ? ORDER BY created_at DESC').bind(tenant).all();
        return json({ success: true, data: rows.results });
      }

      if (m === 'GET' && p.match(/^\/restaurants\/\d+$/)) {
        const id = parseInt(p.split('/')[2]);
        const r = await env.DB.prepare('SELECT * FROM restaurants WHERE id = ?').bind(id).first();
        if (!r) return json({ error: 'Not found' }, 404);
        return json({ success: true, data: r });
      }

      if (m === 'POST' && p === '/restaurants') {
        const b = await req.json() as Record<string, unknown>;
        const name = sanitize(b.name as string, 100);
        if (!name) return json({ error: 'name required' }, 400);
        const s = slugify(name);
        const r = await env.DB.prepare('INSERT INTO restaurants (tenant_id, name, slug, description, logo_url, cover_url, phone, email, website, address, city, state, zip, timezone, currency, brand_color, brand_font, theme, languages, default_language, social, hours, wifi_name, wifi_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(b.tenant_id || 'default', name, s, sanitize(b.description as string, 500), sanitize(b.logo_url as string, 500), sanitize(b.cover_url as string, 500), sanitize(b.phone as string, 20), sanitize(b.email as string, 200), sanitize(b.website as string, 500), sanitize(b.address as string, 200), sanitize(b.city as string, 50), sanitize(b.state as string, 5), sanitize(b.zip as string, 10), sanitize(b.timezone as string, 50) || 'America/Chicago', sanitize(b.currency as string, 5) || 'USD', sanitize(b.brand_color as string, 10) || '#0d7377', sanitize(b.brand_font as string, 50) || 'Inter', sanitize(b.theme as string, 10) || 'light', JSON.stringify(b.languages || ['en']), sanitize(b.default_language as string, 5) || 'en', JSON.stringify(b.social || {}), JSON.stringify(b.hours || {}), sanitize(b.wifi_name as string, 50), sanitize(b.wifi_password as string, 50)).run();
        return json({ success: true, id: r.meta.last_row_id, slug: s }, 201);
      }

      if (m === 'PATCH' && p.match(/^\/restaurants\/\d+$/)) {
        const id = parseInt(p.split('/')[2]);
        const b = await req.json() as Record<string, unknown>;
        const sets: string[] = []; const vals: unknown[] = [];
        const fields = ['name', 'description', 'logo_url', 'cover_url', 'phone', 'email', 'website', 'address', 'city', 'state', 'zip', 'timezone', 'currency', 'brand_color', 'brand_font', 'theme', 'default_language', 'wifi_name', 'wifi_password', 'status'];
        fields.forEach(f => { if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(sanitize(b[f] as string, f === 'description' ? 500 : 200)); } });
        if (b.languages !== undefined) { sets.push('languages = ?'); vals.push(JSON.stringify(b.languages)); }
        if (b.social !== undefined) { sets.push('social = ?'); vals.push(JSON.stringify(b.social)); }
        if (b.hours !== undefined) { sets.push('hours = ?'); vals.push(JSON.stringify(b.hours)); }
        if (sets.length === 0) return json({ error: 'Nothing to update' }, 400);
        sets.push("updated_at = datetime('now')");
        vals.push(id);
        await env.DB.prepare(`UPDATE restaurants SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
        return json({ success: true });
      }

      /* ── Menus CRUD ── */
      if (m === 'GET' && p.match(/^\/restaurants\/\d+\/menus$/)) {
        const rid = parseInt(p.split('/')[2]);
        const rows = await env.DB.prepare('SELECT * FROM menus WHERE restaurant_id = ? ORDER BY sort_order').bind(rid).all();
        return json({ success: true, data: rows.results });
      }

      if (m === 'POST' && p.match(/^\/restaurants\/\d+\/menus$/)) {
        const rid = parseInt(p.split('/')[2]);
        const b = await req.json() as Record<string, unknown>;
        const name = sanitize(b.name as string, 100);
        if (!name) return json({ error: 'name required' }, 400);
        const s = slugify(name);
        const r = await env.DB.prepare('INSERT INTO menus (restaurant_id, name, slug, description, type, available_from, available_until, available_days, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(rid, name, s, sanitize(b.description as string, 500), sanitize(b.type as string, 20) || 'main', b.available_from || null, b.available_until || null, JSON.stringify(b.available_days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), b.sort_order || 0).run();
        await env.DB.prepare('UPDATE restaurants SET total_menus = total_menus + 1 WHERE id = ?').bind(rid).run();
        return json({ success: true, id: r.meta.last_row_id }, 201);
      }

      /* ── Categories CRUD ── */
      if (m === 'GET' && p.match(/^\/menus\/\d+\/categories$/)) {
        const mid = parseInt(p.split('/')[2]);
        const rows = await env.DB.prepare('SELECT * FROM categories WHERE menu_id = ? ORDER BY sort_order').bind(mid).all();
        return json({ success: true, data: rows.results });
      }

      if (m === 'POST' && p.match(/^\/menus\/\d+\/categories$/)) {
        const mid = parseInt(p.split('/')[2]);
        const b = await req.json() as Record<string, unknown>;
        const name = sanitize(b.name as string, 100);
        if (!name) return json({ error: 'name required' }, 400);
        const r = await env.DB.prepare('INSERT INTO categories (menu_id, name, description, image_url, sort_order) VALUES (?, ?, ?, ?, ?)').bind(mid, name, sanitize(b.description as string, 500), sanitize(b.image_url as string, 500), b.sort_order || 0).run();
        await env.DB.prepare('UPDATE menus SET total_categories = total_categories + 1 WHERE id = ?').bind(mid).run();
        return json({ success: true, id: r.meta.last_row_id }, 201);
      }

      /* ── Items CRUD ── */
      if (m === 'GET' && p.match(/^\/categories\/\d+\/items$/)) {
        const cid = parseInt(p.split('/')[2]);
        const rows = await env.DB.prepare('SELECT * FROM items WHERE category_id = ? ORDER BY sort_order').bind(cid).all();
        return json({ success: true, data: rows.results });
      }

      if (m === 'POST' && p === '/items') {
        const b = await req.json() as Record<string, unknown>;
        const name = sanitize(b.name as string, 100);
        const categoryId = b.category_id as number;
        const menuId = b.menu_id as number;
        const restaurantId = b.restaurant_id as number;
        if (!name || !categoryId || !menuId || !restaurantId) return json({ error: 'name, category_id, menu_id, restaurant_id required' }, 400);
        const r = await env.DB.prepare('INSERT INTO items (category_id, menu_id, restaurant_id, name, description, price, compare_price, image_url, calories, prep_time_min, spicy_level, tags, allergens, dietary, modifiers, variants, translations, featured, popular, new_item, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(categoryId, menuId, restaurantId, name, sanitize(b.description as string, 500), b.price || 0, b.compare_price || null, sanitize(b.image_url as string, 500), b.calories || null, b.prep_time_min || null, b.spicy_level || 0, JSON.stringify(b.tags || []), JSON.stringify(b.allergens || []), JSON.stringify(b.dietary || []), JSON.stringify(b.modifiers || []), JSON.stringify(b.variants || []), JSON.stringify(b.translations || {}), b.featured ? 1 : 0, b.popular ? 1 : 0, b.new_item ? 1 : 0, b.sort_order || 0).run();
        await env.DB.prepare('UPDATE categories SET total_items = total_items + 1 WHERE id = ?').bind(categoryId).run();
        await env.DB.prepare('UPDATE menus SET total_items = total_items + 1 WHERE id = ?').bind(menuId).run();
        await env.DB.prepare('UPDATE restaurants SET total_items = total_items + 1 WHERE id = ?').bind(restaurantId).run();
        return json({ success: true, id: r.meta.last_row_id }, 201);
      }

      if (m === 'PATCH' && p.match(/^\/items\/\d+$/)) {
        const id = parseInt(p.split('/')[2]);
        const b = await req.json() as Record<string, unknown>;
        const sets: string[] = []; const vals: unknown[] = [];
        const fields = ['name', 'description', 'image_url'];
        fields.forEach(f => { if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(sanitize(b[f] as string, 500)); } });
        const nums = ['price', 'compare_price', 'calories', 'prep_time_min', 'spicy_level', 'featured', 'popular', 'new_item', 'available', 'sort_order'];
        nums.forEach(f => { if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(b[f]); } });
        const jsons = ['tags', 'allergens', 'dietary', 'modifiers', 'variants', 'translations'];
        jsons.forEach(f => { if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(JSON.stringify(b[f])); } });
        if (sets.length === 0) return json({ error: 'Nothing to update' }, 400);
        sets.push("updated_at = datetime('now')");
        vals.push(id);
        await env.DB.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
        return json({ success: true });
      }

      if (m === 'DELETE' && p.match(/^\/items\/\d+$/)) {
        const id = parseInt(p.split('/')[2]);
        const item = await env.DB.prepare('SELECT category_id, menu_id, restaurant_id FROM items WHERE id = ?').bind(id).first();
        if (item) {
          await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
          await env.DB.prepare('UPDATE categories SET total_items = MAX(0, total_items - 1) WHERE id = ?').bind(item.category_id).run();
          await env.DB.prepare('UPDATE menus SET total_items = MAX(0, total_items - 1) WHERE id = ?').bind(item.menu_id).run();
          await env.DB.prepare('UPDATE restaurants SET total_items = MAX(0, total_items - 1) WHERE id = ?').bind(item.restaurant_id).run();
        }
        return json({ success: true });
      }

      /* ── QR Codes ── */
      if (m === 'GET' && p.match(/^\/restaurants\/\d+\/qr-codes$/)) {
        const rid = parseInt(p.split('/')[2]);
        const rows = await env.DB.prepare('SELECT * FROM qr_codes WHERE restaurant_id = ? ORDER BY created_at DESC').bind(rid).all();
        return json({ success: true, data: rows.results });
      }

      if (m === 'POST' && p === '/qr-codes') {
        const b = await req.json() as Record<string, unknown>;
        const restaurantId = b.restaurant_id as number;
        if (!restaurantId) return json({ error: 'restaurant_id required' }, 400);
        const code = shortCode();
        const r = await env.DB.prepare('INSERT INTO qr_codes (restaurant_id, menu_id, label, table_number, location, short_code, custom_url, style) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(restaurantId, b.menu_id || null, sanitize(b.label as string, 100) || `QR-${code}`, sanitize(b.table_number as string, 10), sanitize(b.location as string, 100), code, sanitize(b.custom_url as string, 500) || null, JSON.stringify(b.style || {})).run();
        return json({ success: true, id: r.meta.last_row_id, short_code: code, url: `https://echo-qr-menu.bmcii1976.workers.dev/m/${code}`, qr_svg: `https://echo-qr-menu.bmcii1976.workers.dev/qr/${code}` }, 201);
      }

      if (m === 'POST' && p === '/qr-codes/bulk') {
        const b = await req.json() as Record<string, unknown>;
        const restaurantId = b.restaurant_id as number;
        const count = Math.min(b.count as number || 10, 100);
        const prefix = sanitize(b.prefix as string, 20) || 'Table';
        if (!restaurantId) return json({ error: 'restaurant_id required' }, 400);
        const codes: { table: string; code: string; url: string }[] = [];
        for (let i = 1; i <= count; i++) {
          const code = shortCode();
          const table = `${i}`;
          await env.DB.prepare('INSERT INTO qr_codes (restaurant_id, menu_id, label, table_number, short_code, style) VALUES (?, ?, ?, ?, ?, ?)').bind(restaurantId, b.menu_id || null, `${prefix} ${i}`, table, code, '{}').run();
          codes.push({ table, code, url: `https://echo-qr-menu.bmcii1976.workers.dev/m/${code}` });
        }
        return json({ success: true, codes, count: codes.length }, 201);
      }

      /* ── Orders management ── */
      if (m === 'GET' && p.match(/^\/restaurants\/\d+\/orders$/)) {
        const rid = parseInt(p.split('/')[2]);
        const status = url.searchParams.get('status');
        let q = 'SELECT * FROM orders WHERE restaurant_id = ?';
        const binds: unknown[] = [rid];
        if (status) { q += ' AND status = ?'; binds.push(status); }
        q += ' ORDER BY created_at DESC LIMIT 100';
        const rows = await env.DB.prepare(q).bind(...binds).all();
        return json({ success: true, data: rows.results });
      }

      if (m === 'PATCH' && p.match(/^\/orders\/\d+$/)) {
        const id = parseInt(p.split('/')[2]);
        const b = await req.json() as Record<string, unknown>;
        if (b.status) {
          await env.DB.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(sanitize(b.status as string, 20), id).run();
        }
        return json({ success: true });
      }

      /* ── Reviews management ── */
      if (m === 'GET' && p.match(/^\/restaurants\/\d+\/reviews$/)) {
        const rid = parseInt(p.split('/')[2]);
        const rows = await env.DB.prepare('SELECT * FROM reviews WHERE restaurant_id = ? ORDER BY created_at DESC').bind(rid).all();
        return json({ success: true, data: rows.results });
      }

      if (m === 'PATCH' && p.match(/^\/reviews\/\d+$/)) {
        const id = parseInt(p.split('/')[2]);
        const b = await req.json() as Record<string, unknown>;
        if (b.status) await env.DB.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind(sanitize(b.status as string, 20), id).run();
        return json({ success: true });
      }

      /* ── Scan analytics ── */
      if (m === 'GET' && p.match(/^\/restaurants\/\d+\/analytics$/)) {
        const rid = parseInt(p.split('/')[2]);
        const cached = await env.QM_CACHE.get(`analytics:${rid}`, 'json');
        if (cached) return json({ success: true, data: cached, cached: true });
        const r = await env.DB.prepare('SELECT * FROM restaurants WHERE id = ?').bind(rid).first();
        const scansToday = await env.DB.prepare('SELECT COUNT(*) as c FROM scans WHERE restaurant_id = ? AND DATE(created_at) = DATE(\'now\')').bind(rid).first();
        const ordersToday = await env.DB.prepare('SELECT COUNT(*) as c, SUM(total) as rev FROM orders WHERE restaurant_id = ? AND DATE(created_at) = DATE(\'now\')').bind(rid).first();
        const topItems = await env.DB.prepare('SELECT name, total_orders, price FROM items WHERE restaurant_id = ? ORDER BY total_orders DESC LIMIT 10').bind(rid).all();
        const scansByDevice = await env.DB.prepare("SELECT device, COUNT(*) as c FROM scans WHERE restaurant_id = ? GROUP BY device").bind(rid).all();
        const scansByCountry = await env.DB.prepare("SELECT country, COUNT(*) as c FROM scans WHERE restaurant_id = ? AND country != '' GROUP BY country ORDER BY c DESC LIMIT 10").bind(rid).all();
        const avgRating = await env.DB.prepare("SELECT AVG(rating) as avg, COUNT(*) as c FROM reviews WHERE restaurant_id = ? AND status = 'approved'").bind(rid).first();
        const data = {
          total_scans: r?.total_scans || 0,
          total_orders: r?.total_orders || 0,
          total_items: r?.total_items || 0,
          scans_today: scansToday?.c || 0,
          orders_today: ordersToday?.c || 0,
          revenue_today: ordersToday?.rev || 0,
          top_items: topItems.results,
          scans_by_device: scansByDevice.results,
          scans_by_country: scansByCountry.results,
          avg_rating: avgRating?.avg || 0,
          total_reviews: avgRating?.c || 0,
        };
        await env.QM_CACHE.put(`analytics:${rid}`, JSON.stringify(data), { expirationTtl: 300 });
        return json({ success: true, data });
      }

      if (m === 'GET' && p.match(/^\/restaurants\/\d+\/analytics\/trends$/)) {
        const rid = parseInt(p.split('/')[2]);
        const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 90);
        const rows = await env.DB.prepare('SELECT * FROM analytics_daily WHERE restaurant_id = ? ORDER BY date DESC LIMIT ?').bind(rid, days).all();
        return json({ success: true, data: rows.results });
      }

      /* ── AI endpoints ── */
      if (m === 'POST' && p === '/ai/suggest-menu') {
        const b = await req.json() as Record<string, unknown>;
        const cuisine = sanitize(b.cuisine as string, 50) || 'American';
        const style = sanitize(b.style as string, 50) || 'casual';
        const prompt = `Generate a restaurant menu for a ${style} ${cuisine} restaurant. Include 4-5 categories with 5-7 items each. For each item include: name, description (1 sentence), price (USD), calories estimate, prep time minutes, dietary tags (vegetarian/vegan/gluten-free), allergens, and spicy level (0-3). Format as JSON array of categories with nested items.`;
        try {
          const aiRes = await env.ENGINE_RUNTIME.fetch(new Request('https://engine/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine_id: 'GEN-01', query: prompt, max_tokens: 1000 }) }));
          const aiData = await aiRes.json() as Record<string, unknown>;
          return json({ success: true, suggestion: aiData });
        } catch { return json({ success: true, suggestion: { error: 'Engine unavailable' } }); }
      }

      if (m === 'POST' && p === '/ai/improve-description') {
        const b = await req.json() as Record<string, unknown>;
        const itemName = sanitize(b.name as string, 100);
        const current = sanitize(b.description as string, 500);
        const prompt = `Improve this restaurant menu item description to be more appetizing and sell better. Keep it to 1-2 sentences max.\n\nItem: ${itemName}\nCurrent: ${current || 'No description'}\n\nProvide 3 alternative descriptions.`;
        try {
          const aiRes = await env.ENGINE_RUNTIME.fetch(new Request('https://engine/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine_id: 'GEN-01', query: prompt, max_tokens: 300 }) }));
          const aiData = await aiRes.json() as Record<string, unknown>;
          return json({ success: true, suggestions: aiData });
        } catch { return json({ success: true, suggestions: { error: 'Engine unavailable' } }); }
      }

      /* ── Export ── */
      if (m === 'GET' && p.match(/^\/restaurants\/\d+\/export$/)) {
        const rid = parseInt(p.split('/')[2]);
        const format = url.searchParams.get('format') || 'json';
        const items = await env.DB.prepare('SELECT i.*, c.name as category_name, m.name as menu_name FROM items i JOIN categories c ON i.category_id = c.id JOIN menus m ON i.menu_id = m.id WHERE i.restaurant_id = ? ORDER BY m.sort_order, c.sort_order, i.sort_order').bind(rid).all();
        if (format === 'csv') {
          const headers = ['menu_name', 'category_name', 'name', 'description', 'price', 'calories', 'spicy_level', 'available'];
          const csv = [headers.join(','), ...items.results.map((r: Record<string, unknown>) => headers.map(h => `"${r[h] ?? ''}"`).join(','))].join('\n');
          return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=menu.csv', 'Access-Control-Allow-Origin': '*' } });
        }
        return json({ success: true, data: items.results, total: items.results.length });
      }

      /* ── Activity log ── */
      if (m === 'GET' && p === '/activity') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
        const rows = await env.DB.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').bind(limit).all();
        return json({ success: true, data: rows.results });
      }

      return json({ error: 'Not found', endpoints: ['/health', '/m/:code', '/menu/:slug', '/restaurants', '/menus', '/categories', '/items', '/qr-codes', '/orders', '/reviews', '/analytics', '/ai'] }, 404);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Internal error';
      if (msg.includes('JSON')) {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      console.error(`[echo-qr-menu] ${msg}`);
      return json({ error: 'Internal server error' }, 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const restaurants = await env.DB.prepare('SELECT id FROM restaurants WHERE status = ?').bind('active').all();
    for (const r of restaurants.results) {
      const rid = r.id as number;
      const scans = await env.DB.prepare('SELECT COUNT(*) as c, COUNT(DISTINCT ip_hash) as u FROM scans WHERE restaurant_id = ? AND DATE(created_at) = ?').bind(rid, today).first();
      const orders = await env.DB.prepare('SELECT COUNT(*) as c, SUM(total) as rev FROM orders WHERE restaurant_id = ? AND DATE(created_at) = ?').bind(rid, today).first();
      const topItems = await env.DB.prepare("SELECT name FROM items WHERE restaurant_id = ? ORDER BY total_orders DESC LIMIT 5").bind(rid).all();
      const peak = await env.DB.prepare("SELECT CAST(strftime('%H', created_at) AS INTEGER) as h, COUNT(*) as c FROM scans WHERE restaurant_id = ? AND DATE(created_at) = ? GROUP BY h ORDER BY c DESC LIMIT 1").bind(rid, today).first();
      await env.DB.prepare(`INSERT INTO analytics_daily (restaurant_id, date, total_scans, unique_visitors, total_orders, total_revenue, popular_items, peak_hour) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(restaurant_id, date) DO UPDATE SET total_scans=excluded.total_scans, unique_visitors=excluded.unique_visitors, total_orders=excluded.total_orders, total_revenue=excluded.total_revenue, popular_items=excluded.popular_items, peak_hour=excluded.peak_hour`).bind(rid, today, scans?.c || 0, scans?.u || 0, orders?.c || 0, orders?.rev || 0, JSON.stringify(topItems.results.map((i: Record<string, unknown>) => i.name)), peak?.h || null).run();
    }
  }
};
