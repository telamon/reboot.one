<script>
import { writable } from 'svelte/store'
import { decodeASL, flagOf } from 'powmem'
import {
  generatePrivateKey,
  getPublicKey,
  relayInit,
  getEventHash,
  signEvent,
  SimplePool
} from 'nostr-tools'
let pool = null
import Widget from '../../nostr-chat-widget/src/Widget.svelte'
const relays = 'wss://relay.f7z.io,wss://nos.lol,wss://relay.nostr.info,wss://nostr-pub.wellorder.net,wss://relay.current.fyi,wss://relay.nostr.band'.split(',')

const chatTags = ['reboot']
/*const relays = [
  'wss://relay.f7z.io',
  'wss://relay.nostr.info',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.current.fyi',
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://nos.lol'
]*/
const TAGS = ['reboot']
const posts = writable([])
/**
 * Connects to nostr network
 */
function initPool () {
  if (pool) return pool
  console.info('Connecting to relays', relays)
  pool = new SimplePool()

  const filters = [
    { kinds: [1], '#t': TAGS }
  ]
  const sub = pool.sub(relays, filters)

  sub.on('event', event => {
    const { pubkey, tags } = event
    const hashtag = tags.find(t => t[0] === 't' && ~TAGS.indexOf(t[1]))
    if (hashtag) {
      console.info('post', hashtag, pubkey, event)
      const { age, sex, location } = decodeASL(event.pubkey)
      event.age = [16, 24, 32, 48][age]
      event.sex = ['F', 'P', 'IB', 'R'][sex] // ['👩', '👨', '🧑', '🤖'][sex]
      event.flag = flagOf(location)
      posts.update(ps => [...ps, event])
    }
  })
  return pool
}
/*
let relay, sk, pk
const posts = writable([])

function loadId2 () {
  sk = window.localStorage.getItem('sk')
  if (!sk) {
    sk = generatePrivateKey()
    window.localStorage.setItem('sk', sk)
  }
  pk = getPublicKey(sk) // `pk` is a hex string
  console.log('Interdimensional Identity (id²)', typeof sk, sk, pk)
}
main()
*/
initPool()
</script>

<main>
<h1>Nyheter</h1>
<!-- [{$posts.length} inlägg] -->

  <Widget
    websiteOwnerPubkey="npub1q9y3wrl83vrpeek8990l7td2xqlhzzap0m7clt7cxsef9dpft6zq9lwty4"
    chatType="GLOBAL"
    chatTags={chatTags}
    chatReferenceTags={[]}
    relays={relays}
    />
<!--
{#each $posts as item}
  <article>
    <samp>Skrivet av {item.sex}{item.age}</samp>
    <date>{new Date(item.created_at)}</date>
    <p>{item.content}</p>
  </article>
{/each}
-->
</main>

<style>
</style>
