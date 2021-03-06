import BigNumber from 'bignumber.js';

import logger from './utils/logger';

class PaymentChannel {
  /**
   * @param {string|number} channelId
   * @param {Web3} web3
   * @param {Account} account
   * @param {ServiceClient} service
   * @param {MPEContract} mpeContract
   */
  constructor(channelId, web3, account, service, mpeContract) {
    this._channelId = channelId;
    this._web3 = web3;
    this._account = account;
    this._mpeContract = mpeContract;
    this._serviceClient = service;
    this._state = {
      nonce: new BigNumber(0),
      lastSignedAmount: new BigNumber(0),
    };
  }

  /**
   * @type {BigNumber}
   */
  get channelId() {
    return this._channelId;
  }

  /**
   * @type {PaymentChannelState}
   */
  get state() {
    return this._state;
  }

  /**
   * Adds fund to the payment channel
   * @param {BigNumber} amount
   * @returns {Promise.<TransactionReceipt>}
   */
  async addFunds(amount) {
    return this._mpeContract.channelAddFunds(this._account, this.channelId, amount);
  }

  /**
   * Extends the expiry of the payment channel
   * @param {BigNumber} expiration - Expiry in terms of block number
   * @returns {Promise.<TransactionReceipt>}
   */
  async extendExpiration(expiration) {
    return this._mpeContract.channelExtend(this._account, this.channelId, expiration);
  }

  /**
   * Extends the expiry of the payment channel and add funds to it
   * @param {BigNumber} expiration
   * @param {BigNumber} amount
   * @returns {Promise.<TransactionReceipt>}
   */
  async extendAndAddFunds(expiration, amount) {
    return this._mpeContract.channelExtendAndAddFunds(this._account, this.channelId, expiration, amount);
  }

  /**
   * Updates the state of the payment channel by fetching latest info from the mpe contract and the ai service daemon
   * @returns {Promise<PaymentChannel>}
   */
  async syncState() {
    logger.debug(`Syncing PaymentChannel[id: ${this._channelId}] state`, { tags: ['PaymentChannel']})
    const latestChannelInfoOnBlockchain = await this._mpeContract.channels(this.channelId);
    const currentState = await this._currentChannelState();
    const { lastSignedAmount, nonce: currentNonce } = currentState;
    const { nonce, expiration, value: totalAmount } = latestChannelInfoOnBlockchain;
    const availableAmount = totalAmount - lastSignedAmount;
    this._state = {
      nonce,
      currentNonce,
      expiration,
      totalAmount,
      lastSignedAmount,
      availableAmount,
    };
    return this;
  }

  async _currentChannelState() {
    logger.debug(`Fetching latest PaymentChannel[id: ${this.channelId}] state from service daemon`, { tags: ['PaymentChannel'] });
    try {
      const response = await this._serviceClient.getChannelState(this.channelId);
      const nonce = PaymentChannel._uint8ArrayToBN(response.getCurrentNonce());
      const currentSignedAmount = PaymentChannel._uint8ArrayToBN(response.getCurrentSignedAmount());
      const channelState = {
        lastSignedAmount: currentSignedAmount,
        nonce,
      };
      logger.debug(`Latest PaymentChannel[id: ${this.channelId}] state: {lastSignedAmount: ${currentSignedAmount}, nonce: ${nonce}}`, { tags: ['PaymentChannel'] });
      return Promise.resolve(channelState);
    } catch(err) {
      logger.error(`Failed to fetch latest PaymentChannel[id: ${this.channelId}] state from service daemon. ${err.message}`, { tags: ['PaymentChannel'] });
      return Promise.reject(err);
    }
  }

  static _uint8ArrayToBN(uint8Array) {
    const buffer = Buffer.from(uint8Array);
    const hex = `0x${buffer.toString('hex')}`;
    return new BigNumber(hex);
  }
}

export default PaymentChannel;
