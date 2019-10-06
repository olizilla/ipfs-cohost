#!/usr/bin/env node

const ipfsProvider = require('ipfs-provider')
const meow = require('meow')
const cohost = require('.')
const ora = require('ora')
const prettyBytes = require('pretty-bytes')

let log = null
let spin = null

const cli = meow(`
  Usage
    $ ipfs-cohost <domain>...
    $ ipfs-cohost add <domain>...
    $ ipfs-cohost rm <domain>...
    $ ipfs-cohost ls [domain]...
    $ ipfs-cohost sync
    $ ipfs-cohost gc [n]

  Example
    $ ipfs-cohost docs.ipfs.io cid.ipfs.io

  Options
    --silent, -s  Just do your job
`, {
  flags: {
    silent: {
      type: 'boolean',
      default: false,
      alias: 's'
    }
  }
})

async function add (ipfs, input) {
  const longestDomain = input.reduce((r, c) => r.length >= c.length ? r : c)
  let size = 0
  for (const domain of input) {
    const spinner = spin(`Cohosting ${domain}...`)
    const { hash, cumulativeSize } = await cohost.add(ipfs, domain)
    spinner.stop()
    size += cumulativeSize
    log('📍', domain.padEnd(longestDomain.length), hash, prettyBytes(cumulativeSize))
  }
  log('📦', 'Total size', prettyBytes(size), 'for', input.length, 'domains')
  log('🤝', 'Co-hosting', input.length, 'domains via IPFS.')
}

async function rm (ipfs, input) {
  let spinner
  for (const domain of input) {
    spinner = spin(`Stopping to cohost ${domain}...`)
    await cohost.rm(ipfs, domain)
    spinner.succeed(` ${domain} no longer cohosted!`)
  }
}

async function ls (ipfs, input) {
  if (input.length > 0) {
    for (const domain of input) {
      const snapshots = await cohost.ls(ipfs, domain)
      log(`⏱  Snapshots for ${domain}:`)
      snapshots.forEach(n => log(`      ${n}`))
    }

    return
  }

  log('📍 Cohosted domains:')
  const domains = await cohost.ls(ipfs)
  domains.forEach(n => log(`      ${n}`))
}

async function sync (ipfs) {
  const spinner = spin('Syncing snapshots...')
  await cohost.sync(ipfs)
  spinner.succeed(' Snapshots synced!')
}

async function gc (ipfs, input) {
  let num = null
  if (input.length > 0) num = parseInt(input[0], 10)

  const spinner = spin('Cleaning cohosted websites...')
  await cohost.gc(ipfs, num)
  spinner.succeed(' Cohosted websites cleaned!')
}

async function run () {
  if (cli.input.length === 0) {
    return cli.showHelp()
  }

  const cmd = cli.input.shift()
  const input = cli.input

  const { ipfs, provider } = await getIpfs()
  log = logger.bind(null, cli.flags.silent)
  spin = spinner.bind(null, cli.flags.silent)

  if (!cli.flags.silent) {
    log('🔌 Using', provider === 'IPFS_HTTP_API' ? 'local ipfs daemon via http api' : 'js-ipfs node')
  }

  try {
    switch (cmd) {
      case 'add':
        await add(ipfs, input)
        break
      case 'rm':
        await rm(ipfs, input)
        break
      case 'ls':
        await ls(ipfs, input)
        break
      case 'sync':
        await sync(ipfs)
        break
      case 'gc':
        await gc(ipfs, input)
        break
      default:
        await add(ipfs, input.concat(cmd))
    }
  } catch (error) {
    console.error(error.message || error)
    process.exit(-1)
  }

  if (provider === 'JS_IPFS' && !cli.flags.pin) {
    await ipfs.stop()
    process.exit()
  }
}

function getIpfs () {
  return ipfsProvider({
    tryWebExt: false,
    tryWindow: false,
    tryJsIpfs: true,
    getJsIpfs: () => require('ipfs'),
    jsIpfsOpts: { silent: true }
  })
}

function spinner (silent, text) {
  if (silent) return { stop: () => {}, fail: () => {}, succeed: () => {} }
  return ora({ text: ` ${text}`, spinner: 'dots' }).start()
}

function logger (silent, ...args) {
  if (silent) return
  console.log(args.join(' '))
}

run()
