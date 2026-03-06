import { describe, test, expect, beforeEach, afterEach, spyOn, type Mock } from "bun:test";
import { logger } from "../../src/output/logger.ts";

describe("logger", () => {
  let stderrSpy: Mock<typeof process.stderr.write>;
  let origIsTTY: boolean | undefined;

  beforeEach(() => {
    origIsTTY = process.stderr.isTTY;
    Object.defineProperty(process.stderr, "isTTY", { value: true, writable: true });
    stderrSpy = spyOn(process.stderr, "write").mockReturnValue(true);
    logger.configure({});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    Object.defineProperty(process.stderr, "isTTY", { value: origIsTTY, writable: true });
  });

  test("info() writes dim text to stderr", () => {
    logger.info("hello");
    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("hello");
  });

  test("warn() writes to stderr", () => {
    logger.warn("caution");
    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("caution");
  });

  test("error() writes to stderr", () => {
    logger.error("failure");
    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("failure");
  });

  test("info() is suppressed in JSON mode", () => {
    logger.configure({ json: true });
    logger.info("hidden");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  test("error() still writes in JSON mode", () => {
    logger.configure({ json: true });
    logger.error("visible");
    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("visible");
  });

  test("info() is suppressed when stderr is not a TTY", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: false, writable: true });
    logger.configure({});
    logger.info("hidden");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  test("debug() only writes when verbose is enabled", () => {
    logger.configure({});
    logger.debug("no-show");
    expect(stderrSpy).not.toHaveBeenCalled();

    logger.configure({ verbose: true });
    logger.debug("show-me");
    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("show-me");
  });

  test("writeRaw() writes to stderr without formatting", () => {
    logger.writeRaw("raw output\n");
    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toBe("raw output\n");
  });

  test("startSpinner() returns no-op in JSON mode", () => {
    logger.configure({ json: true });
    const spinner = logger.startSpinner("test");
    // Should not throw
    spinner.update("x");
    spinner.success("y");
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
