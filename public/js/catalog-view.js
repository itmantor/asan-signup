/* Service catalog views — shared by the panel (/app/services/…) and the public pricing page (/services/…). */
const Catalog = (() => {
  const { icon, money, toFa, esc } = Asan

  let dataPromise
  const load = () => (dataPromise ||= Asan.api('/api/services'))

  const minDuration = (s, durations) => durations.find((d) => d.months >= (s.minMonths || 1))

  /** Price breakdown — same rule as the server (discount rounded to 1,000 Toman). */
  function quote(s, d, vatPercent) {
    const gross = s.monthlyPrice * d.months
    const discount = Math.round((gross * d.discount) / 100 / 1000) * 1000
    const net = gross - discount
    const vat = Math.round((net * vatPercent) / 100)
    return { gross, discount, net, vat, total: net + vat }
  }

  function card(s, href) {
    return `
      <a class="srv" href="${href}" data-route>
        <div class="srv-icon">${icon(s.icon, 22)}</div>
        <div class="srv-name">${esc(s.name)}</div>
        <div class="srv-desc">${esc(s.short)}</div>
        <div class="srv-quota">${icon('layers', 15)}<span>${esc(s.quota)}</span></div>
        <div class="srv-foot"><div class="srv-price"><b>${money(s.monthlyPrice)}</b> تومان <span>/ ماهانه</span></div><span class="go">جزئیات و خرید ${icon('arrow', 16)}</span></div>
      </a>`
  }

  function grid(services, hrefOf) {
    return `<div class="services">${services.map((s) => card(s, hrefOf(s))).join('')}</div>`
  }

  /**
   * Full service page. `buy` decides what the buy button does:
   *  - { onBuy(months) } → called with the chosen length (panel)
   *  - { href }          → plain link, e.g. to the login page (public site)
   */
  function detail(s, data, buy) {
    const durations = data.durations.filter((d) => d.months >= (s.minMonths || 1))
    const first = durations.find((d) => d.months === buy.months) || durations[0]
    const html = `
      <div class="svc step-anim">
        <div class="svc-head">
          <div class="svc-icon">${icon(s.icon, 30)}</div>
          <div>
            <h1 class="svc-title">${esc(s.name)}</h1>
            <p class="svc-short">${esc(s.short)}</p>
          </div>
        </div>

        <div class="svc-grid">
          <div class="svc-main">
            <div class="card">
              <h2 class="section-title">معرفی سرویس</h2>
              <p class="svc-text">${esc(s.description)}</p>
              <h3 class="sub-title">امکانات</h3>
              <ul class="checks">${s.features.map((f) => `<li>${icon('check', 18)}<span>${esc(f)}</span></li>`).join('')}</ul>
            </div>

            <div class="card">
              <h2 class="section-title">تعرفه و سقف استفاده</h2>
              <div class="facts">
                <div class="fact"><span>هزینه اشتراک</span><b>${money(s.monthlyPrice)} تومان در ماه</b></div>
                <div class="fact"><span>سقف استفاده</span><b>${esc(s.quota)}</b></div>
                <div class="fact"><span>استفاده مازاد</span><b>${esc(s.overage)}</b></div>
                <div class="fact"><span>دوره‌های اشتراک</span><b>${durations.map((d) => toFa(d.months)).join('، ')} ماهه</b></div>
              </div>
              <table class="table plans-table">
                <thead><tr><th>دوره</th><th>تخفیف</th><th>مبلغ اشتراک</th><th>معادل ماهانه</th></tr></thead>
                <tbody>${durations
                  .map((d) => {
                    const q = quote(s, d, data.vatPercent)
                    return `<tr><td>${toFa(d.months)} ماهه</td><td>${d.discount ? toFa(d.discount) + '٪' : '—'}</td><td class="num">${money(q.net)} تومان</td><td class="num">${money(Math.round(q.net / d.months))} تومان</td></tr>`
                  })
                  .join('')}</tbody>
              </table>
              <p class="fine">مبالغ بدون مالیات بر ارزش افزوده است؛ مالیات (${toFa(data.vatPercent)}٪) در پیش‌فاکتور اضافه می‌شود.</p>
            </div>

            <div class="card">
              <h2 class="section-title">شرایط استفاده</h2>
              <ol class="terms">${s.terms.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
              <details class="more-terms">
                <summary>شرایط عمومی همه اشتراک‌ها</summary>
                <ol class="terms">${data.commonTerms.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
              </details>
            </div>
          </div>

          <aside class="svc-buy">
            <div class="card buy-card">
              <div class="buy-price"><b>${money(s.monthlyPrice)}</b> تومان <span>/ ماهانه</span></div>
              <div class="field-label" style="margin-top:14px">مدت اشتراک</div>
              <div class="durations">
                ${durations
                  .map(
                    (d) => `<button type="button" class="duration${d === first ? ' active' : ''}" data-months="${d.months}">
                      <span class="d-len">${toFa(d.months)} ماهه</span>
                      ${d.discount ? `<span class="d-off">${toFa(d.discount)}٪ تخفیف</span>` : '<span class="d-off muted-off">بدون تخفیف</span>'}
                    </button>`,
                  )
                  .join('')}
              </div>
              <div id="buy-summary"></div>
              <label class="accept"><input type="checkbox" id="accept"> <span><a href="#svc-terms" id="terms-link">شرایط استفاده</a> از سرویس را خواندم و می‌پذیرم.</span></label>
              <div class="error-text" id="buy-error"></div>
              ${
                buy.href
                  ? `<a class="btn btn-primary btn-block" id="buy-btn" href="${buy.href}">${icon('card', 18)} خرید سرویس</a>`
                  : `<button class="btn btn-primary btn-block" id="buy-btn">${icon('card', 18)} خرید سرویس</button>`
              }
              <p class="fine" style="text-align:center;margin-top:10px">${buy.href ? 'برای خرید ابتدا وارد شوید یا ثبت‌نام کنید.' : 'پس از تأیید، پیش‌فاکتور صادر و به صفحه پرداخت هدایت می‌شوید.'}</p>
            </div>
          </aside>
        </div>
      </div>`

    /** Wires up the length selector, summary, terms checkbox and buy button. */
    function bind(root) {
      let months = first.months
      const btns = [...root.querySelectorAll('.duration')]
      const summary = root.querySelector('#buy-summary')
      const render = () => {
        const d = durations.find((x) => x.months === months)
        const q = quote(s, d, data.vatPercent)
        btns.forEach((b) => b.classList.toggle('active', Number(b.dataset.months) === months))
        summary.innerHTML = `
          <div class="summary-row"><span>${toFa(months)} ماه × ${money(s.monthlyPrice)}</span><b class="num">${money(q.gross)}</b></div>
          ${q.discount ? `<div class="summary-row discount"><span>تخفیف ${toFa(d.discount)}٪</span><b class="num">− ${money(q.discount)}</b></div>` : ''}
          <div class="summary-row"><span>مالیات بر ارزش افزوده (${toFa(data.vatPercent)}٪)</span><b class="num">${money(q.vat)}</b></div>
          <div class="summary-row total"><span>مبلغ قابل پرداخت</span><b class="num">${money(q.total)} <small>تومان</small></b></div>`
      }
      btns.forEach((b) => b.addEventListener('click', () => ((months = Number(b.dataset.months)), render())))
      render()

      const accept = root.querySelector('#accept')
      const err = root.querySelector('#buy-error')
      accept.addEventListener('change', () => (err.textContent = ''))
      root.querySelector('#terms-link').addEventListener('click', (e) => {
        e.preventDefault()
        root.querySelector('.terms').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' })
      })

      const btn = root.querySelector('#buy-btn')
      btn.addEventListener('click', async (e) => {
        if (!accept.checked) {
          e.preventDefault()
          err.textContent = 'برای خرید، شرایط استفاده از سرویس را بپذیرید.'
          return
        }
        if (buy.href) {
          // public page: remember the choice so the panel can continue after login
          try {
            sessionStorage.setItem('asan_pending', JSON.stringify({ service: s.key, months }))
          } catch {
            /* storage unavailable */
          }
          return
        }
        e.preventDefault()
        const label = btn.innerHTML
        btn.disabled = true
        btn.innerHTML = '<span class="spin"></span>'
        try {
          await buy.onBuy(months)
        } catch (ex) {
          err.textContent = ex.message
          btn.disabled = false
          btn.innerHTML = label
        }
      })
    }

    return { html, bind }
  }

  return { load, card, grid, detail, quote, minDuration }
})()
