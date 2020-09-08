const signer = require('@zondax/filecoin-signing-tools')

class MockWallet {
  constructor(mnemonic, path) {
    this.mnemonic = mnemonic
    this.path = path
  }

  async getAccounts(nStart = 0, nEnd = 5) {
    const accounts = []
    for (let i = nStart; i < nEnd; i += 1) {
      accounts.push(
        signer.keyDerive(this.mnemonic, `${this.path}${i}`, '').address,
      )
    }
    return accounts
  }

  async sign(filecoinMessage, indexAccount) {
    const private_hexstring = signer.keyDerive(this.mnemonic, this.path + indexAccount.toString(), '').private_hexstring

    console.log(private_hexstring)

    return signer.transactionSignLotus(
      filecoinMessage,
      Buffer.from(private_hexstring, 'hex'),
    )
  }
}

module.exports = MockWallet
