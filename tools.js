import { decodeASL, flagOf, xorDistance, packGeo } from 'powmem'
import {
  getPublicKey,
  getEventHash,
  signEvent,
  SimplePool,
  parseReferences,
  nip19
} from 'nostr-tools'
import Geohash from 'latlon-geohash'
import { schnorr } from '@noble/curves/secp256k1'
import { bytesToHex } from '@noble/hashes/utils'

const pool = new SimplePool()
const relays = [
  // TODO: Replace with european only
  'wss://relay.f7z.io',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.nostr.band',
  'wss://nostr-pub.wellorder.net',
  // 'wss://relay.current.fyi', // Offline
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://nos.lol'
]

// (decorative misnomer, see pollution)
export function decoratePOP0101 (event) {
  if (event.flag) return event
  const { age, sex, location } = decodeASL(event.pubkey)
  event.age = [16, 24, 32, 48][age]
  event.sex = ['F', 'P', 'IB', 'R'][sex] // ['👩', '👨', '🧑', '🤖'][sex]
  event.flag = flagOf(location)
  return event
}

/**
 * Performs an awaitable nostr-query/subscription.
 * @returns {Promise<import("nostr-tools").Event[]>} of events after EOSE
 */
export async function nostrQuery (filters = []) {
  const events = []
  for await (const event of nostrStream(filters)) events.push(event)
  return events
}

/**
 * Perform a nostr-query/subscription as an async generator.
 * @param {array} filters A nostr query filter (NIP-01)
 * @yields {import('nostr-tools').Event} Event in FIFO order
 * @return {undefined} on EOSE
 */
export async function * nostrStream (filters = []) {
  const sub = pool.sub(relays, filters)
  let [ep, eset] = unpromise() // TODO: Timeout 30s
  sub.on('eose', () => eset(null))
  sub.on('event', ev => {
    const next = unpromise()
    const set = eset
    ep = next[0]
    eset = next[1]
    set(ev)
  })
  while (true) {
    const event = await ep
    if (!event) break
    yield event
  }
  sub.unsub()
}

/**
 * Borrowed from piconet.
 * Returns an unpacked promise
 * that covers all your async-vodoo needs.
 */
export function unpromise () {
  let set, abort
  return [
    new Promise((resolve, reject) => { set = resolve; abort = reject }),
    set,
    abort
  ]
}

export function parseContent (content) {
  const links = []
  const images = []
  content = content.replace(/(https:\/\/\S+)/g, (_, url) => {
    try {
      const u = new URL(url)
      if (u.pathname.match(/jpe?g|png|webp|gif/)) images.push(url)
      else links.push(url)
    } catch (err) { console.warn('ParseURLError:', err) }
    return '\n'
  }).trim()
  return { content, links, images }
}

/**
 * Returns emoji based on age/sex
 * @param {0|1|2|3} sex a.k.a gender Female/Male/NonBinary/Binary
 * @param {0|1|2|3} age Age-bracket 16/24/32/48
 * @return {string' emoji
 */
export function emoOf (sex, age = 1) {
  return [
    ['👧', '👦', '🧒', '🔋'],
    ['👩', '👨', '🧑', '🤖'],
    ['👵', '👴', '🧓', '📟'],
    ['💃', '🕺', '🌈', '💾']
  ][age][sex]
}

/**
 * Naive black magic
 */
export class ProfileFinder {
  profiles = {}
  queue = [] // TODO: use Set
  #p = null

  /** @type {(string) => Promise<Profile>} */
  async profileOf (key, _retry = 0) {
    if (!key || _retry > 5) return null
    if (this.has(key)) return this.contentOf(key)
    if (!~this.queue.indexOf(key)) this.queue.push(key)
    await this.#lookup().catch(err => console.error(err))
    return this.has(key) ? this.contentOf(key) : this.profileOf(key, ++_retry) // reque until found
  }

  getEvent (key) {
    if (!this.profiles[key]) {
      const j = globalThis.localStorage.getItem('p' + key)
      if (j) this.profiles[key] = JSON.parse(j)
    }
    return this.profiles[key]
  }

  setEvent (key, ev) {
    this.profiles[key] = ev
    globalThis.localStorage.setItem('p' + key, JSON.stringify(ev))
  }

  has (key) { return !!this.getEvent(key) }
  contentOf (key) { return JSON.parse(this.getEvent(key).content) }

  async #lookup () {
    if (this.#p) return this.#p
    const authors = [...this.queue]
    // const n = authors.length
    this.queue = []
    this.#p = new Promise(resolve => setTimeout(resolve, 300)) // Let Buffer
      .then(() => new Promise((resolve) => {
        // console.info('Sub k0: ' , authors.join())
        const sub = pool.sub(relays, [
          { kinds: [0], authors }
        ])
        sub.on('event', event => {
          if (event.kind !== 0) return
          const prev = this.getEvent(event.pubkey)
          if (!prev || prev.created_at < event.created_at) {
            this.setEvent(event.pubkey, event)
            authors.splice(authors.indexOf(event.pubkey), 1)
          }
        })
        sub.on('eose', () => {
          // console.info('unsub() resolved:', n - authors.length, 'remain:', authors.join())
          for (const a of authors) {
            if (!~this.queue.indexOf(a)) this.queue.push(a)
          }
          sub.unsub()
          this.#p = null
          resolve()
        })
      }))
    return this.#p
  }
}
/*
class TreeNode {
  children = []
  constructor (event) { this.event = event }
}
class NoteTracker {
  #events = []
  // #lastSync = 0
  #root = []
  async * start (filters) {
    filters ||= [{ kinds: [1], '#t': TAGS }]
    for await (const event of nQueryStream(filters)) {
      // event.tags.find(t => t[0] === 't' && ~TAGS.indexOf(t[1])) // Redundant check
      yield await this.addEvent(event) // Notify update
    }
  }
  async addEvent (event){
    decoratePOP0101(event)
    await storeEvent(event)
    const path = event.tags.filter(t => t[0] === '#e')
    // Assume parent is last #e tag
    const ptag = path.pop()
    const node = new TreeNode(event)
    if (ptag) {
      const parent = await this.getEvent(ptag[1])
      const idx = parent.children.findIndex(n => n.event.created_at < event.created_at)
      if (!~idx) parent.children.push(node)
    }
    const children = await nQuery([{ kinds: [1], '#e': [noteId]}])
    for (const c of children) await addEvent(c)
  }

  async getEvent (id) {
    return this.#events[id]
  }
  async storeEvent (event) {
    // TODO: BrowserLevel
    this.#events[event.id] = event
    //const idx = this.#events.findIndex(p => p.created_at < event.created_at)
    //if (!~idx) this.#events.push(event)
    //else this.#events.splice(idx, 0, event)
  }

  async list (noteId) {
    const subEvents = await nQuery([{ kinds: [1], '#e': [noteId]}])
    console.log('SubNotes', subEvents)
    return subEvents
  }

}
const nman = new NoteTracker()
*/

/**
 * @param {string} hash Geohash
 * @returns {string} Closest Landmark
 */
export function geoCode (hash) {
  const flag = flagOf(hash)
  if (flag !== '🇸🇪') return 'Utlandet'
  // GPT: please provide an array of sweden's 10 largest cities and their latitude and longitude in ES6
  const locations = [
    /* { name: "Stockholm urban area", coordinates: [59.310087557972, 18.046331211663] }, */
    { name: 'Stockholm', coordinates: [59.33, 18.07] },
    { name: 'Göteborg', coordinates: [57.72, 12.01] },
    { name: 'Malmö', coordinates: [55.61, 13.02] },
    { name: 'Uppsala', coordinates: [59.86, 17.64] },
    { name: 'Norrköping', coordinates: [58.6, 16.17] },
    { name: 'Västerås', coordinates: [59.620000000000005, 16.54] },
    { name: 'Umeå', coordinates: [63.83, 20.240000000000002] },
    { name: 'Örebro', coordinates: [59.28, 15.22] },
    { name: 'Linköping', coordinates: [58.410000000000004, 15.63] },
    { name: 'Helsingborg', coordinates: [56.050000000000004, 12.700000000000001] },
    { name: 'Jonkoping', coordinates: [57.78, 14.17] },
    { name: 'Lund', coordinates: [55.71, 13.200000000000001] },
    { name: 'Gävle', coordinates: [60.69, 17.13] },
    { name: 'Södertälje', coordinates: [59.2, 17.63] },
    { name: 'Borås', coordinates: [57.730000000000004, 12.94] },
    { name: 'Halmstad', coordinates: [56.67, 12.86] },
    { name: 'Karlstad', coordinates: [59.38, 13.51] },
    { name: 'Eskilstuna', coordinates: [59.348700525963, 16.44903294272] },
    { name: 'Täby', coordinates: [59.433333333333, 18.083333333333] }
  ].map(({ name, coordinates }) => {
    return {
      name,
      coordinates,
      packed: packGeo(Geohash.encode(coordinates[0], coordinates[1], 6))
    }
  })
  const src = packGeo(hash)
  const sorted = locations
    .map(f => [f, xorDistance(src, f.packed)])
    .sort((a, b) => a[1] - b[1])
  const [location] = sorted[0]
  return location.name
}

/** @param {string} text Hex-string */
export async function shareIt (text) {
  if (navigator.share) {
    await navigator.share({ text })
    return 0
  }
  // Clipboard fallback
  await navigator.clipboard.writeText(text)
  return 1
}

// TODO: prob unexport?
export async function getSecret () {
  return globalThis.localStorage.getItem('_secret')
}
export async function getPub () {
  // check if nip07 - Screw it. If people wanna nip07 they can use another client for now.
  // check localStorage
  const secret = await getSecret()
  if (secret) return bytesToHex(schnorr.getPublicKey(secret))
}

export async function signNostrEvent (event) {
  // check if nip07
  // check if localStorage
}

/** @param {string|Uint8Array} secret Hex-string */
export async function storeSecret (secret) {
  if (typeof secret !== 'string') secret = bytesToHex(secret)
  // const pub = schnorr.getPublicKey(secret)
  globalThis.localStorage.setItem('_secret', secret)
  // await tabSec.put(pub, secret)
}

/* Out of scope w/o https://cdn.jsdelivr.net/npm/idb@7/+esm
export async function listSecrets () {
  const secrets = await tabSec.getMany()
}
*/
