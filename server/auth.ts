import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';
import type { UserRole } from '../src/types.ts';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  return process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length > 0
    ? process.env.SESSION_SECRET.trim()
    : EPHEMERAL_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

interface TokenPayload {
  uid: number;
  email: string;
  role: UserRole;
  exp: number;
}

export function signAuthToken(payload: Omit<TokenPayload, 'exp'>): string {
  const full: TokenPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(body)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  specialty: string | null;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

export function isAdminBootstrapped(): boolean {
  const hasEnvPasscode = Boolean(
    process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0
  );
  if (hasEnvPasscode) return true;
  const row = db
    .prepare(`SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'`)
    .get() as { cnt: number };
  return row.cnt > 0;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Autenticação obrigatória.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Sessão expirada ou inválida. Faça login novamente.' });
    return;
  }

  const user = db
    .prepare(
      `SELECT id, name, email, role, specialty, active, created_at, last_login_at
       FROM users WHERE id = ?`
    )
    .get(payload.uid) as
    | {
        id: number;
        name: string;
        email: string;
        role: UserRole;
        specialty: string | null;
        active: number;
        created_at: string;
        last_login_at: string | null;
      }
    | undefined;

  if (!user || user.active !== 1) {
    res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
    return;
  }

  req.authUser = {
    ...user,
    active: user.active === 1,
  };
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Autenticação obrigatória.' });
      return;
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      res.status(403).json({
        error: 'Acesso negado: seu perfil não possui permissão para esta operação.',
      });
      return;
    }
    next();
  };
}
