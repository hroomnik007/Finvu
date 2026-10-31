// A minimal software passkey (ES256 / P-256) for tests: produces the stored
// COSE public key and WebAuthn assertions that @simplewebauthn/server verifies
// for real — no mocked crypto.
import { createHash, generateKeyPairSync, randomBytes, sign } from "crypto";

const b64url = (b: Buffer) => b.toString("base64url");

export function softPasskey() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const x = Buffer.from(jwk.x, "base64url"), y = Buffer.from(jwk.y, "base64url");
  // COSE_Key {1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y} in CBOR
  const cose = Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]), x,
    Buffer.from([0x22, 0x58, 0x20]), y,
  ]);
  const credentialId = b64url(randomBytes(16));
  let counter = 0;

  return {
    credentialId,
    /** What webauthn_credentials.public_key stores. */
    publicKeyBase64: cose.toString("base64"),
    assert(opts: { challenge: string; origin: string; rpId: string; userVerified?: boolean }) {
      const flags = 0x01 | (opts.userVerified === false ? 0 : 0x04); // UP | UV
      const authData = Buffer.concat([
        createHash("sha256").update(opts.rpId).digest(),
        Buffer.from([flags]),
        Buffer.from([0, 0, 0, ++counter]),
      ]);
      const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: opts.challenge, origin: opts.origin, crossOrigin: false }));
      const signature = sign("sha256", Buffer.concat([authData, createHash("sha256").update(clientDataJSON).digest()]), privateKey);
      return {
        id: credentialId, rawId: credentialId, type: "public-key", clientExtensionResults: {},
        response: { authenticatorData: b64url(authData), clientDataJSON: b64url(clientDataJSON), signature: b64url(signature) },
      };
    },
  };
}
