<script>
/*
import { writable } from 'svelte/store'
import {
  generatePrivateKey,
  getPublicKey,
  relayInit,
  getEventHash,
  signEvent,
  SimplePool
} from 'nostr-tools'

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

// const relays = ['wss://relay.example.com', 'wss://relay.example2.com']
async function loadNoint () {
  console.log('Connecting noint')
  const relays = ['wss://relay.damus.io', 'wss://eden.nostr.land']
  relay = relayInit(relays[0]) // TODO: math.random()
  relay.on('connect', () => {
    console.log(`connected to ${relay.url}`)
  })
  relay.on('error', () => {
    console.log(`failed to connect to ${relay.url}`)
  })

  await relay.connect()

  let sub = relay.sub([
    {
      kinds: [1],
      authors: ['#reboot']
    }
  ])

  sub.on('event', event => {
    console.log('we got the event we wanted:', event)
  })
  sub.on('eose', () => { sub.unsub() })


  sub.on('event', event => {
    console.log('got event:', event)
  })
  // let event = {
  //   kind: 1,
  //   pubkey: pk,
  //   created_at: Math.floor(Date.now() / 1000),
  //   tags: [],
  //   content: 'hello world'
  // }
  // event.id = getEventHash(event)
  // event.sig = signEvent(event, sk)
}

async function main () {
loadId2()
await loadNoint()
console.log('Kernel booted')
}

main()
*/

import Widget from '../../nostr-chat-widget/src/Widget.svelte'
const relays = 'wss://relay.f7z.io,wss://nos.lol,wss://relay.nostr.info,wss://nostr-pub.wellorder.net,wss://relay.current.fyi,wss://relay.nostr.band'.split(',')

const chatTags = ['reboot']
</script>

<main>
  <Widget
    websiteOwnerPubkey="npub1q9y3wrl83vrpeek8990l7td2xqlhzzap0m7clt7cxsef9dpft6zq9lwty4"
    chatType="GLOBAL"
    chatTags={chatTags}
    chatReferenceTags={[]}
    relays={relays}
    />
<!--
{#each $posts as item}
  <li>{item}</li>
{/each}
-->
</main>

<style>
</style>
