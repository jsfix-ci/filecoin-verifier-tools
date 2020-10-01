
const { LotusRPC } = require('@filecoin-shipyard/lotus-client-rpc')
const { NodejsProvider: Provider } = require('@filecoin-shipyard/lotus-client-provider-nodejs')
const { testnet } = require('@filecoin-shipyard/lotus-client-schema')
const methods = require('../../filecoin/methods').testnet
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

async function load(a) {
  const res = await client.chainGetNode(a)
  return res.Obj
}

const schema = {
  type: 'hamt',
  key: 'address',
  value: 'bigint',
}

async function run() {
  const head = await client.chainHead()
  console.log('height', head.Height)
  const state = head.Blocks[0].ParentStateRoot['/']
  const clients = (await client.chainGetNode(`${state}/@Ha:t06/1/2`)).Obj
  const dta = methods.decode(schema, clients)
  for (const [it] of await dta.asList(load)) {
    console.log(it)
  }
  await provider.destroy()
}

run()
