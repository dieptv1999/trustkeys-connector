interface TkProvider {
  send: unknown;
  enable: () => Promise<string[]>;
  on?: (method: string, listener: (...args: any[]) => void) => void;
  removeListener?: (method: string, listener: (...args: any[]) => void) => void;
}

declare interface Window {
  TkProvider?: TkProvider;
}

declare const __DEV__: boolean;
