import { dim } from "ansis";
import { logger } from "../output/logger.ts";

export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

export function createDebugFetch(showSecrets: boolean): FetchLike {
  const isTTY = process.stderr.isTTY ?? false;
  const fmt = (s: string) => (isTTY ? dim(s) : s);

  return async (url, init) => {
    const start = performance.now();

    // Request
    log("");
    log(fmt(`> ${init?.method ?? "GET"} ${url}`));
    logHeaders(">", init?.headers, fmt, showSecrets);
    log(fmt(">"));
    if (init?.body) {
      logBody(String(init.body), fmt);
    }

    const response = await fetch(url, init);
    const elapsed = Math.round(performance.now() - start);

    // Response
    log(fmt(`< ${response.status} ${response.statusText} (${elapsed}ms)`));
    logHeaders("<", response.headers, fmt, showSecrets);
    log(fmt("<"));
    log("");

    return response;
  };
}

function log(line: string) {
  logger.writeRaw(line + "\n");
}

function logHeaders(
  prefix: string,
  headers: HeadersInit | Headers | undefined,
  fmt: (s: string) => string,
  showSecrets: boolean,
) {
  if (!headers) return;

  const format = (key: string, value: string) =>
    fmt(`${prefix} ${key}: ${showSecrets ? value : maskSensitive(key, value)}`);

  if (headers instanceof Headers) {
    headers.forEach((value, key) => log(format(key, value)));
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      log(format(key, value));
    }
  } else {
    for (const [key, value] of Object.entries(headers)) {
      log(format(key, value));
    }
  }
}

function logBody(body: string, fmt: (s: string) => string) {
  try {
    const formatted = JSON.stringify(JSON.parse(body), null, 2);
    for (const line of formatted.split("\n")) {
      log(fmt(line));
    }
  } catch {
    log(fmt(body));
  }
}

export function maskSensitive(key: string, value: string): string {
  const lower = key.toLowerCase();
  if (lower === "authorization" || lower === "cookie" || lower === "set-cookie") {
    if (value.length <= 12) return value;
    return value.slice(0, 12) + "...";
  }
  return value;
}
