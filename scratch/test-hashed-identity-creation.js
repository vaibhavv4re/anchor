/**
 * Phase 6 - Hashed-identity creation (plan Test Plan: "hashing on create").
 *
 * Guards the plaintext-PIN root cause: PINs must be stored as SHA-256 hashes
 * (64 hex chars), never plaintext, both on the client (identityModel) and
 * consistently with the SQL seed. Verifies:
 *   - hashPin matches an independent node:crypto SHA-256;
 *   - createIdentity writes pin_hash (hash) and NO plaintext pin;
 *   - resetPin re-hashes onto the identity (no plaintext);
 *   - the production_hardening superadmin seed equals hashPin('888888').
 */
import { webcrypto, createHash } from 'node:crypto';

// hashPin uses the Web Crypto subtle API; provide it in Node if absent.
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  globalThis.crypto = webcrypto;
}

const { hashPin, IdentityModel } = await import('../businessos/platform/identity/identityModel.js');

const SHA256_RE = /^[0-9a-f]{64}$/;

function sha256Hex(s) {
  return createHash('sha256').update(s).digest('hex');
}

async function main() {
  let failures = 0;
  const check = (label, cond) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'} ${label}`);
    if (!cond) failures++;
  };

  // 1. hashPin is a correct, deterministic SHA-256 (no plaintext anywhere).
  const pin = '246810';
  const h = await hashPin(pin);
  check('hashPin returns a 64-hex SHA-256', SHA256_RE.test(h));
  check('hashPin matches independent node:crypto digest', h === sha256Hex(pin));
  check('hashPin output is NOT the plaintext PIN', h !== pin && !h.includes(pin));
  const h2 = await hashPin(pin);
  check('hashPin is deterministic for the same PIN', h === h2);

  // 2. Superadmin seed constant (production_hardening.sql) == hashPin('888888').
  const SUPERADMIN_SEED = '92925488b28ab12584ac8fcaa8a27a0f497b2c62940c8f4fbc8ef19ebc87c43e';
  check("seeded superadmin pin_hash equals hashPin('888888')", (await hashPin('888888')) === SUPERADMIN_SEED);

  // 3. createIdentity persists a hash and no plaintext, through the gateway.
  const created = [];
  const updated = [];
  const stubGw = {
    create(collection, record) { created.push({ collection, record }); return Promise.resolve(record); },
    update(collection, id, patch) { updated.push({ collection, id, patch }); return Promise.resolve(patch); },
    getCollection() { return Promise.resolve([]); },
    getCachedCollection() { return []; }
  };
  const model = new IdentityModel({ dataGateway: stubGw });

  const identity = await model.createIdentity('135790');
  check('createIdentity writes to the identities collection', created.length === 1 && created[0].collection === 'identities');
  check('createIdentity stores pin_hash as a SHA-256', SHA256_RE.test(identity.pinHash));
  check('createIdentity stores NO plaintext pin', !('pin' in identity) && !('pinDisplay' in identity) && !('adminPin' in identity));
  check('stored identity row has no plaintext PIN field', !('pin' in created[0].record) && !('pinDisplay' in created[0].record));

  // 4. resetPin re-hashes the new PIN onto the identity (no plaintext write).
  await model.resetPin(identity.id, '111111');
  const resetPatch = updated.find((u) => u.id === identity.id);
  check('resetPin issues an update', !!resetPatch);
  check('resetPin patch carries a hashed pin_hash', resetPatch && SHA256_RE.test(resetPatch.patch.pinHash));
  check('resetPin patch has NO plaintext pin', resetPatch && !('pin' in resetPatch.patch) && !('newPin' in resetPatch.patch));
  check('resetPin hash equals hashPin of the new PIN', resetPatch && resetPatch.patch.pinHash === (await hashPin('111111')));

  console.log(failures === 0 ? '\nHASHED-IDENTITY CREATION: PASS' : `\nHASHED-IDENTITY CREATION: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
