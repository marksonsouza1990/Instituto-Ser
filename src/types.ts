export type UserRole =
  | 'admin'
  | 'diretoria'
  | 'financeiro'
  | 'coordenacao_social'
  | 'saude'
  | 'psicologo'
  | 'medico'
  | 'professor'
  | 'voluntario';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  financeiro: 'Departamento Financeiro',
  psicologo: 'Psicólogo(a)',
  medico: 'Médico(a)',
  saude: 'Saúde (Geral)',
  diretoria: 'Diretoria',
  coordenacao_social: 'Coordenação Social',
  professor: 'Professor / Monitor',
  voluntario: 'Voluntário',
};

export const FINANCE_ROLES: UserRole[] = ['admin', 'financeiro'];
export const HEALTH_ROLES: UserRole[] = ['admin', 'saude', 'psicologo', 'medico'];

export type RoleInput =
  | UserRole
  | readonly UserRole[]
  | { role: UserRole; roles?: readonly UserRole[] }
  | null
  | undefined;

export function getUserRoles(input: RoleInput): UserRole[] {
  if (!input) return [];
  if (typeof input === 'string') return [input];
  if (Array.isArray(input)) {
    return Array.from(new Set(input));
  }
  const obj = input as { role: UserRole; roles?: readonly UserRole[] };
  if (obj.roles && obj.roles.length > 0) {
    return Array.from(new Set(obj.roles));
  }
  return obj.role ? [obj.role] : [];
}

export function hasAnyRole(input: RoleInput, allowedRoles: readonly UserRole[]): boolean {
  const userRoles = getUserRoles(input);
  return userRoles.some((r) => allowedRoles.includes(r));
}

export function formatUserRoles(input: RoleInput): string {
  const userRoles = getUserRoles(input);
  if (userRoles.length === 0) return '';
  return userRoles.map((r) => ROLE_LABELS[r] || r).join(' · ');
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  roles?: UserRole[];
  requested_role?: UserRole | null;
  requested_roles?: UserRole[];
  specialty?: string | null;
  active: boolean;
  approval_status?: 'pendente' | 'aprovado' | 'recusado';
  approval_notes?: string;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  last_login_at?: string | null;
}

export interface Family {
  id: number;
  responsible_name: string;
  responsible_phone: string;
  responsible_cpf: string;
  address: string;
  neighborhood: string;
  household_size: number;
  working_members: number;
  family_income: number;
  vulnerability_level: 'Baixa' | 'Moderada' | 'Alta' | 'Extrema';
  vulnerability_notes: string;
  assistance_history: string;
  active: number;
  student_count?: number;
  created_at: string;
  updated_at: string;
}

export type StudentStatus = 'ativo' | 'inativo' | 'aguardando_vaga' | 'desligado';

export interface Student {
  id: number;
  family_id: number | null;
  full_name: string;
  birth_date: string;
  cpf: string | null;
  rg: string | null;
  photo_url: string | null;
  address: string;
  school_name: string;
  school_year: string;
  school_shift: 'Manhã' | 'Tarde' | 'Integral' | 'Noite';
  guardian_name: string;
  guardian_phone: string;
  family_composition: string;
  household_size: number;
  family_income: number;
  working_members: number;
  vulnerability_situation: string;
  identified_needs: string;
  assistance_history: string;
  social_notes: string;
  programs: string[];
  status: StudentStatus;
  entry_date: string;
  attendance_rate?: number;
  linked_patient_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface StudentEvolution {
  id: number;
  student_id: number;
  author_id: number | null;
  author_name: string;
  category: 'Pedagógico' | 'Social' | 'Esportivo' | 'Geral';
  note: string;
  recorded_at: string;
  created_at: string;
}

export interface Patient {
  id: number;
  student_id: number | null;
  full_name: string;
  birth_date: string;
  cpf: string | null;
  guardian_name: string;
  contact_phone: string;
  responsible_professional: string;
  specialty: string;
  follow_up_status: 'Em acompanhamento' | 'Aguardando triagem' | 'Alta' | 'Encaminhado';
  blood_type?: string;
  emergency_contact?: string;
  clinical_allergies?: string;
  clinical_medications?: string;
  clinical_history?: string;
  school_observations?: string;
  family_dynamics?: string;
  total_appointments?: number;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: number;
  patient_id: number;
  patient_name?: string;
  professional_name: string;
  specialty: string;
  scheduled_date: string;
  scheduled_time: string;
  status: 'Agendada' | 'Realizada' | 'Falta' | 'Cancelada' | 'Retorno Agendado';
  is_return: number;
  referral_to: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface MedicalRecord {
  id: number;
  patient_id: number;
  appointment_id: number | null;
  author_id: number;
  author_name: string;
  specialty: string;
  record_type?: 'Médico' | 'Psicológico';
  checklist?: Record<string, boolean>;
  vitals?: Record<string, string>;
  evolution_text: string;
  professional_notes: string;
  referrals: string;
  lgpd_consent_verified: number;
  recorded_at: string;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  objective: string;
  target_audience: string;
  manager_name: string;
  start_date: string;
  end_date: string;
  planned_budget: number | null;
  received_resources: number | null;
  realized_expenses: number | null;
  beneficiaries_count: number;
  target_beneficiaries: number;
  impact_indicator_label: string;
  impact_indicator_value: string;
  status: 'Planejamento' | 'Ativo' | 'Pausado' | 'Concluído';
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: number;
  legal_name: string;
  trade_name: string;
  document: string;
  commercial_contact: string;
  phone: string;
  email: string;
  address: string;
  category: string;
  bank_details?: string | null;
  bank_details_masked?: boolean;
  total_paid?: number;
  purchases_count?: number;
  status: 'ativo' | 'inativo';
  created_at: string;
  updated_at: string;
}

export interface Donor {
  id: number;
  name: string;
  document: string;
  phone: string;
  email: string;
  address: string;
  donor_type: 'Pessoa Física' | 'Empresa' | 'Institucional' | 'Edital / Fundo';
  frequency: 'Única' | 'Mensal' | 'Trimestral' | 'Anual';
  status: 'ativo' | 'inativo';
  notes: string;
  total_donated?: number | null;
  donations_count?: number | null;
  supported_projects?: string[];
  last_donation_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialTransaction {
  id: number;
  type: 'receita' | 'despesa';
  description: string;
  category: string;
  amount: number;
  status: 'Pago' | 'Recebido' | 'Pendente' | 'Vencido';
  issue_date: string;
  due_date: string;
  settlement_date: string | null;
  payment_method: string;
  recurrence: 'Única' | 'Mensal' | 'Trimestral' | 'Anual';
  cost_center: string;
  project_id: number | null;
  project_name?: string | null;
  supplier_id: number | null;
  supplier_name?: string | null;
  donor_id: number | null;
  donor_name?: string | null;
  receipt_ref: string;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FinancialHistoryEntry {
  id: number;
  transaction_id: number;
  changed_by: string;
  change_type: string;
  previous_json: string | null;
  new_json: string | null;
  changed_at: string;
}

export interface Volunteer {
  id: number;
  full_name: string;
  birth_date?: string | null;
  cpf: string;
  phone: string;
  email: string;
  area: string;
  education: string;
  availability: string;
  schedule_hours: string;
  project_id: number | null;
  project_name?: string | null;
  entry_date: string;
  status: 'ativo' | 'inativo' | 'afastado';
  total_hours?: number;
  created_at: string;
  updated_at: string;
}

export interface VolunteerHour {
  id: number;
  volunteer_id: number;
  volunteer_name?: string;
  project_id: number | null;
  project_name?: string | null;
  activity_date: string;
  hours: number;
  activity_description: string;
  created_at: string;
}

export interface ActivityType {
  id: number;
  name: string;
  category: string;
  description: string;
  default_shift: string;
  active: number;
  classes_count?: number;
  created_at: string;
  updated_at: string;
}

export interface AttendanceClass {
  id: number;
  name: string;
  project_id: number | null;
  project_name?: string | null;
  activity_type_id?: number | null;
  activity_type_name?: string | null;
  instructor_name: string;
  schedule_label: string;
  shift: string;
  student_count?: number;
}

export interface AttendanceRecord {
  id: number;
  class_id: number;
  student_id: number;
  student_name?: string;
  date: string;
  status: 'presente' | 'falta' | 'justificada';
  justification: string;
  recorded_by: string;
  created_at: string;
}

export interface InstitutionalDocument {
  id: number;
  title: string;
  category: string;
  person_type: 'aluno' | 'paciente' | 'voluntario' | 'fornecedor' | 'geral';
  person_id: number | null;
  person_name: string;
  project_id: number | null;
  project_name?: string | null;
  access_level: 'geral' | 'restrito_saude' | 'restrito_financeiro' | 'restrito_diretoria';
  file_name: string;
  file_mime: string;
  file_size: number;
  has_file?: boolean;
  uploaded_by: string;
  uploaded_at: string;
}

export interface InstitutionalEvent {
  id: number;
  title: string;
  event_date: string;
  event_time: string;
  location: string;
  project_id: number | null;
  project_name?: string | null;
  description: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  user_name: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string;
  created_at: string;
}

export type DashboardPeriod = 'semanal' | 'mensal' | 'trimestral' | 'semestral' | 'anual';

export interface DashboardData {
  period: DashboardPeriod;
  kpis: {
    totalStudents: number;
    activeStudents: number;
    totalPatients: number;
    periodAttendances: number;
    assistedFamilies: number;
    activeVolunteers: number;
    activeDonors: number;
    periodRevenue: number;
    periodExpenses: number;
    availableBalance: number;
    pendingAttendances: number;
    benefitedChildren: number;
  };
  charts: {
    monthlyChildrenEvolution: { label: string; count: number }[];
    attendancesByModality: { modality: string; count: number }[];
    revenueVsExpenses: { label: string; revenue: number; expenses: number }[];
    expensesByCategory: { category: string; amount: number; percentage: number }[];
    donationsEvolution: { label: string; amount: number }[];
    healthAttendances: { label: string; psicologia: number; medico: number }[];
    familiesEvolution: { label: string; count: number }[];
    socialImpactEvolution: { label: string; score: number; attendances: number; volunteerHours: number }[];
  };
  feeds: {
    recentTransactions: FinancialTransaction[];
    upcomingAppointments: Appointment[];
    upcomingEvents: InstitutionalEvent[];
    payableAlerts: FinancialTransaction[];
    pendingDocumentsAlerts: { student_id: number; student_name: string; missing: string }[];
    monthlyBirthdays: { id: number; name: string; type: 'Aluno' | 'Voluntário'; birth_date: string; day: number }[];
    recentActivities: AuditLog[];
  };
}

export interface AgendaPatientSummary {
  id: number;
  full_name: string;
  responsible_professional: string;
  specialty: string;
  follow_up_status: string;
}

export interface AgendaData {
  canSeeHealth: boolean;
  events: InstitutionalEvent[];
  classes: AttendanceClass[];
  activityTypes: ActivityType[];
  projects: { id: number; name: string; status: string }[];
  appointments: Appointment[];
  patients: AgendaPatientSummary[];
}

