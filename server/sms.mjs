/**
 * SMS providers for the login code.
 *  - parsgreen: https://sms.parsgreen.ir  (Apiv2/Message/SendOtp)
 *  - console:   prints the code to the server log — for local testing only
 */
import http from 'node:http'
import https from 'node:https'

const TIMEOUT_MS = 10_000

/**
 * POST JSON. With `tunnel` ("127.0.0.1:9102") the connection goes into the SSH reverse
 * tunnel opened from a machine in Iran, while the Host header and TLS name stay those of
 * the real URL — Parsgreen only answers Iranian IPs.
 */
function postJson(url, headers, body, tunnel = '') {
  const u = new URL(url)
  const secure = u.protocol === 'https:'
  const [tHost, tPort] = tunnel ? tunnel.split(':') : []
  const data = Buffer.from(JSON.stringify(body))
  return new Promise((resolve, reject) => {
    const req = (secure ? https : http).request(
      {
        host: tHost || u.hostname,
        port: Number(tPort) || Number(u.port) || (secure ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        servername: secure ? u.hostname : undefined,
        headers: { Host: u.host, 'Content-Type': 'application/json', 'Content-Length': data.length, ...headers },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json = null
          try {
            json = JSON.parse(text)
          } catch {
            /* non-JSON error page */
          }
          resolve({ status: res.statusCode, data: json, text })
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('SMS request timed out')))
    req.on('error', reject)
    req.end(data)
  })
}

function parsgreen(env) {
  const apiKey = (env.PARSGREEN_API_KEY || '').trim()
  if (!apiKey) throw new Error('PARSGREEN_API_KEY is not set in .env')
  const baseUrl = (env.PARSGREEN_BASE_URL || 'https://sms.parsgreen.ir').replace(/\/$/, '')
  // Off by default: the panel's brand name would be appended to the SMS.
  const addName = env.PARSGREEN_ADD_NAME === 'true'
  const tunnel = (env.PARSGREEN_TUNNEL || '').trim()

  return {
    name: tunnel ? 'parsgreen via tunnel' : 'parsgreen',
    async sendOtp(mobile, code) {
      const { status, data, text } = await postJson(
        `${baseUrl}/Apiv2/Message/SendOtp`,
        { Authorization: `basic apikey:${apiKey}` },
        { Mobile: mobile, SmsCode: code, AddName: addName },
        tunnel,
      )
      if (status !== 200 || !data || data.R_Success !== true) {
        const reason = data ? `R_Code=${data.R_Code} ${data.R_Message ?? ''}` : text.slice(0, 200)
        throw new Error(`Parsgreen SendOtp failed (HTTP ${status}): ${reason}`)
      }
    },
  }
}

function consoleProvider() {
  return {
    name: 'console',
    async sendOtp(mobile, code) {
      console.log(`[sms:console] login code for ${mobile}: ${code}`)
    },
  }
}

export function createSmsProvider(env) {
  const kind = (env.SMS_PROVIDER || 'console').toLowerCase()
  if (kind === 'parsgreen') return parsgreen(env)
  if (kind === 'console') return consoleProvider()
  throw new Error(`Unknown SMS_PROVIDER "${kind}". Use "parsgreen" or "console".`)
}
