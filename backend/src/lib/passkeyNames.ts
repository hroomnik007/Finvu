// Naming of passkeys in Settings -> Passkeys.
//
// The browser suggests a label from its user agent ("iPhone · Safari"), and if
// the authenticator's AAGUID is one of the well-known passkey providers below
// the provider is named too. Small hand-kept list on purpose (no dependency);
// source: the community-maintained passkey-authenticator-aaguids list. An
// AAGUID that is unknown, or all zeros (Safari zeroes it with attestation
// "none"), simply leaves the browser's label as it is.
export const KNOWN_AAGUIDS: Readonly<Record<string, string>> = {
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "771b48fd-d3d4-4f74-9232-fc157ab0507a": "Edge on Mac",
  "53414d53-554e-4700-0000-000000000000": "Samsung Pass",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "b84e4048-15dc-4dd0-8640-f4f60813c8af": "NordPass",
  "50726f74-6f6e-5061-7373-50726f746f6e": "Proton Pass",
  "fdb141b2-5d84-443e-8a35-4698c205a502": "KeePassXC",
};

export const MAX_PASSKEY_NAME = 64;

export function passkeyProvider(aaguid: unknown): string | null {
  return typeof aaguid === "string" ? KNOWN_AAGUIDS[aaguid.toLowerCase()] ?? null : null;
}

/** Trimmed, single-spaced, no control/format characters, at most 64 chars; null if nothing is left. */
export function cleanPasskeyName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
  return name ? Array.from(name).slice(0, MAX_PASSKEY_NAME).join("").trim() : null;
}

/**
 * Name for a new passkey. A passkey made on this device keeps the browser's
 * label and gets the provider appended ("Android · Chrome · Google Password
 * Manager"). One made on another device (phone via QR, security key) is
 * named after the provider when known, because the browser's label describes
 * the computer, not where the passkey lives. Null = use the column default.
 */
export function newPasskeyName(clientName: unknown, aaguid: unknown, attachment: unknown): string | null {
  const label = cleanPasskeyName(clientName);
  const provider = passkeyProvider(aaguid);
  if (!provider) return label;
  if (attachment === "cross-platform" || !label) return provider;
  return label.includes(provider) ? label : cleanPasskeyName(`${label} · ${provider}`);
}
