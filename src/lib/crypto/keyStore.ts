// Persists this device's ECDH keypair in IndexedDB, which — unlike
// localStorage — can store CryptoKey objects directly. The private key is
// non-extractable, so even IndexedDB only ever holds an opaque key handle,
// never raw bytes a script (or an XSS bug) could read out and exfiltrate.
//
// No sync, no backup: a different browser/device generates its own keypair
// with no access to messages encrypted under the old one. See e2e.ts for
// the full rationale.

import { createClient } from "@/lib/supabase/client";
import { generateKeyPair, exportPublicKeyJwk } from "./e2e";

const DB_NAME = "khelamna-e2e";
const STORE = "keypair";
const KEY = "self";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<CryptoKeyPair | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbSet(db: IDBDatabase, key: string, value: CryptoKeyPair): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let cached: CryptoKeyPair | null = null;

/**
 * This device's ECDH keypair — generated once, persisted locally.
 * On first generation, publishes the public half to `user_keys` so other
 * players can encrypt messages for this user.
 */
export async function getOrCreateKeyPair(): Promise<CryptoKeyPair> {
  if (cached) return cached;

  const db = await openDb();
  let pair = await idbGet(db, KEY);
  let isNew = false;

  if (!pair) {
    pair = await generateKeyPair();
    await idbSet(db, KEY, pair);
    isNew = true;
  }

  cached = pair;

  if (isNew) {
    const jwk = await exportPublicKeyJwk(pair.publicKey);
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      await sb.from("user_keys").upsert({ user_id: user.id, public_key: jwk });
    }
  }

  return pair;
}
