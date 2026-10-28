import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash } from 'node:crypto';
const cookie = 'boostify_session';
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('Configurá SESSION_SECRET con al menos 32 caracteres');
  return new TextEncoder().encode(secret);
}
function fingerprint() {
  return createHash('sha256')
    .update(
      (process.env.ADMIN_EMAIL ?? '') + (process.env.ADMIN_PASSWORD_HASH ?? ''),
    )
    .digest('hex');
}
export async function session() {
  try {
    const value = (await cookies()).get(cookie)?.value;
    if (!value) return false;
    const { payload } = await jwtVerify(value, key(), {
      algorithms: ['HS256'],
      issuer: 'boostify',
      audience: 'boostify-admin',
    });
    return payload.sub === fingerprint();
  } catch {
    return false;
  }
}
export async function requireAdmin() {
  if (!(await session())) redirect('/login');
}
export async function createSession() {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(fingerprint())
    .setIssuer('boostify')
    .setAudience('boostify-admin')
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(key());
  (await cookies()).set(cookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 28800,
  });
}
export async function clearSession() {
  (await cookies()).delete(cookie);
}
