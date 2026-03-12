import { describe, test, expect } from "bun:test";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { createSseTransport } from "../../src/client/sse.ts";
import type { HttpServerConfig } from "../../src/config/schemas.ts";

describe("createSseTransport", () => {
  test("returns an SSEClientTransport instance", () => {
    const config: HttpServerConfig = { url: "https://example.com/sse" };
    const transport = createSseTransport(config);
    expect(transport).toBeInstanceOf(SSEClientTransport);
  });

  test("accepts custom headers", () => {
    const config: HttpServerConfig = {
      url: "https://example.com/sse",
      headers: { Authorization: "Bearer tok123" },
    };
    const transport = createSseTransport(config);
    expect(transport).toBeInstanceOf(SSEClientTransport);
  });

  test("accepts an auth provider", () => {
    const config: HttpServerConfig = { url: "https://example.com/sse" };
    const fakeProvider = {
      get redirectUrl() {
        return "http://localhost/callback";
      },
      get clientMetadata() {
        return { redirect_uris: ["http://localhost/callback"] };
      },
      clientInformation: () => Promise.resolve({ client_id: "test" }),
      tokens: () => Promise.resolve({ access_token: "tok", token_type: "Bearer" }),
      saveTokens: () => Promise.resolve(),
      saveClientInformation: () => Promise.resolve(),
    };
    const transport = createSseTransport(config, fakeProvider as any);
    expect(transport).toBeInstanceOf(SSEClientTransport);
  });

  test("accepts verbose mode without errors", () => {
    const config: HttpServerConfig = { url: "https://example.com/sse" };
    const transport = createSseTransport(config, undefined, true, false);
    expect(transport).toBeInstanceOf(SSEClientTransport);
  });
});
