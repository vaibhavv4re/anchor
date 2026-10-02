// supabase/functions/pin-login/index.ts
//
// Stage 1A - Server-side PIN login. Holds the service_role secret server-side
// only, verifies the submitted PIN against identities.pin_hash (or a tenant
// admin PIN), and mints a short-lived HS256 JWT whose claims (tenant_id,
// role_id, workspace) the RLS policies read via auth.jwt().
//
// Deploy (Supabase):
//   supabase functions deploy pin-login --no-verify-jwt
// Required secrets (set via `supabase secrets set`, never in the client):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
// Optional: SUPERADMIN_PIN (defaults to 888888), TENANT_ADMIN_PIN (defaults to 999999)
//
// The client calls this only when AUTH_MODE=server (Stage 1A rollout gate);
// otherwise the legacy local auth path is used, so this is non-breaking.

// Minimal ambient types for the Deno / Supabase Edge runtime (this module does
// not run in the browser project, so the workspace jsconfig has no Deno lib).
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const ALLOWED = '*';
const JWT_TTL_SECONDS = 60 * 60 * 8; // 8 hour shift

// Simple in-memory rate limiter (per container instance).
const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 10; // max 10 attempts / minute / ip
}

function cors(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': ALLOWED,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwt(claims: Record<string, unknown>, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = b64url(enc.encode(JSON.stringify(header)));
  const encodedPayload = b64url(enc.encode(JSON.stringify(claims)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(signingInput)));
  return `${signingInput}.${b64url(sig)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405, headers: { ...cors(), 'Content-Type': 'application/json' } });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const JWT_SECRET = Deno.env.get('SUPABASE_JWT_SECRET')!;
  const SUPERADMIN_PIN = Deno.env.get('SUPERADMIN_PIN') || '888888';
  const TENANT_ADMIN_PIN = Deno.env.get('TENANT_ADMIN_PIN') || '999999';

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), { status: 429, headers: { ...cors(), 'Content-Type': 'application/json' } });
  }

  let pin = '';
  let deviceId = 'LOCAL-POS-01';
  try {
    const body = await req.json();
    pin = String(body.pin || '').trim();
    deviceId = body.deviceId || deviceId;
  } catch { /* fallthrough to invalid */ }

  if (!pin) {
    return new Response(JSON.stringify({ error: 'INVALID_PIN' }), { status: 401, headers: { ...cors(), 'Content-Type': 'application/json' } });
  }

  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  const now = Math.floor(Date.now() / 1000);
  let claims: Record<string, unknown> | null = null;

  if (pin === SUPERADMIN_PIN) {
    claims = { sub: 'id-superadmin', tenant_id: 'system', role_id: 'role-superadmin', workspace: 'superadmin' };
  } else {
    // 1. Employee identity by hashed PIN
    const hash = await sha256Hex(pin);
    const ident = await fetch(
      `${SUPABASE_URL}/rest/v1/identities?pin_hash=eq.${hash}&status=eq.ACTIVE&select=*`,
      { headers }
    ).then(r => r.json()).catch(() => []);

    if (Array.isArray(ident) && ident.length > 0) {
      const identity = ident[0];
      const emp = await fetch(
        `${SUPABASE_URL}/rest/v1/employees?identity_id=eq.${identity.id}&status=eq.ACTIVE&select=*`,
        { headers }
      ).then(r => r.json()).catch(() => []);
      const employee = Array.isArray(emp) ? emp[0] : null;
      claims = {
        sub: employee ? employee.id : identity.id,
        tenant_id: identity.tenant_id || (employee && employee.tenant_id) || 'tenant_h0qc7wf',
        role_id: employee ? (employee.role_id || 'role-waiter') : 'role-waiter',
        workspace: employee ? (employee.workspace_default || 'waiter') : 'waiter'
      };
    }

    // 2. Tenant admin PIN fallback
    if (!claims) {
      const admins = await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?or=(admin_pin.eq.${pin},admin_pin.eq.${TENANT_ADMIN_PIN})&select=*`,
        { headers }
      ).then(r => r.json()).catch(() => []);
      if (Array.isArray(admins) && admins.length > 0) {
        const t = admins[0];
        claims = { sub: t.tenant_id, tenant_id: t.tenant_id, role_id: 'role-admin', workspace: 'admin' };
      }
    }
  }

  if (!claims) {
    return new Response(JSON.stringify({ error: 'INVALID_PIN' }), { status: 401, headers: { ...cors(), 'Content-Type': 'application/json' } });
  }

  const token = await signJwt(
    { ...claims, role: 'authenticated', aud: 'authenticated', iss: 'supabase', iat: now, exp: now + JWT_TTL_SECONDS },
    JWT_SECRET
  );

  return new Response(JSON.stringify({ token, claims, deviceId, expiresAt: new Date((now + JWT_TTL_SECONDS) * 1000).toISOString() }), {
    status: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' }
  });
});
