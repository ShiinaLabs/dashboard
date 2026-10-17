import { describe, expect, it } from "vitest";
import { canConfirmToken } from "../components/ui/ConfirmDialog";

describe("confirmation token matching", () => {
  it("only enables confirmation for a loaded token that matches", () => {
    expect(canConfirmToken("AB12", "ab12", false, false)).toBe(true);
    expect(canConfirmToken("AB12", "wrong", false, false)).toBe(false);
  });

  it("never treats a failed, loading, or missing token as a match", () => {
    expect(canConfirmToken(null, "ERROR", false, true)).toBe(false);
    expect(canConfirmToken("ERROR", "ERROR", false, true)).toBe(false);
    expect(canConfirmToken("AB12", "AB12", true, false)).toBe(false);
    expect(canConfirmToken(null, "", false, false)).toBe(false);
  });
});
