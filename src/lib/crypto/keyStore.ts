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

let inFlight: Promise<CryptoKeyPair> | null = null;

async function loadOrGenerate(): Promise<CryptoKeyPair> {
  const db = await openDb();
  let pair = await idbGet(db, KEY);
  let isNew = false;

  if (!pair) {
    pair = await generateKeyPair();
    await idbSet(db, KEY, pair);
    isNew = true;
  }

  const jwk = await exportPublicKeyJwk(pair.publicKey);
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    if (isNew) {
      await sb.from("user_keys").upsert({ user_id: user.id, public_key: jwk });
    } else {
      // Reconcile: if an earlier race ever generated two different
      // keypairs concurrently (EnsureE2EKey + DMThread both mounting at
      // once, before either finished its IndexedDB write), the server
      // could be holding a public key that doesn't match this device's
      // actual local private key — every message encrypted "to us" would
      // then use the wrong key and permanently fail to decrypt. The local
      // IndexedDB key is authoritative (it's the one we can actually
      // decrypt with), so make sure the server agrees with it.
      const { data: existing } = await sb.from("user_keys").select("public_key").eq("user_id", user.id).maybeSingle();
      if (existing?.public_key !== jwk) {
        await sb.from("user_keys").upsert({ user_id: user.id, public_key: jwk });
      }
    }
  }

  return pair;
}

/**
 * This device's ECDH keypair — generated once, persisted locally.
 * Concurrent callers (e.g. a global "ensure key" mount racing a DM thread
 * mounting on the same page load) share one in-flight setup instead of
 * each independently generating/uploading a keypair.
 */
export async function getOrCreateKeyPair(): Promise<CryptoKeyPair> {
  if (!inFlight) inFlight = loadOrGenerate();
  return inFlight;
}
