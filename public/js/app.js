/* User panel: dashboard, services, wallet top-up, pre-invoice. */
;(() => {
  const { icon, money, toFa, esc, faDate, api } = Asan
  const $ = (id) => document.getElementById(id)
  const view = $('view')

  const SERVICES = [
    { key: 'paylink', icon: 'link', name: 'لینک پرداخت', desc: 'تولید لینک پرداخت برای صورتحساب‌ها و دریافت آنلاین وجه از مشتری' },
    { key: 'depid', icon: 'hash', name: 'شناسه واریز', desc: 'شناسه واریز اختصاصی برای هر صورتحساب و تطبیق خودکار واریزی‌ها' },
    { key: 'pcode', icon: 'barcode', name: 'شناسه کالا و خدمت', desc: 'جستجوی هوشمند شناسه کالا و خدمت با هوش مصنوعی، تکی یا با فایل اکسل' },
    { key: 'inquiry', icon: 'search', name: 'استعلام‌ها', desc: 'استعلام‌های بانکی، مالیاتی و ثبتی از یک پنل؛ بدون یکپارچه‌سازی فنی' },
    { key: 'advisor', icon: 'chat', name: 'مشاوره هوشمند', desc: 'مشاوره با هوش مصنوعی در مالیات، بیمه، قانون تجارت و ثبت' },
    { key: 'escrow', icon: 'handshake', name: 'معامله مشروط', desc: 'نگهداری امن وجه تا انجام تعهدات طرفین معامله' },
    { key: 'contract', icon: 'file', name: 'قرارداد الکترونیک', desc: 'تنظیم و امضای الکترونیکی قراردادهای کسب‌وکار' },
  ]

  let me = null
  let site = null

  /* ───────── navigation ───────── */

  function renderNav(path) {
    const item = (href, ic, label, active) =>
      `<a class="nav-item${active ? ' active' : ''}" href="${href}" data-route>${icon(ic)}<span>${label}</span></a>`
    $('nav').innerHTML = `
      <div class="nav-label">اصلی</div>
      ${item('/app', 'home', 'داشبورد', path === '/app')}
      ${item('/app/wallet', 'wallet', 'کیف پول', path.startsWith('/app/wallet') || path.startsWith('/app/invoices'))}
      <div class="nav-label">سرویس‌ها</div>
      ${SERVICES.map((s) => `<button class="nav-item" data-service="${s.key}">${icon(s.icon)}<span>${s.name}</span></button>`).join('')}
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
      return
    }
    const s = e.target.closest('[data-service]')
    if (s) {
      closeNav()
      serviceModal(SERVICES.find((x) => x.key === s.dataset.service))
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
    const inv = path.match(/^\/app\/invoices\/(\d+)$/)
    if (path === '/app') return dashboard()
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
      if (e.target.closest('a[data-route]')) close()
    })
    document.addEventListener('keydown', onKey)
    document.body.appendChild(wrap)
    wrap.querySelector('.btn')?.focus()
    return { el: wrap, close }
  }

  function serviceModal(s) {
    const fee = money(site.serviceSetupFee)
    modal(`
      <div class="modal-icon" style="background:var(--navy-50);color:var(--navy)">${icon(s.icon, 28)}</div>
      <h3>${esc(s.name)}</h3>
      <p>هزینه راه‌اندازی اولیه این سرویس <b>${fee} تومان</b> است. لطفاً ابتدا نسبت به شارژ کیف پول خود اقدام نمایید.</p>
      <div class="mini-wallet">
        <div class="mw-icon">${icon('wallet')}</div>
        <div><div class="mw-label">موجودی کیف پول شما</div><div class="mw-amount">${money(me.wallet.balance)} تومان</div></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>بعداً</button>
        <a class="btn btn-primary" href="/app/wallet" data-route>${icon('plus', 18)} شارژ کیف پول</a>
      </div>
    `)
  }

  /* ───────── dashboard ───────── */

  function walletHero(withButton = true) {
    return `
      <div class="wallet-hero">
        <img class="circuit" src="/img/circuit.png" alt="">
        <div class="w-icon">${icon('wallet', 28)}</div>
        <div>
          <div class="w-label">موجودی کیف پول</div>
          <div class="w-amount">${money(me.wallet.balance)} <small>تومان</small></div>
        </div>
        ${withButton ? `<div class="w-actions"><a class="btn btn-gold" href="/app/wallet" data-route>${icon('plus', 18)} شارژ کیف پول</a></div>` : ''}
      </div>`
  }

  function dashboard() {
    setTitle('داشبورد')
    view.innerHTML = `
      <div class="step-anim">
        <p style="margin:0 0 16px;font-size:16px"><b>${esc(me.user.firstName)}</b> عزیز، به پلتفرم خدمات مالی آسان خوش آمدید.</p>
        ${walletHero()}

        <div class="section-head"><h2 class="section-title">سرویس‌های پلتفرم</h2></div>
        <div class="services">
          ${SERVICES.map(
            (s) => `
            <button class="srv" data-service="${s.key}">
              <div class="srv-icon">${icon(s.icon, 22)}</div>
              <div class="srv-name">${s.name}</div>
              <div class="srv-desc">${s.desc}</div>
              <div class="srv-foot"><span class="tag tag-gray">غیرفعال</span><span class="go">فعال‌سازی ${icon('arrow', 16)}</span></div>
            </button>`,
          ).join('')}
        </div>

        <div class="section-head"><h2 class="section-title">شروع کار با آسان</h2></div>
        <div class="card">
          <div class="steps">
            <div class="step"><div class="step-n">۱</div><div><b>شارژ کیف پول</b><span>هزینه همه سرویس‌ها از کیف پول کسر می‌شود.</span></div></div>
            <div class="step"><div class="step-n">۲</div><div><b>فعال‌سازی سرویس</b><span>سرویس مورد نیاز خود را انتخاب و فعال کنید.</span></div></div>
            <div class="step"><div class="step-n">۳</div><div><b>استفاده از سرویس</b><span>بدون نیاز به یکپارچه‌سازی فنی، از پنل استفاده کنید.</span></div></div>
          </div>
        </div>
      </div>`
  }

  /* ───────── wallet / top-up ───────── */

  async function wallet() {
    setTitle('کیف پول')
    const { invoices } = await api('/api/invoices').catch(() => ({ invoices: [] }))
    const presets = site.presets
    view.innerHTML = `
      <div class="step-anim">
        ${walletHero(false)}
        <div class="section-head"><h2 class="section-title">شارژ کیف پول</h2></div>
        <div class="topup">
          <form class="card" id="topup-form" novalidate>
            <label class="field" style="margin-bottom:6px">
              <span class="field-label">مبلغ شارژ</span>
              <div class="input-wrap">
                <input id="amount" class="input ltr num" inputmode="numeric" autocomplete="off" placeholder="مثلاً ۱٬۰۰۰٬۰۰۰" style="text-align:right">
                <span class="input-suffix">تومان</span>
              </div>
            </label>
            <div class="words" id="words"></div>
            <div class="field-label">یا یکی از مبالغ زیر را انتخاب کنید</div>
            <div class="presets">
              ${presets.map((p) => `<button type="button" class="preset" data-amount="${p}">${toFa(p / 1_000_000)} میلیون<small>تومان</small></button>`).join('')}
            </div>
            <div class="error-text" id="amount-error"></div>
            <button class="btn btn-primary btn-block" id="topup-btn" type="submit" style="margin-top:8px">تأیید و صدور پیش‌فاکتور</button>
          </form>

          <div class="card">
            <h3 class="section-title" style="font-size:15px">خلاصه پرداخت</h3>
            <div class="summary-row"><span>مبلغ شارژ</span><b id="s-amount">—</b></div>
            <div class="summary-row"><span>مالیات بر ارزش افزوده (${toFa(site.vatPercent)}٪)</span><b id="s-vat">—</b></div>
            <div class="summary-row total"><span>مبلغ قابل پرداخت</span><b id="s-total">—</b></div>
            <div class="alert alert-info" style="margin-top:14px">${icon('info', 18)}<span>مبلغ کیف پول فقط برای استفاده از سرویس‌های پلتفرم آسان قابل استفاده است.</span></div>
          </div>
        </div>

        <div class="section-head"><h2 class="section-title">پیش‌فاکتورهای شما</h2></div>
        <div class="card" style="padding:8px 10px">
          ${
            invoices.length
              ? `<div class="table-wrap"><table class="table">
                  <thead><tr><th>شماره</th><th>تاریخ</th><th>مبلغ شارژ</th><th>مبلغ کل</th><th>وضعیت</th><th></th></tr></thead>
                  <tbody>${invoices
                    .map(
                      (i) => `<tr>
                        <td class="num">${toFa(i.number)}</td>
                        <td class="num">${faDate(i.createdAt)}</td>
                        <td class="num">${money(i.amount)}</td>
                        <td class="num">${money(i.total)}</td>
                        <td>${statusBadge(i.status)}</td>
                        <td><a href="/app/invoices/${i.id}" data-route>مشاهده</a></td>
                      </tr>`,
                    )
                    .join('')}</tbody></table></div>`
              : `<div class="empty">هنوز پیش‌فاکتوری صادر نشده است.</div>`
          }
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
      const digits = Asan.toLatin(input.value).replace(/\D/g, '').slice(0, 10)
      amount = Number(digits) || 0
      input.value = amount ? money(amount) : ''
      update()
    })
    presetBtns.forEach((b) =>
      b.addEventListener('click', () => {
        amount = Number(b.dataset.amount)
        input.value = money(amount)
        update()
      }),
    )

    $('topup-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const err = (m) => {
        $('amount-error').textContent = m
        input.classList.add('has-error')
      }
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

  const statusBadge = (s) =>
    s === 'paid' ? `<span class="status status-paid">${icon('check', 14)} پرداخت شده</span>` : `<span class="status status-unpaid">در انتظار پرداخت</span>`

  /* ───────── pre-invoice ───────── */

  async function invoice(id) {
    setTitle('پیش‌فاکتور')
    let inv
    try {
      ;({ invoice: inv } = await api(`/api/invoices/${id}`))
    } catch (e) {
      if (e.status === 401) return location.replace('/')
      view.innerHTML = `<div class="card empty">${esc(e.message)}<br><br><a class="btn btn-ghost" href="/app/wallet" data-route>بازگشت به کیف پول</a></div>`
      return
    }
    const s = inv.seller
    const row = (label, value, fa = true) => (value ? `<dt>${label}</dt><dd${fa ? ' class="num"' : ''}>${esc(fa ? toFa(value) : value)}</dd>` : '')
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

        <div class="table-wrap">
          <table class="table inv-items">
            <thead><tr><th style="width:56px">ردیف</th><th>شرح</th><th>مبلغ (تومان)</th></tr></thead>
            <tbody><tr><td class="num">۱</td><td>${esc(inv.description)}</td><td class="num">${money(inv.amount)}</td></tr></tbody>
          </table>
        </div>

        <div class="inv-totals">
          <div class="summary-row"><span>جمع مبلغ</span><b class="num">${money(inv.amount)} تومان</b></div>
          <div class="summary-row"><span>مالیات بر ارزش افزوده (${toFa(inv.vatPercent)}٪)</span><b class="num">${money(inv.vat)} تومان</b></div>
          <div class="summary-row total"><span>مبلغ قابل پرداخت</span><b class="num">${money(inv.total)} تومان</b></div>
          <div class="words" style="margin:4px 0 0;text-align:end">${Asan.words(inv.total)} تومان</div>
        </div>

        <p class="inv-note">
          • این پیش‌فاکتور برای شارژ کیف پول پلتفرم خدمات مالی آسان صادر شده و پس از پرداخت، مبلغ شارژ به موجودی کیف پول شما افزوده می‌شود.<br>
          • موجودی کیف پول فقط برای استفاده از سرویس‌های پلتفرم آسان قابل استفاده است.
        </p>

        <div id="pay-alert"></div>
        <div class="inv-actions">
          <button class="btn btn-gold" id="pay-btn">${icon('card', 18)} پرداخت ${money(inv.total)} تومان</button>
          <button class="btn btn-ghost" onclick="window.print()">${icon('print', 18)} چاپ</button>
          <a class="btn-link" href="/app/wallet" data-route style="margin-inline-start:auto">بازگشت به کیف پول</a>
        </div>
      </div>`

    $('pay-btn').onclick = async (e) => {
      const btn = e.currentTarget
      const label = btn.innerHTML
      btn.disabled = true
      btn.innerHTML = '<span class="spin"></span> در حال اتصال به درگاه پرداخت…'
      $('pay-alert').innerHTML = ''
      const started = Date.now()
      let message
      try {
        await api(`/api/invoices/${inv.id}/pay`, { method: 'POST' })
        message = 'امکان ارتباط با درگاه پرداخت برقرار نشد. لطفاً بعداً تلاش نمایید.'
      } catch (ex) {
        if (ex.status === 401) return location.replace('/')
        message = ex.status === 503 ? ex.message : 'امکان ارتباط با درگاه پرداخت برقرار نشد. لطفاً بعداً تلاش نمایید.'
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
      ;[me, site] = await Promise.all([api('/api/me'), Asan.site()])
    } catch (e) {
      location.replace('/')
      return
    }
    if (!me.user.hasProfile) return location.replace('/')
    const u = me.user
    $('avatar').textContent = `${u.firstName[0] || ''}‌${u.lastName[0] || ''}`
    $('u-name').textContent = `${u.firstName} ${u.lastName}`
    $('u-mobile').textContent = u.mobile
    $('pill-balance').textContent = `${money(me.wallet.balance)} تومان`
    Asan.decorate()
    route()
  }
  boot()
})()
