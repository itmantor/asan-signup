/* Shared helpers for all pages. */
const Asan = (() => {
  const FA = '۰۱۲۳۴۵۶۷۸۹'
  const toFa = (v) => String(v ?? '').replace(/\d/g, (d) => FA[d])
  const toLatin = (v) =>
    String(v ?? '')
      .replace(/[۰-۹]/g, (d) => FA.indexOf(d))
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  const money = (n) => Number(n || 0).toLocaleString('fa-IR')
  const faDate = (iso, withTime = false) => {
    const d = new Date(iso)
    const date = d.toLocaleDateString('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' })
    if (!withTime) return date
    return `${date}، ساعت ${d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' })}`
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

  /** Persian words for a whole number (up to billions) — used under the amount field. */
  function words(n) {
    n = Math.floor(Number(n) || 0)
    if (n === 0) return 'صفر'
    const ones = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']
    const teens = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']
    const tens = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
    const hundreds = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']
    const three = (x) => {
      const parts = []
      if (x >= 100) parts.push(hundreds[Math.floor(x / 100)])
      x %= 100
      if (x >= 20) {
        parts.push(tens[Math.floor(x / 10)])
        if (x % 10) parts.push(ones[x % 10])
      } else if (x >= 10) parts.push(teens[x - 10])
      else if (x > 0) parts.push(ones[x])
      return parts.join(' و ')
    }
    const units = ['', ' هزار', ' میلیون', ' میلیارد']
    const out = []
    for (let i = 0; n > 0 && i < units.length; i++) {
      const chunk = n % 1000
      if (chunk) out.unshift(three(chunk) + units[i])
      n = Math.floor(n / 1000)
    }
    return out.join(' و ')
  }

  async function api(path, { method = 'GET', body } = {}) {
    let res
    try {
      res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
      })
    } catch {
      throw Object.assign(new Error('اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.'), { status: 0 })
    }
    let data = {}
    try {
      data = await res.json()
    } catch {
      /* empty */
    }
    if (!res.ok) throw Object.assign(new Error(data.message || 'خطایی رخ داد. دوباره تلاش کنید.'), { status: res.status, data })
    return data
  }

  let sitePromise
  const site = () => (sitePromise ||= api('/api/site'))

  /** Lucide-style icons (stroke, 24 grid). */
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/><path d="M3 7h16a2 2 0 0 1 2 2v2"/><path d="M21 11h-4a2 2 0 0 0 0 4h4z"/>',
    receipt: '<path d="M5 21V3l2 1.5L9 3l2 1.5L13 3l2 1.5L17 3l2 1.5V21l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    barcode: '<path d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
    handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a2 2 0 0 0-2.8 0l-.9.9a1 1 0 1 1-3-3l2.8-2.8a5 5 0 0 1 6 .8L21 7"/><path d="m21 3-3 4M3 3l3 4 4 4"/><path d="m3 13 5 5"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 14l2 2 4-4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17-5-5 5-5"/><path d="M11 12h10"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="m15 18-6-6 6-6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    pin: '<path d="M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    scale: '<path d="M12 3v18M7 21h10M5 7h14"/><path d="m5 7-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
    calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  }
  const icon = (name, size = 20) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`

  const year = () => new Date().toLocaleDateString('fa-IR-u-ca-persian', { year: 'numeric' })

  /** Fills [data-seller] spans, the footer copyright and the Enamad seal on any page. */
  async function decorate() {
    const s = await site().catch(() => null)
    if (!s) return
    document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = year()))
    document.querySelectorAll('[data-seller]').forEach((el) => {
      const v = s.seller[el.dataset.seller]
      el.textContent = v ? (el.dataset.fa === '1' ? toFa(v) : v) : '—'
    })
    document.querySelectorAll('[data-hide-empty]').forEach((el) => {
      if (!s.seller[el.dataset.hideEmpty]) el.remove()
    })
    document.querySelectorAll('[data-enamad]').forEach((el) => {
      if (s.enamadHtml) el.innerHTML = s.enamadHtml
    })
    document.querySelectorAll('[data-support-hours]').forEach((el) => (el.textContent = s.supportHours))
    document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 20)))
  }

  return { toFa, toLatin, money, faDate, esc, words, api, site, icon, decorate, year }
})()
