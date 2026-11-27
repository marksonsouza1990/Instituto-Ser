import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Vercel Functions only allow writes under /tmp; data there is per-instance and not durable.
const dataDir = process.env.VERCEL ? '/tmp/instituto-ser-data' : path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'instituto_ser.sqlite');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','diretoria','financeiro','coordenacao_social','saude','psicologo','medico','professor','voluntario')),
      specialty TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT NOT NULL,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      responsible_name TEXT NOT NULL,
      responsible_phone TEXT NOT NULL,
      responsible_cpf TEXT UNIQUE,
      address TEXT NOT NULL,
      neighborhood TEXT NOT NULL,
      household_size INTEGER NOT NULL DEFAULT 1,
      working_members INTEGER NOT NULL DEFAULT 0,
      family_income REAL NOT NULL DEFAULT 0,
      vulnerability_level TEXT NOT NULL DEFAULT 'Moderada',
      vulnerability_notes TEXT NOT NULL DEFAULT '',
      assistance_history TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      objective TEXT NOT NULL,
      target_audience TEXT NOT NULL,
      manager_name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      planned_budget REAL NOT NULL DEFAULT 0,
      target_beneficiaries INTEGER NOT NULL DEFAULT 0,
      impact_indicator_label TEXT NOT NULL DEFAULT '',
      impact_indicator_value TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Ativo',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER REFERENCES families(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      birth_date TEXT NOT NULL,
      cpf TEXT UNIQUE,
      rg TEXT,
      photo_url TEXT,
      address TEXT NOT NULL,
      school_name TEXT NOT NULL,
      school_year TEXT NOT NULL,
      school_shift TEXT NOT NULL DEFAULT 'Manhã',
      guardian_name TEXT NOT NULL,
      guardian_phone TEXT NOT NULL,
      family_composition TEXT NOT NULL DEFAULT '',
      household_size INTEGER NOT NULL DEFAULT 1,
      family_income REAL NOT NULL DEFAULT 0,
      working_members INTEGER NOT NULL DEFAULT 0,
      vulnerability_situation TEXT NOT NULL DEFAULT '',
      identified_needs TEXT NOT NULL DEFAULT '',
      assistance_history TEXT NOT NULL DEFAULT '',
      social_notes TEXT NOT NULL DEFAULT '',
      programs_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo','aguardando_vaga','desligado')),
      entry_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_projects (
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      enrolled_at TEXT NOT NULL DEFAULT (date('now')),
      PRIMARY KEY (student_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS student_evolutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Pedagógico',
      note TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER UNIQUE REFERENCES students(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      birth_date TEXT NOT NULL,
      cpf TEXT UNIQUE,
      guardian_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      responsible_professional TEXT NOT NULL,
      specialty TEXT NOT NULL,
      follow_up_status TEXT NOT NULL DEFAULT 'Em acompanhamento',
      blood_type TEXT NOT NULL DEFAULT '',
      emergency_contact TEXT NOT NULL DEFAULT '',
      clinical_allergies TEXT NOT NULL DEFAULT '',
      clinical_medications TEXT NOT NULL DEFAULT '',
      clinical_history TEXT NOT NULL DEFAULT '',
      school_observations TEXT NOT NULL DEFAULT '',
      family_dynamics TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      professional_name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Agendada',
      is_return INTEGER NOT NULL DEFAULT 0,
      referral_to TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medical_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
      author_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      record_type TEXT NOT NULL DEFAULT 'Psicológico',
      checklist_json TEXT NOT NULL DEFAULT '{}',
      vitals_json TEXT NOT NULL DEFAULT '{}',
      evolution_text TEXT NOT NULL,
      professional_notes TEXT NOT NULL DEFAULT '',
      referrals TEXT NOT NULL DEFAULT '',
      lgpd_consent_verified INTEGER NOT NULL DEFAULT 1,
      recorded_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legal_name TEXT NOT NULL,
      trade_name TEXT NOT NULL,
      document TEXT NOT NULL UNIQUE,
      commercial_contact TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      category TEXT NOT NULL,
      bank_details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      document TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      donor_type TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'Mensal',
      status TEXT NOT NULL DEFAULT 'ativo',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('receita','despesa')),
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      settlement_date TEXT,
      payment_method TEXT NOT NULL,
      recurrence TEXT NOT NULL DEFAULT 'Única',
      cost_center TEXT NOT NULL DEFAULT 'Institucional',
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      donor_id INTEGER REFERENCES donors(id) ON DELETE SET NULL,
      receipt_ref TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS financial_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      changed_by TEXT NOT NULL,
      change_type TEXT NOT NULL,
      previous_json TEXT,
      new_json TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS volunteers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      birth_date TEXT,
      cpf TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      area TEXT NOT NULL,
      education TEXT NOT NULL,
      availability TEXT NOT NULL,
      schedule_hours TEXT NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      entry_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS volunteer_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      activity_date TEXT NOT NULL,
      hours REAL NOT NULL,
      activity_description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'Educacional',
      description TEXT NOT NULL DEFAULT '',
      default_shift TEXT NOT NULL DEFAULT 'Manhã',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      activity_type_id INTEGER REFERENCES activity_types(id) ON DELETE SET NULL,
      instructor_name TEXT NOT NULL,
      schedule_label TEXT NOT NULL,
      shift TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS class_enrollments (
      class_id INTEGER NOT NULL REFERENCES attendance_classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      PRIMARY KEY (class_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES attendance_classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('presente','falta','justificada')),
      justification TEXT NOT NULL DEFAULT '',
      recorded_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (class_id, student_id, date)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      person_type TEXT NOT NULL,
      person_id INTEGER,
      person_name TEXT NOT NULL DEFAULT '',
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      access_level TEXT NOT NULL DEFAULT 'geral',
      file_name TEXT NOT NULL,
      file_mime TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      file_data_url TEXT,
      uploaded_by TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      event_date TEXT NOT NULL,
      event_time TEXT NOT NULL,
      location TEXT NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const volCols = db.prepare(`PRAGMA table_info(volunteers)`).all() as { name: string }[];
  if (!volCols.some((c) => c.name === 'birth_date')) {
    db.exec(`ALTER TABLE volunteers ADD COLUMN birth_date TEXT;`);
  }

  const classCols = db.prepare(`PRAGMA table_info(attendance_classes)`).all() as { name: string }[];
  if (!classCols.some((c) => c.name === 'activity_type_id')) {
    db.exec(`ALTER TABLE attendance_classes ADD COLUMN activity_type_id INTEGER REFERENCES activity_types(id) ON DELETE SET NULL;`);
  }

  const patCols = db.prepare(`PRAGMA table_info(patients)`).all() as { name: string }[];
  const patAdditions: [string, string][] = [
    ['blood_type', `TEXT NOT NULL DEFAULT ''`],
    ['emergency_contact', `TEXT NOT NULL DEFAULT ''`],
    ['clinical_allergies', `TEXT NOT NULL DEFAULT ''`],
    ['clinical_medications', `TEXT NOT NULL DEFAULT ''`],
    ['clinical_history', `TEXT NOT NULL DEFAULT ''`],
    ['school_observations', `TEXT NOT NULL DEFAULT ''`],
    ['family_dynamics', `TEXT NOT NULL DEFAULT ''`],
  ];
  for (const [colName, colDef] of patAdditions) {
    if (!patCols.some((c) => c.name === colName)) {
      db.exec(`ALTER TABLE patients ADD COLUMN ${colName} ${colDef};`);
    }
  }

  const medCols = db.prepare(`PRAGMA table_info(medical_records)`).all() as { name: string }[];
  const medAdditions: [string, string][] = [
    ['record_type', `TEXT NOT NULL DEFAULT 'Psicológico'`],
    ['checklist_json', `TEXT NOT NULL DEFAULT '{}'`],
    ['vitals_json', `TEXT NOT NULL DEFAULT '{}'`],
  ];
  for (const [colName, colDef] of medAdditions) {
    if (!medCols.some((c) => c.name === colName)) {
      db.exec(`ALTER TABLE medical_records ADD COLUMN ${colName} ${colDef};`);
    }
  }

  // Upgrade users table CHECK constraint if psicologo/medico roles are missing
  const usersMeta = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
    .get() as { sql: string } | undefined;
  if (usersMeta && (!usersMeta.sql.includes("'psicologo'") || !usersMeta.sql.includes("'medico'"))) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN;');
    try {
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin','diretoria','financeiro','coordenacao_social','saude','psicologo','medico','professor','voluntario')),
          specialty TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_login_at TEXT
        );
        INSERT INTO users_new (id, name, email, password_hash, role, specialty, active, created_at, last_login_at)
        SELECT id, name, email, password_hash, role, specialty, active, created_at, last_login_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  // Ensure first-access approval and multi-role columns exist on users table
  const userCols = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
  const userAdditions: [string, string][] = [
    ['approval_status', `TEXT NOT NULL DEFAULT 'aprovado'`],
    ['requested_role', `TEXT`],
    ['approval_notes', `TEXT NOT NULL DEFAULT ''`],
    ['approved_by', `TEXT`],
    ['approved_at', `TEXT`],
    ['roles_json', `TEXT NOT NULL DEFAULT '[]'`],
    ['requested_roles_json', `TEXT NOT NULL DEFAULT '[]'`],
  ];
  for (const [colName, colDef] of userAdditions) {
    if (!userCols.some((c) => c.name === colName)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${colName} ${colDef};`);
    }
  }

  db.exec(
    `UPDATE users SET roles_json = '["' || role || '"]' WHERE roles_json IS NULL OR roles_json = '' OR roles_json = '[]';`
  );
  db.exec(
    `UPDATE users SET requested_roles_json = '["' || requested_role || '"]'
     WHERE requested_role IS NOT NULL AND requested_role != '' AND (requested_roles_json IS NULL OR requested_roles_json = '' OR requested_roles_json = '[]');`
  );
}

export function logAudit(params: {
  userId?: number | null;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details: string;
  ipAddress?: string;
}): void {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    params.userId ?? null,
    params.userName,
    params.userRole,
    params.action,
    params.entityType,
    params.entityId != null ? String(params.entityId) : null,
    params.details,
    params.ipAddress ?? null
  );
}
