'use strict'

async function request(url, { method = 'GET', headers = {}, body } = {}) {
  const resp = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  })
  const text = await resp.text()
  let parsed
  try {
    parsed = text.length ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  return { status: resp.status, body: parsed, raw: text, headers: resp.headers }
}

module.exports = { request }
