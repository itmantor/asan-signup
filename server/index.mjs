/**
 * Asan signup server — serves the site (public/) and a small JSON API.
 * No dependencies beyond Node.js 20.12+.
 *
 *   POST /api/otp/send      { mobile }            → { ttl, resendIn }
 *   POST /api/otp/verify    { mobile, code }      → { user }         (sets login cookie)
 *   GET  /api/me                                  → { user, wallet }
 *   POST /api/profile       { firstName, lastName } → { user }
 *   POST /api/invoices      { amount }            → { invoice }      (wallet top-up pre-invoice)
 *   GET  /api/invoices                            → { invoices }
 *   GET  /api/invoices/:id                        → { invoice }
 *   POST /api/invoices/:id/pay                    → 503 gateway_unavailable (gateway not connected yet)
 *   POST /api/logout
 *   GET  /api/site                                → seller info, VAT, amount limits (public)
 *   GET  /api/health
 *
 * Configuration comes from `.env` next to package.json (see .env.example).
 */
import http from 'node:http'
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSmsProvider } from './sms.mjs'
import { openStore } from './store.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
try {
  process.loadEnvFile(join(ROOT, '.env'))
} catch {
  /* no .env — rely on real environment variables */
}
const env = process.env

const PORT = Number(env.PORT || 3100)
const HOST = env.HOST || '127.0.0.1'
const OTP_TTL = Number(env.OTP_TTL_SECONDS || 120)
const OTP_RESEND = Number(env.OTP_RESEND_SECONDS || 60)
const MAX_ATTEMPTS = Number(env.OTP_MAX_ATTEMPTS || 5)
const IP_SENDS_PER_HOUR = Number(env.OTP_IP_SENDS_PER_HOUR || 10)
const MOBILE_SENDS_PER_DAY = Number(env.OTP_MOBILE_SENDS_PER_DAY || 8)
const TRUST_PROXY = env.TRUST_PROXY === 'true'
const COOKIE_SECURE = env.COOKIE_SECURE !== 'false'
const SESSION_DAYS = Number(env.SESSION_DAYS || 7)
const SECRET = env.APP_SECRET || randomBytes(32).toString('hex')
if (!env.APP_SECRET) console.warn('[asan] APP_SECRET is not set — logins will reset on every restart')

const VAT_PERCENT = Number(env.VAT_PERCENT ?? 10)
const MIN_AMOUNT = Number(env.MIN_TOPUP_TOMAN || 100_000)
const MAX_AMOUNT = Number(env.MAX_TOPUP_TOMAN || 100_000_000)
const PRESETS = [1_000_000, 3_000_000, 5_000_000]
const SERVICE_SETUP_FEE = Number(env.SERVICE_SETUP_FEE_TOMAN || 1_000_000)

const SITE = {
  brand: 'آسان',
  tagline: 'پلتفرم خدمات مالی',
  seller: {
    name: env.SELLER_NAME || 'پلتفرم خدمات مالی آسان',
    nationalId: env.SELLER_NATIONAL_ID || '',
    economicCode: env.SELLER_ECONOMIC_CODE || '',
    registrationNo: env.SELLER_REGISTRATION_NO || '',
    address: env.SELLER_ADDRESS || '',
    postalCode: env.SELLER_POSTAL_CODE || '',
    phone: env.SELLER_PHONE || '',
    email: env.SELLER_EMAIL || '',
  },
  supportHours: env.SUPPORT_HOURS || 'شنبه تا چهارشنبه، ساعت ۹ تا ۱۷',
  vatPercent: VAT_PERCENT,
  minAmount: MIN_AMOUNT,
  maxAmount: MAX_AMOUNT,
  presets: PRESETS,
  serviceSetupFee: SERVICE_SETUP_FEE,
  enamadHtml: env.ENAMAD_HTML || '',
}

const PUBLIC = join(ROOT, 'public')
const sms = createSmsProvider(env)
const store = await openStore(resolve(ROOT, env.DATA_FILE || 'data/db.json'))

/* ───────────── helpers ───────────── */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const toLatin = (s) =>
  String(s ?? '').replace(/[۰-۹٠-٩]/g, (d) => String(Math.max(FA_DIGITS.indexOf(d), AR_DIGITS.indexOf(d))))
const normMobile = (m) => {
  let s = toLatin(m).replace(/[\s-]/g, '')
  if (s.startsWith('+98')) s = '0' + s.slice(3)
  else if (s.startsWith('0098')) s = '0' + s.slice(4)
  else if (/^9\d{9}$/.test(s)) s = '0' + s
  return s
}
const isMobile = (m) => /^09\d{9}$/.test(m)
const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const isName = (s) => s.length >= 2 && s.length <= 40 && /^[؀-ۿ‌\s‌ ]+$/.test(s)

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for']
    if (xff) return String(xff).split(',')[0].trim()
    if (req.headers['x-real-ip']) return String(req.headers['x-real-ip'])
  }
  return req.socket.remoteAddress || ''
}

/* ───────────── OTP + rate limits (in memory) ───────────── */

/** mobile → { hash, expiresAt, sentAt, attempts } */
const otps = new Map()
/** key → timestamps[] */
const hits = new Map()
const hashCode = (mobile, code) => createHash('sha256').update(`${SECRET}:${mobile}:${code}`).digest()
function countRecent(key, windowMs) {
  const now = Date.now()
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs)
  hits.set(key, list)
  return list.length
}
const record = (key) => (hits.get(key) || hits.set(key, []).get(key)).push(Date.now())

setInterval(() => {
  const now = Date.now()
  for (const [m, o] of otps) if (o.expiresAt < now - 60_000) otps.delete(m)
  for (const [k, list] of hits) if (!list.some((t) => now - t < 86_400_000)) hits.delete(k)
}, 60_000).unref()

/* ───────────── login cookie (signed, stateless) ───────────── */

const COOKIE = 'asan_session'
const sign = (v) => createHmac('sha256', SECRET).update(v).digest('base64url')
function makeSession(userId) {
  const exp = Date.now() + SESSION_DAYS * 86_400_000
  const v = `${userId}.${exp}`
  return `${v}.${sign(v)}`
}
function readSession(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='))
  if (!raw) return null
  const [id, exp, mac] = raw.slice(COOKIE.length + 1).split('.')
  if (!id || !exp || !mac) return null
  const expect = Buffer.from(sign(`${id}.${exp}`))
  const got = Buffer.from(mac)
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return null
  if (Number(exp) < Date.now()) return null
  return store.userById(id)
}
const cookieAttrs = (maxAge) => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${COOKIE_SECURE ? '; Secure' : ''}`

/* ───────────── HTTP plumbing ───────────── */

function send(res, status, body, headers = {}) {
  const data = Buffer.from(JSON.stringify(body))
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(data)
}
const fail = (res, status, code, message, extra = {}) => send(res, status, { error: code, message, ...extra })

async function readJson(req) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) throw Object.assign(new Error('bad'), { status: 415 })
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > 10_000) throw Object.assign(new Error('too big'), { status: 413 })
    chunks.push(c)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw Object.assign(new Error('bad json'), { status: 400 })
  }
}

/** Reject cross-site POSTs (cookie is SameSite=Lax too). */
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

const publicUser = (u) => u && { id: u.id, mobile: u.mobile, firstName: u.firstName, lastName: u.lastName, hasProfile: Boolean(u.firstName && u.lastName) }
const publicInvoice = (i) => ({
  id: i.id,
  number: i.number,
  createdAt: i.createdAt,
  status: i.status,
  description: i.description,
  amount: i.amount,
  vatPercent: i.vatPercent,
  vat: i.vat,
  total: i.total,
  buyer: i.buyer,
  seller: i.seller,
})

/* ───────────── API ───────────── */

async function api(req, res, path) {
  const method = req.method
  if (method === 'POST' && !sameOrigin(req)) return fail(res, 403, 'forbidden', 'درخواست نامعتبر است.')

  if (path === '/api/health' && method === 'GET') return send(res, 200, { ok: true, sms: sms.name })
  if (path === '/api/site' && method === 'GET') return send(res, 200, SITE)

  if (path === '/api/otp/send' && method === 'POST') {
    const body = await readJson(req)
    const mobile = normMobile(body.mobile)
    if (!isMobile(mobile)) return fail(res, 400, 'invalid_mobile', 'شماره موبایل معتبر نیست.')
    const now = Date.now()
    const prev = otps.get(mobile)
    if (prev && now - prev.sentAt < OTP_RESEND * 1000) {
      const wait = Math.ceil((OTP_RESEND * 1000 - (now - prev.sentAt)) / 1000)
      return fail(res, 429, 'wait', `برای ارسال دوباره ${wait} ثانیه صبر کنید.`, { resendIn: wait })
    }
    const ip = clientIp(req)
    if (countRecent(`ip:${ip}`, 3_600_000) >= IP_SENDS_PER_HOUR || countRecent(`m:${mobile}`, 86_400_000) >= MOBILE_SENDS_PER_DAY)
      return fail(res, 429, 'rate_limited', 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.')
    const code = String(randomInt(10000, 100000))
    try {
      await sms.sendOtp(mobile, code)
    } catch (e) {
      console.error('[asan] SMS failed:', e.message)
      return fail(res, 502, 'sms_failed', 'ارسال پیامک انجام نشد. چند لحظه بعد دوباره تلاش کنید.')
    }
    record(`ip:${ip}`)
    record(`m:${mobile}`)
    otps.set(mobile, { hash: hashCode(mobile, code), expiresAt: now + OTP_TTL * 1000, sentAt: now, attempts: 0 })
    return send(res, 200, { ttl: OTP_TTL, resendIn: OTP_RESEND, mobile })
  }

  if (path === '/api/otp/verify' && method === 'POST') {
    const body = await readJson(req)
    const mobile = normMobile(body.mobile)
    const code = toLatin(body.code).trim()
    const o = otps.get(mobile)
    if (!o || o.expiresAt < Date.now()) return fail(res, 400, 'expired', 'کد منقضی شده است. کد جدید بگیرید.')
    if (o.attempts >= MAX_ATTEMPTS) return fail(res, 429, 'too_many', 'تعداد تلاش‌ها زیاد بود. کد جدید بگیرید.')
    o.attempts++
    if (!/^\d{5}$/.test(code) || !timingSafeEqual(o.hash, hashCode(mobile, code)))
      return fail(res, 400, 'wrong_code', 'کد وارد شده درست نیست.', { attemptsLeft: MAX_ATTEMPTS - o.attempts })
    otps.delete(mobile)
    const user = store.userByMobile(mobile) || (await store.createUser(mobile))
    return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': `${COOKIE}=${makeSession(user.id)}; ${cookieAttrs(SESSION_DAYS * 86400)}` })
  }

  if (path === '/api/logout' && method === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; ${cookieAttrs(0)}` })

  /* ── everything below needs login ── */
  const user = readSession(req)
  if (!user) return fail(res, 401, 'unauthorized', 'لطفاً دوباره وارد شوید.')

  if (path === '/api/me' && method === 'GET') {
    const paid = store.invoicesOf(user.id).filter((i) => i.status === 'paid')
    return send(res, 200, { user: publicUser(user), wallet: { balance: paid.reduce((s, i) => s + i.amount, 0) } })
  }

  if (path === '/api/profile' && method === 'POST') {
    const body = await readJson(req)
    const firstName = cleanName(body.firstName)
    const lastName = cleanName(body.lastName)
    if (!isName(firstName)) return fail(res, 400, 'invalid_first', 'نام را به فارسی وارد کنید.')
    if (!isName(lastName)) return fail(res, 400, 'invalid_last', 'نام خانوادگی را به فارسی وارد کنید.')
    return send(res, 200, { user: publicUser(await store.updateUser(user.id, { firstName, lastName })) })
  }

  if (!user.firstName) return fail(res, 403, 'profile_required', 'ابتدا نام و نام خانوادگی را وارد کنید.')

  if (path === '/api/invoices' && method === 'GET') return send(res, 200, { invoices: store.invoicesOf(user.id).map(publicInvoice) })

  if (path === '/api/invoices' && method === 'POST') {
    const body = await readJson(req)
    const amount = Number(toLatin(body.amount).replace(/[^\d]/g, ''))
    if (!Number.isSafeInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT)
      return fail(res, 400, 'invalid_amount', `مبلغ باید بین ${MIN_AMOUNT.toLocaleString('fa-IR')} و ${MAX_AMOUNT.toLocaleString('fa-IR')} تومان باشد.`)
    const recent = store.invoicesOf(user.id).filter((i) => Date.now() - Date.parse(i.createdAt) < 3_600_000)
    if (recent.length >= 20) return fail(res, 429, 'rate_limited', 'تعداد پیش‌فاکتورها زیاد است. کمی بعد تلاش کنید.')
    const vat = Math.round((amount * VAT_PERCENT) / 100)
    const invoice = await store.createInvoice({
      userId: user.id,
      description: 'شارژ کیف پول پلتفرم خدمات مالی آسان',
      amount,
      vatPercent: VAT_PERCENT,
      vat,
      total: amount + vat,
      buyer: { name: `${user.firstName} ${user.lastName}`, mobile: user.mobile },
      seller: SITE.seller,
    })
    return send(res, 201, { invoice: publicInvoice(invoice) })
  }

  const m = path.match(/^\/api\/invoices\/(\d+)(\/pay)?$/)
  if (m) {
    const inv = store.invoiceById(m[1])
    if (!inv || inv.userId !== user.id) return fail(res, 404, 'not_found', 'پیش‌فاکتور پیدا نشد.')
    if (!m[2] && method === 'GET') return send(res, 200, { invoice: publicInvoice(inv) })
    if (m[2] && method === 'POST') {
      // The payment gateway is not connected yet: record the attempt and report the outage.
      await store.updateInvoice(inv.id, { payAttempts: (inv.payAttempts || 0) + 1, lastPayAttemptAt: new Date().toISOString() })
      console.log(`[asan] pay attempt: invoice ${inv.number}, user ${user.id}, total ${inv.total}`)
      return fail(res, 503, 'gateway_unavailable', 'امکان ارتباط با درگاه پرداخت برقرار نشد. لطفاً بعداً تلاش نمایید.')
    }
  }

  return fail(res, 404, 'not_found', 'یافت نشد.')
}

/* ───────────── static files ───────────── */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}
const PAGES = { '/': 'index.html', '/app': 'app.html', '/about': 'about.html', '/contact': 'contact.html', '/terms': 'terms.html' }

async function serveStatic(req, res, path) {
  let file = PAGES[path.replace(/\/$/, '') || '/']
  if (!file && path.startsWith('/app/')) file = 'app.html'
  file = file ? join(PUBLIC, file) : normalize(join(PUBLIC, decodeURIComponent(path)))
  if (!file.startsWith(PUBLIC)) return fail(res, 403, 'forbidden', '')
  try {
    const st = await stat(file)
    if (!st.isFile()) throw new Error('not file')
    const ext = extname(file)
    const longCache = ['.woff2', '.png'].includes(ext)
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': longCache ? 'public, max-age=604800' : 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : await readFile(file))
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(await readFile(join(PUBLIC, '404.html')).catch(() => 'Not found'))
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
}

http
  .createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v)
    const path = new URL(req.url, 'http://x').pathname
    try {
      if (path.startsWith('/api/')) return await api(req, res, path)
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method', '')
      return await serveStatic(req, res, path)
    } catch (e) {
      if (e.status) return fail(res, e.status, 'bad_request', 'درخواست نامعتبر است.')
      console.error('[asan] error:', e)
      return fail(res, 500, 'server_error', 'خطای سرور. دوباره تلاش کنید.')
    }
  })
  .listen(PORT, HOST, () => console.log(`[asan] signup site on http://${HOST}:${PORT} — sms: ${sms.name}`))
