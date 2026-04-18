#!/usr/bin/env node
'use strict'

const cmds = require('../src/commands')

const argv = process.argv.slice(2)
const [name, ...rest] = argv

function usage(code = 0) {
  process.stdout.write(
    [
      'dotenvx-ops — oss drop-in shim for a self-hosted envelops server',
      '',
      'usage:',
      '  dotenvx-ops login --hostname <url>',
      '  dotenvx-ops logout',
      '  dotenvx-ops status',
      '  dotenvx-ops keypair [public_key]',
      '  dotenvx-ops observe <base64>',
      '',
      'config (env vars override stored session):',
      '  DOTENVX_OPS_HOSTNAME    server base url',
      '  DOTENVX_OPS_TOKEN       bearer token',
      ''
    ].join('\n')
  )
  process.exit(code)
}

async function main() {
  switch (name) {
    case 'status':
      return cmds.cmdStatus()
    case 'keypair':
      return cmds.cmdKeypair(rest)
    case 'observe':
      return cmds.cmdObserve(rest)
    case 'rotate':
      return cmds.cmdRotate(rest)
    case 'set':
      return cmds.cmdSet(rest)
    case 'get':
      return cmds.cmdGet(rest)
    case 'login':
      return cmds.cmdLogin(rest)
    case 'logout':
      return cmds.cmdLogout()
    case '--version':
    case '-v':
      process.stdout.write(require('../package.json').version + '\n')
      return
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return usage()
    default:
      process.stderr.write(`unknown command: ${name}\n`)
      usage(1)
  }
}

main().catch((e) => {
  process.stderr.write(`☠ ${e?.message ?? e}\n`)
  process.exit(1)
})
