
const { LotusRPC } = require('@filecoin-shipyard/lotus-client-rpc')
const { NodejsProvider: Provider } = require('@filecoin-shipyard/lotus-client-provider-nodejs')
const { testnet } = require('@filecoin-shipyard/lotus-client-schema')
const hamt = require('../../hamt/hamt')
// const CID = require('cids')
const fs = require('fs')
const constants = require('../constants')

const endpointUrl = constants.lotus_endpoint
const tokenPath = constants.token_path

const provider = new Provider(endpointUrl, {
  token: async () => {
    return fs.readFileSync(tokenPath)
  },
})

const client = new LotusRPC(provider, { schema: testnet.fullNode })

async function load (a) {
  const res = await client.chainGetNode(a)
  return res.Obj
}

async function run () {
  while (true) {
    const head = await client.chainHead()
    const state = head.Blocks[0].ParentStateRoot['/']
    console.log('height', head.Height, state)
    const verified = (await client.chainGetNode(`${state}/@Ha:t06/1/2`)).Obj
    console.log(JSON.stringify(verified, null, 2))
    await hamt.printData(verified, load)

    console.log(await hamt.buildArrayData(verified, load))

    await new Promise(resolve => { setTimeout(resolve, 1000) })
  }
}

run()
