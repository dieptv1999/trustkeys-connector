import { AbstractConnectorArguments, ConnectorUpdate } from "@web3-react/types";
import { AbstractConnector } from "@web3-react/abstract-connector";
import warning from "tiny-warning";

import { SendReturnResult, SendReturn, Send, SendOld } from "./types";

function parseSendReturn(sendReturn: SendReturnResult | SendReturn): any {
  return sendReturn.hasOwnProperty("result") ? sendReturn.result : sendReturn;
}

export class NoTrustKeysProviderError extends Error {
  public constructor() {
    super();
    this.name = this.constructor.name;
    this.message = "No TrustKeys provider was found on window.TkProvider.";
  }
}

export class UserRejectedRequestError extends Error {
  public constructor() {
    super();
    this.name = this.constructor.name;
    this.message = "The user rejected the request.";
  }
}

export class TrustKeysConnector extends AbstractConnector {
  constructor(kwargs: AbstractConnectorArguments) {
    super(kwargs);

    this.handleNetworkChanged = this.handleNetworkChanged.bind(this);
    this.handleChainChanged = this.handleChainChanged.bind(this);
    this.handleAccountsChanged = this.handleAccountsChanged.bind(this);
    this.handleClose = this.handleClose.bind(this);
  }

  private handleChainChanged(chainId: string | number): void {
    if (__DEV__) {
      console.log("Handling 'chainChanged' event with payload", chainId);
    }
    this.emitUpdate({ chainId, provider: window.TkProvider });
  }

  private handleAccountsChanged(accounts: string[]): void {
    if (__DEV__) {
      console.log("Handling 'accountsChanged' event with payload", accounts);
    }
    if (accounts.length === 0) {
      this.emitDeactivate();
    } else {
      this.emitUpdate({ account: accounts[0] });
    }
  }

  private handleClose(code: number, reason: string): void {
    if (__DEV__) {
      console.log("Handling 'close' event with payload", code, reason);
    }
    this.emitDeactivate();
  }

  private handleNetworkChanged(networkId: string | number): void {
    if (__DEV__) {
      console.log("Handling 'networkChanged' event with payload", networkId);
    }
    this.emitUpdate({ chainId: networkId, provider: window.TkProvider });
  }

  public async activate(): Promise<ConnectorUpdate> {
    if (!window.TkProvider) {
      throw new NoTrustKeysProviderError();
    }

    if (window.TkProvider.on) {
      window.TkProvider.on("chainChanged", this.handleChainChanged);
      window.TkProvider.on("accountsChanged", this.handleAccountsChanged);
      window.TkProvider.on("close", this.handleClose);
      window.TkProvider.on("networkChanged", this.handleNetworkChanged);
    }

    if ((window.TkProvider as any).isMetaMask) {
      (window.TkProvider as any).autoRefreshOnNetworkChange = false;
    }

    // try to activate + get account via eth_requestAccounts
    let account;
    try {
      account = await (window.TkProvider.send as Send)(
        "eth_requestAccounts"
      ).then((sendReturn) => parseSendReturn(sendReturn)[0]);
    } catch (error) {
      if ((error as any).code === 4001) {
        throw new UserRejectedRequestError();
      }
      warning(
        false,
        "eth_requestAccounts was unsuccessful, falling back to enable"
      );
    }

    // if unsuccessful, try enable
    if (!account) {
      // if enable is successful but doesn't return accounts, fall back to getAccount (not happy i have to do this...)
      account = await window.TkProvider.enable().then(
        (sendReturn) => sendReturn && parseSendReturn(sendReturn)[0]
      );
    }

    return { provider: window.TkProvider, ...(account ? { account } : {}) };
  }

  public async getProvider(): Promise<any> {
    return window.TkProvider;
  }

  public async getChainId(): Promise<number | string> {
    if (!window.TkProvider) {
      throw new NoTrustKeysProviderError();
    }

    let chainId;
    try {
      chainId = await (window.TkProvider.send as Send)("eth_chainId").then(
        parseSendReturn
      );
    } catch {
      warning(
        false,
        "eth_chainId was unsuccessful, falling back to net_version"
      );
    }

    if (!chainId) {
      try {
        chainId = await (window.TkProvider.send as Send)("net_version").then(
          parseSendReturn
        );
      } catch {
        warning(
          false,
          "net_version was unsuccessful, falling back to net version v2"
        );
      }
    }

    if (!chainId) {
      try {
        chainId = parseSendReturn(
          (window.TkProvider.send as SendOld)({ method: "net_version" })
        );
      } catch {
        warning(
          false,
          "net_version v2 was unsuccessful, falling back to manual matches and static properties"
        );
      }
    }

    if (!chainId) {
      if ((window.TkProvider as any).isDapper) {
        chainId = parseSendReturn(
          (window.TkProvider as any).cachedResults.net_version
        );
      } else {
        chainId =
          (window.TkProvider as any).chainId ||
          (window.TkProvider as any).netVersion ||
          (window.TkProvider as any).networkVersion ||
          (window.TkProvider as any)._chainId;
      }
    }

    return chainId;
  }

  public async getAccount(): Promise<null | string> {
    if (!window.TkProvider) {
      throw new NoTrustKeysProviderError();
    }

    let account;
    try {
      account = await (window.TkProvider.send as Send)("eth_accounts").then(
        (sendReturn) => parseSendReturn(sendReturn)[0]
      );
    } catch {
      warning(false, "eth_accounts was unsuccessful, falling back to enable");
    }

    if (!account) {
      try {
        account = await window.TkProvider.enable().then(
          (sendReturn) => parseSendReturn(sendReturn)[0]
        );
      } catch {
        warning(
          false,
          "enable was unsuccessful, falling back to eth_accounts v2"
        );
      }
    }

    if (!account) {
      account = parseSendReturn(
        (window.TkProvider.send as SendOld)({ method: "eth_accounts" })
      )[0];
    }

    return account;
  }

  public deactivate() {
    if (window.TkProvider && window.TkProvider.removeListener) {
      window.TkProvider.removeListener(
        "chainChanged",
        this.handleChainChanged
      );
      window.TkProvider.removeListener(
        "accountsChanged",
        this.handleAccountsChanged
      );
      window.TkProvider.removeListener("close", this.handleClose);
      window.TkProvider.removeListener(
        "networkChanged",
        this.handleNetworkChanged
      );
    }
  }

  public async isAuthorized(): Promise<boolean> {
    if (!window.TkProvider) {
      return false;
    }

    try {
      return await (window.TkProvider.send as Send)("eth_accounts").then(
        (sendReturn) => {
          if (parseSendReturn(sendReturn).length > 0) {
            return true;
          } else {
            return false;
          }
        }
      );
    } catch {
      return false;
    }
  }
}
