import { describe, expect, it } from "vitest";
import { cleanPasskeyName, newPasskeyName, passkeyProvider } from "./passkeyNames";

const GPM = "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4";
const ZERO = "00000000-0000-0000-0000-000000000000";

describe("passkey names", () => {
  it("knows the big providers by AAGUID, case-insensitively", () => {
    expect(passkeyProvider(GPM)).toBe("Google Password Manager");
    expect(passkeyProvider(GPM.toUpperCase())).toBe("Google Password Manager");
    expect(passkeyProvider("fbfc3007-154e-4ecc-8c0b-6e020557d7bd")).toBe("iCloud Keychain");
    expect(passkeyProvider(ZERO)).toBeNull();
    expect(passkeyProvider(undefined)).toBeNull();
  });

  it("cleans user input", () => {
    expect(cleanPasskeyName("  My\u0000 phone \n\t x ")).toBe("My phone x");
    expect(cleanPasskeyName("a\u202Eb")).toBe("ab");
    expect(cleanPasskeyName("   ")).toBeNull();
    expect(cleanPasskeyName(42)).toBeNull();
    expect(cleanPasskeyName("é".repeat(100))).toHaveLength(64);
  });

  it("combines the browser label with the provider", () => {
    expect(newPasskeyName("Android · Chrome", GPM, "platform")).toBe("Android · Chrome · Google Password Manager");
    expect(newPasskeyName("Windows · Edge", GPM, "cross-platform")).toBe("Google Password Manager");
    expect(newPasskeyName("iPhone · Safari", ZERO, "platform")).toBe("iPhone · Safari");
    expect(newPasskeyName(undefined, ZERO, "platform")).toBeNull();
    expect(newPasskeyName(undefined, GPM, "platform")).toBe("Google Password Manager");
  });
});
