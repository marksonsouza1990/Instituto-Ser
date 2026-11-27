import { useEffect, useState, type FormEvent } from 'react';
import {
  Building2,
  Calendar,
  Edit3,
  FolderKanban,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  Home,
  Layers,
  Plus,
  Search,
  Trash2,
  Users,
  ClipboardList,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatBRL, formatDateBR } from '../lib/format';
import {
  FINANCE_ROLES,
  HEALTH_ROLES,
  hasAnyRole,
  type ActivityType,
  type AttendanceClass,
  type Donor,
  type Family,
  type InstitutionalEvent,
  type Patient,
  type Project,
  type RoleInput,
  type Student,
  type StudentStatus,
  type Supplier,
  type Volunteer,
} from '../types';

type RegistryTab =
  | 'voluntarios'
  | 'tipos_atividades'
  | 'turmas'
  | 'doadores'
  | 'fornecedores'
  | 'projetos'
  | 'familias'
  | 'alunos'
  | 'pacientes'
  | 'eventos';

const PROGRAMS_LIST = [
  'Reforço Escolar',
  'Acompanhamento Psicológico',
  'Atendimento Médico',
  'Projeto Esportivo',
  'Oficina de Artes e Leitura Viva',
  'Assistência Familiar',
];

export function CadastrosView({ role }: { role: RoleInput }) {
  const canSeeFinance = hasAnyRole(role, FINANCE_ROLES);
  const canSeeHealth = hasAnyRole(role, HEALTH_ROLES);

  const canEditVolunteers = hasAnyRole(role, ['admin', 'coordenacao_social', 'diretoria']);
  const canEditActivities = hasAnyRole(role, ['admin', 'diretoria', 'coordenacao_social', 'professor']);
  const canEditDonors = hasAnyRole(role, ['admin', 'financeiro', 'diretoria', 'coordenacao_social']);
  const canEditSuppliers = hasAnyRole(role, FINANCE_ROLES);
  const canEditProjects = hasAnyRole(role, ['admin', 'diretoria', 'coordenacao_social']);
  const canEditFamilies = hasAnyRole(role, ['admin', 'coordenacao_social', 'diretoria']);
  const canEditStudents = hasAnyRole(role, ['admin', 'coordenacao_social', 'professor']);
  const canEditPatients = hasAnyRole(role, HEALTH_ROLES);
  const canEditEvents = hasAnyRole(role, ['admin', 'diretoria', 'coordenacao_social']);
  const canSeeFamilies = hasAnyRole(role, ['admin', 'diretoria', 'coordenacao_social', ...HEALTH_ROLES, 'professor']);

  const tabs: { id: RegistryTab; label: string; icon: typeof Users; visible: boolean }[] = [
    { id: 'voluntarios', label: 'Voluntários', icon: Users, visible: true },
    { id: 'tipos_atividades', label: 'Tipos de Atividades', icon: Layers, visible: true },
    { id: 'turmas', label: 'Turmas e Oficinas', icon: ClipboardList, visible: true },
    { id: 'doadores', label: 'Doadores', icon: HeartHandshake, visible: true },
    { id: 'fornecedores', label: 'Fornecedores', icon: Building2, visible: canSeeFinance },
    { id: 'projetos', label: 'Projetos', icon: FolderKanban, visible: true },
    { id: 'familias', label: 'Famílias', icon: Home, visible: canSeeFamilies },
    { id: 'alunos', label: 'Alunos', icon: GraduationCap, visible: true },
    { id: 'pacientes', label: 'Pacientes', icon: HeartPulse, visible: canSeeHealth },
    { id: 'eventos', label: 'Eventos', icon: Calendar, visible: true },
  ];

  const visibleTabs = tabs.filter((t) => t.visible);
  const [activeTab, setActiveTab] = useState<RegistryTab>('voluntarios');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Loaded datasets
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [classes, setClasses] = useState<AttendanceClass[]>([]);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [events, setEvents] = useState<InstitutionalEvent[]>([]);

  // Active modal state
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Forms
  const [volForm, setVolForm] = useState({
    full_name: '',
    birth_date: '',
    cpf: '',
    phone: '',
    email: '',
    area: '',
    education: '',
    availability: '',
    schedule_hours: '',
    project_id: '',
    entry_date: '2026-11-23',
    status: 'ativo',
  });

  const [actForm, setActForm] = useState({
    name: '',
    category: 'Educacional',
    description: '',
    default_shift: 'Manhã',
    active: true,
  });

  const [classForm, setClassForm] = useState({
    name: '',
    project_id: '',
    activity_type_id: '',
    instructor_name: '',
    schedule_label: '',
    shift: 'Manhã',
  });

  const [donorForm, setDonorForm] = useState({
    name: '',
    document: '',
    phone: '',
    email: '',
    address: '',
    donor_type: 'Pessoa Física',
    frequency: 'Mensal',
    status: 'ativo',
    notes: '',
  });

  const [supForm, setSupForm] = useState({
    legal_name: '',
    trade_name: '',
    document: '',
    commercial_contact: '',
    phone: '',
    email: '',
    address: '',
    category: 'Alimentação',
    bank_details: '',
    status: 'ativo',
  });

  const [projForm, setProjForm] = useState({
    name: '',
    description: '',
    objective: '',
    target_audience: '',
    manager_name: '',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    planned_budget: '0',
    target_beneficiaries: '50',
    impact_indicator_label: '',
    impact_indicator_value: '',
    status: 'Ativo',
  });

  const [famForm, setFamForm] = useState({
    responsible_name: '',
    responsible_phone: '',
    responsible_cpf: '',
    address: '',
    neighborhood: '',
    household_size: '4',
    working_members: '1',
    family_income: '1800',
    vulnerability_level: 'Moderada',
    vulnerability_notes: '',
    assistance_history: '',
    active: true,
  });

  const [stuForm, setStuForm] = useState({
    full_name: '',
    birth_date: '',
    cpf: '',
    rg: '',
    address: '',
    school_name: '',
    school_year: '',
    school_shift: 'Manhã',
    guardian_name: '',
    guardian_phone: '',
    household_size: '4',
    family_income: '1800',
    working_members: '1',
    vulnerability_situation: '',
    identified_needs: '',
    assistance_history: '',
    social_notes: '',
    programs: [] as string[],
    status: 'ativo' as StudentStatus,
  });

  const [patForm, setPatForm] = useState({
    full_name: '',
    birth_date: '',
    cpf: '',
    guardian_name: '',
    contact_phone: '',
    responsible_professional: '',
    specialty: 'Psicologia',
    follow_up_status: 'Em acompanhamento',
    blood_type: '',
    emergency_contact: '',
  });

  const [evtForm, setEvtForm] = useState({
    title: '',
    event_date: '2026-12-01',
    event_time: '09:00',
    location: '',
    project_id: '',
    description: '',
  });

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [vols, acts, cls, dons, projs, stus, evts, sups, fams, pats] = await Promise.all([
        apiRequest<Volunteer[]>('/api/volunteers'),
        apiRequest<ActivityType[]>('/api/activity-types'),
        apiRequest<AttendanceClass[]>('/api/attendance/classes'),
        apiRequest<Donor[]>('/api/donors'),
        apiRequest<Project[]>('/api/projects'),
        apiRequest<Student[]>('/api/students'),
        apiRequest<InstitutionalEvent[]>('/api/events'),
        canSeeFinance ? apiRequest<Supplier[]>('/api/suppliers') : Promise.resolve([] as Supplier[]),
        canSeeFamilies ? apiRequest<Family[]>('/api/families') : Promise.resolve([] as Family[]),
        canSeeHealth ? apiRequest<Patient[]>('/api/patients') : Promise.resolve([] as Patient[]),
      ]);
      setVolunteers(vols);
      setActivityTypes(acts);
      setClasses(cls);
      setDonors(dons);
      setProjects(projs);
      setStudents(stus);
      setEvents(evts);
      setSuppliers(sups);
      setFamilies(fams);
      setPatients(pats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar cadastros.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function openCreateModal() {
    setError(null);
    setSuccessMsg(null);
    setEditingId(null);
    setModalMode('create');

    if (activeTab === 'voluntarios') {
      setVolForm({
        full_name: '',
        birth_date: '',
        cpf: '',
        phone: '',
        email: '',
        area: '',
        education: '',
        availability: '',
        schedule_hours: '',
        project_id: '',
        entry_date: '2026-11-23',
        status: 'ativo',
      });
    } else if (activeTab === 'tipos_atividades') {
      setActForm({
        name: '',
        category: 'Educacional',
        description: '',
        default_shift: 'Manhã',
        active: true,
      });
    } else if (activeTab === 'turmas') {
      setClassForm({
        name: '',
        project_id: projects[0] ? String(projects[0].id) : '',
        activity_type_id: activityTypes[0] ? String(activityTypes[0].id) : '',
        instructor_name: '',
        schedule_label: '',
        shift: 'Manhã',
      });
    } else if (activeTab === 'doadores') {
      setDonorForm({
        name: '',
        document: '',
        phone: '',
        email: '',
        address: '',
        donor_type: 'Pessoa Física',
        frequency: 'Mensal',
        status: 'ativo',
        notes: '',
      });
    } else if (activeTab === 'fornecedores') {
      setSupForm({
        legal_name: '',
        trade_name: '',
        document: '',
        commercial_contact: '',
        phone: '',
        email: '',
        address: '',
        category: 'Alimentação',
        bank_details: '',
        status: 'ativo',
      });
    } else if (activeTab === 'projetos') {
      setProjForm({
        name: '',
        description: '',
        objective: '',
        target_audience: '',
        manager_name: '',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        planned_budget: '0',
        target_beneficiaries: '50',
        impact_indicator_label: '',
        impact_indicator_value: '',
        status: 'Ativo',
      });
    } else if (activeTab === 'familias') {
      setFamForm({
        responsible_name: '',
        responsible_phone: '',
        responsible_cpf: '',
        address: '',
        neighborhood: '',
        household_size: '4',
        working_members: '1',
        family_income: '1800',
        vulnerability_level: 'Moderada',
        vulnerability_notes: '',
        assistance_history: '',
        active: true,
      });
    } else if (activeTab === 'eventos') {
      setEvtForm({
        title: '',
        event_date: '2026-12-01',
        event_time: '09:00',
        location: '',
        project_id: '',
        description: '',
      });
    }
  }

  function openEditItem(item: unknown) {
    setError(null);
    setSuccessMsg(null);
    setModalMode('edit');

    if (activeTab === 'voluntarios') {
      const v = item as Volunteer;
      setEditingId(v.id);
      setVolForm({
        full_name: v.full_name,
        birth_date: v.birth_date || '',
        cpf: v.cpf,
        phone: v.phone,
        email: v.email,
        area: v.area,
        education: v.education,
        availability: v.availability,
        schedule_hours: v.schedule_hours,
        project_id: v.project_id ? String(v.project_id) : '',
        entry_date: v.entry_date,
        status: v.status,
      });
    } else if (activeTab === 'tipos_atividades') {
      const a = item as ActivityType;
      setEditingId(a.id);
      setActForm({
        name: a.name,
        category: a.category,
        description: a.description,
        default_shift: a.default_shift,
        active: a.active === 1,
      });
    } else if (activeTab === 'turmas') {
      const c = item as AttendanceClass;
      setEditingId(c.id);
      setClassForm({
        name: c.name,
        project_id: c.project_id ? String(c.project_id) : '',
        activity_type_id: c.activity_type_id ? String(c.activity_type_id) : '',
        instructor_name: c.instructor_name,
        schedule_label: c.schedule_label,
        shift: c.shift,
      });
    } else if (activeTab === 'doadores') {
      const d = item as Donor;
      setEditingId(d.id);
      setDonorForm({
        name: d.name,
        document: d.document,
        phone: d.phone,
        email: d.email,
        address: d.address,
        donor_type: d.donor_type,
        frequency: d.frequency,
        status: d.status,
        notes: d.notes || '',
      });
    } else if (activeTab === 'fornecedores') {
      const s = item as Supplier;
      setEditingId(s.id);
      setSupForm({
        legal_name: s.legal_name,
        trade_name: s.trade_name,
        document: s.document,
        commercial_contact: s.commercial_contact,
        phone: s.phone,
        email: s.email,
        address: s.address,
        category: s.category,
        bank_details: s.bank_details || '',
        status: s.status,
      });
    } else if (activeTab === 'projetos') {
      const p = item as Project;
      setEditingId(p.id);
      setProjForm({
        name: p.name,
        description: p.description,
        objective: p.objective,
        target_audience: p.target_audience,
        manager_name: p.manager_name,
        start_date: p.start_date,
        end_date: p.end_date,
        planned_budget: p.planned_budget != null ? String(p.planned_budget) : '0',
        target_beneficiaries: String(p.target_beneficiaries),
        impact_indicator_label: p.impact_indicator_label,
        impact_indicator_value: p.impact_indicator_value,
        status: p.status,
      });
    } else if (activeTab === 'familias') {
      const f = item as Family;
      setEditingId(f.id);
      setFamForm({
        responsible_name: f.responsible_name,
        responsible_phone: f.responsible_phone,
        responsible_cpf: f.responsible_cpf || '',
        address: f.address,
        neighborhood: f.neighborhood,
        household_size: String(f.household_size),
        working_members: String(f.working_members),
        family_income: String(f.family_income),
        vulnerability_level: f.vulnerability_level,
        vulnerability_notes: f.vulnerability_notes || '',
        assistance_history: f.assistance_history || '',
        active: f.active === 1,
      });
    } else if (activeTab === 'alunos') {
      const s = item as Student;
      setEditingId(s.id);
      setStuForm({
        full_name: s.full_name,
        birth_date: s.birth_date,
        cpf: s.cpf || '',
        rg: s.rg || '',
        address: s.address,
        school_name: s.school_name,
        school_year: s.school_year,
        school_shift: s.school_shift,
        guardian_name: s.guardian_name,
        guardian_phone: s.guardian_phone,
        household_size: String(s.household_size),
        family_income: String(s.family_income),
        working_members: String(s.working_members),
        vulnerability_situation: s.vulnerability_situation || '',
        identified_needs: s.identified_needs || '',
        assistance_history: s.assistance_history || '',
        social_notes: s.social_notes || '',
        programs: s.programs || [],
        status: s.status,
      });
    } else if (activeTab === 'pacientes') {
      const pat = item as Patient;
      setEditingId(pat.id);
      setPatForm({
        full_name: pat.full_name,
        birth_date: pat.birth_date,
        cpf: pat.cpf || '',
        guardian_name: pat.guardian_name,
        contact_phone: pat.contact_phone,
        responsible_professional: pat.responsible_professional,
        specialty: pat.specialty,
        follow_up_status: pat.follow_up_status,
        blood_type: pat.blood_type || '',
        emergency_contact: pat.emergency_contact || '',
      });
    } else if (activeTab === 'eventos') {
      const ev = item as InstitutionalEvent;
      setEditingId(ev.id);
      setEvtForm({
        title: ev.title,
        event_date: ev.event_date,
        event_time: ev.event_time,
        location: ev.location,
        project_id: ev.project_id ? String(ev.project_id) : '',
        description: ev.description || '',
      });
    }
  }

  async function handleSubmitModal(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const isEdit = modalMode === 'edit' && editingId != null;

    try {
      if (activeTab === 'voluntarios') {
        const body = {
          ...volForm,
          project_id: volForm.project_id ? Number(volForm.project_id) : null,
        };
        await apiRequest(isEdit ? `/api/volunteers/${editingId}` : '/api/volunteers', {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        });
      } else if (activeTab === 'tipos_atividades') {
        await apiRequest(isEdit ? `/api/activity-types/${editingId}` : '/api/activity-types', {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(actForm),
        });
      } else if (activeTab === 'turmas') {
        const body = {
          ...classForm,
          project_id: classForm.project_id ? Number(classForm.project_id) : null,
          activity_type_id: classForm.activity_type_id ? Number(classForm.activity_type_id) : null,
        };
        await apiRequest(isEdit ? `/api/attendance/classes/${editingId}` : '/api/attendance/classes', {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        });
      } else if (activeTab === 'doadores') {
        await apiRequest(isEdit ? `/api/donors/${editingId}` : '/api/donors', {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(donorForm),
        });
      } else if (activeTab === 'fornecedores') {
        await apiRequest(isEdit ? `/api/suppliers/${editingId}` : '/api/suppliers', {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(supForm),
        });
      } else if (activeTab === 'projetos') {
        const body = {
          ...projForm,
          planned_budget: Number(projForm.planned_budget || 0),
          target_beneficiaries: Number(projForm.target_beneficiaries || 0),
        };
        await apiRequest(isEdit ? `/api/projects/${editingId}` : '/api/projects', {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        });
      } else if (activeTab === 'familias') {
        const body = {
          ...famForm,
          household_size: Number(famForm.household_size || 1),
          working_members: Number(famForm.working_members || 0),
          family_income: Number(famForm.family_income || 0),
        };
        await apiRequest(isEdit ? `/api/families/${editingId}` : '/api/families', {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        });
      } else if (activeTab === 'alunos' && isEdit) {
        const body = {
          ...stuForm,
          household_size: Number(stuForm.household_size || 1),
          working_members: Number(stuForm.working_members || 0),
          family_income: Number(stuForm.family_income || 0),
        };
        await apiRequest(`/api/students/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else if (activeTab === 'pacientes' && isEdit) {
        await apiRequest(`/api/patients/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(patForm),
        });
      } else if (activeTab === 'eventos') {
        const body = {
          ...evtForm,
          project_id: evtForm.project_id ? Number(evtForm.project_id) : null,
        };
        await apiRequest(isEdit ? `/api/events/${editingId}` : '/api/events', {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        });
      }

      setModalMode(null);
      setSuccessMsg(isEdit ? 'Cadastro atualizado com sucesso.' : 'Novo registro salvo com sucesso.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cadastro.');
    }
  }

  async function handleDeleteActivityType(id: number, name: string) {
    setError(null);
    setSuccessMsg(null);
    try {
      await apiRequest(`/api/activity-types/${id}`, { method: 'DELETE' });
      setSuccessMsg(`Tipo de atividade "${name}" removido.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover tipo de atividade.');
    }
  }

  async function handleDeleteEvent(id: number, title: string) {
    setError(null);
    setSuccessMsg(null);
    try {
      await apiRequest(`/api/events/${id}`, { method: 'DELETE' });
      setSuccessMsg(`Evento "${title}" removido.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover evento.');
    }
  }

  const canCreateCurrentTab =
    (activeTab === 'voluntarios' && canEditVolunteers) ||
    (activeTab === 'tipos_atividades' && canEditActivities) ||
    (activeTab === 'turmas' && canEditActivities) ||
    (activeTab === 'doadores' && canEditDonors) ||
    (activeTab === 'fornecedores' && canEditSuppliers) ||
    (activeTab === 'projetos' && canEditProjects) ||
    (activeTab === 'familias' && canEditFamilies) ||
    (activeTab === 'eventos' && canEditEvents);

  const q = search.trim().toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Central de Edição de Cadastros
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Edite e mantenha atualizados os cadastros de voluntários, tipos de atividades, turmas, doadores, fornecedores, projetos e pessoas.
          </p>
        </div>

        {canCreateCurrentTab && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg cursor-pointer self-start whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Novo Registro
          </button>
        )}
      </div>

      {/* Sub-navigation switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearch('');
                  setSuccessMsg(null);
                  setError(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#144A47] text-white'
                    : 'bg-[#F7F5F0] text-[#182424]/80 hover:bg-[#EFECE4]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar registros nesta aba por nome, documento, categoria ou responsável..."
            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
      )}
      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {successMsg}
        </div>
      )}

      {/* Registry Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        {loading ? (
          <div className="py-10 text-center text-xs text-slate-400">Carregando cadastros...</div>
        ) : (
          <>
            {activeTab === 'voluntarios' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-3 px-4">Voluntário / CPF</th>
                    <th className="py-3 px-4">Contato</th>
                    <th className="py-3 px-4">Área / Formação</th>
                    <th className="py-3 px-4">Disponibilidade / Projeto</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {volunteers
                    .filter((v) =>
                      !q || `${v.full_name} ${v.cpf} ${v.area} ${v.email} ${v.project_name || ''}`.toLowerCase().includes(q)
                    )
                    .map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{v.full_name}</div>
                          <div className="text-[11px] font-mono text-slate-500">CPF {v.cpf}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono">{v.phone}</div>
                          <div className="text-[11px] text-slate-500">{v.email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800">{v.area}</div>
                          <div className="text-[11px] text-slate-500">{v.education}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div>{v.availability} · {v.schedule_hours}</div>
                          <div className="text-[11px] text-[#0E5A75]">{v.project_name || 'Geral'}</div>
                        </td>
                        <td className="py-3 px-4 font-medium text-[#144A47] capitalize">{v.status}</td>
                        <td className="py-3 px-4 text-right">
                          {canEditVolunteers && (
                            <button
                              type="button"
                              onClick={() => openEditItem(v)}
                              className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {activeTab === 'tipos_atividades' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-3 px-4">Tipo de Atividade</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4">Descrição</th>
                    <th className="py-3 px-4">Turno Padrão</th>
                    <th className="py-3 px-4 text-right">Turmas</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activityTypes
                    .filter((a) => !q || `${a.name} ${a.category} ${a.description}`.toLowerCase().includes(q))
                    .map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-medium text-slate-900">{a.name}</td>
                        <td className="py-3 px-4 text-slate-700">{a.category}</td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs">{a.description || '—'}</td>
                        <td className="py-3 px-4">{a.default_shift}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{a.classes_count ?? 0}</td>
                        <td className="py-3 px-4 font-medium text-[#144A47]">
                          {a.active === 1 ? 'Ativo' : 'Inativo'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-3">
                          {canEditActivities && (
                            <button
                              type="button"
                              onClick={() => openEditItem(a)}
                              className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Editar
                            </button>
                          )}
                          {canEditVolunteers && (
                            <button
                              type="button"
                              onClick={() => handleDeleteActivityType(a.id, a.name)}
                              className="inline-flex items-center gap-1 text-red-700 hover:underline font-medium cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Excluir
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {activeTab === 'turmas' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-3 px-4">Turma / Oficina</th>
                    <th className="py-3 px-4">Tipo de Atividade</th>
                    <th className="py-3 px-4">Projeto</th>
                    <th className="py-3 px-4">Educador / Horário</th>
                    <th className="py-3 px-4">Turno</th>
                    <th className="py-3 px-4 text-right">Alunos</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classes
                    .filter((c) =>
                      !q ||
                      `${c.name} ${c.activity_type_name || ''} ${c.project_name || ''} ${c.instructor_name}`
                        .toLowerCase()
                        .includes(q)
                    )
                    .map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-medium text-slate-900">{c.name}</td>
                        <td className="py-3 px-4 text-slate-700">{c.activity_type_name || 'Não vinculado'}</td>
                        <td className="py-3 px-4 text-slate-600">{c.project_name || 'Geral'}</td>
                        <td className="py-3 px-4">
                          <div>{c.instructor_name}</div>
                          <div className="text-[11px] text-slate-500">{c.schedule_label}</div>
                        </td>
                        <td className="py-3 px-4">{c.shift}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{c.student_count ?? 0}</td>
                        <td className="py-3 px-4 text-right">
                          {canEditActivities && (
                            <button
                              type="button"
                              onClick={() => openEditItem(c)}
                              className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {activeTab === 'doadores' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-3 px-4">Doador / CPF-CNPJ</th>
                    <th className="py-3 px-4">Tipo / Frequência</th>
                    <th className="py-3 px-4">Contato</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {donors
                    .filter((d) =>
                      !q || `${d.name} ${d.document} ${d.donor_type} ${d.email}`.toLowerCase().includes(q)
                    )
                    .map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{d.name}</div>
                          <div className="text-[11px] font-mono text-slate-500">{d.document}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div>{d.donor_type}</div>
                          <div className="text-[11px] text-slate-500">{d.frequency}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono">{d.phone}</div>
                          <div className="text-[11px] text-slate-500">{d.email}</div>
                        </td>
                        <td className="py-3 px-4 font-medium text-[#144A47] capitalize">{d.status}</td>
                        <td className="py-3 px-4 text-right">
                          {canEditDonors && (
                            <button
                              type="button"
                              onClick={() => openEditItem(d)}
                              className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {activeTab === 'fornecedores' && canSeeFinance && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-3 px-4">Fornecedor / CNPJ</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4">Contato / Telefone</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {suppliers
                    .filter((s) =>
                      !q || `${s.trade_name} ${s.legal_name} ${s.document} ${s.category}`.toLowerCase().includes(q)
                    )
                    .map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{s.trade_name}</div>
                          <div className="text-[11px] text-slate-500">
                            {s.legal_name} · <span className="font-mono">{s.document}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">{s.category}</td>
                        <td className="py-3 px-4">
                          <div>{s.commercial_contact}</div>
                          <div className="text-[11px] font-mono text-slate-500">{s.phone}</div>
                        </td>
                        <td className="py-3 px-4 font-medium text-[#144A47] capitalize">{s.status}</td>
                        <td className="py-3 px-4 text-right">
                          {canEditSuppliers && (
                            <button
                              type="button"
                              onClick={() => openEditItem(s)}
                              className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {activeTab === 'projetos' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-3 px-4">Projeto</th>
                    <th className="py-3 px-4">Responsável</th>
                    <th className="py-3 px-4">Período</th>
                    <th className="py-3 px-4 text-right">Meta / Benef.</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projects
                    .filter((p) => !q || `${p.name} ${p.manager_name} ${p.status}`.toLowerCase().includes(q))
                    .map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-medium text-slate-900">{p.name}</td>
                        <td className="py-3 px-4">{p.manager_name}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {formatDateBR(p.start_date)} — {formatDateBR(p.end_date)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {p.beneficiaries_count} / {p.target_beneficiaries}
                        </td>
                        <td className="py-3 px-4 font-medium text-[#144A47]">{p.status}</td>
                        <td className="py-3 px-4 text-right">
                          {canEditProjects && (
                            <button
                              type="button"
                              onClick={() => openEditItem(p)}
                              className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {activeTab === 'familias' && canSeeFamilies && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-3 px-4">Responsável Familiar</th>
                    <th className="py-3 px-4">Bairro / Endereço</th>
                    <th className="py-3 px-4">Renda / Moradores</th>
                    <th className="py-3 px-4">Vulnerabilidade</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {families
                    .filter((f) =>
                      !q || `${f.responsible_name} ${f.neighborhood} ${f.responsible_cpf || ''}`.toLowerCase().includes(q)
                    )
                    .map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{f.responsible_name}</div>
                          <div className="text-[11px] font-mono text-slate-500">{f.responsible_phone}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div>{f.neighborhood}</div>
                          <div className="text-[11px] text-slate-500">{f.address}</div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums">
                          {formatBRL(f.family_income)} · {f.household_size} pessoas
                        </td>
                        <td className="py-3 px-4 font-medium">{f.vulnerability_level}</td>
                        <td className="py-3 px-4 text-[#144A47] font-medium">
                          {f.active === 1 ? 'Ativa' : 'Inativa'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canEditFamilies && (
                            <button
                              type="button"
                              onClick={() => openEditItem(f)}
                              className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {activeTab === 'alunos' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-3 px-4">Aluno</th>
                    <th className="py-3 px-4">Escola / Turno</th>
                    <th className="py-3 px-4">Responsável</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students
                    .filter((s) =>
                      !q || `${s.full_name} ${s.cpf || ''} ${s.school_name} ${s.guardian_name}`.toLowerCase().includes(q)
                    )
                    .map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{s.full_name}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            Nasc.: {formatDateBR(s.birth_date)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {s.school_name} · {s.school_year} ({s.school_shift})
                        </td>
                        <td className="py-3 px-4">
                          <div>{s.guardian_name}</div>
                          <div className="text-[11px] font-mono text-slate-500">{s.guardian_phone}</div>
                        </td>
                        <td className="py-3 px-4 font-medium text-[#144A47] capitalize">
                          {s.status.replace('_', ' ')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canEditStudents && (
                            <button
                              type="button"
                              onClick={() => openEditItem(s)}
                              className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {activeTab === 'pacientes' && canSeeHealth && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-3 px-4">Paciente</th>
                    <th className="py-3 px-4">Responsável / Telefone</th>
                    <th className="py-3 px-4">Profissional / Especialidade</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patients
                    .filter((p) =>
                      !q || `${p.full_name} ${p.cpf || ''} ${p.specialty} ${p.responsible_professional}`.toLowerCase().includes(q)
                    )
                    .map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{p.full_name}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            Nasc.: {formatDateBR(p.birth_date)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div>{p.guardian_name}</div>
                          <div className="text-[11px] font-mono text-slate-500">{p.contact_phone}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div>{p.specialty}</div>
                          <div className="text-[11px] text-slate-500">{p.responsible_professional}</div>
                        </td>
                        <td className="py-3 px-4 font-medium text-[#144A47]">{p.follow_up_status}</td>
                        <td className="py-3 px-4 text-right">
                          {canEditPatients && (
                            <button
                              type="button"
                              onClick={() => openEditItem(p)}
                              className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {activeTab === 'eventos' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-3 px-4">Evento / Atividade</th>
                    <th className="py-3 px-4">Data / Horário</th>
                    <th className="py-3 px-4">Local</th>
                    <th className="py-3 px-4">Projeto</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events
                    .filter((ev) => !q || `${ev.title} ${ev.location} ${ev.project_name || ''}`.toLowerCase().includes(q))
                    .map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{ev.title}</div>
                          <div className="text-[11px] text-slate-500">{ev.description}</div>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {formatDateBR(ev.event_date)} · {ev.event_time}
                        </td>
                        <td className="py-3 px-4">{ev.location}</td>
                        <td className="py-3 px-4 text-slate-600">{ev.project_name || 'Institucional'}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-3">
                          {canEditEvents && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditItem(ev)}
                                className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" /> Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEvent(ev.id, ev.title)}
                                className="inline-flex items-center gap-1 text-red-700 hover:underline font-medium cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Excluir
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">
                {modalMode === 'edit' ? 'Editar Cadastro' : 'Novo Cadastro'} —{' '}
                {visibleTabs.find((t) => t.id === activeTab)?.label}
              </h2>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="text-xs text-slate-500 cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSubmitModal} className="mt-4 space-y-3 text-xs">
              {activeTab === 'voluntarios' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Nome completo *</label>
                    <input
                      type="text"
                      required
                      value={volForm.full_name}
                      onChange={(e) => setVolForm({ ...volForm, full_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">CPF *</label>
                    <input
                      type="text"
                      required
                      value={volForm.cpf}
                      onChange={(e) => setVolForm({ ...volForm, cpf: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Data de nascimento</label>
                    <input
                      type="date"
                      value={volForm.birth_date}
                      onChange={(e) => setVolForm({ ...volForm, birth_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Telefone</label>
                    <input
                      type="text"
                      value={volForm.phone}
                      onChange={(e) => setVolForm({ ...volForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">E-mail</label>
                    <input
                      type="email"
                      value={volForm.email}
                      onChange={(e) => setVolForm({ ...volForm, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Área de atuação *</label>
                    <input
                      type="text"
                      required
                      value={volForm.area}
                      onChange={(e) => setVolForm({ ...volForm, area: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Formação / Escolaridade</label>
                    <input
                      type="text"
                      value={volForm.education}
                      onChange={(e) => setVolForm({ ...volForm, education: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Disponibilidade</label>
                    <input
                      type="text"
                      value={volForm.availability}
                      onChange={(e) => setVolForm({ ...volForm, availability: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Horários</label>
                    <input
                      type="text"
                      value={volForm.schedule_hours}
                      onChange={(e) => setVolForm({ ...volForm, schedule_hours: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Projeto vinculado</label>
                    <select
                      value={volForm.project_id}
                      onChange={(e) => setVolForm({ ...volForm, project_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Geral / Institucional</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Status</label>
                    <select
                      value={volForm.status}
                      onChange={(e) => setVolForm({ ...volForm, status: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="ativo">Ativo</option>
                      <option value="afastado">Afastado</option>
                      <option value="inativo">Inativo</option>
                    </select>
                  </div>
                </div>
              )}

              {activeTab === 'tipos_atividades' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Nome do Tipo de Atividade *</label>
                    <input
                      type="text"
                      required
                      value={actForm.name}
                      onChange={(e) => setActForm({ ...actForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Categoria</label>
                    <select
                      value={actForm.category}
                      onChange={(e) => setActForm({ ...actForm, category: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Educacional">Educacional</option>
                      <option value="Saúde e Psicologia">Saúde e Psicologia</option>
                      <option value="Esporte e Cidadania">Esporte e Cidadania</option>
                      <option value="Cultura e Leitura">Cultura e Leitura</option>
                      <option value="Assistência Social">Assistência Social</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Turno padrão</label>
                    <select
                      value={actForm.default_shift}
                      onChange={(e) => setActForm({ ...actForm, default_shift: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Manhã">Manhã</option>
                      <option value="Tarde">Tarde</option>
                      <option value="Integral">Integral</option>
                      <option value="Noite">Noite</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Descrição</label>
                    <textarea
                      rows={3}
                      value={actForm.description}
                      onChange={(e) => setActForm({ ...actForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <label className="sm:col-span-2 flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      checked={actForm.active}
                      onChange={(e) => setActForm({ ...actForm, active: e.target.checked })}
                    />
                    Tipo de atividade ativo para novas turmas
                  </label>
                </div>
              )}

              {activeTab === 'turmas' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Nome da Turma / Oficina *</label>
                    <input
                      type="text"
                      required
                      value={classForm.name}
                      onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tipo de Atividade</label>
                    <select
                      value={classForm.activity_type_id}
                      onChange={(e) => setClassForm({ ...classForm, activity_type_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Sem vínculo específico</option>
                      {activityTypes.map((at) => (
                        <option key={at.id} value={at.id}>
                          {at.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Projeto</label>
                    <select
                      value={classForm.project_id}
                      onChange={(e) => setClassForm({ ...classForm, project_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Geral</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Educador / Monitor *</label>
                    <input
                      type="text"
                      required
                      value={classForm.instructor_name}
                      onChange={(e) => setClassForm({ ...classForm, instructor_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Dias e Horário *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex.: Seg / Qua · 09h00"
                      value={classForm.schedule_label}
                      onChange={(e) => setClassForm({ ...classForm, schedule_label: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Turno</label>
                    <select
                      value={classForm.shift}
                      onChange={(e) => setClassForm({ ...classForm, shift: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Manhã">Manhã</option>
                      <option value="Tarde">Tarde</option>
                      <option value="Integral">Integral</option>
                      <option value="Noite">Noite</option>
                    </select>
                  </div>
                </div>
              )}

              {activeTab === 'doadores' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Nome / Razão Social *</label>
                    <input
                      type="text"
                      required
                      value={donorForm.name}
                      onChange={(e) => setDonorForm({ ...donorForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">CPF / CNPJ *</label>
                    <input
                      type="text"
                      required
                      value={donorForm.document}
                      onChange={(e) => setDonorForm({ ...donorForm, document: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tipo</label>
                    <select
                      value={donorForm.donor_type}
                      onChange={(e) => setDonorForm({ ...donorForm, donor_type: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Pessoa Física">Pessoa Física</option>
                      <option value="Empresa">Empresa</option>
                      <option value="Institucional">Institucional</option>
                      <option value="Edital / Fundo">Edital / Fundo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Frequência</label>
                    <select
                      value={donorForm.frequency}
                      onChange={(e) => setDonorForm({ ...donorForm, frequency: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Única">Única</option>
                      <option value="Mensal">Mensal</option>
                      <option value="Trimestral">Trimestral</option>
                      <option value="Anual">Anual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Status</label>
                    <select
                      value={donorForm.status}
                      onChange={(e) => setDonorForm({ ...donorForm, status: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Telefone</label>
                    <input
                      type="text"
                      value={donorForm.phone}
                      onChange={(e) => setDonorForm({ ...donorForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">E-mail</label>
                    <input
                      type="email"
                      value={donorForm.email}
                      onChange={(e) => setDonorForm({ ...donorForm, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Endereço</label>
                    <input
                      type="text"
                      value={donorForm.address}
                      onChange={(e) => setDonorForm({ ...donorForm, address: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Observações</label>
                    <textarea
                      rows={2}
                      value={donorForm.notes}
                      onChange={(e) => setDonorForm({ ...donorForm, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'fornecedores' && canSeeFinance && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Razão Social *</label>
                    <input
                      type="text"
                      required
                      value={supForm.legal_name}
                      onChange={(e) => setSupForm({ ...supForm, legal_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Nome Fantasia</label>
                    <input
                      type="text"
                      value={supForm.trade_name}
                      onChange={(e) => setSupForm({ ...supForm, trade_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">CPF / CNPJ *</label>
                    <input
                      type="text"
                      required
                      value={supForm.document}
                      onChange={(e) => setSupForm({ ...supForm, document: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Categoria *</label>
                    <input
                      type="text"
                      required
                      value={supForm.category}
                      onChange={(e) => setSupForm({ ...supForm, category: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Contato comercial</label>
                    <input
                      type="text"
                      value={supForm.commercial_contact}
                      onChange={(e) => setSupForm({ ...supForm, commercial_contact: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Telefone</label>
                    <input
                      type="text"
                      value={supForm.phone}
                      onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">E-mail</label>
                    <input
                      type="email"
                      value={supForm.email}
                      onChange={(e) => setSupForm({ ...supForm, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Status</label>
                    <select
                      value={supForm.status}
                      onChange={(e) => setSupForm({ ...supForm, status: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Endereço</label>
                    <input
                      type="text"
                      value={supForm.address}
                      onChange={(e) => setSupForm({ ...supForm, address: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Dados bancários / PIX</label>
                    <input
                      type="text"
                      value={supForm.bank_details}
                      onChange={(e) => setSupForm({ ...supForm, bank_details: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'projetos' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Nome do Projeto *</label>
                    <input
                      type="text"
                      required
                      value={projForm.name}
                      onChange={(e) => setProjForm({ ...projForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Responsável *</label>
                    <input
                      type="text"
                      required
                      value={projForm.manager_name}
                      onChange={(e) => setProjForm({ ...projForm, manager_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Status</label>
                    <select
                      value={projForm.status}
                      onChange={(e) => setProjForm({ ...projForm, status: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Ativo">Ativo</option>
                      <option value="Planejamento">Planejamento</option>
                      <option value="Pausado">Pausado</option>
                      <option value="Concluído">Concluído</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Data início *</label>
                    <input
                      type="date"
                      required
                      value={projForm.start_date}
                      onChange={(e) => setProjForm({ ...projForm, start_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Data término *</label>
                    <input
                      type="date"
                      required
                      value={projForm.end_date}
                      onChange={(e) => setProjForm({ ...projForm, end_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Meta de beneficiários</label>
                    <input
                      type="number"
                      value={projForm.target_beneficiaries}
                      onChange={(e) => setProjForm({ ...projForm, target_beneficiaries: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  {canSeeFinance && (
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Orçamento previsto (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={projForm.planned_budget}
                        onChange={(e) => setProjForm({ ...projForm, planned_budget: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Descrição</label>
                    <textarea
                      rows={2}
                      value={projForm.description}
                      onChange={(e) => setProjForm({ ...projForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'familias' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Responsável Familiar *</label>
                    <input
                      type="text"
                      required
                      value={famForm.responsible_name}
                      onChange={(e) => setFamForm({ ...famForm, responsible_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Telefone *</label>
                    <input
                      type="text"
                      required
                      value={famForm.responsible_phone}
                      onChange={(e) => setFamForm({ ...famForm, responsible_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">CPF</label>
                    <input
                      type="text"
                      value={famForm.responsible_cpf}
                      onChange={(e) => setFamForm({ ...famForm, responsible_cpf: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Bairro</label>
                    <input
                      type="text"
                      value={famForm.neighborhood}
                      onChange={(e) => setFamForm({ ...famForm, neighborhood: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Endereço completo *</label>
                    <input
                      type="text"
                      required
                      value={famForm.address}
                      onChange={(e) => setFamForm({ ...famForm, address: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Renda familiar (R$)</label>
                    <input
                      type="number"
                      value={famForm.family_income}
                      onChange={(e) => setFamForm({ ...famForm, family_income: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Vulnerabilidade</label>
                    <select
                      value={famForm.vulnerability_level}
                      onChange={(e) => setFamForm({ ...famForm, vulnerability_level: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Baixa">Baixa</option>
                      <option value="Moderada">Moderada</option>
                      <option value="Alta">Alta</option>
                      <option value="Extrema">Extrema</option>
                    </select>
                  </div>
                  <label className="sm:col-span-2 flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      checked={famForm.active}
                      onChange={(e) => setFamForm({ ...famForm, active: e.target.checked })}
                    />
                    Cadastro familiar ativo
                  </label>
                </div>
              )}

              {activeTab === 'alunos' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Nome completo *</label>
                    <input
                      type="text"
                      required
                      value={stuForm.full_name}
                      onChange={(e) => setStuForm({ ...stuForm, full_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Nascimento *</label>
                    <input
                      type="date"
                      required
                      value={stuForm.birth_date}
                      onChange={(e) => setStuForm({ ...stuForm, birth_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Status</label>
                    <select
                      value={stuForm.status}
                      onChange={(e) => setStuForm({ ...stuForm, status: e.target.value as StudentStatus })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="ativo">Ativo</option>
                      <option value="aguardando_vaga">Aguardando vaga</option>
                      <option value="inativo">Inativo</option>
                      <option value="desligado">Desligado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Escola</label>
                    <input
                      type="text"
                      value={stuForm.school_name}
                      onChange={(e) => setStuForm({ ...stuForm, school_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Ano / Turno</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={stuForm.school_year}
                        onChange={(e) => setStuForm({ ...stuForm, school_year: e.target.value })}
                        className="px-3 py-2 border border-slate-300 rounded-lg"
                      />
                      <select
                        value={stuForm.school_shift}
                        onChange={(e) => setStuForm({ ...stuForm, school_shift: e.target.value })}
                        className="px-2 py-2 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Manhã">Manhã</option>
                        <option value="Tarde">Tarde</option>
                        <option value="Integral">Integral</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Responsável *</label>
                    <input
                      type="text"
                      required
                      value={stuForm.guardian_name}
                      onChange={(e) => setStuForm({ ...stuForm, guardian_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Telefone *</label>
                    <input
                      type="text"
                      required
                      value={stuForm.guardian_phone}
                      onChange={(e) => setStuForm({ ...stuForm, guardian_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="font-medium text-slate-700 mb-1.5">Programas participantes:</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {PROGRAMS_LIST.map((prog) => {
                        const checked = stuForm.programs.includes(prog);
                        return (
                          <label key={prog} className="flex items-center gap-2 text-slate-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setStuForm({
                                  ...stuForm,
                                  programs: e.target.checked
                                    ? [...stuForm.programs, prog]
                                    : stuForm.programs.filter((p) => p !== prog),
                                })
                              }
                            />
                            <span>{prog}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'pacientes' && canSeeHealth && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Nome do Paciente *</label>
                    <input
                      type="text"
                      required
                      value={patForm.full_name}
                      onChange={(e) => setPatForm({ ...patForm, full_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Nascimento *</label>
                    <input
                      type="date"
                      required
                      value={patForm.birth_date}
                      onChange={(e) => setPatForm({ ...patForm, birth_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">CPF</label>
                    <input
                      type="text"
                      value={patForm.cpf}
                      onChange={(e) => setPatForm({ ...patForm, cpf: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Responsável *</label>
                    <input
                      type="text"
                      required
                      value={patForm.guardian_name}
                      onChange={(e) => setPatForm({ ...patForm, guardian_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Telefone *</label>
                    <input
                      type="text"
                      required
                      value={patForm.contact_phone}
                      onChange={(e) => setPatForm({ ...patForm, contact_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Especialidade *</label>
                    <input
                      type="text"
                      required
                      value={patForm.specialty}
                      onChange={(e) => setPatForm({ ...patForm, specialty: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Profissional *</label>
                    <input
                      type="text"
                      required
                      value={patForm.responsible_professional}
                      onChange={(e) =>
                        setPatForm({ ...patForm, responsible_professional: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Status</label>
                    <select
                      value={patForm.follow_up_status}
                      onChange={(e) => setPatForm({ ...patForm, follow_up_status: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Em acompanhamento">Em acompanhamento</option>
                      <option value="Aguardando triagem">Aguardando triagem</option>
                      <option value="Encaminhado">Encaminhado</option>
                      <option value="Alta">Alta</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tipo Sanguíneo</label>
                    <input
                      type="text"
                      value={patForm.blood_type}
                      onChange={(e) => setPatForm({ ...patForm, blood_type: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'eventos' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Título do Evento *</label>
                    <input
                      type="text"
                      required
                      value={evtForm.title}
                      onChange={(e) => setEvtForm({ ...evtForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Data *</label>
                    <input
                      type="date"
                      required
                      value={evtForm.event_date}
                      onChange={(e) => setEvtForm({ ...evtForm, event_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Horário *</label>
                    <input
                      type="time"
                      required
                      value={evtForm.event_time}
                      onChange={(e) => setEvtForm({ ...evtForm, event_time: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Local *</label>
                    <input
                      type="text"
                      required
                      value={evtForm.location}
                      onChange={(e) => setEvtForm({ ...evtForm, location: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Projeto</label>
                    <select
                      value={evtForm.project_id}
                      onChange={(e) => setEvtForm({ ...evtForm, project_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Institucional</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Descrição</label>
                    <textarea
                      rows={2}
                      value={evtForm.description}
                      onChange={(e) => setEvtForm({ ...evtForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="py-2 px-4 border border-slate-300 rounded-lg text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white font-medium rounded-lg cursor-pointer"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
