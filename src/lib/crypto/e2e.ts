// True end-to-end encryption for direct messages, using the browser's
// native Web Crypto API — no external crypto library.
//
// Design: ECDH (P-256) key agreement + AES-GCM-256 for message content.
// Each pair of friends derives one shared symmetric key from (my private
// key, their public key); that key never leaves the browser and is never
// sent anywhere. The server only ever stores ciphertext + a per-message
// nonce (iv) — it cannot decrypt message content under any circumstance.
//
// Known, deliberate limitations (see the plan for the full rationale):
//  - No forward secrecy — this is a static keypair, not a ratchet like
//    Signal. A compromised private key exposes all past messages.
//  - No multi-device sync or key backup. The private key lives in one
//    browser's IndexedDB (see keyStore.ts); a new device/browser or
//    cleared storage means a fresh keypair with no access to old history.

const CURVE = "P-256";

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: CURVE },
    // Private key stays non-extractable — it can be *used* to derive
    // shared secrets but its raw bytes can never be read out by JS,
    // even by a compromised page script.
    false,
    ["deriveKey"]
  ) as Promise<CryptoKeyPair>;
}

export async function exportPublicKeyJwk(publicKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  return JSON.stringify(jwk);
}

async function importPeerPublicKey(jwkJson: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkJson) as JsonWebKey;
  return crypto.subtle.importKey(
    "jwk", jwk,
    { name: "ECDH", namedCurve: CURVE },
    false, []
  );
}

/** The shared AES-GCM key for one conversation, derived from my private key + their public key. */
export async function deriveConversationKey(myPrivateKey: CryptoKey, theirPublicKeyJwk: string): Promise<CryptoKey> {
  const theirPublicKey = await importPeerPublicKey(theirPublicKeyJwk);
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toBase64(buf: ArrayBuffer): string {
  let bin = "";
  new Uint8Array(buf).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptText(key: CryptoKey, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM nonce — unique per message, not secret
  const encoded = new TextEncoder().encode(plaintext);
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { ciphertext: toBase64(buf), iv: toBase64(iv.buffer) };
}

export async function decryptText(key: CryptoKey, ciphertext: string, iv: string): Promise<string> {
  const buf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext)
  );
  return new TextDecoder().decode(buf);
}
