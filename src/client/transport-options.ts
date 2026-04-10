import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { HttpServerConfig } from "../config/schemas.ts";
import { createDebugFetch, type FetchLike } from "./debug-fetch.ts";
import pkg from "../../package.json";

export interface TransportDeps {
  config: HttpServerConfig;
  authProvider?: OAuthClientProvider;
  verbose?: boolean;
  showSecrets?: boolean;
}

/** Build shared transport init options (auth, headers, User-Agent, debug fetch) */
export function buildTransportInit(deps: TransportDeps): {
  authProvider?: OAuthClientProvider;
  requestInit: RequestInit;
  fetch?: FetchLike;
} {
  const { config, authProvider, verbose = false, showSecrets = false } = deps;
  const userAgent = `${pkg.name}/${pkg.version}`;
  return {
    authProvider,
    requestInit: {
      headers: {
        "User-Agent": userAgent,
        ...config.headers,
      },
    },
    fetch: verbose ? createDebugFetch(showSecrets) : undefined,
  };
}
