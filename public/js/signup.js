/* Signup flow: mobile → SMS code → welcome + name → /app */
;(() => {
  const $ = (id) => document.getElementById(id)
  const steps = { mobile: $('step-mobile'), code: $('step-code'), name: $('step-name') }
  let mobile = ''
  let timerId = null

  function show(name) {
    for (const [k, el] of Object.entries(steps)) {
      el.classList.toggle('hidden', k !== name)
      el.classList.toggle('step-anim', k === name)
    }
    const first = steps[name].querySelector('input')
    if (first) setTimeout(() => first.focus(), 30)
  }

  function busy(btn, on, label) {
    btn.disabled = on
    if (on) {
      btn.dataset.label = btn.textContent
      btn.innerHTML = '<span class="spin"></span>'
    } else btn.textContent = label || btn.dataset.label
  }

  function setError(id, msg, input) {
    $(id).textContent = msg || ''
    if (input) input.classList.toggle('has-error', Boolean(msg))
  }

  const normMobile = (v) => {
    let s = Asan.toLatin(v).replace(/[\s-]/g, '')
    if (s.startsWith('+98')) s = '0' + s.slice(3)
    else if (s.startsWith('0098')) s = '0' + s.slice(4)
    else if (/^9\d{9}$/.test(s)) s = '0' + s
    return s
  }

  /* ── already logged in? ── */
  Asan.api('/api/me')
    .then(({ user }) => {
      if (user.hasProfile) location.replace('/app')
      else show('name')
    })
    .catch(() => {})

  /* ── step 1 ── */
  const mobileInput = $('mobile')
  mobileInput.addEventListener('input', () => {
    mobileInput.value = Asan.toLatin(mobileInput.value).replace(/[^\d+]/g, '')
    setError('mobile-error', '', mobileInput)
  })

  async function sendCode(btn) {
    const r = await Asan.api('/api/otp/send', { method: 'POST', body: { mobile } })
    $('sent-mobile').textContent = mobile
    startTimer(r.resendIn)
    return r
  }

  steps.mobile.addEventListener('submit', async (e) => {
    e.preventDefault()
    mobile = normMobile(mobileInput.value)
    if (!/^09\d{9}$/.test(mobile)) return setError('mobile-error', 'شماره موبایل را درست وارد کنید؛ مثل ۰۹۱۲۳۴۵۶۷۸۹', mobileInput)
    const btn = $('send-btn')
    busy(btn, true)
    try {
      await sendCode()
      clearOtp()
      show('code')
    } catch (err) {
      if (err.data?.error === 'wait') {
        $('sent-mobile').textContent = mobile
        startTimer(err.data.resendIn)
        show('code')
      } else setError('mobile-error', err.message, mobileInput)
    } finally {
      busy(btn, false)
    }
  })

  /* ── step 2 ── */
  const boxes = [...$('otp-row').querySelectorAll('input')]
  const code = () => boxes.map((b) => b.value).join('')
  function clearOtp() {
    boxes.forEach((b) => (b.value = ''))
    $('otp-row').classList.remove('has-error')
    $('code-error').textContent = ''
  }
  function fill(digits, from = 0) {
    ;[...digits].slice(0, boxes.length - from).forEach((d, i) => (boxes[from + i].value = d))
    const next = boxes.find((b) => !b.value) || boxes[boxes.length - 1]
    next.focus()
    if (code().length === boxes.length) steps.code.requestSubmit()
  }
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      const digits = Asan.toLatin(box.value).replace(/\D/g, '')
      box.value = ''
      $('otp-row').classList.remove('has-error')
      $('code-error').textContent = ''
      if (digits) fill(digits, i)
    })
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        boxes[i - 1].value = ''
        boxes[i - 1].focus()
        e.preventDefault()
      }
      if (e.key === 'ArrowLeft' && i < boxes.length - 1) boxes[i + 1].focus()
      if (e.key === 'ArrowRight' && i > 0) boxes[i - 1].focus()
    })
    box.addEventListener('paste', (e) => {
      e.preventDefault()
      const digits = Asan.toLatin(e.clipboardData.getData('text')).replace(/\D/g, '')
      if (digits) {
        boxes.forEach((b) => (b.value = ''))
        fill(digits, 0)
      }
    })
  })

  function startTimer(seconds) {
    clearInterval(timerId)
    let left = seconds
    const el = $('timer')
    const tick = () => {
      if (left <= 0) {
        clearInterval(timerId)
        el.innerHTML = '<button type="button" class="btn-link" id="resend">ارسال دوباره کد</button>'
        $('resend').onclick = async (ev) => {
          ev.target.disabled = true
          try {
            await sendCode()
            clearOtp()
            boxes[0].focus()
          } catch (err) {
            $('code-error').textContent = err.message
            if (err.data?.resendIn) startTimer(err.data.resendIn)
            else ev.target.disabled = false
          }
        }
        return
      }
      const m = Math.floor(left / 60)
      const s = String(left % 60).padStart(2, '0')
      el.textContent = Asan.toFa(`ارسال دوباره تا ${m}:${s}`)
      left--
    }
    tick()
    timerId = setInterval(tick, 1000)
  }

  $('edit-mobile').onclick = () => {
    clearInterval(timerId)
    show('mobile')
  }

  steps.code.addEventListener('submit', async (e) => {
    e.preventDefault()
    const c = code()
    if (c.length !== boxes.length) {
      $('code-error').textContent = 'کد ۵ رقمی را کامل وارد کنید.'
      return
    }
    const btn = $('verify-btn')
    if (btn.disabled) return
    busy(btn, true)
    try {
      const { user } = await Asan.api('/api/otp/verify', { method: 'POST', body: { mobile, code: c } })
      clearInterval(timerId)
      if (user.hasProfile) return location.replace('/app')
      show('name')
    } catch (err) {
      $('otp-row').classList.add('has-error')
      $('code-error').textContent = err.message
      boxes.forEach((b) => (b.value = ''))
      boxes[0].focus()
    } finally {
      busy(btn, false)
    }
  })

  /* ── step 3 ── */
  const first = $('first-name')
  const last = $('last-name')
  const faName = (v) => v.trim().length >= 2 && /^[؀-ۿ‌\s]+$/.test(v.trim())
  first.addEventListener('input', () => setError('first-error', '', first))
  last.addEventListener('input', () => setError('last-error', '', last))

  steps.name.addEventListener('submit', async (e) => {
    e.preventDefault()
    let ok = true
    if (!faName(first.value)) (ok = false), setError('first-error', 'نام را به فارسی وارد کنید.', first)
    if (!faName(last.value)) (ok = false), setError('last-error', 'نام خانوادگی را به فارسی وارد کنید.', last)
    if (!ok) return
    const btn = $('name-btn')
    busy(btn, true)
    try {
      await Asan.api('/api/profile', { method: 'POST', body: { firstName: first.value, lastName: last.value } })
      location.replace('/app')
    } catch (err) {
      if (err.status === 401) return location.reload()
      setError('last-error', err.message, null)
      busy(btn, false)
    }
  })

  Asan.decorate()
})()
