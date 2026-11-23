import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Plus, Search, UserCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatBRL, formatDateBR } from '../lib/format';
import {
  HEALTH_ROLES,
  type Appointment,
  type Family,
  type InstitutionalDocument,
  type Student,
  type StudentEvolution,
  type StudentStatus,
  type UserRole,
} from '../types';

const PROGRAMS_LIST = [
  'Reforço Escolar',
  'Acompanhamento Psicológico',
  'Atendimento Médico',
  'Projeto Esportivo',
  'Oficina de Artes e Leitura Viva',
  'Assistência Familiar',
];

const STATUS_LABELS: Record<StudentStatus, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  aguardando_vaga: 'Aguardando vaga',
  desligado: 'Desligado',
};

interface StudentDetailPayload {
  student: Student;
  evolutions: StudentEvolution[];
  attendance: { id: number; date: string; status: string; justification: string; class_name: string }[];
  documents: InstitutionalDocument[];
  appointments: Appointment[];
}

export function StudentsView({ role }: { role: UserRole }) {
  const [subTab, setSubTab] = useState<'alunos' | 'familias'>('alunos');
  const [students, setStudents] = useState<Student[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [programFilter, setProgramFilter] = useState<string>('todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDetail, setSelectedDetail] = useState<StudentDetailPayload | null>(null);
  const [evoNote, setEvoNote] = useState('');
  const [evoCategory, setEvoCategory] = useState<'Pedagógico' | 'Social' | 'Esportivo' | 'Geral'>('Pedagógico');

  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showFamilyModal, setShowFamilyModal] = useState(false);

  const canWrite = ['admin', 'coordenacao_social', 'professor'].includes(role);
  const canWriteFamily = ['admin', 'coordenacao_social'].includes(role);
  const canSeeHealth = HEALTH_ROLES.includes(role);

  // Student form state
  const [sForm, setSForm] = useState({
    family_id: '',
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
    family_composition: '',
    household_size: '4',
    family_income: '1800',
    working_members: '1',
    vulnerability_situation: '',
    identified_needs: '',
    assistance_history: '',
    social_notes: '',
    programs: ['Reforço Escolar'] as string[],
    status: 'ativo' as StudentStatus,
    entry_date: '2026-11-23',
  });

  // Family form state
  const [fForm, setFForm] = useState({
    responsible_name: '',
    responsible_phone: '',
    responsible_cpf: '',
    address: '',
    neighborhood: '',
    household_size: '4',
    working_members: '1',
    family_income: '1600',
    vulnerability_level: 'Moderada',
    vulnerability_notes: '',
    assistance_history: '',
  });

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [stuRes, famRes] = await Promise.all([
        apiRequest<Student[]>('/api/students'),
        apiRequest<Family[]>('/api/families').catch(() => [] as Family[]),
      ]);
      setStudents(stuRes);
      setFamilies(famRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar alunos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function openProfile(studentId: number) {
    try {
      const detail = await apiRequest<StudentDetailPayload>(`/api/students/${studentId}`);
      setSelectedDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar ficha do aluno.');
    }
  }

  function openNewStudent() {
    setEditingStudent(null);
    setSForm({
      family_id: '',
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
      family_composition: '',
      household_size: '4',
      family_income: '1800',
      working_members: '1',
      vulnerability_situation: '',
      identified_needs: '',
      assistance_history: '',
      social_notes: '',
      programs: ['Reforço Escolar'],
      status: 'ativo',
      entry_date: '2026-11-23',
    });
    setShowStudentModal(true);
  }

  function openEditStudent(st: Student) {
    setEditingStudent(st);
    setSForm({
      family_id: st.family_id ? String(st.family_id) : '',
      full_name: st.full_name,
      birth_date: st.birth_date,
      cpf: st.cpf || '',
      rg: st.rg || '',
      address: st.address,
      school_name: st.school_name,
      school_year: st.school_year,
      school_shift: st.school_shift,
      guardian_name: st.guardian_name,
      guardian_phone: st.guardian_phone,
      family_composition: st.family_composition,
      household_size: String(st.household_size),
      family_income: String(st.family_income),
      working_members: String(st.working_members),
      vulnerability_situation: st.vulnerability_situation,
      identified_needs: st.identified_needs,
      assistance_history: st.assistance_history,
      social_notes: st.social_notes,
      programs: st.programs || [],
      status: st.status,
      entry_date: st.entry_date,
    });
    setShowStudentModal(true);
  }

  async function handleSaveStudent(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        ...sForm,
        family_id: sForm.family_id ? Number(sForm.family_id) : null,
        household_size: Number(sForm.household_size),
        family_income: Number(sForm.family_income),
        working_members: Number(sForm.working_members),
      };
      if (editingStudent) {
        await apiRequest(`/api/students/${editingStudent.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/students', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setShowStudentModal(false);
      await loadAll();
      if (selectedDetail && editingStudent && selectedDetail.student.id === editingStudent.id) {
        await openProfile(editingStudent.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar aluno.');
    }
  }

  async function handleAddEvolution(e: FormEvent) {
    e.preventDefault();
    if (!selectedDetail || !evoNote.trim()) return;
    try {
      await apiRequest(`/api/students/${selectedDetail.student.id}/evolutions`, {
        method: 'POST',
        body: JSON.stringify({
          category: evoCategory,
          note: evoNote.trim(),
          recorded_at: '2026-11-23',
        }),
      });
      setEvoNote('');
      await openProfile(selectedDetail.student.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar evolução.');
    }
  }

  async function handleSaveFamily(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/families', {
        method: 'POST',
        body: JSON.stringify({
          ...fForm,
          household_size: Number(fForm.household_size),
          working_members: Number(fForm.working_members),
          family_income: Number(fForm.family_income),
        }),
      });
      setShowFamilyModal(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar família.');
    }
  }

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.guardian_name.toLowerCase().includes(search.toLowerCase()) ||
      (s.cpf || '').includes(search);
    const matchesStatus = statusFilter === 'todos' || s.status === statusFilter;
    const matchesProgram = programFilter === 'todos' || s.programs.includes(programFilter);
    return matchesSearch && matchesStatus && matchesProgram;
  });

  // Individual Student 360 Page
  if (selectedDetail) {
    const st = selectedDetail.student;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setSelectedDetail(null)}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#0E5A75] hover:underline cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para lista de alunos
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={() => openEditStudent(st)}
              className="py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Editar ficha do aluno
            </button>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900">{st.full_name}</h1>
              <div className="mt-1 text-xs text-slate-500 flex flex-wrap items-center gap-2">
                <span>Nascimento: {formatDateBR(st.birth_date)}</span>
                <span aria-hidden="true">·</span>
                <span>Ingresso: {formatDateBR(st.entry_date)}</span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-[#144A47]">{STATUS_LABELS[st.status]}</span>
                {canSeeHealth && st.linked_patient_id && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" /> Vinculado à Saúde (#{st.linked_patient_id})
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Frequência nas atividades</div>
              <div className="text-2xl font-display font-bold font-mono tabular-nums text-slate-900">
                {st.attendance_rate != null ? `${st.attendance_rate}%` : 'Sem registros'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5 text-xs">
            <div className="space-y-2">
              <h3 className="font-display font-semibold text-slate-900 text-sm">Dados Pessoais e Escolares</h3>
              <p><span className="text-slate-500">CPF:</span> <span className="font-mono">{st.cpf || 'Não informado'}</span></p>
              <p><span className="text-slate-500">RG:</span> <span className="font-mono">{st.rg || 'Não informado'}</span></p>
              <p><span className="text-slate-500">Escola:</span> {st.school_name} ({st.school_year} · {st.school_shift})</p>
              <p><span className="text-slate-500">Endereço:</span> {st.address}</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-display font-semibold text-slate-900 text-sm">Responsável e Núcleo Familiar</h3>
              <p><span className="text-slate-500">Responsável:</span> {st.guardian_name}</p>
              <p><span className="text-slate-500">Telefone:</span> <span className="font-mono">{st.guardian_phone}</span></p>
              <p><span className="text-slate-500">Composição:</span> {st.family_composition || '—'}</p>
              <p><span className="text-slate-500">Moradores / Trabalham:</span> {st.household_size} pessoas · {st.working_members} trabalham</p>
              <p><span className="text-slate-500">Renda familiar:</span> <span className="font-mono">{formatBRL(st.family_income)}</span></p>
            </div>
            <div className="space-y-2">
              <h3 className="font-display font-semibold text-slate-900 text-sm">Quadro Social e Programas</h3>
              <p><span className="text-slate-500">Programas:</span> {st.programs.join(' · ') || 'Nenhum'}</p>
              <p><span className="text-slate-500">Vulnerabilidade:</span> {st.vulnerability_situation || '—'}</p>
              <p><span className="text-slate-500">Necessidades:</span> {st.identified_needs || '—'}</p>
              <p><span className="text-slate-500">Observações:</span> {st.social_notes || '—'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Evolution Timeline */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Registro de Evolução e Acompanhamento
            </h2>
            {canWrite && (
              <form onSubmit={handleAddEvolution} className="space-y-2 pb-4 border-b border-slate-100">
                <div className="flex gap-2">
                  <select
                    value={evoCategory}
                    onChange={(e) => setEvoCategory(e.target.value as typeof evoCategory)}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Pedagógico">Pedagógico</option>
                    <option value="Social">Social</option>
                    <option value="Esportivo">Esportivo</option>
                    <option value="Geral">Geral</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={evoNote}
                    onChange={(e) => setEvoNote(e.target.value)}
                    placeholder="Registrar evolução do aluno..."
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    Registrar
                  </button>
                </div>
              </form>
            )}
            {selectedDetail.evolutions.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum registro de evolução lançado ainda.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {selectedDetail.evolutions.map((ev) => (
                  <li key={ev.id} className="py-3 text-xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                      <span className="font-semibold text-slate-800">{ev.category} · {ev.author_name}</span>
                      <span className="font-mono">{formatDateBR(ev.recorded_at)}</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">{ev.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Attendance, Appointments & Documents */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="font-display text-base font-semibold text-slate-900 mb-3">
                Histórico de Frequência Recente
              </h2>
              {selectedDetail.attendance.length === 0 ? (
                <p className="text-xs text-slate-500">Sem chamadas registradas.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-xs">
                  {selectedDetail.attendance.slice(0, 6).map((a) => (
                    <li key={a.id} className="py-2 flex items-center justify-between">
                      <span>{formatDateBR(a.date)} · {a.class_name}</span>
                      <span
                        className={`font-medium ${
                          a.status === 'presente'
                            ? 'text-emerald-700'
                            : a.status === 'justificada'
                              ? 'text-amber-700'
                              : 'text-red-700'
                        }`}
                      >
                        {a.status === 'presente' ? 'Presente' : a.status === 'justificada' ? 'Justificada' : 'Falta'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="font-display text-base font-semibold text-slate-900 mb-3">
                {canSeeHealth ? 'Atendimentos de Saúde e Documentos' : 'Documentos do Aluno'}
              </h2>
              <div className="space-y-3 text-xs">
                {canSeeHealth && (
                  <div>
                    <div className="font-medium text-slate-700 mb-1">Consultas vinculadas ({selectedDetail.appointments.length})</div>
                    {selectedDetail.appointments.length === 0 ? (
                      <p className="text-slate-400">Nenhuma consulta registrada.</p>
                    ) : (
                      selectedDetail.appointments.slice(0, 4).map((ap) => (
                        <div key={ap.id} className="py-1 flex justify-between text-slate-600">
                          <span>{ap.specialty} · {ap.professional_name}</span>
                          <span className="font-mono">{formatDateBR(ap.scheduled_date)} · {ap.status}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
                <div className={canSeeHealth ? 'pt-2 border-t border-slate-100' : ''}>
                  <div className="font-medium text-slate-700 mb-1">Documentos anexados ({selectedDetail.documents.length})</div>
                  {selectedDetail.documents.length === 0 ? (
                    <p className="text-amber-700">Nenhum termo ou documento anexado.</p>
                  ) : (
                    selectedDetail.documents.map((doc) => (
                      <div key={doc.id} className="py-1 flex justify-between text-slate-600">
                        <span>{doc.title}</span>
                        <span className="text-slate-400">{doc.category}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Alunos, Beneficiários e Famílias
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cadastro integral de crianças, adolescentes, histórico socioeconômico e núcleos familiares.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#EFECE4] border border-[#E5E1D8] rounded-lg">
            <button
              type="button"
              onClick={() => setSubTab('alunos')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                subTab === 'alunos' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
              }`}
            >
              Alunos ({students.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('familias')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                subTab === 'familias' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
              }`}
            >
              Famílias ({families.length})
            </button>
          </div>

          {subTab === 'alunos' && canWrite && (
            <button
              type="button"
              onClick={openNewStudent}
              className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Novo Aluno
            </button>
          )}
          {subTab === 'familias' && canWriteFamily && (
            <button
              type="button"
              onClick={() => setShowFamilyModal(true)}
              className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nova Família
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
      )}

      {subTab === 'alunos' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome do aluno, responsável ou CPF..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="todos">Todos os status</option>
              <option value="ativo">Ativo</option>
              <option value="aguardando_vaga">Aguardando vaga</option>
              <option value="inativo">Inativo</option>
              <option value="desligado">Desligado</option>
            </select>
            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="todos">Todos os programas</option>
              {PROGRAMS_LIST.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                  <th className="py-3 px-4">Aluno / Beneficiário</th>
                  <th className="py-3 px-4">Nascimento</th>
                  <th className="py-3 px-4">Responsável</th>
                  <th className="py-3 px-4">Programas</th>
                  <th className="py-3 px-4 text-right">Frequência</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Carregando registros...
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Nenhum aluno encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{st.full_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {st.school_name} · {st.school_year}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                        {formatDateBR(st.birth_date)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800">{st.guardian_name}</div>
                        <div className="text-[11px] font-mono text-slate-500">{st.guardian_phone}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs">
                        {st.programs.join(' · ') || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                        {st.attendance_rate != null ? `${st.attendance_rate}%` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-medium ${
                            st.status === 'ativo'
                              ? 'text-emerald-700'
                              : st.status === 'aguardando_vaga'
                                ? 'text-amber-700'
                                : 'text-slate-500'
                          }`}
                        >
                          {STATUS_LABELS[st.status]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openProfile(st.id)}
                          className="text-[#0E5A75] hover:underline font-medium cursor-pointer"
                        >
                          Ver ficha completa
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                <th className="py-3 px-4">Responsável Familiar</th>
                <th className="py-3 px-4">Bairro / Endereço</th>
                <th className="py-3 px-4 text-right">Moradores</th>
                <th className="py-3 px-4 text-right">Renda Familiar</th>
                <th className="py-3 px-4">Vulnerabilidade</th>
                <th className="py-3 px-4 text-right">Crianças Vinculadas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {families.map((fam) => (
                <tr key={fam.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{fam.responsible_name}</div>
                    <div className="text-[11px] font-mono text-slate-500">{fam.responsible_phone}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {fam.neighborhood} · {fam.address}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {fam.household_size} ({fam.working_members} trab.)
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatBRL(fam.family_income)}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`font-medium ${
                        fam.vulnerability_level === 'Extrema' || fam.vulnerability_level === 'Alta'
                          ? 'text-red-700'
                          : fam.vulnerability_level === 'Moderada'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                      }`}
                    >
                      {fam.vulnerability_level}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {fam.student_count ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal New/Edit Student */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">
                {editingStudent ? 'Editar Cadastro do Aluno' : 'Cadastrar Novo Aluno / Beneficiário'}
              </h2>
              <button
                type="button"
                onClick={() => setShowStudentModal(false)}
                className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nome completo *</label>
                  <input
                    type="text"
                    required
                    value={sForm.full_name}
                    onChange={(e) => setSForm({ ...sForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Data de nascimento *</label>
                  <input
                    type="date"
                    required
                    value={sForm.birth_date}
                    onChange={(e) => setSForm({ ...sForm, birth_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">CPF (quando disponível)</label>
                  <input
                    type="text"
                    value={sForm.cpf}
                    onChange={(e) => setSForm({ ...sForm, cpf: e.target.value })}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">RG (quando disponível)</label>
                  <input
                    type="text"
                    value={sForm.rg}
                    onChange={(e) => setSForm({ ...sForm, rg: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Endereço completo *</label>
                  <input
                    type="text"
                    required
                    value={sForm.address}
                    onChange={(e) => setSForm({ ...sForm, address: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Escola onde estuda</label>
                  <input
                    type="text"
                    value={sForm.school_name}
                    onChange={(e) => setSForm({ ...sForm, school_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Ano escolar</label>
                    <input
                      type="text"
                      value={sForm.school_year}
                      onChange={(e) => setSForm({ ...sForm, school_year: e.target.value })}
                      placeholder="Ex.: 5º Ano"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Turno</label>
                    <select
                      value={sForm.school_shift}
                      onChange={(e) => setSForm({ ...sForm, school_shift: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Manhã">Manhã</option>
                      <option value="Tarde">Tarde</option>
                      <option value="Integral">Integral</option>
                      <option value="Noite">Noite</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nome do responsável *</label>
                  <input
                    type="text"
                    required
                    value={sForm.guardian_name}
                    onChange={(e) => setSForm({ ...sForm, guardian_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Telefone do responsável *</label>
                  <input
                    type="text"
                    required
                    value={sForm.guardian_phone}
                    onChange={(e) => setSForm({ ...sForm, guardian_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Família vinculada</label>
                  <select
                    value={sForm.family_id}
                    onChange={(e) => setSForm({ ...sForm, family_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Sem vínculo / Avulso</option>
                    {families.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.responsible_name} ({f.neighborhood})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={sForm.status}
                    onChange={(e) => setSForm({ ...sForm, status: e.target.value as StudentStatus })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="aguardando_vaga">Aguardando vaga</option>
                    <option value="inativo">Inativo</option>
                    <option value="desligado">Desligado</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Pessoas na residência</label>
                  <input
                    type="number"
                    min={1}
                    value={sForm.household_size}
                    onChange={(e) => setSForm({ ...sForm, household_size: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Renda familiar (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={sForm.family_income}
                    onChange={(e) => setSForm({ ...sForm, family_income: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1.5">Programas participantes</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PROGRAMS_LIST.map((prog) => {
                      const checked = sForm.programs.includes(prog);
                      return (
                        <label key={prog} className="flex items-center gap-2 text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSForm({
                                ...sForm,
                                programs: checked
                                  ? sForm.programs.filter((p) => p !== prog)
                                  : [...sForm.programs, prog],
                              });
                            }}
                          />
                          <span>{prog}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Situação de vulnerabilidade e necessidades</label>
                  <textarea
                    rows={2}
                    value={sForm.vulnerability_situation}
                    onChange={(e) => setSForm({ ...sForm, vulnerability_situation: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowStudentModal(false)}
                  className="py-2 px-4 border border-slate-300 rounded-lg text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white font-medium rounded-lg cursor-pointer"
                >
                  Salvar Cadastro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal New Family */}
      {showFamilyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">Cadastrar Família Assistida</h2>
              <button
                type="button"
                onClick={() => setShowFamilyModal(false)}
                className="text-xs text-slate-500 cursor-pointer"
              >
                Fechar
              </button>
            </div>
            <form onSubmit={handleSaveFamily} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Responsável familiar *</label>
                  <input
                    type="text"
                    required
                    value={fForm.responsible_name}
                    onChange={(e) => setFForm({ ...fForm, responsible_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Telefone *</label>
                  <input
                    type="text"
                    required
                    value={fForm.responsible_phone}
                    onChange={(e) => setFForm({ ...fForm, responsible_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">CPF</label>
                  <input
                    type="text"
                    value={fForm.responsible_cpf}
                    onChange={(e) => setFForm({ ...fForm, responsible_cpf: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Bairro *</label>
                  <input
                    type="text"
                    required
                    value={fForm.neighborhood}
                    onChange={(e) => setFForm({ ...fForm, neighborhood: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Endereço completo *</label>
                  <input
                    type="text"
                    required
                    value={fForm.address}
                    onChange={(e) => setFForm({ ...fForm, address: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Renda familiar (R$)</label>
                  <input
                    type="number"
                    value={fForm.family_income}
                    onChange={(e) => setFForm({ ...fForm, family_income: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nível de vulnerabilidade</label>
                  <select
                    value={fForm.vulnerability_level}
                    onChange={(e) => setFForm({ ...fForm, vulnerability_level: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Baixa">Baixa</option>
                    <option value="Moderada">Moderada</option>
                    <option value="Alta">Alta</option>
                    <option value="Extrema">Extrema</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFamilyModal(false)}
                  className="py-2 px-4 border border-slate-300 rounded-lg text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white font-medium rounded-lg cursor-pointer"
                >
                  Salvar Família
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
