/* User panel: dashboard, service pages (buy a monthly subscription), orders, wallet, pre-invoice. */
;(() => {
  const { icon, money, toFa, esc, faDate, api } = Asan
  const $ = (id) => document.getElementById(id)
  const view = $('view')

  let me = null
  let site = null
  let catalog = null

  /* ───────── navigation ───────── */

  function renderNav(path) {
    const item = (href, ic, label, active) =>
      `<a class="nav-item${active ? ' active' : ''}" href="${href}" data-route>${icon(ic)}<span>${label}</span></a>`
    $('nav').innerHTML = `
      <div class="nav-label">اصلی</div>
      ${item('/app', 'home', 'داشبورد', path === '/app')}
      ${item('/app/services', 'grid', 'همه سرویس‌ها', path === '/app/services')}
      <div class="nav-label">سرویس‌ها</div>
      ${catalog.services.map((s) => item(`/app/services/${s.key}`, s.icon, esc(s.name), path === `/app/services/${s.key}`)).join('')}
      <div class="nav-label">حساب</div>
      ${item('/app/orders', 'receipt', 'سفارش‌ها و پیش‌فاکتورها', path === '/app/orders' || path.startsWith('/app/invoices'))}
      ${item('/app/wallet', 'wallet', 'کیف پول', path === '/app/wallet')}
    `
  }

  function go(path, replace = false) {
    if (replace) history.replaceState({}, '', path)
    else history.pushState({}, '', path)
    route()
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-route]')
    if (a && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      closeNav()
      go(a.getAttribute('href'))
    }
  })
  window.addEventListener('popstate', route)

  const closeNav = () => $('shell').classList.remove('nav-open')
  $('menu-btn').onclick = () => $('shell').classList.add('nav-open')
  $('scrim').onclick = closeNav

  $('logout').onclick = async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {})
    location.replace('/')
  }

  function setTitle(t) {
    $('title').textContent = t
    document.title = `${t} | آسان — پلتفرم خدمات مالی`
  }

  async function route() {
    const path = location.pathname.replace(/\/$/, '') || '/app'
    renderNav(path)
    window.scrollTo(0, 0)
    const svc = path.match(/^\/app\/services\/([a-z]+)$/)
    const inv = path.match(/^\/app\/invoices\/(\d+)$/)
    if (path === '/app') return dashboard()
    if (path === '/app/services') return allServices()
    if (svc) return servicePage(svc[1])
    if (path === '/app/orders') return orders()
    if (path === '/app/wallet') return wallet()
    if (inv) return invoice(inv[1])
    go('/app', true)
  }

  /* ───────── modal ───────── */

  function modal(html) {
    const wrap = document.createElement('div')
    wrap.className = 'modal-backdrop'
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><button class="modal-close" aria-label="بستن">${icon('x')}</button>${html}</div>`
    const close = () => {
      wrap.remove()
      document.removeEventListener('keydown', onKey)
    }
    const onKey = (e) => e.key === 'Escape' && close()
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('.modal-close') || e.target.closest('[data-close]')) close()
    })
    document.addEventListener('keydown', onKey)
    document.body.appendChild(wrap)
    wrap.querySelector('.btn')?.focus()
    return { el: wrap, close }
  }

  /* ───────── dashboard ───────── */

  async function dashboard() {
    setTitle('داشبورد')
    const { invoices } = await api('/api/invoices').catch(() => ({ invoices: [] }))
    const pending = invoices.filter((i) => i.kind === 'subscription' && i.status === 'unpaid').slice(0, 3)
    view.innerHTML = `
      <div class="step-anim">
        <div class="hello">
          <div>
            <h2><b>${esc(me.user.firstName)}</b> عزیز، به آسان خوش آمدید</h2>
            <p>سرویس مورد نیاز کسب‌وکارتان را انتخاب کنید، اشتراک ماهانه بخرید و بلافاصله از آن استفاده کنید.</p>
          </div>
          <img class="circuit" src="/img/circuit.png" alt="">
        </div>

        <div class="section-head"><h2 class="section-title">سرویس‌های فعال شما</h2></div>
        <div class="card empty-state">
          <div class="es-icon">${icon('layers', 26)}</div>
          <div>
            <b>هنوز سرویسی فعال نکرده‌اید</b>
            <span>از فهرست زیر سرویس مورد نیاز را انتخاب کنید و اشتراک آن را بخرید.</span>
          </div>
        </div>
        ${
          pending.length
            ? `<div class="pending">${pending
                .map(
                  (i) => `<a class="pending-item" href="/app/invoices/${i.id}" data-route>${icon('receipt', 18)}<span>${esc(i.description)}</span><span class="status status-unpaid">در انتظار پرداخت</span><b class="num">${money(i.total)} تومان</b></a>`,
                )
                .join('')}</div>`
            : ''
        }

        <div class="section-head"><h2 class="section-title">سرویس‌های آسان</h2><a class="section-link" href="/app/services" data-route>مقایسه تعرفه‌ها</a></div>
        ${Catalog.grid(catalog.services, (s) => `/app/services/${s.key}`)}
      </div>`
  }

  /* ───────── all services (pricing table) ───────── */

  function allServices() {
    setTitle('همه سرویس‌ها')
    view.innerHTML = `
      <div class="step-anim">
        ${Catalog.grid(catalog.services, (s) => `/app/services/${s.key}`)}
        <div class="section-head"><h2 class="section-title">مقایسه تعرفه‌ها</h2></div>
        ${pricingTable((s) => `/app/services/${s.key}`)}
      </div>`
  }

  function pricingTable(hrefOf) {
    return `<div class="card" style="padding:8px 10px"><div class="table-wrap"><table class="table">
      <thead><tr><th>سرویس</th><th>سقف استفاده ماهانه</th><th>اشتراک ماهانه</th><th></th></tr></thead>
      <tbody>${catalog.services
        .map(
          (s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.quota)}</td><td class="num" style="white-space:nowrap">${money(s.monthlyPrice)} تومان</td><td><a href="${hrefOf(s)}" data-route>خرید</a></td></tr>`,
        )
        .join('')}</tbody></table></div></div>`
  }

  /* ───────── service page + buy ───────── */

  function servicePage(key) {
    const s = catalog.services.find((x) => x.key === key)
    if (!s) return go('/app/services', true)
    setTitle(s.name)
    let months
    try {
      const p = JSON.parse(sessionStorage.getItem('asan_pending') || 'null')
      if (p && p.service === key) months = p.months
      sessionStorage.removeItem('asan_pending')
    } catch {
      /* storage unavailable */
    }
    const page = Catalog.detail(s, catalog, {
      months,
      async onBuy(m) {
        try {
          const { invoice } = await api('/api/orders', { method: 'POST', body: { service: s.key, months: m, acceptTerms: true } })
          go(`/app/invoices/${invoice.id}`)
        } catch (ex) {
          if (ex.status === 401) return location.replace('/')
          throw ex
        }
      },
    })
    view.innerHTML = page.html
    page.bind(view)
  }

  /* ───────── orders ───────── */

  const statusBadge = (s) =>
    s === 'paid' ? `<span class="status status-paid">${icon('check', 14)} پرداخت شده</span>` : `<span class="status status-unpaid">در انتظار پرداخت</span>`

  async function orders() {
    setTitle('سفارش‌ها و پیش‌فاکتورها')
    const { invoices } = await api('/api/invoices').catch(() => ({ invoices: [] }))
    view.innerHTML = `
      <div class="card step-anim" style="padding:8px 10px">
        ${
          invoices.length
            ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>شماره</th><th>شرح</th><th>تاریخ</th><th>مبلغ کل</th><th>وضعیت</th><th></th></tr></thead>
                <tbody>${invoices
                  .map(
                    (i) => `<tr>
                      <td class="num">${toFa(i.number)}</td>
                      <td>${esc(i.description)}</td>
                      <td class="num" style="white-space:nowrap">${faDate(i.createdAt)}</td>
                      <td class="num" style="white-space:nowrap">${money(i.total)} تومان</td>
                      <td>${statusBadge(i.status)}</td>
                      <td><a href="/app/invoices/${i.id}" data-route>مشاهده</a></td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
            : `<div class="empty">هنوز سفارشی ثبت نکرده‌اید. <a href="/app/services" data-route>مشاهده سرویس‌ها</a></div>`
        }
      </div>`
  }

  /* ───────── wallet (kept simple) ───────── */

  function wallet() {
    setTitle('کیف پول')
    view.innerHTML = `
      <div class="step-anim">
        <div class="topup">
          <form class="card" id="topup-form" novalidate>
            <div class="wallet-line">${icon('wallet', 22)}<span>موجودی کیف پول</span><b class="num">${money(me.wallet.balance)} تومان</b></div>
            <label class="field" style="margin-bottom:6px">
              <span class="field-label">مبلغ شارژ</span>
              <div class="input-wrap">
                <input id="amount" class="input ltr num" inputmode="numeric" autocomplete="off" placeholder="مثلاً ۱٬۰۰۰٬۰۰۰" style="text-align:right">
                <span class="input-suffix">تومان</span>
              </div>
            </label>
            <div class="words" id="words"></div>
            <div class="presets">
              ${site.presets.map((p) => `<button type="button" class="preset" data-amount="${p}">${toFa(p / 1_000_000)} میلیون<small>تومان</small></button>`).join('')}
            </div>
            <div class="error-text" id="amount-error"></div>
            <button class="btn btn-primary btn-block" id="topup-btn" type="submit" style="margin-top:8px">تأیید و صدور پیش‌فاکتور</button>
          </form>
          <div class="card">
            <h3 class="section-title" style="font-size:15px">خلاصه پرداخت</h3>
            <div class="summary-row"><span>مبلغ شارژ</span><b id="s-amount">—</b></div>
            <div class="summary-row"><span>مالیات بر ارزش افزوده (${toFa(site.vatPercent)}٪)</span><b id="s-vat">—</b></div>
            <div class="summary-row total"><span>مبلغ قابل پرداخت</span><b id="s-total">—</b></div>
          </div>
        </div>
      </div>`

    const input = $('amount')
    const presetBtns = [...view.querySelectorAll('.preset')]
    let amount = 0
    const update = () => {
      const vat = Math.round((amount * site.vatPercent) / 100)
      $('s-amount').textContent = amount ? `${money(amount)} تومان` : '—'
      $('s-vat').textContent = amount ? `${money(vat)} تومان` : '—'
      $('s-total').textContent = amount ? `${money(amount + vat)} تومان` : '—'
      $('words').textContent = amount ? `${Asan.words(amount)} تومان` : ''
      presetBtns.forEach((b) => b.classList.toggle('active', Number(b.dataset.amount) === amount))
      $('amount-error').textContent = ''
      input.classList.remove('has-error')
    }
    input.addEventListener('input', () => {
      amount = Number(Asan.toLatin(input.value).replace(/\D/g, '').slice(0, 10)) || 0
      input.value = amount ? money(amount) : ''
      update()
    })
    presetBtns.forEach((b) => b.addEventListener('click', () => ((amount = Number(b.dataset.amount)), (input.value = money(amount)), update())))

    $('topup-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const err = (m) => (($('amount-error').textContent = m), input.classList.add('has-error'))
      if (!amount) return err('مبلغ شارژ را وارد کنید یا یکی از مبالغ پیشنهادی را انتخاب کنید.')
      if (amount < site.minAmount) return err(`حداقل مبلغ شارژ ${money(site.minAmount)} تومان است.`)
      if (amount > site.maxAmount) return err(`حداکثر مبلغ شارژ ${money(site.maxAmount)} تومان است.`)
      const btn = $('topup-btn')
      btn.disabled = true
      btn.innerHTML = '<span class="spin"></span>'
      try {
        const { invoice } = await api('/api/invoices', { method: 'POST', body: { amount } })
        go(`/app/invoices/${invoice.id}`)
      } catch (ex) {
        if (ex.status === 401) return location.replace('/')
        err(ex.message)
        btn.disabled = false
        btn.textContent = 'تأیید و صدور پیش‌فاکتور'
      }
    })
  }

  /* ───────── pre-invoice ───────── */

  async function invoice(id) {
    setTitle('پیش‌فاکتور')
    let inv
    try {
      ;({ invoice: inv } = await api(`/api/invoices/${id}`))
    } catch (e) {
      if (e.status === 401) return location.replace('/')
      view.innerHTML = `<div class="card empty">${esc(e.message)}<br><br><a class="btn btn-ghost" href="/app/orders" data-route>بازگشت به سفارش‌ها</a></div>`
      return
    }
    const s = inv.seller
    const row = (label, value, fa = true) => (value ? `<dt>${label}</dt><dd${fa ? ' class="num"' : ''}>${esc(fa ? toFa(value) : value)}</dd>` : '')
    const hasDiscount = inv.items.some((it) => it.discount)
    const svc = inv.kind === 'subscription' && catalog.services.find((x) => x.key === inv.service)
    view.innerHTML = `
      <div class="card invoice step-anim">
        <div class="inv-head">
          <a class="brand" href="/app" data-route>
            <img src="/img/logo-mark.png" alt="">
            <div><div class="brand-name">آسان</div><div class="brand-sub">پلتفرم خدمات مالی</div></div>
          </a>
          <div style="text-align:center"><h2 class="inv-title">پیش‌فاکتور</h2>${statusBadge(inv.status)}</div>
          <div class="inv-meta">
            <div>شماره: <b class="num">${toFa(inv.number)}</b></div>
            <div>تاریخ: <b class="num">${faDate(inv.createdAt)}</b></div>
          </div>
        </div>

        <div class="parties">
          <div class="party">
            <h3>${icon('building', 18)} مشخصات فروشنده</h3>
            <dl>
              ${row('نام', s.name, false)}
              ${row('شناسه ملی', s.nationalId)}
              ${row('کد اقتصادی', s.economicCode)}
              ${row('شماره ثبت', s.registrationNo)}
              ${row('تلفن', s.phone)}
              ${row('کد پستی', s.postalCode)}
              ${row('نشانی', s.address, false)}
            </dl>
          </div>
          <div class="party">
            <h3>${icon('user', 18)} مشخصات خریدار</h3>
            <dl>
              ${row('نام و نام خانوادگی', inv.buyer.name, false)}
              ${row('شماره موبایل', inv.buyer.mobile)}
            </dl>
          </div>
        </div>

        <div class="table-wrap inv-items-d">
          <table class="table inv-items">
            <thead><tr><th style="width:52px">ردیف</th><th>شرح</th><th>مبلغ واحد</th><th>تعداد</th>${hasDiscount ? '<th>تخفیف</th>' : ''}<th>مبلغ (تومان)</th></tr></thead>
            <tbody>${inv.items
              .map(
                (it, n) => `<tr>
                  <td class="num">${toFa(n + 1)}</td>
                  <td>${esc(it.description)}</td>
                  <td class="num" style="white-space:nowrap">${money(it.unitPrice)}</td>
                  <td class="num" style="white-space:nowrap">${toFa(it.qty)} ${esc(it.unit || '')}</td>
                  ${hasDiscount ? `<td class="num" style="white-space:nowrap">${it.discount ? money(it.discount) : '—'}</td>` : ''}
                  <td class="num" style="white-space:nowrap">${money(it.net)}</td>
                </tr>`,
              )
              .join('')}</tbody>
          </table>
        </div>

        <div class="inv-items-m">${inv.items
          .map(
            (it) => `<div class="iim">
              <b>${esc(it.description)}</b>
              <div class="summary-row"><span>مبلغ واحد × تعداد</span><span class="num">${money(it.unitPrice)} × ${toFa(it.qty)} ${esc(it.unit || '')}</span></div>
              ${it.discount ? `<div class="summary-row discount"><span>تخفیف</span><b class="num">− ${money(it.discount)}</b></div>` : ''}
              <div class="summary-row"><span>مبلغ</span><b class="num">${money(it.net)} تومان</b></div>
            </div>`,
          )
          .join('')}</div>

        <div class="inv-totals">
          <div class="summary-row"><span>جمع مبلغ</span><b class="num">${money(inv.amount)} تومان</b></div>
          <div class="summary-row"><span>مالیات بر ارزش افزوده (${toFa(inv.vatPercent)}٪)</span><b class="num">${money(inv.vat)} تومان</b></div>
          <div class="summary-row total"><span>مبلغ قابل پرداخت</span><b class="num">${money(inv.total)} تومان</b></div>
          <div class="words" style="margin:4px 0 0;text-align:end">${Asan.words(inv.total)} تومان</div>
        </div>

        <p class="inv-note">
          ${
            svc
              ? `• اشتراک سرویس «${esc(svc.name)}» پس از پرداخت فعال می‌شود و به مدت ${toFa(inv.months)} ماه (هر ماه ۳۰ روز) معتبر است. سقف استفاده: ${esc(svc.quota)}.<br>
                 • خرید این اشتراک به معنای پذیرش <a href="/services/${svc.key}" target="_blank">شرایط استفاده از سرویس</a> است.`
              : `• پس از پرداخت، مبلغ شارژ به موجودی کیف پول شما افزوده می‌شود و فقط برای سرویس‌های آسان قابل استفاده است.`
          }
        </p>

        <div id="pay-alert"></div>
        <div class="inv-actions">
          <button class="btn btn-gold" id="pay-btn">${icon('card', 18)} پرداخت ${money(inv.total)} تومان</button>
          <button class="btn btn-ghost" onclick="window.print()">${icon('print', 18)} چاپ</button>
          <a class="btn-link" href="${svc ? `/app/services/${svc.key}` : '/app/orders'}" data-route style="margin-inline-start:auto">${svc ? 'بازگشت به سرویس' : 'بازگشت به سفارش‌ها'}</a>
        </div>
      </div>`

    $('pay-btn').onclick = async (e) => {
      const btn = e.currentTarget
      const label = btn.innerHTML
      btn.disabled = true
      btn.innerHTML = '<span class="spin"></span> در حال اتصال به درگاه پرداخت…'
      $('pay-alert').innerHTML = ''
      const started = Date.now()
      let message = 'امکان ارتباط با درگاه پرداخت برقرار نشد. لطفاً بعداً تلاش نمایید.'
      try {
        await api(`/api/invoices/${inv.id}/pay`, { method: 'POST' })
      } catch (ex) {
        if (ex.status === 401) return location.replace('/')
        if (ex.status === 503) message = ex.message
      }
      await new Promise((r) => setTimeout(r, Math.max(0, 1800 - (Date.now() - started))))
      btn.disabled = false
      btn.innerHTML = label
      $('pay-alert').innerHTML = `<div class="alert alert-danger" role="alert" style="margin-top:6px">${icon('alert', 18)}<span>${esc(message)}</span></div>`
      modal(`
        <div class="modal-icon" style="background:var(--danger-50);color:var(--danger)">${icon('alert', 28)}</div>
        <h3>خطا در اتصال به درگاه</h3>
        <p>${esc(message)}</p>
        <div class="modal-actions"><button class="btn btn-primary" data-close>متوجه شدم</button></div>
      `)
    }
  }

  /* ───────── boot ───────── */

  async function boot() {
    try {
      ;[me, site, catalog] = await Promise.all([api('/api/me'), Asan.site(), Catalog.load()])
    } catch (e) {
      location.replace('/')
      return
    }
    if (!me.user.hasProfile) return location.replace('/')
    const u = me.user
    $('avatar').textContent = `${u.firstName[0] || ''}‌${u.lastName[0] || ''}`
    $('u-name').textContent = `${u.firstName} ${u.lastName}`
    $('u-mobile').textContent = u.mobile
    Asan.decorate()
    route()
  }
  boot()
})()
