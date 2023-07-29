import Tonic from '@socketsupply/tonic'
import { nip19 } from 'nostr-tools'
import {
  ProfileFinder,
  nostrQuery,
  nostrStream,
  decoratePOP0101,
  parseContent,
  emoOf,
  geoCode
} from './tools.js'
import Geohash from 'latlon-geohash'
import { flagOf } from 'powmem'

const pman = new ProfileFinder()
const TAGS = ['reboot']

Tonic.add(class GuestBook extends Tonic {
  #posts = []
  render () {
    const posts = this.#posts.map(p => this.html`
      <book-post event=${p} rl="1"></book-post>
    `)
    return this.html`
      ${this.renderPostDialog()}
      <div class="flex row center"><button class="post-btn biff" data-parent="">Skapa Inlägg</button></div>
      <h3>Senaste Inlägg (${this.#posts.length + ''}st)</h3>
      ${posts}
    `
  }

  renderPostDialog () {
    return this.html`
      <dialog id="postDialog">
        <h2>Identitet</h2>
        ${this.replyTo ? 'Nytt Inlägg' : 'Re:' + this.replyTo}
        <textarea id="note-area" rows="8" style="width: 100%;" placeholder="Work in progress... klicka på något av porträtten nedan för att komma vidare"></textarea>
        <button id="submit">Skicka</button>
      </dialog>
    `
  }

  disconnected () { this.sub?.unsub() }
  async connected () {
    const filters = [{ kinds: [1], '#t': TAGS }]
    for await (const event of nostrStream(filters)) {
      const { tags } = event
      const hashtag = tags.find(t => t[0] === 't' && ~TAGS.indexOf(t[1]))
      if (!hashtag) return
      decoratePOP0101(event)
      const idx = this.#posts.findIndex(p => p.created_at < event.created_at)
      if (!~idx) this.#posts.push(event)
      else this.#posts.splice(idx, 0, event)
      this.reRender()
    }
  }

  click (ev) {
    const postButton = Tonic.match(ev.target, '.post-btn')
    if (postButton) {
      this.replyTo = postButton.dataset.parent
      this.querySelector('#postDialog').showModal()
    } else {
      console.log(ev.target)
      this.querySelector('#postDialog').close()
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

    replies = replies.map(p => this.html`
      <book-post event=${decoratePOP0101(p)}></book-post>
    `)
    return this.html`
      <div class="post flex column" style="--depth: ${(event.depth || 0) + ''};">
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
        <div class="replies">${replies}</div>
      </div>
    `
  }

  async * render () {
    yield this.html`Loading...`
    let replies = []
    const { event, rl } = this.props
    let profile = undefined
    yield this.populate(event, profile, replies)
    try {
      profile = await pman.profileOf(event.pubkey)
      yield this.populate(event, profile, replies)
    } catch (error) { console.error('profileOf:Error:', error) }

    if (rl) {
      // Lazy workaround for lack of node-tree
      try {
        replies = await nostrQuery([{ kinds: [1], '#e': [event.id]}])
        replies.sort((a, b) => b.created_at < a.created_at) // Time ASC
        for (const e of replies) {
          e.depth = 0
          for (const [type, id] of e.tags.reverse()) {
            if (type !== 'e') continue
            e.depth++
            if (e.id === id) break
          }
        }
      } catch (error) { console.error('replies:Error:', error) }
    }
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

Tonic.add(class KeygenButton extends Tonic {
  render () {
    return this.html`
    <button class="biff">Utfärda Identitet</button>
    `
  }
  click (ev) {
    if (Tonic.match(ev.target, 'button')) document.getElementById('keygen').show()
  }
})

Tonic.add(class ModalDialog extends Tonic {
  show () {
    this.querySelector('dialog').showModal()
  }
  close () {
    this.querySelector('dialog').close()
  }
  render () { return this.html`<dialog>${this.children}</dialog>` }
  click ({ target }) { if (target === this.querySelector('dialog')) this.close() }
})

Tonic.add(class KeyGenerator extends Tonic {
  selectedCell = 5

  render () {
    this.props.geohash ||= 'u6282' // gbg
    const geoLabel = geoCode(this.props.geohash)
    const flag = flagOf(this.props.geohash)
    const astd = (s, a, d) => this.html`
      <td
        data-v="${(s | a << 2) + ''}"
        ${this.selectedCell === (s | a << 2) ? 'selected' : ''}
        ${d ? 'data-disabled=true' : ''}>
        ${emoOf(s, a)}
      </td>
    `
    return this.html`
      <div class="flex col xcenter">
        <h1>Utfärda Identitet</h1>
        <hr />
        <table id="as-matrix">
          <tr>
            <th>&nbsp;</th>
            <th colspan="4">Ålder</th>
          </tr>
          <tr class="mono">
            <th>&nbsp;</th>
            <th>16+</th><th>24+</th><th>32+</th><th>48+</th>
          </tr>
          <tr>
            <th rowspan="6"><span class="r-90">Kön</th>
            ${astd(0, 0)}${astd(0, 1)}${astd(0, 2)}${astd(0, 3)}
          </tr>
          <tr>
            ${astd(1, 0)}${astd(1, 1)}${astd(1, 2)}${astd(1, 3)}
          </tr>
          <tr>
            ${astd(2, 0)}${astd(2, 1)}${astd(2, 2)}${astd(2, 3)}
          </tr>
          <tr>
            ${astd(3, 0, true)}${astd(3, 1, true)}${astd(3, 2, true)}${astd(3, 3, true)}
          </tr>
        </table>
        <br>
        <hr />
        <br>
        <p><strong>Plats</strong></p>
        <div class="flex row space-around">
          <input id="geohash-input" type="text" value="${this.props.geohash}"/>
          <p class="geo-desc">${flag} ${geoLabel}</p>
        </div>
        <button id="btn-gps">Hämta Plats</button>

        <hr />
        Work in Progress
        <button id="generate">Generera Nyckel</button>
      </div>
    `
  }

  async click (ev) {
    const cellEl = Tonic.match(ev.target, 'td[data-v]')
    if (cellEl && !cellEl.dataset.disabled) {
      ev.preventDefault()
      this.selectedCell = parseInt(cellEl.dataset.v)
      return this.reRender(p => ({ ...p, selectedCell: this.selectedCell }))
    }
    if (Tonic.match(ev.target, '#btn-gps')) {
      ev.preventDefault()
      try {
        const { coords } = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) reject(new Error('Browser does not support geolocation APIs'))
          else navigator.geolocation.getCurrentPosition(resolve, reject)
        })
        const geohash = Geohash.encode(coords.latitude, coords.longitude, 6)
        return this.reRender(p => ({...p, geohash }))
      } catch (err) { console.error('FetchLocation failed', err) }
    }
  }
})
