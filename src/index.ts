const COOKIE = "rr_session",
  enc = new TextEncoder();
type Json = Record<string, unknown>;
const reply = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
const b64 = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
async function digest(v: string) {
  return crypto.subtle.digest("SHA-256", enc.encode(v));
}
async function equal(a: string, b: string) {
  const [x, y] = await Promise.all([digest(a), digest(b)]),
    l = new Uint8Array(x),
    r = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < l.length; i++) d |= l[i] ^ r[i];
  return d === 0;
}
async function sign(v: string, s: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(s),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64(await crypto.subtle.sign("HMAC", k, enc.encode(v)));
}
function cookie(r: Request) {
  return r.headers.get("Cookie")?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1] ?? null;
}
async function authed(r: Request, e: Env) {
  const t = cookie(r);
  if (!t) return false;
  const [x, s] = decodeURIComponent(t).split(".");
  return !!x && !!s && Number(x) > Date.now() && (await equal(s, await sign(x, e.SESSION_SECRET)));
}
function originOk(r: Request) {
  return ["GET", "HEAD"].includes(r.method) || r.headers.get("Origin") === new URL(r.url).origin;
}
async function jsonBody(r: Request): Promise<Json> {
  if (!r.headers.get("Content-Type")?.includes("application/json"))
    throw new Error("INVALID_CONTENT_TYPE");
  return r.json<Json>();
}
const clean = (v: unknown, n = 500) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const uint = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};
async function api(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (!originOk(req)) return reply({ error: "無效的請求來源" }, 403);
  if (url.pathname === "/api/login" && req.method === "POST") {
    const p = clean((await jsonBody(req)).password, 200);
    if (!p || !(await equal(p, env.ADMIN_PASSWORD))) return reply({ error: "密碼不正確" }, 401);
    const x = String(Date.now() + 28800000),
      t = `${x}.${await sign(x, env.SESSION_SECRET)}`;
    return reply({ ok: true }, 200, {
      "Set-Cookie": `${COOKIE}=${encodeURIComponent(t)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,
    });
  }
  if (url.pathname === "/api/logout" && req.method === "POST")
    return reply({ ok: true }, 200, {
      "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    });
  if (!(await authed(req, env))) return reply({ error: "請先登入" }, 401);
  if (url.pathname === "/api/session") return reply({ authenticated: true });
  const image = url.pathname.match(/^\/api\/receipts\/(\d+)$/);
  if (image && req.method === "GET") {
    const row = await env.DB.prepare("SELECT attachment_key FROM expenses WHERE id=?")
      .bind(Number(image[1]))
      .first<{ attachment_key: string | null }>();
    if (!row?.attachment_key) return reply({ error: "找不到圖片" }, 404);
    const o = await env.RECEIPTS.getWithMetadata(row.attachment_key, { type: "stream" });
    if (!o.value) return reply({ error: "找不到圖片" }, 404);
    const h = new Headers({
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    const mime = (o.metadata as { contentType?: string } | null)?.contentType;
    if (mime) h.set("Content-Type", mime);
    return new Response(o.value, { headers: h });
  }
  if (url.pathname === "/api/dashboard" && req.method === "GET") {
    const raw = url.searchParams.get("month") ?? "",
      m = /^\d{4}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 7);
    const [e, people, s, rp, rl] = await env.DB.batch([
      env.DB.prepare(
        "SELECT e.*,m.name member_name FROM expenses e LEFT JOIN members m ON m.id=e.member_id WHERE substr(e.expense_date,1,7)=? ORDER BY e.expense_date DESC,e.id DESC",
      ).bind(m),
      env.DB.prepare("SELECT * FROM members ORDER BY travel_date DESC, name COLLATE NOCASE"),
      env.DB.prepare(
        "SELECT COUNT(*) count,COALESCE(SUM(amount_cents),0) total_cents FROM expenses WHERE substr(expense_date,1,7)=?",
      ).bind(m),
      env.DB.prepare("SELECT * FROM roster_people ORDER BY name COLLATE NOCASE"),
      env.DB.prepare("SELECT * FROM roster_places ORDER BY name COLLATE NOCASE"),
    ]);
    return reply({
      expenses: e.results,
      members: people.results,
      summary: s.results[0],
      people: rp.results,
      places: rl.results,
    });
  }
  if (url.pathname === "/api/expenses" && req.method === "POST") {
    const f = await req.formData(),
      date = clean(f.get("expense_date"), 10),
      cat = clean(f.get("category"), 50),
      desc = clean(f.get("description"), 200),
      amount = uint(f.get("amount_cents")),
      member = f.get("member_id") ? uint(f.get("member_id")) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !cat || !desc || amount === null)
      return reply({ error: "請完整填寫日期、分類、項目與金額" }, 400);
    const file = f.get("attachment"),
      allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    let key: string | null = null,
      name: string | null = null,
      mime: string | null = null;
    if (file instanceof File && file.size) {
      if (file.size > 8388608) return reply({ error: "圖片不可超過 8MB" }, 400);
      if (!allowed.has(file.type))
        return reply({ error: "只接受 JPG、PNG、WebP 或 GIF 圖片" }, 400);
      key = `receipts/${crypto.randomUUID()}`;
      name = file.name.slice(0, 200);
      mime = file.type;
      await env.RECEIPTS.put(key, await file.arrayBuffer(), { metadata: { contentType: mime } });
    }
    try {
      const r = await env.DB.prepare(
        "INSERT INTO expenses(expense_date,category,description,amount_cents,member_id,payment_method,receipt_number,note,attachment_key,attachment_name,attachment_type,location,location_address) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          date,
          cat,
          desc,
          amount,
          member,
          clean(f.get("payment_method"), 30) || "現金",
          clean(f.get("receipt_number"), 80),
          clean(f.get("note")),
          key,
          name,
          mime,
          clean(f.get("location"), 120),
          clean(f.get("location_address"), 200),
        )
        .run();
      return reply({ id: r.meta.last_row_id }, 201);
    } catch (e) {
      if (key) await env.RECEIPTS.delete(key);
      throw e;
    }
  }
  const expense = url.pathname.match(/^\/api\/expenses\/(\d+)$/);
  if (expense && req.method === "DELETE") {
    const row = await env.DB.prepare("SELECT attachment_key FROM expenses WHERE id=?")
      .bind(Number(expense[1]))
      .first<{ attachment_key: string | null }>();
    await env.DB.prepare("DELETE FROM expenses WHERE id=?").bind(Number(expense[1])).run();
    if (row?.attachment_key) await env.RECEIPTS.delete(row.attachment_key);
    return reply({ ok: true });
  }
  if (expense && req.method === "PUT") {
    const id = Number(expense[1]),
      f = await req.formData(),
      date = clean(f.get("expense_date"), 10),
      cat = clean(f.get("category"), 50),
      desc = clean(f.get("description"), 200),
      amount = uint(f.get("amount_cents")),
      member = f.get("member_id") ? uint(f.get("member_id")) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !cat || !desc || amount === null)
      return reply({ error: "請完整填寫日期、分類、項目與金額" }, 400);
    const file = f.get("attachment"),
      allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    let newKey: string | null = null;
    if (file instanceof File && file.size) {
      if (file.size > 8388608) return reply({ error: "圖片不可超過 8MB" }, 400);
      if (!allowed.has(file.type))
        return reply({ error: "只接受 JPG、PNG、WebP 或 GIF 圖片" }, 400);
      newKey = `receipts/${crypto.randomUUID()}`;
      await env.RECEIPTS.put(newKey, await file.arrayBuffer(), {
        metadata: { contentType: file.type },
      });
    }
    const base =
      "UPDATE expenses SET expense_date=?,category=?,description=?,amount_cents=?,member_id=?,payment_method=?,receipt_number=?,note=?,location=?,location_address=?";
    const args = [
      date,
      cat,
      desc,
      amount,
      member,
      clean(f.get("payment_method"), 30) || "現金",
      clean(f.get("receipt_number"), 80),
      clean(f.get("note")),
      clean(f.get("location"), 120),
      clean(f.get("location_address"), 200),
    ];
    try {
      if (newKey) {
        const old = await env.DB.prepare("SELECT attachment_key FROM expenses WHERE id=?")
          .bind(id)
          .first<{ attachment_key: string | null }>();
        await env.DB.prepare(
          `${base},attachment_key=?,attachment_name=?,attachment_type=? WHERE id=?`,
        )
          .bind(...args, newKey, (file as File).name.slice(0, 200), (file as File).type, id)
          .run();
        if (old?.attachment_key) await env.RECEIPTS.delete(old.attachment_key);
      } else {
        await env.DB.prepare(`${base} WHERE id=?`)
          .bind(...args, id)
          .run();
      }
      return reply({ ok: true });
    } catch (e) {
      if (newKey) await env.RECEIPTS.delete(newKey);
      throw e;
    }
  }
  if (url.pathname === "/api/members" && req.method === "POST") {
    const d = await jsonBody(req),
      name = clean(d.name, 80),
      date = clean(d.travel_date, 10),
      mode = clean(d.transport_mode, 80),
      fare = uint(d.fare_cents);
    if (!name || !mode || fare === null || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return reply({ error: "請填寫委員姓名、日期、交通方式與交通費" }, 400);
    const r = await env.DB.prepare(
      "INSERT INTO members(name,travel_date,transport_mode,route,fare_cents,note,location,location_address) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(
        name,
        date,
        mode,
        clean(d.route, 160),
        fare,
        clean(d.note),
        clean(d.location, 120),
        clean(d.location_address, 200),
      )
      .run();
    return reply({ id: r.meta.last_row_id }, 201);
  }
  const member = url.pathname.match(/^\/api\/members\/(\d+)$/);
  if (member && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM members WHERE id=?").bind(Number(member[1])).run();
    return reply({ ok: true });
  }
  if (member && req.method === "PUT") {
    const d = await jsonBody(req),
      name = clean(d.name, 80),
      date = clean(d.travel_date, 10),
      mode = clean(d.transport_mode, 80),
      fare = uint(d.fare_cents);
    if (!name || !mode || fare === null || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return reply({ error: "請填寫委員姓名、日期、交通方式與交通費" }, 400);
    await env.DB.prepare(
      "UPDATE members SET name=?,travel_date=?,transport_mode=?,route=?,fare_cents=?,note=?,location=?,location_address=? WHERE id=?",
    )
      .bind(
        name,
        date,
        mode,
        clean(d.route, 160),
        fare,
        clean(d.note),
        clean(d.location, 120),
        clean(d.location_address, 200),
        Number(member[1]),
      )
      .run();
    return reply({ ok: true });
  }
  if (url.pathname === "/api/roster/people" && req.method === "POST") {
    const name = clean((await jsonBody(req)).name, 80);
    if (!name) return reply({ error: "請輸入委員姓名" }, 400);
    const r = await env.DB.prepare("INSERT INTO roster_people(name) VALUES(?)").bind(name).run();
    return reply({ id: r.meta.last_row_id }, 201);
  }
  const rp = url.pathname.match(/^\/api\/roster\/people\/(\d+)$/);
  if (rp && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM roster_people WHERE id=?").bind(Number(rp[1])).run();
    return reply({ ok: true });
  }
  if (url.pathname === "/api/roster/places" && req.method === "POST") {
    const d = await jsonBody(req),
      name = clean(d.name, 120);
    if (!name) return reply({ error: "請輸入單位名稱" }, 400);
    const r = await env.DB.prepare("INSERT INTO roster_places(name,address) VALUES(?,?)")
      .bind(name, clean(d.address, 200))
      .run();
    return reply({ id: r.meta.last_row_id }, 201);
  }
  const rl = url.pathname.match(/^\/api\/roster\/places\/(\d+)$/);
  if (rl && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM roster_places WHERE id=?").bind(Number(rl[1])).run();
    return reply({ ok: true });
  }
  return reply({ error: "找不到此功能" }, 404);
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return new URL(req.url).pathname.startsWith("/api/")
        ? await api(req, env)
        : env.ASSETS.fetch(req);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "request failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return reply({ error: "系統暫時無法處理，請稍後再試" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
