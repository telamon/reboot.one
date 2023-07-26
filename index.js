import Tonic from '@socketsupply/tonic'
import { decodeASL, flagOf } from 'powmem'
import {
  getPublicKey,
  getEventHash,
  signEvent,
  SimplePool,
  parseReferences,
  nip19
} from 'nostr-tools'

const relays = [
  // TODO: Replace with european only
  'wss://relay.f7z.io',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.nostr.band',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.current.fyi',
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://nos.lol'
]
const TAGS = ['reboot']
let pool = new SimplePool()

Tonic.add(class GuestBook extends Tonic {
  #posts = []
  render () {
    const posts = this.#posts.map(p => this.html`
      <book-post event=${p}></book-post>
    `)
    return this.html`
      <h3>Senaste Inlägg (${this.#posts.length + ''}st)</h3>
      <post-form></post-form>
      ${posts}
    `
  }

  disconnected () { this.sub?.unsub() }
  async connected () {
    const filters = [{ kinds: [1], '#t': TAGS }]
    for await (const event of nQueryStream(filters)) {
      const { pubkey, tags } = event
      const hashtag = tags.find(t => t[0] === 't' && ~TAGS.indexOf(t[1]))
      if (!hashtag) return
      const { age, sex, location } = decodeASL(pubkey)
      event.age = [16, 24, 32, 48][age]
      event.sex = ['F', 'P', 'IB', 'R'][sex] // ['👩', '👨', '🧑', '🤖'][sex]
      event.flag = flagOf(location)
      const idx = this.#posts.findIndex(p => p.created_at < event.created_at)
      if (!~idx) this.#posts.push(event)
      else this.#posts.splice(idx, 0, event)
      this.reRender()
    }
  }
})

Tonic.add(class BookPost extends Tonic {
  populate (event, profile, replies = []) {
    const name = profile
      ? profile.display_name || profile.name || profile.username
      : event.pubkey.slice(0, 8)
    const color = event.pubkey.slice(0, 6)
    const picture = profile
      ? this.html`<img src="${profile?.picture}" />`
      : this.html`<div class="placeholder" style="background-color: #${color}"></div> `
    const time = new Date(event.created_at * 1000)
    const pad = n => n.toString().padStart(2, '0')
    const tstr = `${pad(time.getHours())}:${pad(time.getMinutes())} ${pad(time.getDate())}-${pad(time.getMonth())}-${pad(time.getFullYear())}`

    let { content, images } = parseContent(event.content)
    /* for (const ref of parseReferences(event)) {
      content = content.replace(ref.text, () => this.html`<p-ref ref="${ref}"></p-ref>`)
    } */
    const iattachments = images.map(src => this.html`<post-img src="${src}"></post-img>`)
    return this.html`
      <div class="post flex column">
        <div class="flex row start">
          <div class="gutter flex column">
            <div class="portrait"><a href="https://iris.to/${nip19.npubEncode(event.pubkey)}" target="_blank">${picture}</a></div>
            <div class="asl">${event.flag} <small>${event.sex + event.age}</small></div>
          </div>
          <div class="flex column" style="width: 100%">
            <div class="alias"><strong><samp>${name}</samp></strong></div>
            <samp><time datetime="${time.toISOString()}">${tstr}</time></samp>
            <div class="images flex row wrap">${iattachments}</div>
            <p class="content">${content}</p>
            <div class="ctrls flex row space-between">
              <samp><a href="">svara (${replies.length + ''})</a></samp>
              <samp>
                <a href="https://iris.to/${nip19.noteEncode(event.id)}" target="_blank">dela</a>
              </samp>
            </div>
          </div>
        </div>
      </div>
    `
  }

  async * render () {
    yield this.html`Loading...`
    const { event } = this.props
    yield this.populate(event, null)
    let profile = undefined
    try {
      profile = await pman.profileOf(event.pubkey)
    } catch (error) { console.error('profileOf:Error:', error) }
    // Attempt fetching replies
    const replies = await nman.list(event.id)
    return this.populate(event, profile, replies)
  }
})

Tonic.add(class PostImg extends Tonic {
  click () {
    const d = this.querySelector('dialog')
    if(d.open) d.close()
    else d.showModal()
  }
  render () {
    return this.html`
      <img class="preview" src="${this.props.src}" />
      <dialog>
        <img src="${this.props.src}"/>
      </dialog>
    `
  }
})

Tonic.add(class PostForm extends Tonic {
  #pk = null
  #type = -1
  click (ev) {
    if (Tonic.match(ev.target, '#submit')) {
      this.querySelector('dialog').showModal()
    }
    if (Tonic.match(ev.target, '#abort')) {
      this.querySelector('dialog').close()
    }
  }

  render () {
    let identity = this.html`
      <h3>Skapa Identitet</h3>
      <div>
        <label for="sex">
          Kön
          <select name="sex" id="sex">
            <option>Kvinna</option>
            <option selected>Man</option>
            <option>Icke-binär</option>
          </select>
        </label>
        <br/>
        <label for="age">
          Ålder
          <select name="age" id="age">
            <option>16+</option>
            <option selected>24+</option>
            <option>32+</option>
            <option>48+</option>
          </select>
        </label>
        <br/>
        <label for="location">
          Plats
          <select name="location" id="location">
            <option>Stockholm</option>
            <option selected>Göteborg</option>
            <option>Malmö</option>
            <option>Använd GPS</option>
          </select>
        </label>
        <br/>
        <br/>
        <button id="generate">Generera Nyckel</button>
      </div>
    `
    return this.html`
      <textarea id="note-area" rows="8" style="width: 100%;" placeholder="Work in progress... klicka på något av porträtten nedan för att komma vidare"></textarea>
      <button id="submit">Skicka</button>
      <dialog>
        ${identity}
        <br />
        <button id="abort">Avbryt</button>
        <button id="kbk" disabled>Kör bara kör</button>
      </dialog>
    `
  }
})

function parseContent (content) {
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
 * Naive black magic
 */
class ProfileFinder {
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
     const j = localStorage.getItem('p' + key)
     if (j) this.profiles[key] = JSON.parse(j)
    }
    return this.profiles[key]
  }
  setEvent (key, ev) {
    this.profiles[key] = ev
    localStorage.setItem('p' + key, JSON.stringify(ev))
  }
  has (key) { return !!this.getEvent(key) }
  contentOf (key) { return JSON.parse(this.getEvent(key).content) }

  async #lookup () {
    if (this.#p) return this.#p
    const authors = [ ...this.queue ]
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
const pman = new ProfileFinder()

class NoteTracker {
  #notes = []
  #lastSync = 0
  #ns = 'root'
  /** Attempt to fetch replies for given note-id */
  async list (noteId) {
    const subEvents = await nQuery([{ kinds: [1], '#e': [noteId]}])
    console.log('SubNotes', subEvents)
    return subEvents
  }
}

const nman = new NoteTracker()

async function nQuery (filters = []) {
  const events = []
  for await (const event of nQueryStream(filters)) events.push(event)
  return events
}

/**
 * Converts pesky EventEmitters into
 * easily iterated Async Generators
 */
async function * nQueryStream (filters = []) {
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
// Borrowed from piconet
function unpromise () {
  let set, abort
  return [
    new Promise((resolve, reject) => { set = resolve; abort = reject }),
    set,
    abort
  ]
}
