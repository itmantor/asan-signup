/**
 * Tiny JSON-file store (users and pre-invoices). Enough for the signup demo:
 * one process, low traffic. Writes are serialized and atomic (temp file + rename).
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function openStore(file) {
  let db = { users: {}, mobiles: {}, invoices: {}, seq: { user: 0, invoice: 0 } }
  try {
    db = { ...db, ...JSON.parse(await readFile(file, 'utf8')) }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    await mkdir(dirname(file), { recursive: true })
  }

  let chain = Promise.resolve()
  const save = () => {
    const snapshot = JSON.stringify(db, null, 1)
    chain = chain.then(async () => {
      const tmp = `${file}.tmp`
      await writeFile(tmp, snapshot, { mode: 0o600 })
      await rename(tmp, file)
    })
    return chain
  }

  return {
    userById: (id) => db.users[id] || null,
    userByMobile: (mobile) => db.users[db.mobiles[mobile]] || null,

    async createUser(mobile) {
      const id = String(++db.seq.user)
      const user = { id, mobile, firstName: '', lastName: '', createdAt: new Date().toISOString() }
      db.users[id] = user
      db.mobiles[mobile] = id
      await save()
      return user
    },

    async updateUser(id, patch) {
      Object.assign(db.users[id], patch)
      await save()
      return db.users[id]
    },

    async createInvoice(data) {
      const seq = ++db.seq.invoice
      const id = String(seq)
      const invoice = { id, number: String(100000 + seq), status: 'unpaid', payAttempts: 0, createdAt: new Date().toISOString(), ...data }
      db.invoices[id] = invoice
      await save()
      return invoice
    },

    invoiceById: (id) => db.invoices[id] || null,

    invoicesOf: (userId) =>
      Object.values(db.invoices)
        .filter((i) => i.userId === userId)
        .sort((a, b) => Number(b.id) - Number(a.id)),

    async updateInvoice(id, patch) {
      Object.assign(db.invoices[id], patch)
      await save()
      return db.invoices[id]
    },
  }
}
