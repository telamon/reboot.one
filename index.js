import Tonic from '@socketsupply/tonic'
import { nip19 } from 'nostr-tools'
import {
  ProfileFinder,
  nostrQuery,
  nostrStream,
  decoratePOP0101,
  parseContent,
  emoOf,
  geoCode,
  shareIt,
  storeSecret,
  getSecret,
  updateProfileNP,
  postNote
} from './tools.js'
import Geohash from 'latlon-geohash'
import { decodeASL, flagOf, roll } from 'powmem'
import { schnorr } from '@noble/curves/secp256k1'
import { bytesToHex } from '@noble/hashes/utils'

const pman = ProfileFinder.singleton()
const TAGS = ['reboot', 'reroll']

Tonic.add(class GuestBook extends Tonic {
  #posts = []
  render () {
    const posts = this.#posts.map(p => this.html`
      <book-post event=${p} rl="1"></book-post>
    `)
    return this.html`
      <post-form></post-form>
      <h3>Senaste Inlägg (${this.#posts.length + ''}st)</h3>
      ${posts}
    `
  }

  renderPostDialog () {
    return this.html`
      <dialog id="postDialog">
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
  }
})

async function fileToDataURL (file) {
  return new Promise(resolve => {
    const fr = new globalThis.FileReader()
    fr.onloadend = () => resolve(fr.result)
    fr.readAsDataURL(file)
  })
}
Tonic.add(class PostForm extends Tonic {
  async * render () {
    yield this.html`
      <sub>Loading...</sub>
      <author class="flex row space-between xcenter wrap">
        <div class="placeholder" style="background-color: #888"></div>
      </author>
    `
    const secret = await getSecret()
    let authorProfile = this.html`
      <sub>Logga in</sub>
      <author class="flex row space-between xcenter wrap">
        <button id="btn-p-gen">generera</button>
        <div>
          <input type="text" id="inp-sk-import" placeholder="Klistra in din nsec..."/>
          <button>importera</button>
        </div>
      </author>
    `
    if (secret) {
      const pubkey = bytesToHex(schnorr.getPublicKey(secret))
      const profile = (await pman.profileOfQuick(pubkey)) || {}
      const name = this.props.inputName || profile.display_name || profile.name || profile.username
      const color = pubkey.slice(0, 6)
      const purl = this.props.inputPicture ? await fileToDataURL(this.props.inputPicture) : profile.picture
      const picture = profile.picture
        ? this.html`<div class="portrait"><img src="${purl}" /></div>`
        : this.html`<div class="placeholder" style="background-color: #${color}"></div> `
      const asl = decodeASL(pubkey)
      const flag = flagOf(asl.location)
      const location = geoCode(asl.location)
      const sex = ['Kvinna', 'Man', 'Ickebinär', 'Robot'][asl.sex]
      const age = ['16', '24', '32', '48'][asl.age]
      const { profileDirty, saving } = this.props
      const saveEnabled = profileDirty && !saving ? '' : 'disabled'
      authorProfile = this.html`
        <sub>Inloggad som</sub>
        <author class="flex row space-between xcenter wrap">
          <div class="flex column">
            ${picture}
            <input type="hidden" id="inp-profile-url" value="${profile.picture}"/>
          </div>
            <input type="file" id="inp-profile-upload" style="display: none" />
            <label>
              <input type="text" id="inp-profile-name" value="${name}" placeholder="${'Anonym-' + pubkey.slice(0, 4)}"/>
            </label>
          <div class="flex column xcenter">
            <div>
              ${age}+ ${sex} <span title="${asl.location}">${flag}</span> ${location}
            </div>
            <small class="subl">${pubkey.slice(0, 24)}</small>
          </div>
          <div>
            <button id="btn-save-profile" class="go" ${saveEnabled} ${saving && 'aria-busy=true'}>
              ${saving ? 'sparar' : 'spara'}
            </button>
          </div>
        </author>
      `
    }
    const { isPosting } = this.props
    const attrD = !secret || isPosting ? 'disabled=true' : ''
    return this.html`
      <div id="post-form">
        ${authorProfile}
        <br/>
        <h1>Gästboken</h1>
        <!-- ${this.replyTo ? 'Nytt Inlägg' : 'Re:' + this.replyTo} -->
          <textarea id="note-area" ${attrD} rows="8" style="width: 100%;" placeholder="Lämmna en kommentar här eller tagga med #reboot för att synas"></textarea>
        <!--<button id="submit">Skicka</button>-->
        <div class="flex row center"><button class="post-btn biff" ${attrD} ${isPosting ? 'aria-busy=true' : ''}>Skapa Inlägg</button></div>
      </div>
    `
  }

  async click (ev) {
    if (
      Tonic.match(ev.target, 'div.portrait img') ||
      Tonic.match(ev.target, '.placeholder')
    ) {
      ev.preventDefault()
      this.querySelector('#inp-profile-upload').click()
    }
    if (Tonic.match(ev.target, '#btn-p-gen')) {
      ev.preventDefault()
      document.getElementById('keygen').show(true)
    }
    if (Tonic.match(ev.target, '#btn-save-profile')) {
      ev.preventDefault()
      this.reRender(p => ({ ...p, saving: true }))
      await updateProfileNP(
        this.querySelector('#inp-profile-name').value,
        this.props.inputPicture
      )
      this.reRender(p => ({ ...p, profileDirty: false, inputName: null, inputPicture: null, saving: false }))
    }
    if (Tonic.match(ev.target, 'button.post-btn')) {
      ev.preventDefault()
      console.log('Post button')
      this.reRender(p => ({ ...p, isPosting: true }))
      await postNote(this.querySelector('#note-area').value, [
        ['t', 'reboot']
      ])
      this.reRender(p => ({ ...p, isPosting: false }))
    }
  }

  change (ev) {
    const { target } = ev
    if (Tonic.match(target, '#inp-profile-upload')) {
      ev.preventDefault()
      // ev.target payload => nostr.build
      console.log('picture upload', ev)
      const [file] = target.files
      if (!file) return
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return
      this.reRender(p => ({ ...p, profileDirty: true, inputPicture: file }))
    }
    if (Tonic.match(target, '#inp-profile-name')) {
      ev.preventDefault()
      this.reRender(p => ({ ...p, profileDirty: true, inputName: ev.target.value }))
    }
    if (Tonic.match(target, '#note-area')) {
      this.querySelector('button.post-btn').disabled = !target.value?.length
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

    const { content, images } = parseContent(event.content)
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
    let profile
    yield this.populate(event, profile, replies)
    try {
      profile = await pman.profileOf(event.pubkey)
      yield this.populate(event, profile, replies)
    } catch (error) { console.error('profileOf:Error:', error) }

    if (rl) {
      // Lazy workaround for lack of node-tree
      try {
        replies = await nostrQuery([{ kinds: [1], '#e': [event.id] }])
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
    if (d.open) d.close()
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
  async connected () {
    const secret = await getSecret()
    this.reRender(p => ({ ...p, secret }))
  }

  render () {
    this.props.geohash ||= 'u628' // gbg
    this.props.hashRate ||= 0
    this.props.selectedCell ||= 5
    const { geohash, hashRate, isMining, secret, ulock, selectedCell } = this.props

    const state = isMining ? 1 : secret ? 2 : 0
    let content
    if (state === 0) {
      const geoLabel = geoCode(geohash)
      const flag = flagOf(geohash)
      const astd = (s, a, d) => this.html`
        <td
          data-v="${(s | a << 2) + ''}"
          ${selectedCell === (s | a << 2) ? 'selected' : ''}
          ${d ? 'data-disabled=true' : ''}>
          ${emoOf(s, a)}
        </td>
      `
      content = this.html`
        <h1>Utfärda Identitet</h1>
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
          <!-- <tr>
            ${astd(3, 0, true)}${astd(3, 1, true)}${astd(3, 2, true)}${astd(3, 3, true)}
          </tr> -->
        </table>
        <br>
        <hr />
        <br>
        <p><strong>Plats</strong></p>
        <div class="flex row space-around">
          <input id="geohash-input" type="text"
            ${ulock ? '' : 'disabled="true"'}
            value="${geohash}"/>
          <p class="geo-desc">${flag} ${geoLabel}</p>
        </div>
        <button id="btn-gps">Hämta Plats</button>
        <hr />
        <div class="flex row">
          <button id="btn-close" class="glitch">Stäng</button>
          <button id="btn-generate" class="go">Generera</button>
        </div>
      `
    } else if (state === 1) {
      content = this.html`
        <h1>Söker...</h1>
        <img class="asciiloader" src="https://camo.githubusercontent.com/cab6fe7bb1021d845cb67eae7c618dd09ca6ec53f028a5349cf3ceae47d6f889/687474703a2f2f692e696d6775722e636f6d2f6c6e636270426d2e676966"/>
        <pre><code>${hashRate.toFixed(2)} nycklar/s</code></pre>
        <button id="btn-generate" class="glitch">Avbryt</button>
      `
    } else { // state 2: Secret found
      const phex = bytesToHex(schnorr.getPublicKey(secret))
      const nsec = nip19.nsecEncode(secret)
      const npub = nip19.npubEncode(phex)
      const { sex, age, location } = decodeASL(phex)
      const slur = ['sassy', 'stilig', 'ball', 'odefinierad'][sex]
      content = this.html`
        <h1>Identitet Utfärdad</h1>
        <!-- <h4>${emoOf(sex, age)} ${flagOf(location)} ${geoCode(location)}</h4> -->
        <p>
          Grattis, du har funnit en ${slur} nyckel:<br/>
        </p>
        <div class="flex col">
          <div>⚿ Hemligheten <small class="sublm">(håll hårt)</small></div>
          <pre class="bq sk"><code>${nsec}</code></pre>
          <div class="flex row end xcenter">
            <a role="button"
              href="data:text/plain,${secret}"
              download="secret-${phex.slice(0, 6)}.txt">
              Spara
            </a>
            <a role="button"
              href="https://iris.to/#${nsec}"
              target="_blank">
              iris
            </a>
          </div>
          <br/>
          <hr/>
          <br/>
          <br/>
          <div>⚿ Publik <small class="sublm">(ge bort till kompis)</small></div>
          <pre class="bq pk"><code>${npub}</code></pre>
          <div class="flex row end xcenter">
            <a role="button" data-share="${npub}">Dela</a>
          </div>
        </div>
        <div class="flex row center">
          <button id="btn-erase" class="glitch">Radera</button>
          <button id="btn-close" class="go">Stäng</button>
        </div>
      `
    }
    return this.html`
      <div class="flex col xcenter">
        ${content}
      </div>
    `
  }

  change (ev) {
    console.log('onchange', ev.target)
    if (Tonic.match(ev.target, '#geohash-input')) {
      return this.reRender(p => ({ ...p, geohash: ev.target.value }))
    }
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
        return this.reRender(p => ({ ...p, geohash }))
      } catch (err) {
        console.error('FetchLocation failed', err)
        return this.reRender(p => ({ ...p, ulock: true }))
      }
    }
    if (Tonic.match(ev.target, '#btn-generate')) return this.toggleGenerate(ev)
    if (Tonic.match(ev.target, '[data-share]')) {
      ev.preventDefault()
      try {
        const code = await shareIt(ev.target.dataset.share)
        if (code === 1) globalThis.alert('Copied to clipboard')
      } catch (error) { console.error('Share Failed', error) }
    }
    if (Tonic.match(ev.target, '#btn-close')) {
      ev.preventDefault()
      document.getElementById('keygen').close()
    }

    if (Tonic.match(ev.target, '#btn-erase')) {
      if (window.confirm('Har du sparat backup?\nTryck på OK för att radera allt och ladda om')) {
        window.localStorage.clear()
        window.location.reload()
      }
    }
  }

  toggleGenerate (event) {
    event?.preventDefault()
    const setMiningState = isMining => this.reRender(p => ({ ...p, isMining }))
    if (this.props.isMining) { // -- STOP KEYGEN
      console.log('KEYGEN: STOP')
      setMiningState(false)
    } else { // -- START KEYGEN
      console.log('KEYGEN: START')
      const { selectedCell, geohash } = this.props
      const sex = selectedCell & 0b11
      const age = (selectedCell >> 2) & 0b11
      const bits = 15
      const mute = true
      console.log('Generating', age, sex, geohash, mute, bits)
      let secret = null
      const start = performance.now()
      let keysTested = 0
      const testCount = 1000
      // if (!mute) await initSound(burn ? 24000 : 48000)
      setMiningState(true)
      const rollLoop = () => setTimeout(() => {
        if (!secret && this.props.isMining) {
          secret = roll(age, sex, geohash, bits, testCount)
          keysTested += testCount
          const hashRate = keysTested / (performance.now() - start)
          this.reRender(p => ({ ...p, hashRate: hashRate * 1000 }))
        }
        // Auto-restart/stop
        if (!secret && this.props.isMining) rollLoop()
        else {
          if (secret) {
            console.log('Secret Found!',
              bytesToHex(schnorr.getPublicKey(secret)),
              nip19.nsecEncode(secret)
            )
            storeSecret(secret)
              .then(() => console.log('Secret stored'))
              .catch(err => console.error('Failed storing secret', err))
              .then(() => document.querySelector('post-form').reRender())
            this.reRender(p => ({ ...p, isMining: false, secret }))
          } else setMiningState(false)
        }
      }, 30)
      rollLoop()
    }
  }
})

Tonic.add(class KeygenButton extends Tonic {
  render () { return this.html`<button class="biff">Utfärda Identitet</button>` }
  click (ev) { if (Tonic.match(ev.target, 'button')) document.getElementById('keygen').show(true) }
})
