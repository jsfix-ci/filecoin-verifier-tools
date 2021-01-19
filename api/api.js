const { mainnet } = require('@filecoin-shipyard/lotus-client-schema')
const methods = require('../filecoin/methods')
const { BrowserProvider } = require('@filecoin-shipyard/lotus-client-provider-browser')
const { NodejsProvider } = require('@filecoin-shipyard/lotus-client-provider-nodejs')
const { LotusRPC } = require('@filecoin-shipyard/lotus-client-rpc')
const cbor = require('cbor')

class VerifyAPI {
  constructor(lotusClient, walletContext, testnet = true) {
    this.methods = testnet ? methods.testnet : methods.mainnet
    this.client = lotusClient
    this.walletContext = walletContext
  }

  static standAloneProvider(lotusEndpoint, token) {
    var provider = new NodejsProvider(lotusEndpoint, token)
    return new LotusRPC(provider, { schema: mainnet.fullNode })
  }

  static browserProvider(lotusEndpoint, token) {
    var provider = new BrowserProvider(lotusEndpoint, token)
    return new LotusRPC(provider, { schema: mainnet.fullNode })
  }

  async load(a) {
    const res = await this.client.chainGetNode(a)
    return res.Obj
  }

  async getPath(addr, path) {
    const head = await this.client.chainHead()
    const state = head.Blocks[0].ParentStateRoot['/']
    return (await this.client.chainGetNode(`${state}/1/@Ha:${addr}/${path}`)).Obj
  }

  async listVerifiers() {
    const verifiers = await this.getPath(this.methods.VERIFREG, '1/1')
    const listOfVerifiers = await this.methods.buildArrayData(verifiers, a => this.load(a))
    const returnList = []
    for (const [key, value] of listOfVerifiers) {
      returnList.push({
        verifier: key,
        datacap: value.toString(10),
      })
    }
    return returnList
  }

  async checkVerifier(verifierAddress) {
    // empty array if not verifier is present
    const lst = await this.listVerifiers()
    return lst.filter(({ verifier }) => verifier.toString() === verifierAddress)
  }

  checkWallet(wallet) {
    if (!wallet && !this.walletContext) { throw new Error('No wallet context defined in API') }
    return wallet || this.walletContext
  }

  async proposeVerifier(verifierAccount, datacap, indexAccount, wallet) {
    // Not address but account in the form "t01004", for instance
    const tx = this.methods.rootkey.propose(this.methods.verifreg.addVerifier(verifierAccount, datacap))
    const res = await this.methods.sendTx(this.client, indexAccount, this.checkWallet(wallet), tx)
    // res has this shape: {/: "bafy2bzaceb32fwcf7uatfxfs367f3tw5yejcresnw4futiz35heb57ybaqxvu"}
    // we return the messageID
    return res['/']
  }

  async send(tx, indexAccount, wallet) {
    const res = await this.methods.sendTx(this.client, indexAccount, this.checkWallet(wallet), tx)
    return res['/']
  }

  async getReceipt(id) {
    return this.methods.getReceipt(this.client, id)
  }

  async approveVerifier(verifierAccount, datacap, fromAccount, transactionId, indexAccount, wallet) {
    // Not address but account in the form "t01003", for instance
    const add = this.methods.verifreg.addVerifier(verifierAccount, datacap)

    // let tx = this.methods.rootkey.approve(0, {...add, from: "t01001"})
    const tx = this.methods.rootkey.approve(parseInt(transactionId, 10), { ...add, from: fromAccount })
    console.log(tx)

    const res = await this.methods.sendTx(this.client, indexAccount, this.checkWallet(wallet), tx)
    // res has this shape: {/: "bafy2bzaceb32fwcf7uatfxfs367f3tw5yejcresnw4futiz35heb57ybaqxvu"}
    // we return the messageID
    return res['/']
  }

  async listVerifiedClients() {
    const verified = await this.getPath(this.methods.VERIFREG, '1/2')
    const listOfVerified = await this.methods.buildArrayData(verified, a => this.load(a))
    const returnList = []
    for (const [key, value] of listOfVerified) {
      returnList.push({
        verified: key,
        datacap: value.toString(10),
      })
    }
    return returnList
  }

  async listRootkeys() {
    return this.listSigners(this.methods.ROOTKEY)
  }

  async listSigners(addr) {
    const data = await this.getPath(addr, '1')
    const info = this.methods.decode(this.methods.msig_state, data)
    return info.signers
  }

  async actorType(addr) {
    return this.getPath(addr, '0')
  }

  async actorAddress(str) {
    const head = await this.client.chainHead()
    return this.client.stateLookupID(str, head.Cids)
  }

  async actorKey(str) {
    try {
      const head = await this.client.chainHead()
      const res = await this.client.stateAccountKey(str, head.Cids)
      return res
    } catch (err) {
      console.log('Cannot convert to key', err)
      return str
    }
  }

  async checkClient(clientAddress) {
    return this.listVerifiedClients
      .filter(client => client[0].toString() === clientAddress)
  }

  async verifyClient(clientAddress, datacap, indexAccount, wallet) {
    const arg = this.methods.verifreg.addVerifiedClient(clientAddress, datacap)
    const res = await this.methods.sendTx(this.client, indexAccount, this.checkWallet(wallet), arg)
    // res has this shape: {/: "bafy2bzaceb32fwcf7uatfxfs367f3tw5yejcresnw4futiz35heb57ybaqxvu"}
    // we return the messageID
    return res['/']
  }

  async approvePending(msig, tx, from, wallet) {
    const m1_actor = this.methods.actor(msig, this.methods.multisig)
    await this.send(m1_actor.approve(parseInt(tx.id), tx.tx), from, wallet)
  }

  async multisigProposeClient(m0_addr, m1_addr, client, cap, from, wallet) {
    const amount = cap * 1073741824n // 1 GiB
    const m0_actor = this.methods.actor(m0_addr, this.methods.multisig)
    const m1_actor = this.methods.actor(m1_addr, this.methods.multisig)
    const tx = this.methods.verifreg.addVerifiedClient(client, amount)
    const tx2 = m0_actor.propose(tx)
    return await this.send(m1_actor.propose(tx2), from, wallet)
  }

  async newMultisig(signers, threshold, cap, from, wallet) {
    const tx = this.methods.init.exec(this.methods.multisigCID, this.methods.encode(this.methods.msig_constructor, [signers, threshold, cap, 1000]))
    const txid = await this.send({ ...tx, value: cap }, from, wallet)
    const receipt = await this.getReceipt(txid)
    const [addr] = this.methods.decode(['list', 'address'], cbor.decode(Buffer.from(receipt.Return, 'base64')))
    return addr
  }

  async multisigAdd(addr, signer, from, wallet) {
    const actor = this.methods.actor(addr, this.methods.multisig)
    const tx = actor.propose(actor.addSigner(signer, false))
    const txid = await this.send(tx, from, wallet)
    return this.getReceipt(txid)
  }

  async pendingRootTransactions() {
    return this.pendingTransactions(this.methods.ROOTKEY)
  }

  async multisigInfo(addr) {
    const data = await this.getPath(addr, '1')
    return this.methods.decode(this.methods.msig_state, data)
  }

  async pendingTransactions(addr) {
    const data = await this.getPath(addr, '1/6')
    const info = this.methods.decode(this.methods.pending, data)
    const obj = await info.asObject(a => this.load(a))
    const returnList = []
    for (const [k, v] of Object.entries(obj)) {
      const parsed = this.methods.parse(v)
      returnList.push({
        id: parseInt(k),
        tx: { ...v, from: v.signers[0] },
        parsed,
        signers: v.signers,
      })
    }
    return returnList
  }
}

module.exports = VerifyAPI
