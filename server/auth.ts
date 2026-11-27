import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import type { UserRole } from '../src/types.js';

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

export const VALID_ROLES: UserRole[] = [
  'admin',
  'diretoria',
  'financeiro',
  'coordenacao_social',
  'saude',
  'psicologo',
  'medico',
  'professor',
  'voluntario',
];

export function parseUserRoles(primaryRole: UserRole, rolesJson?: string | null): UserRole[] {
  const result: UserRole[] = [];
  if (rolesJson && rolesJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(rolesJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string' && VALID_ROLES.includes(item as UserRole) && !result.includes(item as UserRole)) {
            result.push(item as UserRole);
          }
        }
      }
    } catch {
      // Fallback to primary role below
    }
  }
  if (VALID_ROLES.includes(primaryRole) && !result.includes(primaryRole)) {
    result.unshift(primaryRole);
  }
  if (result.length === 0) {
    result.push('voluntario');
  }
  return result;
}

interface TokenPayload {
  uid: number;
  email: string;
  role: UserRole;
  roles?: UserRole[];
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
  roles: UserRole[];
  specialty: string | null;
  active: boolean;
  approval_status?: 'pendente' | 'aprovado' | 'recusado';
  created_at: string;
  last_login_at: string | null;
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

export function hasUserRole(user: Pick<AuthenticatedUser, 'role' | 'roles'> | undefined, allowedRoles: readonly UserRole[]): boolean {
  if (!user) return false;
  const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
  return roles.some((r) => allowedRoles.includes(r));
}

export function isAdminBootstrapped(): boolean {
  const hasEnvPasscode = Boolean(
    process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0
  );
  if (hasEnvPasscode) return true;
  const rows = db
    .prepare(`SELECT role, roles_json FROM users`)
    .all() as { role: UserRole; roles_json: string | null }[];
  return rows.some((r) => parseUserRoles(r.role, r.roles_json).includes('admin'));
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
      `SELECT id, name, email, role, roles_json, specialty, active, approval_status, created_at, last_login_at
       FROM users WHERE id = ?`
    )
    .get(payload.uid) as
    | {
        id: number;
        name: string;
        email: string;
        role: UserRole;
        roles_json: string | null;
        specialty: string | null;
        active: number;
        approval_status: 'pendente' | 'aprovado' | 'recusado' | null;
        created_at: string;
        last_login_at: string | null;
      }
    | undefined;

  if (!user || user.active !== 1 || (user.approval_status && user.approval_status !== 'aprovado')) {
    res.status(401).json({ error: 'Usuário inativo, pendente de autorização ou não encontrado.' });
    return;
  }

  const roles = parseUserRoles(user.role, user.roles_json);
  req.authUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: roles[0],
    roles,
    specialty: user.specialty,
    active: user.active === 1,
    approval_status: user.approval_status || 'aprovado',
    created_at: user.created_at,
    last_login_at: user.last_login_at,
  };
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Autenticação obrigatória.' });
      return;
    }
    if (!hasUserRole(req.authUser, allowedRoles)) {
      res.status(403).json({
        error: 'Acesso negado: seu perfil não possui permissão para esta operação.',
      });
      return;
    }
    next();
  };
}
