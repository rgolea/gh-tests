import { transactions as nearTransactions, utils } from "near-api-js";
import isMobile from "is-mobile";
import {
  WalletModule,
  WalletBehaviourFactory,
  AccountState,
  InjectedWallet,
  transformActions,
  waitFor,
  errors,
} from "@near-wallet-selector/core";

import { InjectedMathWallet } from "./injected-math-wallet";

declare global {
  interface Window {
    nearWalletApi: InjectedMathWallet | undefined;
  }
}

export interface MathWalletParams {
  iconUrl?: string;
}

const MathWallet: WalletBehaviourFactory<InjectedWallet> = ({
  options,
  metadata,
  provider,
  emitter,
  logger,
}) => {
  let _wallet: InjectedMathWallet | null = null;

  const isInstalled = async () => {
    try {
      return await waitFor(() => !!window.nearWalletApi);
    } catch (e) {
      logger.log("MathWallet:isInstalled:error", e);

      return false;
    }
  };

  const cleanup = () => {
    _wallet = null;
  };

  const getAccounts = (): Array<AccountState> => {
    if (!_wallet?.signer.account) {
      return [];
    }

    const accountId =
      "accountId" in _wallet.signer.account
        ? _wallet.signer.account.accountId
        : _wallet.signer.account.name;

    return [{ accountId }];
  };

  const getSignedInAccount = () => {
    if (_wallet?.signer.account && "accountId" in _wallet.signer.account) {
      return _wallet.signer.account;
    }

    return null;
  };

  const setupWallet = async (): Promise<InjectedMathWallet> => {
    if (_wallet) {
      return _wallet;
    }

    const installed = await isInstalled();

    if (!installed) {
      throw errors.createWalletNotInstalledError(metadata);
    }

    const wallet = window.nearWalletApi!;

    // This wallet currently has weird behaviour regarding signer.account.
    // - When you initially sign in, you get a SignedInAccount interface.
    // - When the extension loads after this, you get a PreviouslySignedInAccount interface.
    // This method normalises the behaviour to only return the SignedInAccount interface.
    if (wallet.signer.account && "address" in wallet.signer.account) {
      await wallet.login({ contractId: options.contractId });
    }

    _wallet = wallet;

    return wallet;
  };

  const getWallet = (): InjectedMathWallet => {
    if (!_wallet) {
      throw new Error(`${metadata.name} not connected`);
    }

    return _wallet;
  };

  return {
    getDownloadUrl() {
      return "https://chrome.google.com/webstore/detail/math-wallet/afbcbjpbpfadlkmhmclhkeeodmamcflc";
    },

    isAvailable() {
      return !isMobile();
    },

    async connect() {
      const wallet = await setupWallet();
      const existingAccounts = getAccounts();

      if (existingAccounts.length) {
        return existingAccounts;
      }

      await wallet.login({ contractId: options.contractId }).catch((err) => {
        this.disconnect();

        throw err;
      });

      const newAccounts = getAccounts();
      emitter.emit("connected", { accounts: newAccounts });

      return newAccounts;
    },

    // Must only trigger "disconnected" if we were connected.
    async disconnect() {
      if (!_wallet) {
        return;
      }

      if (!_wallet.signer.account) {
        return cleanup();
      }

      // Ignore if unsuccessful (returns false).
      await _wallet.logout();
      cleanup();

      emitter.emit("disconnected", null);
    },

    async getAccounts() {
      return getAccounts();
    },

    async signAndSendTransaction({
      signerId,
      receiverId = options.contractId,
      actions,
    }) {
      logger.log("MathWallet:signAndSendTransaction", {
        signerId,
        receiverId,
        actions,
      });

      const wallet = getWallet();
      const { accountId, publicKey } = getSignedInAccount()!;
      const [block, accessKey] = await Promise.all([
        provider.block({ finality: "final" }),
        provider.viewAccessKey({ accountId, publicKey }),
      ]);

      logger.log("MathWallet:signAndSendTransaction:block", block);
      logger.log("MathWallet:signAndSendTransaction:accessKey", accessKey);

      const transaction = nearTransactions.createTransaction(
        accountId,
        utils.PublicKey.from(publicKey),
        receiverId,
        accessKey.nonce + 1,
        transformActions(actions),
        utils.serialize.base_decode(block.header.hash)
      );

      const [hash, signedTx] = await nearTransactions.signTransaction(
        transaction,
        wallet.signer,
        accountId
      );

      logger.log("MathWallet:signAndSendTransaction:hash", hash);

      return provider.sendTransaction(signedTx);
    },

    async signAndSendTransactions({ transactions }) {
      logger.log("MathWallet:signAndSendTransactions", { transactions });

      const wallet = getWallet();
      const { accountId, publicKey } = getSignedInAccount()!;
      const [block, accessKey] = await Promise.all([
        provider.block({ finality: "final" }),
        provider.viewAccessKey({ accountId, publicKey }),
      ]);

      logger.log("MathWallet:signAndSendTransactions:block", block);
      logger.log("MathWallet:signAndSendTransactions:accessKey", accessKey);

      const signedTransactions: Array<nearTransactions.SignedTransaction> = [];
      let nonce = accessKey.nonce;

      for (let i = 0; i < transactions.length; i++) {
        const transaction = nearTransactions.createTransaction(
          accountId,
          utils.PublicKey.from(publicKey),
          transactions[i].receiverId,
          ++nonce,
          transformActions(transactions[i].actions),
          utils.serialize.base_decode(block.header.hash)
        );

        const [hash, signedTx] = await nearTransactions.signTransaction(
          transaction,
          wallet.signer,
          accountId
        );

        logger.log("MathWallet:signAndSendTransactions:hash", hash);

        signedTransactions.push(signedTx);
      }

      logger.log(
        "MathWallet:signAndSendTransactions:signedTransactions",
        signedTransactions
      );

      return Promise.all(
        signedTransactions.map((tx) => provider.sendTransaction(tx))
      );
    },
  };
};

export function setupMathWallet({
  iconUrl = "./assets/math-wallet-icon.png",
}: MathWalletParams = {}): WalletModule<InjectedWallet> {
  return {
    id: "math-wallet",
    type: "injected",
    name: "Math Wallet",
    description: null,
    iconUrl,
    wallet: MathWallet,
  };
}
