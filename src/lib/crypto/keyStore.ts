// Persists this device's ECDH keypair in IndexedDB, which — unlike
// localStorage — can store CryptoKey objects directly. The private key is
// non-extractable, so even IndexedDB only ever holds an opaque key handle,
// never raw bytes a script (or an XSS bug) could read out and exfiltrate.
//
// No sync, no backup: a different browser/device generates its own keypair
// with no access to messages encrypted under the old one. See e2e.ts for
// the full rationale.

import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/authCache";
import { generateKeyPair, exportPublicKeyJwk } from "./e2e";

const DB_NAME = "sportonica-e2e";
const STORE = "keypair";
const KEY = "self";
const RECONCILED_FLAG = "sportonica-e2e-reconciled";

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

  // This used to call sb.auth.getUser() directly here — a real network
  // round-trip on every fresh page load. getCachedUser() shares the same
  // request other components on the page are already making.
  const user = await getCachedUser();
  if (!user) return pair;

  const sb = createClient();

  if (isNew) {
    const jwk = await exportPublicKeyJwk(pair.publicKey);
    await sb.from("user_keys").upsert({ user_id: user.id, public_key: jwk });
    try { localStorage.setItem(RECONCILED_FLAG, "1"); } catch { /* ignore */ }
    return pair;
  }

  // Reconcile at most once per browser, not on every page load. This only
  // exists to self-heal a since-fixed race (EnsureE2EKey + DMThread both
  // generating a keypair concurrently on first mount) — it has nothing to
  // catch after the first successful check, so paying a network round-trip
  // for it on every single visit forever isn't worth it.
  let alreadyReconciled = false;
  try { alreadyReconciled = localStorage.getItem(RECONCILED_FLAG) === "1"; } catch { /* ignore */ }
  if (alreadyReconciled) return pair;

  const jwk = await exportPublicKeyJwk(pair.publicKey);
  const { data: existing } = await sb.from("user_keys").select("public_key").eq("user_id", user.id).maybeSingle();
  if (existing?.public_key !== jwk) {
    await sb.from("user_keys").upsert({ user_id: user.id, public_key: jwk });
  }
  try { localStorage.setItem(RECONCILED_FLAG, "1"); } catch { /* ignore */ }

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
