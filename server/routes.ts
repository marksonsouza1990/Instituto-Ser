import crypto from 'node:crypto';
import type { Express, Response } from 'express';
import { db, logAudit } from './db.ts';
import {
  type AuthRequest,
  hashPassword,
  isAdminBootstrapped,
  requireAuth,
  requireRole,
  signAuthToken,
  verifyPassword,
} from './auth.ts';
import type { DashboardPeriod, UserRole } from '../src/types.ts';

const VALID_ROLES: UserRole[] = [
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

const FINANCE_ROLES: UserRole[] = ['admin', 'financeiro'];
const HEALTH_ROLES: UserRole[] = ['admin', 'saude', 'psicologo', 'medico'];

function getPeriodCutoff(period: DashboardPeriod): { startDate: string; monthsBack: number } {
  const ref = new Date('2026-11-23T12:00:00Z');
  const d = new Date(ref);
  let monthsBack = 6;
  if (period === 'semanal') {
    d.setDate(d.getDate() - 7);
    monthsBack = 3;
  } else if (period === 'mensal') {
    d.setDate(1);
    monthsBack = 6;
  } else if (period === 'trimestral') {
    d.setMonth(d.getMonth() - 3);
    monthsBack = 6;
  } else if (period === 'semestral') {
    d.setMonth(d.getMonth() - 6);
    monthsBack = 6;
  } else {
    d.setMonth(0, 1);
    monthsBack = 12;
  }
  return { startDate: d.toISOString().slice(0, 10), monthsBack };
}

function getMonthRange(monthsBack: number): { ym: string; label: string }[] {
  const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const result: { ym: string; label: string }[] = [];
  const baseYear = 2026;
  const baseMonth = 10; // Nov (0-indexed)
  for (let i = monthsBack - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(baseYear, baseMonth - i, 1));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth();
    const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
    result.push({ ym, label: `${labels[m]}/${String(y).slice(2)}` });
  }
  return result;
}

function safeString(val: unknown, maxLen = 500): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function safeNumber(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function registerRoutes(app: Express): void {
  // ---------------- AUTH ROUTES ----------------
  app.get('/api/auth/status', (_req, res) => {
    const hasEnvPasscode = Boolean(
      process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0
    );
    res.json({
      bootstrapped: isAdminBootstrapped(),
      hasEnvPasscode,
    });
  });

  app.post('/api/auth/bootstrap-admin', (req, res) => {
    if (isAdminBootstrapped()) {
      res.status(409).json({
        error: 'O sistema já possui um administrador configurado. Utilize o login normal.',
      });
      return;
    }
    const name = safeString(req.body?.name, 120);
    const email = safeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!name || !email || !email.includes('@')) {
      res.status(400).json({ error: 'Informe nome completo e e-mail válido.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
      return;
    }

    const passwordHash = hashPassword(password);
    const result = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, active, last_login_at)
         VALUES (?, ?, ?, 'admin', 1, datetime('now'))`
      )
      .run(name, email, passwordHash);

    const uid = Number(result.lastInsertRowid);
    const user = db
      .prepare(`SELECT id, name, email, role, specialty, active, created_at, last_login_at FROM users WHERE id = ?`)
      .get(uid) as {
      id: number;
      name: string;
      email: string;
      role: UserRole;
      specialty: string | null;
      active: number;
      created_at: string;
      last_login_at: string | null;
    };

    // Seed initial clinical sample records authored by the bootstrapped admin if empty
    const medCount = db.prepare(`SELECT COUNT(*) as cnt FROM medical_records`).get() as { cnt: number };
    if (medCount.cnt === 0) {
      const pat1 = db.prepare(`SELECT id FROM patients ORDER BY id ASC LIMIT 1`).get() as { id: number } | undefined;
      if (pat1) {
        db.prepare(`
          INSERT INTO medical_records (patient_id, author_id, author_name, specialty, evolution_text, professional_notes, referrals, lgpd_consent_verified, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, '2026-11-18')
        `).run(
          pat1.id,
          uid,
          'Dra. Beatriz Alencar (Registro Clínico)',
          'Psicologia',
          'Criança apresentou excelente vinculação terapêutica nas atividades lúdicas. Observa-se melhora na autorregulação emocional durante tarefas escolares.',
          'Manter sessões quinzenais e alinhar devolutiva com a professora de reforço.',
          'Sem necessidade de encaminhamento externo no momento.'
        );
      }
    }

    logAudit({
      userId: uid,
      userName: name,
      userRole: 'admin',
      action: 'BOOTSTRAP_ADMIN',
      entityType: 'users',
      entityId: uid,
      details: `Administrador inicial configurado (${email}).`,
      ipAddress: req.ip,
    });

    const token = signAuthToken({ uid, email, role: 'admin' });
    res.status(201).json({
      token,
      user: { ...user, active: true },
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = safeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Informe e-mail e senha.' });
      return;
    }

    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    const userRow = db
      .prepare(`SELECT * FROM users WHERE lower(email) = ?`)
      .get(email) as
      | {
          id: number;
          name: string;
          email: string;
          password_hash: string;
          role: UserRole;
          specialty: string | null;
          active: number;
          created_at: string;
          last_login_at: string | null;
        }
      | undefined;

    // Allow env passcode override for admin access when configured
    if (envPasscode && envPasscode.length > 0 && password === envPasscode) {
      let adminUser = userRow;
      if (!adminUser) {
        const anyAdmin = db
          .prepare(`SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`)
          .get() as typeof userRow;
        if (anyAdmin) {
          adminUser = anyAdmin;
        } else {
          const inserted = db
            .prepare(
              `INSERT INTO users (name, email, password_hash, role, active, last_login_at)
               VALUES (?, ?, ?, 'admin', 1, datetime('now'))`
            )
            .run('Administrador Instituto SER', email, hashPassword(envPasscode));
          adminUser = db
            .prepare(`SELECT * FROM users WHERE id = ?`)
            .get(Number(inserted.lastInsertRowid)) as typeof userRow;
        }
      }
      if (adminUser && adminUser.role === 'admin' && adminUser.active === 1) {
        db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(adminUser.id);
        logAudit({
          userId: adminUser.id,
          userName: adminUser.name,
          userRole: adminUser.role,
          action: 'LOGIN',
          entityType: 'auth',
          entityId: adminUser.id,
          details: 'Login administrativo autenticado.',
          ipAddress: req.ip,
        });
        const token = signAuthToken({
          uid: adminUser.id,
          email: adminUser.email,
          role: adminUser.role,
        });
        res.json({
          token,
          user: {
            id: adminUser.id,
            name: adminUser.name,
            email: adminUser.email,
            role: adminUser.role,
            specialty: adminUser.specialty,
            active: true,
            created_at: adminUser.created_at,
            last_login_at: new Date().toISOString(),
          },
        });
        return;
      }
    }

    if (!userRow || userRow.active !== 1 || !verifyPassword(password, userRow.password_hash)) {
      res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      return;
    }

    db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(userRow.id);
    logAudit({
      userId: userRow.id,
      userName: userRow.name,
      userRole: userRow.role,
      action: 'LOGIN',
      entityType: 'auth',
      entityId: userRow.id,
      details: `Acesso realizado no sistema (${userRow.role}).`,
      ipAddress: req.ip,
    });

    const token = signAuthToken({ uid: userRow.id, email: userRow.email, role: userRow.role });
    res.json({
      token,
      user: {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        role: userRow.role,
        specialty: userRow.specialty,
        active: true,
        created_at: userRow.created_at,
        last_login_at: new Date().toISOString(),
      },
    });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const email = safeString(req.body?.email, 160).toLowerCase();
    if (!email) {
      res.status(400).json({ error: 'Informe o e-mail cadastrado.' });
      return;
    }
    const user = db
      .prepare(`SELECT id, name, email, role FROM users WHERE lower(email) = ? AND active = 1`)
      .get(email) as { id: number; name: string; email: string; role: string } | undefined;

    if (user) {
      const rawToken = crypto.randomBytes(16).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
      db.prepare(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)`).run(
        user.id,
        tokenHash,
        expiresAt
      );
      logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'PASSWORD_RESET_REQUEST',
        entityType: 'users',
        entityId: user.id,
        details: `Solicitação de recuperação de senha registrada para ${user.email}.`,
        ipAddress: req.ip,
      });
    }

    res.json({
      message:
        'Se o e-mail estiver ativo na instituição, a solicitação de recuperação foi registrada para validação administrativa.',
    });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const email = safeString(req.body?.email, 160).toLowerCase();
    const resetCode = safeString(req.body?.code, 128);
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!email || !resetCode || newPassword.length < 6) {
      res.status(400).json({ error: 'Dados incompletos ou senha menor que 6 caracteres.' });
      return;
    }

    const user = db
      .prepare(`SELECT id, name, role FROM users WHERE lower(email) = ? AND active = 1`)
      .get(email) as { id: number; name: string; role: string } | undefined;

    if (!user) {
      res.status(400).json({ error: 'Código de recuperação inválido ou expirado.' });
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(resetCode).digest('hex');
    const resetRow = db
      .prepare(
        `SELECT id, expires_at, used_at FROM password_resets
         WHERE user_id = ? AND token_hash = ?
         ORDER BY id DESC LIMIT 1`
      )
      .get(user.id, tokenHash) as { id: number; expires_at: string; used_at: string | null } | undefined;

    if (!resetRow || resetRow.used_at || new Date(resetRow.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'Código de recuperação inválido ou expirado.' });
      return;
    }

    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(
      hashPassword(newPassword),
      user.id
    );
    db.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`).run(resetRow.id);

    logAudit({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PASSWORD_RESET_COMPLETE',
      entityType: 'users',
      entityId: user.id,
      details: `Senha redefinida via código de recuperação.`,
      ipAddress: req.ip,
    });

    res.json({ message: 'Senha redefinida com sucesso.' });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    res.json({ user: req.authUser });
  });

  // ---------------- DASHBOARD ----------------
  app.get('/api/dashboard', requireAuth, (req: AuthRequest, res) => {
    const periodParam = safeString(req.query.period, 20) as DashboardPeriod;
    const period: DashboardPeriod = ['semanal', 'mensal', 'trimestral', 'semestral', 'anual'].includes(
      periodParam
    )
      ? periodParam
      : 'mensal';

    const { startDate, monthsBack } = getPeriodCutoff(period);
    const months = getMonthRange(monthsBack);
    const role = req.authUser!.role;
    const canSeeFinance = FINANCE_ROLES.includes(role);
    const canSeeHealth = HEALTH_ROLES.includes(role);

    const totalStudents = (db.prepare(`SELECT COUNT(*) as c FROM students`).get() as { c: number }).c;
    const activeStudents = (
      db.prepare(`SELECT COUNT(*) as c FROM students WHERE status = 'ativo'`).get() as { c: number }
    ).c;
    const totalPatients = canSeeHealth
      ? (db.prepare(`SELECT COUNT(*) as c FROM patients`).get() as { c: number }).c
      : 0;

    const completedHealth = canSeeHealth
      ? (
          db
            .prepare(
              `SELECT COUNT(*) as c FROM appointments WHERE status = 'Realizada' AND scheduled_date >= ?`
            )
            .get(startDate) as { c: number }
        ).c
      : 0;
    const attendancePresences = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM attendance_records WHERE status = 'presente' AND date >= ?`
        )
        .get(startDate) as { c: number }
    ).c;
    const periodAttendances = completedHealth + attendancePresences;

    const assistedFamilies = (
      db.prepare(`SELECT COUNT(*) as c FROM families WHERE active = 1`).get() as { c: number }
    ).c;
    const activeVolunteers = (
      db.prepare(`SELECT COUNT(*) as c FROM volunteers WHERE status = 'ativo'`).get() as { c: number }
    ).c;
    const activeDonors = (
      db.prepare(`SELECT COUNT(*) as c FROM donors WHERE status = 'ativo'`).get() as { c: number }
    ).c;

    const periodRevenue = canSeeFinance
      ? (
          db
            .prepare(
              `SELECT COALESCE(SUM(amount), 0) as s FROM financial_transactions
               WHERE type = 'receita' AND status = 'Recebido' AND issue_date >= ?`
            )
            .get(startDate) as { s: number }
        ).s
      : 0;

    const periodExpenses = canSeeFinance
      ? (
          db
            .prepare(
              `SELECT COALESCE(SUM(amount), 0) as s FROM financial_transactions
               WHERE type = 'despesa' AND status = 'Pago' AND issue_date >= ?`
            )
            .get(startDate) as { s: number }
        ).s
      : 0;

    const allRec = canSeeFinance
      ? (
          db
            .prepare(
              `SELECT COALESCE(SUM(amount), 0) as s FROM financial_transactions WHERE type = 'receita' AND status = 'Recebido'`
            )
            .get() as { s: number }
        ).s
      : 0;
    const allPay = canSeeFinance
      ? (
          db
            .prepare(
              `SELECT COALESCE(SUM(amount), 0) as s FROM financial_transactions WHERE type = 'despesa' AND status = 'Pago'`
            )
            .get() as { s: number }
        ).s
      : 0;
    const availableBalance = allRec - allPay;

    const pendingAttendances = canSeeHealth
      ? (
          db
            .prepare(
              `SELECT COUNT(*) as c FROM appointments WHERE status IN ('Agendada', 'Retorno Agendado')`
            )
            .get() as { c: number }
        ).c
      : 0;

    const benefitedChildren = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT id) as c FROM students WHERE status IN ('ativo', 'aguardando_vaga')`
        )
        .get() as { c: number }
    ).c;

    // Charts
    // 1. Monthly children evolution (cumulative active/entered students up to each month)
    const monthlyChildrenEvolution = months.map((m) => {
      const cutoff = `${m.ym}-31`;
      const row = db
        .prepare(`SELECT COUNT(*) as c FROM students WHERE entry_date <= ? AND status != 'desligado'`)
        .get(cutoff) as { c: number };
      return { label: m.label, count: row.c };
    });

    // 2. Attendances by modality
    const studentsRows = db.prepare(`SELECT programs_json FROM students WHERE status = 'ativo'`).all() as {
      programs_json: string;
    }[];
    const modalityMap = new Map<string, number>();
    for (const r of studentsRows) {
      try {
        const list = JSON.parse(r.programs_json) as string[];
        for (const p of list) {
          modalityMap.set(p, (modalityMap.get(p) ?? 0) + 1);
        }
      } catch {
        // ignore invalid json
      }
    }
    modalityMap.set('Assistência Familiar', assistedFamilies);
    const attendancesByModality = Array.from(modalityMap.entries()).map(([modality, count]) => ({
      modality,
      count,
    }));

    // 3. Revenue vs Expenses per month
    const revenueVsExpenses = months.map((m) => {
      if (!canSeeFinance) return { label: m.label, revenue: 0, expenses: 0 };
      const rev = (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount), 0) as s FROM financial_transactions
             WHERE type = 'receita' AND substr(issue_date, 1, 7) = ?`
          )
          .get(m.ym) as { s: number }
      ).s;
      const exp = (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount), 0) as s FROM financial_transactions
             WHERE type = 'despesa' AND substr(issue_date, 1, 7) = ?`
          )
          .get(m.ym) as { s: number }
      ).s;
      return { label: m.label, revenue: rev, expenses: exp };
    });

    // 4. Expenses by category
    const expCatRows = canSeeFinance
      ? (db
          .prepare(
            `SELECT category, COALESCE(SUM(amount), 0) as amount
             FROM financial_transactions
             WHERE type = 'despesa' AND issue_date >= ?
             GROUP BY category ORDER BY amount DESC`
          )
          .all(startDate) as { category: string; amount: number }[])
      : [];
    const totalExpCat = expCatRows.reduce((acc, r) => acc + r.amount, 0) || 1;
    const expensesByCategory = expCatRows.map((r) => ({
      category: r.category,
      amount: r.amount,
      percentage: Math.round((r.amount / totalExpCat) * 100),
    }));

    // 5. Donations evolution
    const donationsEvolution = months.map((m) => {
      if (!canSeeFinance) return { label: m.label, amount: 0 };
      const s = (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount), 0) as s FROM financial_transactions
             WHERE type = 'receita' AND substr(issue_date, 1, 7) = ?`
          )
          .get(m.ym) as { s: number }
      ).s;
      return { label: m.label, amount: s };
    });

    // 6. Health attendances (Psicologia vs Médico)
    const healthAttendances = canSeeHealth
      ? months.map((m) => {
          const psi = (
            db
              .prepare(
                `SELECT COUNT(*) as c FROM appointments
                 WHERE specialty = 'Psicologia' AND status = 'Realizada' AND substr(scheduled_date, 1, 7) = ?`
              )
              .get(m.ym) as { c: number }
          ).c;
          const med = (
            db
              .prepare(
                `SELECT COUNT(*) as c FROM appointments
                 WHERE specialty != 'Psicologia' AND status = 'Realizada' AND substr(scheduled_date, 1, 7) = ?`
              )
              .get(m.ym) as { c: number }
          ).c;
          return { label: m.label, psicologia: psi, medico: med };
        })
      : [];

    // 7. Families evolution
    const familiesEvolution = months.map((m) => {
      const c = (
        db
          .prepare(`SELECT COUNT(*) as c FROM families WHERE active = 1 AND substr(created_at, 1, 7) <= ?`)
          .get(m.ym) as { c: number }
      ).c;
      return { label: m.label, count: c };
    });

    // 8. Social impact evolution (composite derived directly from real records)
    const socialImpactEvolution = months.map((m) => {
      const att = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM attendance_records WHERE status = 'presente' AND substr(date, 1, 7) = ?`
          )
          .get(m.ym) as { c: number }
      ).c;
      const app = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM appointments WHERE status = 'Realizada' AND substr(scheduled_date, 1, 7) = ?`
          )
          .get(m.ym) as { c: number }
      ).c;
      const vh = (
        db
          .prepare(
            `SELECT COALESCE(SUM(hours), 0) as h FROM volunteer_hours WHERE substr(activity_date, 1, 7) = ?`
          )
          .get(m.ym) as { h: number }
      ).h;
      const stu = (
        db
          .prepare(`SELECT COUNT(*) as c FROM students WHERE entry_date <= ? AND status = 'ativo'`)
          .get(`${m.ym}-31`) as { c: number }
      ).c;
      const score = Math.round(stu * 6 + (att + app) * 2 + vh * 1.5);
      return { label: m.label, score, attendances: att + app, volunteerHours: vh };
    });

    // Feeds
    const recentTransactions = canSeeFinance
      ? db
          .prepare(
            `SELECT t.*, p.name as project_name, s.trade_name as supplier_name, d.name as donor_name
             FROM financial_transactions t
             LEFT JOIN projects p ON p.id = t.project_id
             LEFT JOIN suppliers s ON s.id = t.supplier_id
             LEFT JOIN donors d ON d.id = t.donor_id
             ORDER BY t.issue_date DESC, t.id DESC LIMIT 6`
          )
          .all()
      : [];

    const upcomingAppointments = canSeeHealth
      ? db
          .prepare(
            `SELECT a.*, COALESCE(st.full_name, pt.full_name) as patient_name
             FROM appointments a
             JOIN patients pt ON pt.id = a.patient_id
             LEFT JOIN students st ON st.id = pt.student_id
             WHERE a.status IN ('Agendada', 'Retorno Agendado')
             ORDER BY a.scheduled_date ASC, a.scheduled_time ASC LIMIT 6`
          )
          .all()
      : [];

    const upcomingEvents = db
      .prepare(
        `SELECT e.*, p.name as project_name
         FROM events e
         LEFT JOIN projects p ON p.id = e.project_id
         ORDER BY e.event_date ASC LIMIT 5`
      )
      .all();

    const payableAlerts = canSeeFinance
      ? db
          .prepare(
            `SELECT t.*, p.name as project_name, s.trade_name as supplier_name
             FROM financial_transactions t
             LEFT JOIN projects p ON p.id = t.project_id
             LEFT JOIN suppliers s ON s.id = t.supplier_id
             WHERE t.type = 'despesa' AND t.status IN ('Pendente', 'Vencido')
             ORDER BY t.due_date ASC LIMIT 6`
          )
          .all()
      : [];

    // Students without LGPD consent / authorization document
    const pendingDocumentsAlerts = db
      .prepare(
        `SELECT s.id as student_id, s.full_name as student_name, 'Termo LGPD / Autorização pendente' as missing
         FROM students s
         WHERE s.status = 'ativo'
           AND NOT EXISTS (
             SELECT 1 FROM documents d
             WHERE d.person_type = 'aluno' AND d.person_id = s.id
               AND d.category IN ('Termo de Consentimento LGPD', 'Autorização de Responsável')
           )
         ORDER BY s.full_name ASC`
      )
      .all();

    // Birthdays in current month (November = '11')
    const currentMonth = '11';
    const stuBirthdays = db
      .prepare(
        `SELECT id, full_name as name, birth_date FROM students
         WHERE substr(birth_date, 6, 2) = ? AND status = 'ativo'`
      )
      .all(currentMonth) as { id: number; name: string; birth_date: string }[];
    const volBirthdays = db
      .prepare(
        `SELECT id, full_name as name, birth_date FROM volunteers
         WHERE birth_date IS NOT NULL AND substr(birth_date, 6, 2) = ? AND status = 'ativo'`
      )
      .all(currentMonth) as { id: number; name: string; birth_date: string }[];
    const monthlyBirthdays = [
      ...stuBirthdays.map((b) => ({
        id: b.id,
        name: b.name,
        type: 'Aluno' as const,
        birth_date: b.birth_date,
        day: Number(b.birth_date.slice(8, 10)),
      })),
      ...volBirthdays.map((b) => ({
        id: b.id,
        name: b.name,
        type: 'Voluntário' as const,
        birth_date: b.birth_date,
        day: Number(b.birth_date.slice(8, 10)),
      })),
    ].sort((a, b) => a.day - b.day);

    const allRecentActivities = db
      .prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 25`)
      .all() as { entity_type: string; [key: string]: unknown }[];
    const recentActivities = allRecentActivities
      .filter((act) => {
        if (!canSeeFinance && ['financial_transactions', 'financial_history', 'suppliers'].includes(act.entity_type)) {
          return false;
        }
        if (!canSeeHealth && ['patients', 'appointments', 'medical_records'].includes(act.entity_type)) {
          return false;
        }
        return true;
      })
      .slice(0, 8);

    res.json({
      period,
      kpis: {
        totalStudents,
        activeStudents,
        totalPatients,
        periodAttendances,
        assistedFamilies,
        activeVolunteers,
        activeDonors,
        periodRevenue,
        periodExpenses,
        availableBalance,
        pendingAttendances,
        benefitedChildren,
      },
      charts: {
        monthlyChildrenEvolution,
        attendancesByModality,
        revenueVsExpenses,
        expensesByCategory,
        donationsEvolution,
        healthAttendances,
        familiesEvolution,
        socialImpactEvolution,
      },
      feeds: {
        recentTransactions,
        upcomingAppointments,
        upcomingEvents,
        payableAlerts,
        pendingDocumentsAlerts,
        monthlyBirthdays,
        recentActivities,
      },
    });
  });

  // ---------------- FAMILIES ----------------
  app.get(
    '/api/families',
    requireAuth,
    requireRole('admin', 'diretoria', 'coordenacao_social', ...HEALTH_ROLES, 'professor'),
    (_req, res) => {
      const rows = db
        .prepare(
          `SELECT f.*, (SELECT COUNT(*) FROM students s WHERE s.family_id = f.id) as student_count
           FROM families f ORDER BY f.responsible_name ASC`
        )
        .all();
      res.json(rows);
    }
  );

  app.post(
    '/api/families',
    requireAuth,
    requireRole('admin', 'coordenacao_social'),
    (req: AuthRequest, res) => {
      const responsible_name = safeString(req.body?.responsible_name, 160);
      const responsible_phone = safeString(req.body?.responsible_phone, 40);
      const responsible_cpf = safeString(req.body?.responsible_cpf, 20) || null;
      const address = safeString(req.body?.address, 250);
      const neighborhood = safeString(req.body?.neighborhood, 120);
      const household_size = Math.max(1, safeNumber(req.body?.household_size, 1));
      const working_members = Math.max(0, safeNumber(req.body?.working_members, 0));
      const family_income = Math.max(0, safeNumber(req.body?.family_income, 0));
      const vulnerability_level = safeString(req.body?.vulnerability_level, 40) || 'Moderada';
      const vulnerability_notes = safeString(req.body?.vulnerability_notes, 1000);
      const assistance_history = safeString(req.body?.assistance_history, 1000);

      if (!responsible_name || !responsible_phone || !address) {
        res.status(400).json({ error: 'Responsável, telefone e endereço são obrigatórios.' });
        return;
      }

      if (responsible_cpf) {
        const dup = db
          .prepare(`SELECT id FROM families WHERE responsible_cpf = ?`)
          .get(responsible_cpf);
        if (dup) {
          res.status(409).json({ error: 'Já existe uma família cadastrada com este CPF.' });
          return;
        }
      }

      const result = db
        .prepare(
          `INSERT INTO families (responsible_name, responsible_phone, responsible_cpf, address, neighborhood, household_size, working_members, family_income, vulnerability_level, vulnerability_notes, assistance_history)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          responsible_name,
          responsible_phone,
          responsible_cpf,
          address,
          neighborhood,
          household_size,
          working_members,
          family_income,
          vulnerability_level,
          vulnerability_notes,
          assistance_history
        );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'CREATE',
        entityType: 'families',
        entityId: Number(result.lastInsertRowid),
        details: `Família de ${responsible_name} cadastrada.`,
      });

      const created = db.prepare(`SELECT * FROM families WHERE id = ?`).get(Number(result.lastInsertRowid));
      res.status(201).json(created);
    }
  );

  app.put(
    '/api/families/:id',
    requireAuth,
    requireRole('admin', 'coordenacao_social', 'diretoria'),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM families WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Família não encontrada.' });
        return;
      }

      const responsible_name = safeString(req.body?.responsible_name, 160) || String(existing.responsible_name);
      const responsible_phone = safeString(req.body?.responsible_phone, 40) || String(existing.responsible_phone);
      const responsible_cpf =
        req.body?.responsible_cpf !== undefined
          ? safeString(req.body.responsible_cpf, 20) || null
          : (existing.responsible_cpf as string | null);
      const address = safeString(req.body?.address, 250) || String(existing.address);
      const neighborhood = safeString(req.body?.neighborhood, 120);
      const household_size = Math.max(1, safeNumber(req.body?.household_size, Number(existing.household_size)));
      const working_members = Math.max(0, safeNumber(req.body?.working_members, Number(existing.working_members)));
      const family_income = Math.max(0, safeNumber(req.body?.family_income, Number(existing.family_income)));
      const vulnerability_level = safeString(req.body?.vulnerability_level, 40) || String(existing.vulnerability_level);
      const vulnerability_notes = safeString(req.body?.vulnerability_notes, 1000);
      const assistance_history = safeString(req.body?.assistance_history, 1000);
      const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : Number(existing.active);

      if (responsible_cpf) {
        const dup = db
          .prepare(`SELECT id FROM families WHERE responsible_cpf = ? AND id != ?`)
          .get(responsible_cpf, id);
        if (dup) {
          res.status(409).json({ error: 'Já existe outra família cadastrada com este CPF.' });
          return;
        }
      }

      db.prepare(
        `UPDATE families SET
          responsible_name = ?, responsible_phone = ?, responsible_cpf = ?, address = ?, neighborhood = ?,
          household_size = ?, working_members = ?, family_income = ?, vulnerability_level = ?,
          vulnerability_notes = ?, assistance_history = ?, active = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        responsible_name,
        responsible_phone,
        responsible_cpf,
        address,
        neighborhood,
        household_size,
        working_members,
        family_income,
        vulnerability_level,
        vulnerability_notes,
        assistance_history,
        active,
        id
      );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'families',
        entityId: id,
        details: `Cadastro familiar de ${responsible_name} atualizado.`,
      });

      res.json(db.prepare(`SELECT * FROM families WHERE id = ?`).get(id));
    }
  );

  // ---------------- STUDENTS ----------------
  app.get('/api/students', requireAuth, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT s.*,
          (SELECT p.id FROM patients p WHERE p.student_id = s.id LIMIT 1) as linked_patient_id,
          (SELECT ROUND(100.0 * SUM(CASE WHEN ar.status IN ('presente','justificada') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0))
           FROM attendance_records ar WHERE ar.student_id = s.id) as attendance_rate
         FROM students s
         ORDER BY s.full_name ASC`
      )
      .all() as Record<string, unknown>[];

    const mapped = rows.map((r) => ({
      ...r,
      programs: (() => {
        try {
          return JSON.parse(String(r.programs_json || '[]'));
        } catch {
          return [];
        }
      })(),
    }));
    res.json(mapped);
  });

  app.get('/api/students/:id', requireAuth, (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const row = db
      .prepare(
        `SELECT s.*,
          (SELECT p.id FROM patients p WHERE p.student_id = s.id LIMIT 1) as linked_patient_id,
          (SELECT ROUND(100.0 * SUM(CASE WHEN ar.status IN ('presente','justificada') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0))
           FROM attendance_records ar WHERE ar.student_id = s.id) as attendance_rate
         FROM students s WHERE s.id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Aluno não encontrado.' });
      return;
    }

    const evolutions = db
      .prepare(`SELECT * FROM student_evolutions WHERE student_id = ? ORDER BY recorded_at DESC, id DESC`)
      .all(id);
    const attendance = db
      .prepare(
        `SELECT ar.*, ac.name as class_name
         FROM attendance_records ar
         JOIN attendance_classes ac ON ac.id = ar.class_id
         WHERE ar.student_id = ?
         ORDER BY ar.date DESC LIMIT 30`
      )
      .all(id);
    const documents = db
      .prepare(
        `SELECT id, title, category, person_type, person_id, person_name, project_id, access_level, file_name, file_mime, file_size, uploaded_by, uploaded_at
         FROM documents WHERE person_type = 'aluno' AND person_id = ?
         ORDER BY uploaded_at DESC`
      )
      .all(id);
    const canSeeHealth = HEALTH_ROLES.includes(req.authUser!.role);
    const appointments = canSeeHealth
      ? db
          .prepare(
            `SELECT a.*
             FROM appointments a
             JOIN patients p ON p.id = a.patient_id
             WHERE p.student_id = ?
             ORDER BY a.scheduled_date DESC`
          )
          .all(id)
      : [];

    const programs = (() => {
      try {
        return JSON.parse(String(row.programs_json || '[]'));
      } catch {
        return [];
      }
    })();

    res.json({
      student: { ...row, programs },
      evolutions,
      attendance,
      documents,
      appointments,
    });
  });

  app.post(
    '/api/students',
    requireAuth,
    requireRole('admin', 'coordenacao_social', 'professor'),
    (req: AuthRequest, res) => {
      const full_name = safeString(req.body?.full_name, 160);
      const birth_date = safeString(req.body?.birth_date, 20);
      const cpf = safeString(req.body?.cpf, 20) || null;
      const rg = safeString(req.body?.rg, 30) || null;
      const address = safeString(req.body?.address, 250);
      const school_name = safeString(req.body?.school_name, 160);
      const school_year = safeString(req.body?.school_year, 60);
      const school_shift = safeString(req.body?.school_shift, 40) || 'Manhã';
      const guardian_name = safeString(req.body?.guardian_name, 160);
      const guardian_phone = safeString(req.body?.guardian_phone, 40);
      const family_id = req.body?.family_id ? Number(req.body.family_id) : null;
      const family_composition = safeString(req.body?.family_composition, 200);
      const household_size = Math.max(1, safeNumber(req.body?.household_size, 1));
      const family_income = Math.max(0, safeNumber(req.body?.family_income, 0));
      const working_members = Math.max(0, safeNumber(req.body?.working_members, 0));
      const vulnerability_situation = safeString(req.body?.vulnerability_situation, 500);
      const identified_needs = safeString(req.body?.identified_needs, 500);
      const assistance_history = safeString(req.body?.assistance_history, 1000);
      const social_notes = safeString(req.body?.social_notes, 1000);
      const programs = Array.isArray(req.body?.programs)
        ? req.body.programs.map((p: unknown) => String(p).slice(0, 80))
        : [];
      const status = safeString(req.body?.status, 30) || 'ativo';
      const entry_date = safeString(req.body?.entry_date, 20) || '2026-11-23';

      if (!full_name || !birth_date || !guardian_name || !guardian_phone) {
        res.status(400).json({ error: 'Nome, data de nascimento e dados do responsável são obrigatórios.' });
        return;
      }

      if (cpf) {
        const dupCpf = db.prepare(`SELECT id FROM students WHERE cpf = ?`).get(cpf);
        if (dupCpf) {
          res.status(409).json({ error: 'Já existe um aluno cadastrado com este CPF.' });
          return;
        }
      }

      const dupNameBirth = db
        .prepare(`SELECT id FROM students WHERE lower(full_name) = lower(?) AND birth_date = ?`)
        .get(full_name, birth_date);
      if (dupNameBirth) {
        res.status(409).json({ error: 'Cadastro duplicado: já existe aluno com mesmo nome e data de nascimento.' });
        return;
      }

      const result = db
        .prepare(
          `INSERT INTO students (
            family_id, full_name, birth_date, cpf, rg, address, school_name, school_year, school_shift,
            guardian_name, guardian_phone, family_composition, household_size, family_income, working_members,
            vulnerability_situation, identified_needs, assistance_history, social_notes, programs_json, status, entry_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          family_id,
          full_name,
          birth_date,
          cpf,
          rg,
          address,
          school_name,
          school_year,
          school_shift,
          guardian_name,
          guardian_phone,
          family_composition,
          household_size,
          family_income,
          working_members,
          vulnerability_situation,
          identified_needs,
          assistance_history,
          social_notes,
          JSON.stringify(programs),
          status,
          entry_date
        );

      const studentId = Number(result.lastInsertRowid);
      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'CREATE',
        entityType: 'students',
        entityId: studentId,
        details: `Aluno ${full_name} cadastrado.`,
      });

      const created = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId) as Record<string, unknown>;
      res.status(201).json({ ...created, programs });
    }
  );

  app.put(
    '/api/students/:id',
    requireAuth,
    requireRole('admin', 'coordenacao_social', 'professor'),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM students WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Aluno não encontrado.' });
        return;
      }

      const full_name = safeString(req.body?.full_name, 160) || String(existing.full_name);
      const birth_date = safeString(req.body?.birth_date, 20) || String(existing.birth_date);
      const cpf = req.body?.cpf !== undefined ? safeString(req.body.cpf, 20) || null : (existing.cpf as string | null);
      const rg = req.body?.rg !== undefined ? safeString(req.body.rg, 30) || null : (existing.rg as string | null);
      const address = safeString(req.body?.address, 250);
      const school_name = safeString(req.body?.school_name, 160);
      const school_year = safeString(req.body?.school_year, 60);
      const school_shift = safeString(req.body?.school_shift, 40) || String(existing.school_shift);
      const guardian_name = safeString(req.body?.guardian_name, 160);
      const guardian_phone = safeString(req.body?.guardian_phone, 40);
      const household_size = Math.max(1, safeNumber(req.body?.household_size, Number(existing.household_size)));
      const family_income = Math.max(0, safeNumber(req.body?.family_income, Number(existing.family_income)));
      const working_members = Math.max(0, safeNumber(req.body?.working_members, Number(existing.working_members)));
      const vulnerability_situation = safeString(req.body?.vulnerability_situation, 500);
      const identified_needs = safeString(req.body?.identified_needs, 500);
      const assistance_history = safeString(req.body?.assistance_history, 1000);
      const social_notes = safeString(req.body?.social_notes, 1000);
      const programs = Array.isArray(req.body?.programs)
        ? req.body.programs.map((p: unknown) => String(p).slice(0, 80))
        : JSON.parse(String(existing.programs_json || '[]'));
      const status = safeString(req.body?.status, 30) || String(existing.status);

      if (cpf) {
        const dup = db.prepare(`SELECT id FROM students WHERE cpf = ? AND id != ?`).get(cpf, id);
        if (dup) {
          res.status(409).json({ error: 'CPF já vinculado a outro aluno.' });
          return;
        }
      }

      db.prepare(
        `UPDATE students SET
          full_name = ?, birth_date = ?, cpf = ?, rg = ?, address = ?, school_name = ?, school_year = ?, school_shift = ?,
          guardian_name = ?, guardian_phone = ?, household_size = ?, family_income = ?, working_members = ?,
          vulnerability_situation = ?, identified_needs = ?, assistance_history = ?, social_notes = ?,
          programs_json = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        full_name,
        birth_date,
        cpf,
        rg,
        address,
        school_name,
        school_year,
        school_shift,
        guardian_name,
        guardian_phone,
        household_size,
        family_income,
        working_members,
        vulnerability_situation,
        identified_needs,
        assistance_history,
        social_notes,
        JSON.stringify(programs),
        status,
        id
      );

      // Sync linked patient personal fields automatically
      db.prepare(
        `UPDATE patients SET full_name = ?, birth_date = ?, cpf = ?, guardian_name = ?, contact_phone = ?, updated_at = datetime('now')
         WHERE student_id = ?`
      ).run(full_name, birth_date, cpf, guardian_name, guardian_phone, id);

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'students',
        entityId: id,
        details: `Ficha do aluno ${full_name} atualizada.`,
      });

      res.json({ ok: true });
    }
  );

  app.post(
    '/api/students/:id/evolutions',
    requireAuth,
    requireRole('admin', 'coordenacao_social', 'professor', ...HEALTH_ROLES),
    (req: AuthRequest, res) => {
      const studentId = Number(req.params.id);
      const category = safeString(req.body?.category, 60) || 'Pedagógico';
      const note = safeString(req.body?.note, 2000);
      const recorded_at = safeString(req.body?.recorded_at, 20) || '2026-11-23';

      if (!note) {
        res.status(400).json({ error: 'Descreva o registro de evolução.' });
        return;
      }

      const r = db
        .prepare(
          `INSERT INTO student_evolutions (student_id, author_id, author_name, category, note, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(studentId, req.authUser!.id, req.authUser!.name, category, note, recorded_at);

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'CREATE',
        entityType: 'student_evolutions',
        entityId: Number(r.lastInsertRowid),
        details: `Evolução (${category}) registrada para aluno #${studentId}.`,
      });

      res.status(201).json(
        db.prepare(`SELECT * FROM student_evolutions WHERE id = ?`).get(Number(r.lastInsertRowid))
      );
    }
  );

  // ---------------- PATIENTS, APPOINTMENTS & RESTRICTED MEDICAL RECORDS ----------------
  // STRICT HEALTH RBAC: ONLY admin, saude, psicologo, medico
  app.get(
    '/api/patients',
    requireAuth,
    requireRole(...HEALTH_ROLES),
    (_req, res) => {
      const rows = db
        .prepare(
          `SELECT p.id, p.student_id,
            COALESCE(s.full_name, p.full_name) as full_name,
            COALESCE(s.birth_date, p.birth_date) as birth_date,
            COALESCE(s.cpf, p.cpf) as cpf,
            COALESCE(s.guardian_name, p.guardian_name) as guardian_name,
            COALESCE(s.guardian_phone, p.contact_phone) as contact_phone,
            p.responsible_professional, p.specialty, p.follow_up_status,
            p.blood_type, p.emergency_contact, p.clinical_allergies, p.clinical_medications,
            p.clinical_history, p.school_observations, p.family_dynamics,
            p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id) as total_appointments
           FROM patients p
           LEFT JOIN students s ON s.id = p.student_id
           ORDER BY full_name ASC`
        )
        .all();
      res.json(rows);
    }
  );

  app.post(
    '/api/patients',
    requireAuth,
    requireRole(...HEALTH_ROLES),
    (req: AuthRequest, res) => {
      const student_id = req.body?.student_id ? Number(req.body.student_id) : null;
      const responsible_professional = safeString(req.body?.responsible_professional, 160);
      const specialty = safeString(req.body?.specialty, 80);
      const follow_up_status = safeString(req.body?.follow_up_status, 60) || 'Em acompanhamento';
      const blood_type = safeString(req.body?.blood_type, 20);
      const emergency_contact = safeString(req.body?.emergency_contact, 160);
      const clinical_allergies = safeString(req.body?.clinical_allergies, 1000);
      const clinical_medications = safeString(req.body?.clinical_medications, 1000);
      const clinical_history = safeString(req.body?.clinical_history, 2000);
      const school_observations = safeString(req.body?.school_observations, 1000);
      const family_dynamics = safeString(req.body?.family_dynamics, 1000);

      if (!responsible_professional || !specialty) {
        res.status(400).json({ error: 'Profissional responsável e especialidade são obrigatórios.' });
        return;
      }

      let full_name = safeString(req.body?.full_name, 160);
      let birth_date = safeString(req.body?.birth_date, 20);
      let cpf = safeString(req.body?.cpf, 20) || null;
      let guardian_name = safeString(req.body?.guardian_name, 160);
      let contact_phone = safeString(req.body?.contact_phone, 40);

      if (student_id) {
        const already = db.prepare(`SELECT id FROM patients WHERE student_id = ?`).get(student_id);
        if (already) {
          res.status(409).json({ error: 'Este aluno já está vinculado como paciente (sem duplicidade).' });
          return;
        }
        const stu = db.prepare(`SELECT * FROM students WHERE id = ?`).get(student_id) as
          | Record<string, unknown>
          | undefined;
        if (!stu) {
          res.status(404).json({ error: 'Aluno selecionado não encontrado.' });
          return;
        }
        full_name = String(stu.full_name);
        birth_date = String(stu.birth_date);
        cpf = stu.cpf ? String(stu.cpf) : null;
        guardian_name = String(stu.guardian_name);
        contact_phone = String(stu.guardian_phone);
      } else {
        if (!full_name || !birth_date || !guardian_name || !contact_phone) {
          res.status(400).json({ error: 'Preencha todos os dados pessoais e de contato do paciente.' });
          return;
        }
        if (cpf) {
          const dup = db.prepare(`SELECT id FROM patients WHERE cpf = ?`).get(cpf);
          if (dup) {
            res.status(409).json({ error: 'Já existe paciente cadastrado com este CPF.' });
            return;
          }
        }
      }

      const r = db
        .prepare(
          `INSERT INTO patients (
            student_id, full_name, birth_date, cpf, guardian_name, contact_phone,
            responsible_professional, specialty, follow_up_status,
            blood_type, emergency_contact, clinical_allergies, clinical_medications,
            clinical_history, school_observations, family_dynamics
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          student_id,
          full_name,
          birth_date,
          cpf,
          guardian_name,
          contact_phone,
          responsible_professional,
          specialty,
          follow_up_status,
          blood_type,
          emergency_contact,
          clinical_allergies,
          clinical_medications,
          clinical_history,
          school_observations,
          family_dynamics
        );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'CREATE',
        entityType: 'patients',
        entityId: Number(r.lastInsertRowid),
        details: `Paciente ${full_name} cadastrado${student_id ? ` (vinculado ao aluno #${student_id})` : ''}.`,
      });

      res.status(201).json(db.prepare(`SELECT * FROM patients WHERE id = ?`).get(Number(r.lastInsertRowid)));
    }
  );

  app.put(
    '/api/patients/:id/clinical-profile',
    requireAuth,
    requireRole(...HEALTH_ROLES),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Paciente não encontrado.' });
        return;
      }

      const responsible_professional =
        safeString(req.body?.responsible_professional, 160) || String(existing.responsible_professional);
      const specialty = safeString(req.body?.specialty, 80) || String(existing.specialty);
      const follow_up_status =
        safeString(req.body?.follow_up_status, 60) || String(existing.follow_up_status);
      const blood_type = safeString(req.body?.blood_type, 20);
      const emergency_contact = safeString(req.body?.emergency_contact, 160);
      const clinical_allergies = safeString(req.body?.clinical_allergies, 1000);
      const clinical_medications = safeString(req.body?.clinical_medications, 1000);
      const clinical_history = safeString(req.body?.clinical_history, 3000);
      const school_observations = safeString(req.body?.school_observations, 1500);
      const family_dynamics = safeString(req.body?.family_dynamics, 1500);

      db.prepare(
        `UPDATE patients SET
          responsible_professional = ?, specialty = ?, follow_up_status = ?,
          blood_type = ?, emergency_contact = ?, clinical_allergies = ?, clinical_medications = ?,
          clinical_history = ?, school_observations = ?, family_dynamics = ?,
          updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        responsible_professional,
        specialty,
        follow_up_status,
        blood_type,
        emergency_contact,
        clinical_allergies,
        clinical_medications,
        clinical_history,
        school_observations,
        family_dynamics,
        id
      );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'ACCESS_MEDICAL_RECORD',
        entityType: 'patients',
        entityId: id,
        details: `Ficha clínica completa do paciente #${id} atualizada no prontuário.`,
        ipAddress: req.ip,
      });

      res.json(db.prepare(`SELECT * FROM patients WHERE id = ?`).get(id));
    }
  );

  app.put(
    '/api/patients/:id',
    requireAuth,
    requireRole(...HEALTH_ROLES),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Paciente não encontrado.' });
        return;
      }

      const full_name = safeString(req.body?.full_name, 160) || String(existing.full_name);
      const birth_date = safeString(req.body?.birth_date, 20) || String(existing.birth_date);
      const cpf = req.body?.cpf !== undefined ? safeString(req.body.cpf, 20) || null : (existing.cpf as string | null);
      const guardian_name = safeString(req.body?.guardian_name, 160) || String(existing.guardian_name);
      const contact_phone = safeString(req.body?.contact_phone, 40) || String(existing.contact_phone);
      const responsible_professional =
        safeString(req.body?.responsible_professional, 160) || String(existing.responsible_professional);
      const specialty = safeString(req.body?.specialty, 80) || String(existing.specialty);
      const follow_up_status =
        safeString(req.body?.follow_up_status, 60) || String(existing.follow_up_status);
      const blood_type =
        req.body?.blood_type !== undefined ? safeString(req.body.blood_type, 20) : String(existing.blood_type || '');
      const emergency_contact =
        req.body?.emergency_contact !== undefined
          ? safeString(req.body.emergency_contact, 160)
          : String(existing.emergency_contact || '');
      const clinical_allergies =
        req.body?.clinical_allergies !== undefined
          ? safeString(req.body.clinical_allergies, 1000)
          : String(existing.clinical_allergies || '');
      const clinical_medications =
        req.body?.clinical_medications !== undefined
          ? safeString(req.body.clinical_medications, 1000)
          : String(existing.clinical_medications || '');

      if (cpf) {
        const dup = db.prepare(`SELECT id FROM patients WHERE cpf = ? AND id != ?`).get(cpf, id);
        if (dup) {
          res.status(409).json({ error: 'CPF já vinculado a outro paciente.' });
          return;
        }
      }

      db.prepare(
        `UPDATE patients SET
          full_name = ?, birth_date = ?, cpf = ?, guardian_name = ?, contact_phone = ?,
          responsible_professional = ?, specialty = ?, follow_up_status = ?,
          blood_type = ?, emergency_contact = ?, clinical_allergies = ?, clinical_medications = ?,
          updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        full_name,
        birth_date,
        cpf,
        guardian_name,
        contact_phone,
        responsible_professional,
        specialty,
        follow_up_status,
        blood_type,
        emergency_contact,
        clinical_allergies,
        clinical_medications,
        id
      );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'patients',
        entityId: id,
        details: `Cadastro do paciente ${full_name} atualizado.`,
      });

      res.json(db.prepare(`SELECT * FROM patients WHERE id = ?`).get(id));
    }
  );

  app.get(
    '/api/appointments',
    requireAuth,
    requireRole(...HEALTH_ROLES),
    (_req, res) => {
      const rows = db
        .prepare(
          `SELECT a.*, COALESCE(s.full_name, p.full_name) as patient_name
           FROM appointments a
           JOIN patients p ON p.id = a.patient_id
           LEFT JOIN students s ON s.id = p.student_id
           ORDER BY a.scheduled_date DESC, a.scheduled_time ASC`
        )
        .all();
      res.json(rows);
    }
  );

  app.post(
    '/api/appointments',
    requireAuth,
    requireRole(...HEALTH_ROLES),
    (req: AuthRequest, res) => {
      const patient_id = Number(req.body?.patient_id);
      const professional_name = safeString(req.body?.professional_name, 160);
      const specialty = safeString(req.body?.specialty, 80);
      const scheduled_date = safeString(req.body?.scheduled_date, 20);
      const scheduled_time = safeString(req.body?.scheduled_time, 10);
      const status = safeString(req.body?.status, 40) || 'Agendada';
      const is_return = req.body?.is_return ? 1 : 0;
      const referral_to = safeString(req.body?.referral_to, 200);
      const notes = safeString(req.body?.notes, 1000);

      if (!patient_id || !professional_name || !scheduled_date || !scheduled_time) {
        res.status(400).json({ error: 'Paciente, profissional, data e horário são obrigatórios.' });
        return;
      }

      const r = db
        .prepare(
          `INSERT INTO appointments (patient_id, professional_name, specialty, scheduled_date, scheduled_time, status, is_return, referral_to, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          patient_id,
          professional_name,
          specialty,
          scheduled_date,
          scheduled_time,
          status,
          is_return,
          referral_to,
          notes
        );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'CREATE',
        entityType: 'appointments',
        entityId: Number(r.lastInsertRowid),
        details: `Consulta (${specialty}) agendada para ${scheduled_date} às ${scheduled_time}.`,
      });

      res.status(201).json(db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(Number(r.lastInsertRowid)));
    }
  );

  app.patch(
    '/api/appointments/:id',
    requireAuth,
    requireRole(...HEALTH_ROLES),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Consulta não encontrada.' });
        return;
      }
      const status = safeString(req.body?.status, 40) || String(existing.status);
      const referral_to =
        req.body?.referral_to !== undefined ? safeString(req.body.referral_to, 200) : String(existing.referral_to);
      const notes = req.body?.notes !== undefined ? safeString(req.body.notes, 1000) : String(existing.notes);

      db.prepare(
        `UPDATE appointments SET status = ?, referral_to = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(status, referral_to, notes, id);

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'appointments',
        entityId: id,
        details: `Status da consulta #${id} alterado para ${status}.`,
      });

      res.json({ ok: true });
    }
  );

  // STRICT LGPD MEDICAL & PSYCHOLOGICAL RECORDS: ONLY admin, saude, psicologo, medico
  app.get(
    '/api/patients/:id/medical-records',
    requireAuth,
    requireRole(...HEALTH_ROLES),
    (req: AuthRequest, res) => {
      const patientId = Number(req.params.id);
      const rows = db
        .prepare(
          `SELECT * FROM medical_records WHERE patient_id = ? ORDER BY recorded_at DESC, id DESC`
        )
        .all(patientId) as Record<string, unknown>[];

      const parsed = rows.map((r) => {
        let checklist: Record<string, boolean> = {};
        let vitals: Record<string, string> = {};
        try {
          checklist = JSON.parse(String(r.checklist_json || '{}'));
        } catch {
          checklist = {};
        }
        try {
          vitals = JSON.parse(String(r.vitals_json || '{}'));
        } catch {
          vitals = {};
        }
        return {
          ...r,
          record_type: String(r.record_type || (String(r.specialty).toLowerCase().includes('psic') ? 'Psicológico' : 'Médico')),
          checklist,
          vitals,
        };
      });

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'ACCESS_MEDICAL_RECORD',
        entityType: 'medical_records',
        entityId: patientId,
        details: `Acesso ao prontuário sigiloso do paciente #${patientId} registrado conforme LGPD.`,
        ipAddress: req.ip,
      });

      res.json(parsed);
    }
  );

  app.post(
    '/api/patients/:id/medical-records',
    requireAuth,
    requireRole(...HEALTH_ROLES),
    (req: AuthRequest, res) => {
      const patientId = Number(req.params.id);
      const record_type = req.body?.record_type === 'Médico' ? 'Médico' : 'Psicológico';
      const specialty =
        safeString(req.body?.specialty, 80) ||
        req.authUser!.specialty ||
        (record_type === 'Médico' ? 'Pediatria / Medicina' : 'Psicologia');
      const evolution_text = safeString(req.body?.evolution_text, 4000);
      const professional_notes = safeString(req.body?.professional_notes, 2000);
      const referrals = safeString(req.body?.referrals, 1000);
      const recorded_at = safeString(req.body?.recorded_at, 20) || '2026-11-23';
      const lgpd_consent_verified = req.body?.lgpd_consent_verified ? 1 : 0;

      const rawChecklist = req.body?.checklist && typeof req.body.checklist === 'object' ? req.body.checklist : {};
      const cleanChecklist: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(rawChecklist)) {
        cleanChecklist[String(k).slice(0, 120)] = Boolean(v);
      }

      const rawVitals = req.body?.vitals && typeof req.body.vitals === 'object' ? req.body.vitals : {};
      const cleanVitals: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawVitals)) {
        const str = safeString(v, 500);
        if (str) cleanVitals[String(k).slice(0, 80)] = str;
      }

      if (!evolution_text) {
        res.status(400).json({ error: 'O texto de evolução clínica é obrigatório.' });
        return;
      }

      const r = db
        .prepare(
          `INSERT INTO medical_records (
            patient_id, author_id, author_name, specialty, record_type, checklist_json, vitals_json,
            evolution_text, professional_notes, referrals, lgpd_consent_verified, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          patientId,
          req.authUser!.id,
          req.authUser!.name,
          specialty,
          record_type,
          JSON.stringify(cleanChecklist),
          JSON.stringify(cleanVitals),
          evolution_text,
          professional_notes,
          referrals,
          lgpd_consent_verified,
          recorded_at
        );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'ACCESS_MEDICAL_RECORD',
        entityType: 'medical_records',
        entityId: Number(r.lastInsertRowid),
        details: `Novo registro (${record_type}) salvo no prontuário do paciente #${patientId}.`,
        ipAddress: req.ip,
      });

      const created = db.prepare(`SELECT * FROM medical_records WHERE id = ?`).get(Number(r.lastInsertRowid)) as Record<string, unknown>;
      res.status(201).json({
        ...created,
        checklist: cleanChecklist,
        vitals: cleanVitals,
      });
    }
  );

  // ---------------- PROJECTS ----------------
  app.get('/api/projects', requireAuth, (req: AuthRequest, res) => {
    const canSeeFinance = FINANCE_ROLES.includes(req.authUser!.role);
    const rows = db
      .prepare(
        `SELECT p.*,
          COALESCE((SELECT SUM(t.amount) FROM financial_transactions t WHERE t.project_id = p.id AND t.type = 'receita' AND t.status = 'Recebido'), 0) as received_resources,
          COALESCE((SELECT SUM(t.amount) FROM financial_transactions t WHERE t.project_id = p.id AND t.type = 'despesa' AND t.status = 'Pago'), 0) as realized_expenses,
          (SELECT COUNT(*) FROM student_projects sp WHERE sp.project_id = p.id) as beneficiaries_count
         FROM projects p ORDER BY p.id ASC`
      )
      .all() as Record<string, unknown>[];

    const sanitized = canSeeFinance
      ? rows
      : rows.map((p) => ({
          ...p,
          planned_budget: null,
          received_resources: null,
          realized_expenses: null,
        }));
    res.json(sanitized);
  });

  app.post(
    '/api/projects',
    requireAuth,
    requireRole('admin', 'diretoria', 'coordenacao_social'),
    (req: AuthRequest, res) => {
      const name = safeString(req.body?.name, 160);
      const description = safeString(req.body?.description, 1000);
      const objective = safeString(req.body?.objective, 500);
      const target_audience = safeString(req.body?.target_audience, 200);
      const manager_name = safeString(req.body?.manager_name, 160);
      const start_date = safeString(req.body?.start_date, 20);
      const end_date = safeString(req.body?.end_date, 20);
      const planned_budget = Math.max(0, safeNumber(req.body?.planned_budget, 0));
      const target_beneficiaries = Math.max(0, safeNumber(req.body?.target_beneficiaries, 0));
      const impact_indicator_label = safeString(req.body?.impact_indicator_label, 120);
      const impact_indicator_value = safeString(req.body?.impact_indicator_value, 120);
      const status = safeString(req.body?.status, 40) || 'Ativo';

      if (!name || !manager_name || !start_date || !end_date) {
        res.status(400).json({ error: 'Nome do projeto, responsável e datas são obrigatórios.' });
        return;
      }

      const dup = db.prepare(`SELECT id FROM projects WHERE lower(name) = lower(?)`).get(name);
      if (dup) {
        res.status(409).json({ error: 'Já existe um projeto cadastrado com este nome.' });
        return;
      }

      const r = db
        .prepare(
          `INSERT INTO projects (name, description, objective, target_audience, manager_name, start_date, end_date, planned_budget, target_beneficiaries, impact_indicator_label, impact_indicator_value, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          name,
          description,
          objective,
          target_audience,
          manager_name,
          start_date,
          end_date,
          planned_budget,
          target_beneficiaries,
          impact_indicator_label,
          impact_indicator_value,
          status
        );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'CREATE',
        entityType: 'projects',
        entityId: Number(r.lastInsertRowid),
        details: `Projeto ${name} criado.`,
      });

      res.status(201).json(db.prepare(`SELECT * FROM projects WHERE id = ?`).get(Number(r.lastInsertRowid)));
    }
  );

  app.put(
    '/api/projects/:id',
    requireAuth,
    requireRole('admin', 'diretoria', 'coordenacao_social'),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Projeto não encontrado.' });
        return;
      }

      const name = safeString(req.body?.name, 160) || String(existing.name);
      const description = safeString(req.body?.description, 1000);
      const objective = safeString(req.body?.objective, 500);
      const target_audience = safeString(req.body?.target_audience, 200);
      const manager_name = safeString(req.body?.manager_name, 160) || String(existing.manager_name);
      const start_date = safeString(req.body?.start_date, 20) || String(existing.start_date);
      const end_date = safeString(req.body?.end_date, 20) || String(existing.end_date);
      const canEditBudget = FINANCE_ROLES.includes(req.authUser!.role);
      const planned_budget = canEditBudget
        ? Math.max(0, safeNumber(req.body?.planned_budget, Number(existing.planned_budget)))
        : Number(existing.planned_budget);
      const target_beneficiaries = Math.max(0, safeNumber(req.body?.target_beneficiaries, Number(existing.target_beneficiaries)));
      const impact_indicator_label = safeString(req.body?.impact_indicator_label, 120);
      const impact_indicator_value = safeString(req.body?.impact_indicator_value, 120);
      const status = safeString(req.body?.status, 40) || String(existing.status);

      const dup = db.prepare(`SELECT id FROM projects WHERE lower(name) = lower(?) AND id != ?`).get(name, id);
      if (dup) {
        res.status(409).json({ error: 'Já existe outro projeto com este nome.' });
        return;
      }

      db.prepare(
        `UPDATE projects SET
          name = ?, description = ?, objective = ?, target_audience = ?, manager_name = ?,
          start_date = ?, end_date = ?, planned_budget = ?, target_beneficiaries = ?,
          impact_indicator_label = ?, impact_indicator_value = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        name,
        description,
        objective,
        target_audience,
        manager_name,
        start_date,
        end_date,
        planned_budget,
        target_beneficiaries,
        impact_indicator_label,
        impact_indicator_value,
        status,
        id
      );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'projects',
        entityId: id,
        details: `Projeto ${name} atualizado.`,
      });

      res.json(db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id));
    }
  );

  // ---------------- SUPPLIERS (ADMIN & FINANCEIRO ONLY) ----------------
  app.get('/api/suppliers', requireAuth, requireRole(...FINANCE_ROLES), (_req: AuthRequest, res) => {
    const rows = db
      .prepare(
        `SELECT s.*,
          COALESCE((SELECT SUM(t.amount) FROM financial_transactions t WHERE t.supplier_id = s.id AND t.type = 'despesa' AND t.status = 'Pago'), 0) as total_paid,
          (SELECT COUNT(*) FROM financial_transactions t WHERE t.supplier_id = s.id AND t.type = 'despesa') as purchases_count
         FROM suppliers s ORDER BY s.trade_name ASC`
      )
      .all() as Record<string, unknown>[];

    const sanitized = rows.map((r) => ({
      ...r,
      bank_details_masked: false,
    }));
    res.json(sanitized);
  });

  app.post(
    '/api/suppliers',
    requireAuth,
    requireRole(...FINANCE_ROLES),
    (req: AuthRequest, res) => {
      const legal_name = safeString(req.body?.legal_name, 160);
      const trade_name = safeString(req.body?.trade_name, 160);
      const document = safeString(req.body?.document, 30);
      const commercial_contact = safeString(req.body?.commercial_contact, 120);
      const phone = safeString(req.body?.phone, 40);
      const email = safeString(req.body?.email, 160);
      const address = safeString(req.body?.address, 250);
      const category = safeString(req.body?.category, 80);
      const bank_details = safeString(req.body?.bank_details, 250);
      const status = safeString(req.body?.status, 20) || 'ativo';

      if (!legal_name || !document || !category) {
        res.status(400).json({ error: 'Razão social, CPF/CNPJ e categoria são obrigatórios.' });
        return;
      }

      const dup = db.prepare(`SELECT id FROM suppliers WHERE document = ?`).get(document);
      if (dup) {
        res.status(409).json({ error: 'Já existe fornecedor cadastrado com este CPF/CNPJ.' });
        return;
      }

      const r = db
        .prepare(
          `INSERT INTO suppliers (legal_name, trade_name, document, commercial_contact, phone, email, address, category, bank_details, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          legal_name,
          trade_name || legal_name,
          document,
          commercial_contact,
          phone,
          email,
          address,
          category,
          bank_details,
          status
        );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'CREATE',
        entityType: 'suppliers',
        entityId: Number(r.lastInsertRowid),
        details: `Fornecedor ${trade_name || legal_name} cadastrado.`,
      });

      res.status(201).json(db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(Number(r.lastInsertRowid)));
    }
  );

  app.put(
    '/api/suppliers/:id',
    requireAuth,
    requireRole(...FINANCE_ROLES),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Fornecedor não encontrado.' });
        return;
      }

      const legal_name = safeString(req.body?.legal_name, 160) || String(existing.legal_name);
      const trade_name = safeString(req.body?.trade_name, 160) || legal_name;
      const document = safeString(req.body?.document, 30) || String(existing.document);
      const commercial_contact = safeString(req.body?.commercial_contact, 120);
      const phone = safeString(req.body?.phone, 40);
      const email = safeString(req.body?.email, 160);
      const address = safeString(req.body?.address, 250);
      const category = safeString(req.body?.category, 80) || String(existing.category);
      const bank_details = safeString(req.body?.bank_details, 250);
      const status = safeString(req.body?.status, 20) || String(existing.status);

      const dup = db.prepare(`SELECT id FROM suppliers WHERE document = ? AND id != ?`).get(document, id);
      if (dup) {
        res.status(409).json({ error: 'Já existe outro fornecedor cadastrado com este CPF/CNPJ.' });
        return;
      }

      db.prepare(
        `UPDATE suppliers SET
          legal_name = ?, trade_name = ?, document = ?, commercial_contact = ?,
          phone = ?, email = ?, address = ?, category = ?, bank_details = ?, status = ?,
          updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        legal_name,
        trade_name,
        document,
        commercial_contact,
        phone,
        email,
        address,
        category,
        bank_details,
        status,
        id
      );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'suppliers',
        entityId: id,
        details: `Fornecedor ${trade_name} atualizado.`,
      });

      res.json(db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(id));
    }
  );

  // ---------------- DONORS ----------------
  app.get('/api/donors', requireAuth, (req: AuthRequest, res) => {
    const canSeeFinance = FINANCE_ROLES.includes(req.authUser!.role);
    const donors = db
      .prepare(
        `SELECT d.*,
          COALESCE((SELECT SUM(t.amount) FROM financial_transactions t WHERE t.donor_id = d.id AND t.type = 'receita' AND t.status = 'Recebido'), 0) as total_donated,
          (SELECT COUNT(*) FROM financial_transactions t WHERE t.donor_id = d.id AND t.type = 'receita' AND t.status = 'Recebido') as donations_count,
          (SELECT MAX(t.issue_date) FROM financial_transactions t WHERE t.donor_id = d.id AND t.type = 'receita') as last_donation_date
         FROM donors d ORDER BY total_donated DESC, d.name ASC`
      )
      .all() as Record<string, unknown>[];

    const enriched = donors.map((d) => {
      const projRows = db
        .prepare(
          `SELECT DISTINCT p.name FROM financial_transactions t
           JOIN projects p ON p.id = t.project_id
           WHERE t.donor_id = ?`
        )
        .all(Number(d.id)) as { name: string }[];
      return {
        ...d,
        total_donated: canSeeFinance ? d.total_donated : null,
        donations_count: canSeeFinance ? d.donations_count : null,
        supported_projects: projRows.map((p) => p.name),
      };
    });

    res.json(enriched);
  });

  app.post(
    '/api/donors',
    requireAuth,
    requireRole('admin', 'financeiro', 'diretoria', 'coordenacao_social'),
    (req: AuthRequest, res) => {
      const name = safeString(req.body?.name, 160);
      const document = safeString(req.body?.document, 30);
      const phone = safeString(req.body?.phone, 40);
      const email = safeString(req.body?.email, 160);
      const address = safeString(req.body?.address, 250);
      const donor_type = safeString(req.body?.donor_type, 60) || 'Pessoa Física';
      const frequency = safeString(req.body?.frequency, 40) || 'Mensal';
      const status = safeString(req.body?.status, 20) || 'ativo';
      const notes = safeString(req.body?.notes, 500);

      if (!name || !document) {
        res.status(400).json({ error: 'Nome e CPF/CNPJ do doador são obrigatórios.' });
        return;
      }

      const dup = db.prepare(`SELECT id FROM donors WHERE document = ?`).get(document);
      if (dup) {
        res.status(409).json({ error: 'Já existe apoiador/doador cadastrado com este CPF/CNPJ.' });
        return;
      }

      const r = db
        .prepare(
          `INSERT INTO donors (name, document, phone, email, address, donor_type, frequency, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(name, document, phone, email, address, donor_type, frequency, status, notes);

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'CREATE',
        entityType: 'donors',
        entityId: Number(r.lastInsertRowid),
        details: `Doador ${name} (${donor_type}) cadastrado.`,
      });

      res.status(201).json(db.prepare(`SELECT * FROM donors WHERE id = ?`).get(Number(r.lastInsertRowid)));
    }
  );

  app.put(
    '/api/donors/:id',
    requireAuth,
    requireRole('admin', 'financeiro', 'diretoria', 'coordenacao_social'),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM donors WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Doador/apoiador não encontrado.' });
        return;
      }

      const name = safeString(req.body?.name, 160) || String(existing.name);
      const document = safeString(req.body?.document, 30) || String(existing.document);
      const phone = safeString(req.body?.phone, 40);
      const email = safeString(req.body?.email, 160);
      const address = safeString(req.body?.address, 250);
      const donor_type = safeString(req.body?.donor_type, 60) || String(existing.donor_type);
      const frequency = safeString(req.body?.frequency, 40) || String(existing.frequency);
      const status = safeString(req.body?.status, 20) || String(existing.status);
      const notes = safeString(req.body?.notes, 500);

      const dup = db.prepare(`SELECT id FROM donors WHERE document = ? AND id != ?`).get(document, id);
      if (dup) {
        res.status(409).json({ error: 'Já existe outro apoiador/doador cadastrado com este CPF/CNPJ.' });
        return;
      }

      db.prepare(
        `UPDATE donors SET
          name = ?, document = ?, phone = ?, email = ?, address = ?,
          donor_type = ?, frequency = ?, status = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(name, document, phone, email, address, donor_type, frequency, status, notes, id);

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'donors',
        entityId: id,
        details: `Doador ${name} atualizado.`,
      });

      res.json(db.prepare(`SELECT * FROM donors WHERE id = ?`).get(id));
    }
  );

  // ---------------- FINANCIAL (STRICT: ADMIN & FINANCEIRO ONLY) ----------------
  app.get(
    '/api/finance/transactions',
    requireAuth,
    requireRole(...FINANCE_ROLES),
    (_req, res) => {
      const rows = db
        .prepare(
          `SELECT t.*, p.name as project_name, s.trade_name as supplier_name, d.name as donor_name
           FROM financial_transactions t
           LEFT JOIN projects p ON p.id = t.project_id
           LEFT JOIN suppliers s ON s.id = t.supplier_id
           LEFT JOIN donors d ON d.id = t.donor_id
           ORDER BY t.issue_date DESC, t.id DESC`
        )
        .all();
      res.json(rows);
    }
  );

  app.get(
    '/api/finance/history',
    requireAuth,
    requireRole(...FINANCE_ROLES),
    (_req, res) => {
      const rows = db
        .prepare(`SELECT * FROM financial_history ORDER BY id DESC LIMIT 100`)
        .all();
      res.json(rows);
    }
  );

  app.post(
    '/api/finance/transactions',
    requireAuth,
    requireRole('admin', 'financeiro'),
    (req: AuthRequest, res) => {
      const type = req.body?.type === 'receita' ? 'receita' : 'despesa';
      const description = safeString(req.body?.description, 200);
      const category = safeString(req.body?.category, 80);
      const amount = safeNumber(req.body?.amount, 0);
      const status = safeString(req.body?.status, 30) || (type === 'receita' ? 'Recebido' : 'Pendente');
      const issue_date = safeString(req.body?.issue_date, 20) || '2026-11-23';
      const due_date = safeString(req.body?.due_date, 20) || issue_date;
      const settlement_date =
        status === 'Pago' || status === 'Recebido'
          ? safeString(req.body?.settlement_date, 20) || issue_date
          : null;
      const payment_method = safeString(req.body?.payment_method, 60) || 'PIX';
      const recurrence = safeString(req.body?.recurrence, 40) || 'Única';
      const cost_center = safeString(req.body?.cost_center, 80) || 'Institucional';
      const project_id = req.body?.project_id ? Number(req.body.project_id) : null;
      const supplier_id = req.body?.supplier_id ? Number(req.body.supplier_id) : null;
      const donor_id = req.body?.donor_id ? Number(req.body.donor_id) : null;
      const receipt_ref = safeString(req.body?.receipt_ref, 80);
      const notes = safeString(req.body?.notes, 500);

      if (!description || !category || amount <= 0) {
        res.status(400).json({ error: 'Descrição, categoria e valor positivo são obrigatórios.' });
        return;
      }

      const r = db
        .prepare(
          `INSERT INTO financial_transactions (
            type, description, category, amount, status, issue_date, due_date, settlement_date,
            payment_method, recurrence, cost_center, project_id, supplier_id, donor_id, receipt_ref, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          type,
          description,
          category,
          amount,
          status,
          issue_date,
          due_date,
          settlement_date,
          payment_method,
          recurrence,
          cost_center,
          project_id,
          supplier_id,
          donor_id,
          receipt_ref,
          notes,
          req.authUser!.name
        );

      const txId = Number(r.lastInsertRowid);
      db.prepare(
        `INSERT INTO financial_history (transaction_id, changed_by, change_type, previous_json, new_json)
         VALUES (?, ?, 'Criação', NULL, ?)`
      ).run(txId, req.authUser!.name, JSON.stringify({ type, description, category, amount, status }));

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'CREATE',
        entityType: 'financial_transactions',
        entityId: txId,
        details: `Lançamento financeiro (${type}): ${description} — R$ ${amount.toFixed(2)}.`,
      });

      res.status(201).json(db.prepare(`SELECT * FROM financial_transactions WHERE id = ?`).get(txId));
    }
  );

  app.patch(
    '/api/finance/transactions/:id/settle',
    requireAuth,
    requireRole('admin', 'financeiro'),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM financial_transactions WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Lançamento financeiro não encontrado.' });
        return;
      }

      const newStatus = existing.type === 'receita' ? 'Recebido' : 'Pago';
      const settleDate = safeString(req.body?.settlement_date, 20) || '2026-11-23';

      db.prepare(
        `UPDATE financial_transactions SET status = ?, settlement_date = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(newStatus, settleDate, id);

      db.prepare(
        `INSERT INTO financial_history (transaction_id, changed_by, change_type, previous_json, new_json)
         VALUES (?, ?, 'Baixa/Pagamento', ?, ?)`
      ).run(
        id,
        req.authUser!.name,
        JSON.stringify({ status: existing.status, settlement_date: existing.settlement_date }),
        JSON.stringify({ status: newStatus, settlement_date: settleDate })
      );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'financial_transactions',
        entityId: id,
        details: `Baixa registrada no lançamento #${id} (${newStatus}).`,
      });

      res.json({ ok: true });
    }
  );

  // ---------------- VOLUNTEERS ----------------
  app.get('/api/volunteers', requireAuth, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT v.*, p.name as project_name,
          COALESCE((SELECT SUM(vh.hours) FROM volunteer_hours vh WHERE vh.volunteer_id = v.id), 0) as total_hours
         FROM volunteers v
         LEFT JOIN projects p ON p.id = v.project_id
         ORDER BY v.full_name ASC`
      )
      .all();
    res.json(rows);
  });

  app.post(
    '/api/volunteers',
    requireAuth,
    requireRole('admin', 'coordenacao_social', 'diretoria'),
    (req: AuthRequest, res) => {
      const full_name = safeString(req.body?.full_name, 160);
      const birth_date = safeString(req.body?.birth_date, 20) || null;
      const cpf = safeString(req.body?.cpf, 20);
      const phone = safeString(req.body?.phone, 40);
      const email = safeString(req.body?.email, 160);
      const area = safeString(req.body?.area, 120);
      const education = safeString(req.body?.education, 160);
      const availability = safeString(req.body?.availability, 120);
      const schedule_hours = safeString(req.body?.schedule_hours, 120);
      const project_id = req.body?.project_id ? Number(req.body.project_id) : null;
      const entry_date = safeString(req.body?.entry_date, 20) || '2026-11-23';
      const status = safeString(req.body?.status, 30) || 'ativo';

      if (!full_name || !cpf || !area) {
        res.status(400).json({ error: 'Nome, CPF e área de atuação são obrigatórios.' });
        return;
      }

      const dup = db.prepare(`SELECT id FROM volunteers WHERE cpf = ?`).get(cpf);
      if (dup) {
        res.status(409).json({ error: 'Já existe voluntário/colaborador com este CPF.' });
        return;
      }

      const r = db
        .prepare(
          `INSERT INTO volunteers (full_name, birth_date, cpf, phone, email, area, education, availability, schedule_hours, project_id, entry_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          full_name,
          birth_date,
          cpf,
          phone,
          email,
          area,
          education,
          availability,
          schedule_hours,
          project_id,
          entry_date,
          status
        );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'CREATE',
        entityType: 'volunteers',
        entityId: Number(r.lastInsertRowid),
        details: `Voluntário ${full_name} (${area}) cadastrado.`,
      });

      res.status(201).json(db.prepare(`SELECT * FROM volunteers WHERE id = ?`).get(Number(r.lastInsertRowid)));
    }
  );

  app.put(
    '/api/volunteers/:id',
    requireAuth,
    requireRole('admin', 'coordenacao_social', 'diretoria'),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM volunteers WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Voluntário não encontrado.' });
        return;
      }

      const full_name = safeString(req.body?.full_name, 160) || String(existing.full_name);
      const birth_date =
        req.body?.birth_date !== undefined
          ? safeString(req.body.birth_date, 20) || null
          : (existing.birth_date as string | null);
      const cpf = safeString(req.body?.cpf, 20) || String(existing.cpf);
      const phone = safeString(req.body?.phone, 40);
      const email = safeString(req.body?.email, 160);
      const area = safeString(req.body?.area, 120) || String(existing.area);
      const education = safeString(req.body?.education, 160);
      const availability = safeString(req.body?.availability, 120);
      const schedule_hours = safeString(req.body?.schedule_hours, 120);
      const project_id = req.body?.project_id ? Number(req.body.project_id) : null;
      const entry_date = safeString(req.body?.entry_date, 20) || String(existing.entry_date);
      const status = safeString(req.body?.status, 30) || String(existing.status);

      const dup = db.prepare(`SELECT id FROM volunteers WHERE cpf = ? AND id != ?`).get(cpf, id);
      if (dup) {
        res.status(409).json({ error: 'CPF já vinculado a outro voluntário.' });
        return;
      }

      db.prepare(
        `UPDATE volunteers SET
          full_name = ?, birth_date = ?, cpf = ?, phone = ?, email = ?, area = ?, education = ?,
          availability = ?, schedule_hours = ?, project_id = ?, entry_date = ?, status = ?,
          updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        full_name,
        birth_date,
        cpf,
        phone,
        email,
        area,
        education,
        availability,
        schedule_hours,
        project_id,
        entry_date,
        status,
        id
      );

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'volunteers',
        entityId: id,
        details: `Cadastro do voluntário ${full_name} atualizado.`,
      });

      res.json(db.prepare(`SELECT * FROM volunteers WHERE id = ?`).get(id));
    }
  );

  app.get('/api/volunteers/hours', requireAuth, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT vh.*, v.full_name as volunteer_name, p.name as project_name
         FROM volunteer_hours vh
         JOIN volunteers v ON v.id = vh.volunteer_id
         LEFT JOIN projects p ON p.id = vh.project_id
         ORDER BY vh.activity_date DESC, vh.id DESC`
      )
      .all();
    res.json(rows);
  });

  app.post('/api/volunteers/hours', requireAuth, (req: AuthRequest, res) => {
    const volunteer_id = Number(req.body?.volunteer_id);
    const project_id = req.body?.project_id ? Number(req.body.project_id) : null;
    const activity_date = safeString(req.body?.activity_date, 20) || '2026-11-23';
    const hours = safeNumber(req.body?.hours, 0);
    const activity_description = safeString(req.body?.activity_description, 500);

    if (!volunteer_id || hours <= 0 || !activity_description) {
      res.status(400).json({ error: 'Selecione o voluntário, horas válidas e descrição da atividade.' });
      return;
    }

    const r = db
      .prepare(
        `INSERT INTO volunteer_hours (volunteer_id, project_id, activity_date, hours, activity_description)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(volunteer_id, project_id, activity_date, hours, activity_description);

    logAudit({
      userId: req.authUser!.id,
      userName: req.authUser!.name,
      userRole: req.authUser!.role,
      action: 'CREATE',
      entityType: 'volunteer_hours',
      entityId: Number(r.lastInsertRowid),
      details: `Registro de ${hours}h voluntárias.`,
    });

    res.status(201).json(db.prepare(`SELECT * FROM volunteer_hours WHERE id = ?`).get(Number(r.lastInsertRowid)));
  });

  // ---------------- ACTIVITY TYPES ----------------
  app.get('/api/activity-types', requireAuth, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT at.*,
          (SELECT COUNT(*) FROM attendance_classes ac WHERE ac.activity_type_id = at.id) as classes_count
         FROM activity_types at
         ORDER BY at.name ASC`
      )
      .all();
    res.json(rows);
  });

  app.post(
    '/api/activity-types',
    requireAuth,
    requireRole('admin', 'diretoria', 'coordenacao_social', 'professor'),
    (req: AuthRequest, res) => {
      const name = safeString(req.body?.name, 120);
      const category = safeString(req.body?.category, 80) || 'Educacional';
      const description = safeString(req.body?.description, 500);
      const default_shift = safeString(req.body?.default_shift, 40) || 'Manhã';
      const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : 1;

      if (!name) {
        res.status(400).json({ error: 'Nome do tipo de atividade é obrigatório.' });
        return;
      }

      const dup = db.prepare(`SELECT id FROM activity_types WHERE lower(name) = lower(?)`).get(name);
      if (dup) {
        res.status(409).json({ error: 'Já existe um tipo de atividade com este nome.' });
        return;
      }

      const r = db
        .prepare(
          `INSERT INTO activity_types (name, category, description, default_shift, active)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(name, category, description, default_shift, active);

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'CREATE',
        entityType: 'activity_types',
        entityId: Number(r.lastInsertRowid),
        details: `Tipo de atividade "${name}" criado.`,
      });

      res.status(201).json(db.prepare(`SELECT * FROM activity_types WHERE id = ?`).get(Number(r.lastInsertRowid)));
    }
  );

  app.put(
    '/api/activity-types/:id',
    requireAuth,
    requireRole('admin', 'diretoria', 'coordenacao_social', 'professor'),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM activity_types WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Tipo de atividade não encontrado.' });
        return;
      }

      const name = safeString(req.body?.name, 120) || String(existing.name);
      const category = safeString(req.body?.category, 80) || String(existing.category);
      const description = safeString(req.body?.description, 500);
      const default_shift = safeString(req.body?.default_shift, 40) || String(existing.default_shift);
      const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : Number(existing.active);

      const dup = db
        .prepare(`SELECT id FROM activity_types WHERE lower(name) = lower(?) AND id != ?`)
        .get(name, id);
      if (dup) {
        res.status(409).json({ error: 'Já existe outro tipo de atividade com este nome.' });
        return;
      }

      db.prepare(
        `UPDATE activity_types SET
          name = ?, category = ?, description = ?, default_shift = ?, active = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(name, category, description, default_shift, active, id);

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'activity_types',
        entityId: id,
        details: `Tipo de atividade "${name}" atualizado.`,
      });

      res.json(db.prepare(`SELECT * FROM activity_types WHERE id = ?`).get(id));
    }
  );

  app.delete(
    '/api/activity-types/:id',
    requireAuth,
    requireRole('admin', 'diretoria', 'coordenacao_social'),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM activity_types WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Tipo de atividade não encontrado.' });
        return;
      }
      db.prepare(`DELETE FROM activity_types WHERE id = ?`).run(id);
      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'DELETE',
        entityType: 'activity_types',
        entityId: id,
        details: `Tipo de atividade "${existing.name}" removido.`,
      });
      res.json({ ok: true });
    }
  );

  // ---------------- ATTENDANCE ----------------
  app.get('/api/attendance/classes', requireAuth, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT ac.*, p.name as project_name, at.name as activity_type_name,
          (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = ac.id) as student_count
         FROM attendance_classes ac
         LEFT JOIN projects p ON p.id = ac.project_id
         LEFT JOIN activity_types at ON at.id = ac.activity_type_id
         ORDER BY ac.name ASC`
      )
      .all();
    res.json(rows);
  });

  app.post(
    '/api/attendance/classes',
    requireAuth,
    requireRole('admin', 'diretoria', 'coordenacao_social', 'professor'),
    (req: AuthRequest, res) => {
      const name = safeString(req.body?.name, 160);
      const project_id = req.body?.project_id ? Number(req.body.project_id) : null;
      const activity_type_id = req.body?.activity_type_id ? Number(req.body.activity_type_id) : null;
      const instructor_name = safeString(req.body?.instructor_name, 160);
      const schedule_label = safeString(req.body?.schedule_label, 120);
      const shift = safeString(req.body?.shift, 40) || 'Manhã';

      if (!name || !instructor_name || !schedule_label) {
        res.status(400).json({ error: 'Nome da turma, educador e horário são obrigatórios.' });
        return;
      }

      const dup = db.prepare(`SELECT id FROM attendance_classes WHERE lower(name) = lower(?)`).get(name);
      if (dup) {
        res.status(409).json({ error: 'Já existe uma turma/oficina com este nome.' });
        return;
      }

      const r = db
        .prepare(
          `INSERT INTO attendance_classes (name, project_id, activity_type_id, instructor_name, schedule_label, shift)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(name, project_id, activity_type_id, instructor_name, schedule_label, shift);

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'CREATE',
        entityType: 'attendance_classes',
        entityId: Number(r.lastInsertRowid),
        details: `Turma/oficina "${name}" criada.`,
      });

      res.status(201).json(db.prepare(`SELECT * FROM attendance_classes WHERE id = ?`).get(Number(r.lastInsertRowid)));
    }
  );

  app.put(
    '/api/attendance/classes/:id',
    requireAuth,
    requireRole('admin', 'diretoria', 'coordenacao_social', 'professor'),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM attendance_classes WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Turma/oficina não encontrada.' });
        return;
      }

      const name = safeString(req.body?.name, 160) || String(existing.name);
      const project_id = req.body?.project_id ? Number(req.body.project_id) : null;
      const activity_type_id = req.body?.activity_type_id ? Number(req.body.activity_type_id) : null;
      const instructor_name = safeString(req.body?.instructor_name, 160) || String(existing.instructor_name);
      const schedule_label = safeString(req.body?.schedule_label, 120) || String(existing.schedule_label);
      const shift = safeString(req.body?.shift, 40) || String(existing.shift);

      const dup = db
        .prepare(`SELECT id FROM attendance_classes WHERE lower(name) = lower(?) AND id != ?`)
        .get(name, id);
      if (dup) {
        res.status(409).json({ error: 'Já existe outra turma/oficina com este nome.' });
        return;
      }

      db.prepare(
        `UPDATE attendance_classes SET
          name = ?, project_id = ?, activity_type_id = ?, instructor_name = ?, schedule_label = ?, shift = ?
         WHERE id = ?`
      ).run(name, project_id, activity_type_id, instructor_name, schedule_label, shift, id);

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'attendance_classes',
        entityId: id,
        details: `Turma/oficina "${name}" atualizada.`,
      });

      res.json(db.prepare(`SELECT * FROM attendance_classes WHERE id = ?`).get(id));
    }
  );

  app.get('/api/attendance/roster/:classId', requireAuth, (req, res) => {
    const classId = Number(req.params.classId);
    const date = safeString(req.query.date, 20) || '2026-11-23';

    const students = db
      .prepare(
        `SELECT s.id, s.full_name, s.school_year, s.status as student_status,
          ar.status as attendance_status, ar.justification,
          (SELECT ROUND(100.0 * SUM(CASE WHEN r2.status IN ('presente','justificada') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0))
           FROM attendance_records r2 WHERE r2.student_id = s.id) as monthly_rate
         FROM class_enrollments ce
         JOIN students s ON s.id = ce.student_id
         LEFT JOIN attendance_records ar ON ar.class_id = ce.class_id AND ar.student_id = s.id AND ar.date = ?
         WHERE ce.class_id = ?
         ORDER BY s.full_name ASC`
      )
      .all(date, classId);

    res.json(students);
  });

  app.post(
    '/api/attendance/record',
    requireAuth,
    requireRole('admin', 'coordenacao_social', 'professor', 'voluntario'),
    (req: AuthRequest, res) => {
      const class_id = Number(req.body?.class_id);
      const date = safeString(req.body?.date, 20);
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

      if (!class_id || !date || entries.length === 0) {
        res.status(400).json({ error: 'Turma, data e lista de frequência são obrigatórios.' });
        return;
      }

      const upsert = db.prepare(`
        INSERT INTO attendance_records (class_id, student_id, date, status, justification, recorded_by)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(class_id, student_id, date) DO UPDATE SET
          status = excluded.status,
          justification = excluded.justification,
          recorded_by = excluded.recorded_by
      `);

      db.exec('BEGIN');
      try {
        for (const item of entries) {
          const sid = Number(item.student_id);
          const st = ['presente', 'falta', 'justificada'].includes(item.status)
            ? item.status
            : 'presente';
          const just = safeString(item.justification, 300);
          upsert.run(class_id, sid, date, st, just, req.authUser!.name);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'attendance_records',
        entityId: class_id,
        details: `Chamada registrada para turma #${class_id} em ${date} (${entries.length} alunos).`,
      });

      res.json({ ok: true });
    }
  );

  // ---------------- DOCUMENTS ----------------
  app.get('/api/documents', requireAuth, (req: AuthRequest, res) => {
    const role = req.authUser!.role;
    const allowedLevels = ['geral'];
    if (role === 'admin') {
      allowedLevels.push('restrito_saude', 'restrito_financeiro', 'restrito_diretoria');
    } else if (HEALTH_ROLES.includes(role)) {
      allowedLevels.push('restrito_saude');
    } else if (role === 'financeiro') {
      allowedLevels.push('restrito_financeiro');
    } else if (role === 'diretoria') {
      allowedLevels.push('restrito_diretoria');
    }

    const placeholders = allowedLevels.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT d.id, d.title, d.category, d.person_type, d.person_id, d.person_name, d.project_id,
          p.name as project_name, d.access_level, d.file_name, d.file_mime, d.file_size,
          CASE WHEN d.file_data_url IS NOT NULL THEN 1 ELSE 0 END as has_file,
          d.uploaded_by, d.uploaded_at
         FROM documents d
         LEFT JOIN projects p ON p.id = d.project_id
         WHERE d.access_level IN (${placeholders})
         ORDER BY d.uploaded_at DESC, d.id DESC`
      )
      .all(...allowedLevels);
    res.json(rows);
  });

  app.post(
    '/api/documents',
    requireAuth,
    requireRole('admin', 'diretoria', 'financeiro', 'coordenacao_social', 'saude', 'psicologo', 'medico', 'professor'),
    (req: AuthRequest, res) => {
      const callerRole = req.authUser!.role;
      const title = safeString(req.body?.title, 180);
      const category = safeString(req.body?.category, 80);
      const person_type = safeString(req.body?.person_type, 30) || 'geral';
      const person_id = req.body?.person_id ? Number(req.body.person_id) : null;
      const person_name = safeString(req.body?.person_name, 160);
      const project_id = req.body?.project_id ? Number(req.body.project_id) : null;
      const access_level = safeString(req.body?.access_level, 40) || 'geral';
      const file_name = safeString(req.body?.file_name, 180) || 'documento.pdf';
      const file_mime = safeString(req.body?.file_mime, 100) || 'application/pdf';
      const file_size = Math.max(0, safeNumber(req.body?.file_size, 0));
      const file_data_url =
        typeof req.body?.file_data_url === 'string' && req.body.file_data_url.length <= 2_800_000
          ? req.body.file_data_url
          : null;

      if (!title || !category) {
        res.status(400).json({ error: 'Título e categoria do documento são obrigatórios.' });
        return;
      }

      if (
        (access_level === 'restrito_financeiro' && !FINANCE_ROLES.includes(callerRole)) ||
        (access_level === 'restrito_saude' && !HEALTH_ROLES.includes(callerRole)) ||
        (access_level === 'restrito_diretoria' && !['admin', 'diretoria'].includes(callerRole))
      ) {
        res.status(403).json({ error: 'Sem permissão para publicar documento neste nível de acesso restrito.' });
        return;
      }

    const r = db
      .prepare(
        `INSERT INTO documents (title, category, person_type, person_id, person_name, project_id, access_level, file_name, file_mime, file_size, file_data_url, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        title,
        category,
        person_type,
        person_id,
        person_name,
        project_id,
        access_level,
        file_name,
        file_mime,
        file_size,
        file_data_url,
        req.authUser!.name
      );

    logAudit({
      userId: req.authUser!.id,
      userName: req.authUser!.name,
      userRole: req.authUser!.role,
      action: 'CREATE',
      entityType: 'documents',
      entityId: Number(r.lastInsertRowid),
      details: `Documento "${title}" (${category}) anexado.`,
    });

      res.status(201).json(
        db
          .prepare(
            `SELECT id, title, category, person_type, person_id, person_name, project_id, access_level, file_name, file_mime, file_size, uploaded_by, uploaded_at
             FROM documents WHERE id = ?`
          )
          .get(Number(r.lastInsertRowid))
      );
    }
  );

  app.get('/api/documents/:id/download', requireAuth, (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!doc) {
      res.status(404).json({ error: 'Documento não encontrado.' });
      return;
    }
    const role = req.authUser!.role;
    const lvl = String(doc.access_level);
    if (
      (lvl === 'restrito_saude' && !HEALTH_ROLES.includes(role)) ||
      (lvl === 'restrito_financeiro' && !FINANCE_ROLES.includes(role)) ||
      (lvl === 'restrito_diretoria' && !['admin', 'diretoria'].includes(role))
    ) {
      res.status(403).json({ error: 'Sem permissão para acessar este documento restrito.' });
      return;
    }

    res.json({
      file_name: doc.file_name,
      file_mime: doc.file_mime,
      file_data_url: doc.file_data_url,
      title: doc.title,
      category: doc.category,
      person_name: doc.person_name,
      uploaded_by: doc.uploaded_by,
      uploaded_at: doc.uploaded_at,
    });
  });

  // ---------------- EVENTS ----------------
  app.get('/api/events', requireAuth, (_req, res) => {
    res.json(
      db
        .prepare(
          `SELECT e.*, p.name as project_name FROM events e LEFT JOIN projects p ON p.id = e.project_id ORDER BY e.event_date ASC`
        )
        .all()
    );
  });

  app.post(
    '/api/events',
    requireAuth,
    requireRole('admin', 'diretoria', 'coordenacao_social'),
    (req: AuthRequest, res) => {
      const title = safeString(req.body?.title, 160);
      const event_date = safeString(req.body?.event_date, 20);
      const event_time = safeString(req.body?.event_time, 10) || '09:00';
      const location = safeString(req.body?.location, 160);
      const project_id = req.body?.project_id ? Number(req.body.project_id) : null;
      const description = safeString(req.body?.description, 500);

      if (!title || !event_date || !location) {
        res.status(400).json({ error: 'Título, data e local do evento são obrigatórios.' });
        return;
      }

      const r = db
        .prepare(
          `INSERT INTO events (title, event_date, event_time, location, project_id, description)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(title, event_date, event_time, location, project_id, description);

      res.status(201).json(db.prepare(`SELECT * FROM events WHERE id = ?`).get(Number(r.lastInsertRowid)));
    }
  );

  app.put(
    '/api/events/:id',
    requireAuth,
    requireRole('admin', 'diretoria', 'coordenacao_social'),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Evento não encontrado.' });
        return;
      }

      const title = safeString(req.body?.title, 160) || String(existing.title);
      const event_date = safeString(req.body?.event_date, 20) || String(existing.event_date);
      const event_time = safeString(req.body?.event_time, 10) || String(existing.event_time);
      const location = safeString(req.body?.location, 160) || String(existing.location);
      const project_id = req.body?.project_id ? Number(req.body.project_id) : null;
      const description = safeString(req.body?.description, 500);

      db.prepare(
        `UPDATE events SET title = ?, event_date = ?, event_time = ?, location = ?, project_id = ?, description = ?
         WHERE id = ?`
      ).run(title, event_date, event_time, location, project_id, description, id);

      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'UPDATE',
        entityType: 'events',
        entityId: id,
        details: `Evento "${title}" atualizado.`,
      });

      res.json(db.prepare(`SELECT * FROM events WHERE id = ?`).get(id));
    }
  );

  app.delete(
    '/api/events/:id',
    requireAuth,
    requireRole('admin', 'diretoria', 'coordenacao_social'),
    (req: AuthRequest, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Evento não encontrado.' });
        return;
      }
      db.prepare(`DELETE FROM events WHERE id = ?`).run(id);
      logAudit({
        userId: req.authUser!.id,
        userName: req.authUser!.name,
        userRole: req.authUser!.role,
        action: 'DELETE',
        entityType: 'events',
        entityId: id,
        details: `Evento "${existing.title}" removido.`,
      });
      res.json({ ok: true });
    }
  );

  // ---------------- AGENDA INSTITUCIONAL UNIFICADA ----------------
  app.get('/api/agenda', requireAuth, (req: AuthRequest, res) => {
    const startDate = safeString(req.query.startDate, 20);
    const endDate = safeString(req.query.endDate, 20);
    const role = req.authUser!.role;
    const canSeeHealth = HEALTH_ROLES.includes(role);

    const events =
      startDate && endDate
        ? db
            .prepare(
              `SELECT e.*, p.name as project_name
               FROM events e
               LEFT JOIN projects p ON p.id = e.project_id
               WHERE e.event_date BETWEEN ? AND ?
               ORDER BY e.event_date ASC, e.event_time ASC`
            )
            .all(startDate, endDate)
        : db
            .prepare(
              `SELECT e.*, p.name as project_name
               FROM events e
               LEFT JOIN projects p ON p.id = e.project_id
               ORDER BY e.event_date ASC, e.event_time ASC`
            )
            .all();

    const classes = db
      .prepare(
        `SELECT ac.*, p.name as project_name, at.name as activity_type_name,
          (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = ac.id) as student_count
         FROM attendance_classes ac
         LEFT JOIN projects p ON p.id = ac.project_id
         LEFT JOIN activity_types at ON at.id = ac.activity_type_id
         ORDER BY ac.name ASC`
      )
      .all();

    const activityTypes = db
      .prepare(`SELECT * FROM activity_types WHERE active = 1 ORDER BY name ASC`)
      .all();

    const projects = db
      .prepare(`SELECT id, name, status FROM projects ORDER BY name ASC`)
      .all();

    const appointments = canSeeHealth
      ? startDate && endDate
        ? db
            .prepare(
              `SELECT a.*, COALESCE(s.full_name, p.full_name) as patient_name
               FROM appointments a
               JOIN patients p ON p.id = a.patient_id
               LEFT JOIN students s ON s.id = p.student_id
               WHERE a.scheduled_date BETWEEN ? AND ?
               ORDER BY a.scheduled_date ASC, a.scheduled_time ASC`
            )
            .all(startDate, endDate)
        : db
            .prepare(
              `SELECT a.*, COALESCE(s.full_name, p.full_name) as patient_name
               FROM appointments a
               JOIN patients p ON p.id = a.patient_id
               LEFT JOIN students s ON s.id = p.student_id
               ORDER BY a.scheduled_date ASC, a.scheduled_time ASC`
            )
            .all()
      : [];

    const patients = canSeeHealth
      ? db
          .prepare(
            `SELECT p.id, COALESCE(s.full_name, p.full_name) as full_name,
              p.responsible_professional, p.specialty, p.follow_up_status
             FROM patients p
             LEFT JOIN students s ON s.id = p.student_id
             ORDER BY full_name ASC`
          )
          .all()
      : [];

    res.json({
      canSeeHealth,
      events,
      classes,
      activityTypes,
      projects,
      appointments,
      patients,
    });
  });

  // ---------------- REPORTS ----------------
  app.get('/api/reports', requireAuth, (req: AuthRequest, res) => {
    const startDate = safeString(req.query.startDate, 20) || '2026-01-01';
    const endDate = safeString(req.query.endDate, 20) || '2026-12-31';
    const role = req.authUser!.role;
    const canSeeFinance = FINANCE_ROLES.includes(role);
    const canSeeHealth = HEALTH_ROLES.includes(role);

    const students = db
      .prepare(
        `SELECT s.id, s.full_name, s.birth_date, s.school_name, s.school_year, s.school_shift, s.status, s.entry_date, s.programs_json,
          (SELECT ROUND(100.0 * SUM(CASE WHEN ar.status IN ('presente','justificada') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0))
           FROM attendance_records ar WHERE ar.student_id = s.id) as attendance_rate
         FROM students s WHERE s.entry_date BETWEEN ? AND ? ORDER BY s.full_name ASC`
      )
      .all(startDate, endDate);

    const families = db
      .prepare(
        `SELECT f.*, (SELECT COUNT(*) FROM students s WHERE s.family_id = f.id) as student_count
         FROM families f ORDER BY f.responsible_name ASC`
      )
      .all();

    const appointments = canSeeHealth
      ? db
          .prepare(
            `SELECT a.*, COALESCE(s.full_name, p.full_name) as patient_name
             FROM appointments a
             JOIN patients p ON p.id = a.patient_id
             LEFT JOIN students s ON s.id = p.student_id
             WHERE a.scheduled_date BETWEEN ? AND ?
             ORDER BY a.scheduled_date DESC`
          )
          .all(startDate, endDate)
      : [];

    const rawProjects = db
      .prepare(
        `SELECT p.*,
          COALESCE((SELECT SUM(t.amount) FROM financial_transactions t WHERE t.project_id = p.id AND t.type = 'receita' AND t.status = 'Recebido' AND t.issue_date BETWEEN ? AND ?), 0) as period_received,
          COALESCE((SELECT SUM(t.amount) FROM financial_transactions t WHERE t.project_id = p.id AND t.type = 'despesa' AND t.status = 'Pago' AND t.issue_date BETWEEN ? AND ?), 0) as period_spent,
          (SELECT COUNT(*) FROM student_projects sp WHERE sp.project_id = p.id) as beneficiaries_count
         FROM projects p ORDER BY p.id ASC`
      )
      .all(startDate, endDate, startDate, endDate) as Record<string, unknown>[];

    const projects = canSeeFinance
      ? rawProjects
      : rawProjects.map((p) => ({
          ...p,
          planned_budget: 0,
          period_received: 0,
          period_spent: 0,
        }));

    const transactions = canSeeFinance
      ? db
          .prepare(
            `SELECT t.*, p.name as project_name, s.trade_name as supplier_name, d.name as donor_name
             FROM financial_transactions t
             LEFT JOIN projects p ON p.id = t.project_id
             LEFT JOIN suppliers s ON s.id = t.supplier_id
             LEFT JOIN donors d ON d.id = t.donor_id
             WHERE t.issue_date BETWEEN ? AND ?
             ORDER BY t.issue_date DESC`
          )
          .all(startDate, endDate)
      : [];

    const donations = canSeeFinance
      ? db
          .prepare(
            `SELECT t.*, d.name as donor_name, d.donor_type, d.frequency as donor_frequency, p.name as project_name
             FROM financial_transactions t
             LEFT JOIN donors d ON d.id = t.donor_id
             LEFT JOIN projects p ON p.id = t.project_id
             WHERE t.type = 'receita' AND t.issue_date BETWEEN ? AND ?
             ORDER BY t.issue_date DESC`
          )
          .all(startDate, endDate)
      : [];

    const volunteerHours = db
      .prepare(
        `SELECT vh.*, v.full_name as volunteer_name, v.area, p.name as project_name
         FROM volunteer_hours vh
         JOIN volunteers v ON v.id = vh.volunteer_id
         LEFT JOIN projects p ON p.id = vh.project_id
         WHERE vh.activity_date BETWEEN ? AND ?
         ORDER BY vh.activity_date DESC`
      )
      .all(startDate, endDate);

    res.json({
      startDate,
      endDate,
      students,
      families,
      appointments,
      projects,
      transactions,
      donations,
      volunteerHours,
    });
  });

  // ---------------- USERS, RBAC, AUDIT & BACKUP (ADMIN ONLY) ----------------
  app.get('/api/users', requireAuth, requireRole('admin'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT id, name, email, role, specialty, active, created_at, last_login_at
         FROM users ORDER BY id ASC`
      )
      .all() as Record<string, unknown>[];
    res.json(rows.map((u) => ({ ...u, active: u.active === 1 })));
  });

  app.post('/api/users', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
    const name = safeString(req.body?.name, 160);
    const email = safeString(req.body?.email, 160).toLowerCase();
    const role = safeString(req.body?.role, 40) as UserRole;
    const specialty = safeString(req.body?.specialty, 100) || null;
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!name || !email || !VALID_ROLES.includes(role) || password.length < 6) {
      res.status(400).json({ error: 'Preencha nome, e-mail válido, perfil e senha (mín. 6 caracteres).' });
      return;
    }

    const dup = db.prepare(`SELECT id FROM users WHERE lower(email) = ?`).get(email);
    if (dup) {
      res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
      return;
    }

    const r = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, specialty, active)
         VALUES (?, ?, ?, ?, ?, 1)`
      )
      .run(name, email, hashPassword(password), role, specialty);

    logAudit({
      userId: req.authUser!.id,
      userName: req.authUser!.name,
      userRole: req.authUser!.role,
      action: 'CREATE',
      entityType: 'users',
      entityId: Number(r.lastInsertRowid),
      details: `Usuário ${name} (${email}) criado com perfil ${role}.`,
    });

    res.status(201).json(
      db
        .prepare(
          `SELECT id, name, email, role, specialty, active, created_at, last_login_at FROM users WHERE id = ?`
        )
        .get(Number(r.lastInsertRowid))
    );
  });

  app.patch('/api/users/:id', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const role =
      req.body?.role && VALID_ROLES.includes(req.body.role)
        ? String(req.body.role)
        : String(existing.role);
    const active =
      req.body?.active !== undefined ? (req.body.active ? 1 : 0) : Number(existing.active);
    const specialty =
      req.body?.specialty !== undefined
        ? safeString(req.body.specialty, 100) || null
        : existing.specialty != null
          ? String(existing.specialty)
          : null;

    if (id === req.authUser!.id && active === 0) {
      res.status(400).json({ error: 'Você não pode desativar sua própria conta de administrador.' });
      return;
    }

    db.prepare(`UPDATE users SET role = ?, active = ?, specialty = ? WHERE id = ?`).run(
      role,
      active,
      specialty,
      id
    );

    if (typeof req.body?.newPassword === 'string' && req.body.newPassword.length >= 6) {
      db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(
        hashPassword(req.body.newPassword),
        id
      );
    }

    logAudit({
      userId: req.authUser!.id,
      userName: req.authUser!.name,
      userRole: req.authUser!.role,
      action: 'ROLE_CHANGE',
      entityType: 'users',
      entityId: id,
      details: `Permissões de ${existing.name} atualizadas (perfil: ${role}, ativo: ${active === 1}).`,
    });

    res.json({ ok: true });
  });

  app.get('/api/audit-logs', requireAuth, requireRole('admin', 'diretoria'), (_req, res) => {
    const rows = db.prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 150`).all();
    res.json(rows);
  });

  app.get('/api/backup', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
    const tables = [
      'families',
      'projects',
      'students',
      'student_evolutions',
      'patients',
      'appointments',
      'medical_records',
      'suppliers',
      'donors',
      'financial_transactions',
      'financial_history',
      'volunteers',
      'volunteer_hours',
      'activity_types',
      'attendance_classes',
      'attendance_records',
      'documents',
      'events',
      'audit_logs',
    ];
    const snapshot: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.authUser!.email,
      institution: 'Instituto SER — Gestão Integrada',
    };
    for (const tbl of tables) {
      snapshot[tbl] = db.prepare(`SELECT * FROM ${tbl}`).all();
    }

    logAudit({
      userId: req.authUser!.id,
      userName: req.authUser!.name,
      userRole: req.authUser!.role,
      action: 'BACKUP',
      entityType: 'database',
      entityId: 'full',
      details: 'Backup completo institucional exportado em JSON.',
    });

    res.setHeader('Content-Disposition', 'attachment; filename="instituto_ser_backup.json"');
    res.json(snapshot);
  });

  // Log client-triggered PDF/Excel exports cleanly
  app.post('/api/audit-export', requireAuth, (req: AuthRequest, res: Response) => {
    const reportName = safeString(req.body?.reportName, 120) || 'Relatório Institucional';
    const format = safeString(req.body?.format, 20) || 'PDF';
    logAudit({
      userId: req.authUser!.id,
      userName: req.authUser!.name,
      userRole: req.authUser!.role,
      action: 'EXPORT',
      entityType: 'reports',
      entityId: reportName,
      details: `Relatório "${reportName}" exportado em ${format}.`,
    });
    res.json({ ok: true });
  });
}
