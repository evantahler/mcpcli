import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import type { ElicitRequest, ElicitRequestURLParams } from "@modelcontextprotocol/sdk/types.js";
import { type ElicitationOptions, handleElicitation, handleUrlElicitation } from "../../src/client/elicitation.ts";

function makeFormRequest(overrides: Record<string, unknown> = {}): ElicitRequest {
	return {
		method: "elicitation/create",
		params: {
			message: "Select deployment target",
			requestedSchema: {
				type: "object" as const,
				properties: {
					confirm: {
						type: "boolean" as const,
						title: "Confirm",
						description: "Proceed with deployment?",
					},
				},
				required: ["confirm"],
			},
			...overrides,
		},
	};
}

function makeUrlRequest(overrides: Record<string, unknown> = {}): ElicitRequest {
	return {
		method: "elicitation/create",
		params: {
			mode: "url",
			message: "Please authenticate",
			url: "https://example.com/auth",
			elicitationId: "elicit-123",
			...overrides,
		},
	} as ElicitRequest;
}

describe("handleElicitation", () => {
	test("noInteractive returns decline for form mode", async () => {
		const options: ElicitationOptions = { noInteractive: true, json: false };
		const result = await handleElicitation(makeFormRequest(), options);
		expect(result.action).toBe("decline");
	});

	test("noInteractive returns decline for URL mode", async () => {
		const options: ElicitationOptions = { noInteractive: true, json: false };
		const result = await handleElicitation(makeUrlRequest(), options);
		expect(result.action).toBe("decline");
	});
});

describe("handleUrlElicitation (direct, used for URL elicitation errors)", () => {
	let stderrSpy: Mock<typeof process.stderr.write>;

	beforeEach(() => {
		stderrSpy = spyOn(process.stderr, "write").mockReturnValue(true);
	});

	afterEach(() => {
		stderrSpy.mockRestore();
	});

	test("noInteractive declines without prompting", async () => {
		const params: ElicitRequestURLParams = {
			mode: "url",
			message: "Please authenticate",
			url: "https://example.com/auth",
			elicitationId: "elicit-123",
		};
		const result = await handleUrlElicitation(params, { noInteractive: true, json: false });
		expect(result.action).toBe("decline");
	});
});
