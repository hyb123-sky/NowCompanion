import { describe, expect, it } from "vitest";
import { ready } from "../src/index";

describe("ready", () => {
  it("returns true", () => {
    expect(ready()).toBe(true);
  });
});
