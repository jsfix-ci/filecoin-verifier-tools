const VerifyAPI = require('../../api/api.js')
const methods = require('../../filecoin/methods.js')
const MockWallet = require('../mockWallet')
const fs = require('fs')
const constants = require('../constants')

const endpointUrl = constants.lotus_endpoint
const tokenPath = constants.token_path

const mockWallet = new MockWallet(constants.rootkey_mnemonic, constants.rootkey_path)

const api = new VerifyAPI(VerifyAPI.standAloneProvider(endpointUrl, {
  token: async () => {
    return fs.readFileSync(tokenPath)
  },
}), mockWallet)

async function main() {
  const tx = methods.rootkey.addSigner(process.argv[2], false)
  console.log(tx)
  const tx2 = methods.rootkey.propose(tx)
  console.log(tx2)
  console.log(methods.parse(tx2))
  await api.send(tx2, 2)
  process.exit(0)
}

main()
