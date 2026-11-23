import { useEffect, useState, type FormEvent } from 'react';
import { FileCheck2, FileText, Printer, RotateCcw } from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  formatBRL,
  formatDateBR,
  generateInstitutionalDocumentPDF,
  type InstitutionalDocumentPDFInput,
} from '../lib/format';
import {
  FINANCE_ROLES,
  HEALTH_ROLES,
  type Donor,
  type Patient,
  type Project,
  type Student,
  type UserRole,
  type Volunteer,
} from '../types';
import { BrandLogo, BrandStrip } from './BrandLogo';

type TemplateKey =
  | 'estagio_voluntario'
  | 'declaracao_aluno'
  | 'declaracao_saude'
  | 'recibo_doacao'
  | 'oficio_geral';

interface TemplateOption {
  id: TemplateKey;
  label: string;
  description: string;
  restricted?: 'finance' | 'health';
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'estagio_voluntario',
    label: 'Relatório de Estágio / Voluntariado',
    description: 'Para apresentação em escolas, faculdades e horas complementares.',
  },
  {
    id: 'declaracao_aluno',
    label: 'Declaração de Participação (Aluno)',
    description: 'Comprova matrícula e frequência nas oficinas e reforço escolar.',
  },
  {
    id: 'declaracao_saude',
    label: 'Declaração de Comparecimento (Saúde)',
    description: 'Atestado de atendimento psicológico ou médico para escola/trabalho.',
    restricted: 'health',
  },
  {
    id: 'recibo_doacao',
    label: 'Comprovante de Doação',
    description: 'Recibo institucional nominal para apoiadores e mantenedores.',
    restricted: 'finance',
  },
  {
    id: 'oficio_geral',
    label: 'Ofício / Declaração Personalizada',
    description: 'Modelo livre com timbre e assinatura institucional do Instituto SER.',
  },
];

export function DocumentGeneratorView({ role }: { role: UserRole }) {
  const canSeeFinance = FINANCE_ROLES.includes(role);
  const canSeeHealth = HEALTH_ROLES.includes(role);

  const availableTemplates = TEMPLATES.filter((t) => {
    if (t.restricted === 'finance' && !canSeeFinance) return false;
    if (t.restricted === 'health' && !canSeeHealth) return false;
    return true;
  });

  const [template, setTemplate] = useState<TemplateKey>('estagio_voluntario');
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Form state for Internship / Volunteer Report
  const [internForm, setInternForm] = useState({
    selectedVolunteerId: '',
    fullName: '',
    document: '',
    rg: '',
    institution: '',
    course: '',
    registrationNumber: '',
    area: 'Pedagogia e Reforço Escolar',
    projectName: 'Reforço Escolar Caminho do Saber',
    startDate: '2026-08-01',
    endDate: '2026-11-23',
    weeklyHours: '12',
    totalHours: '160',
    activities:
      'Apoio pedagógico no contraturno escolar, acompanhamento de leitura e matemática básica para crianças de 6 a 14 anos, preparação de materiais lúdicos e auxílio nas rotinas educativas sob supervisão técnica.',
    evaluation:
      'O(A) estagiário(a)/voluntário(a) demonstrou comprometimento, pontualidade, postura ética, empatia com as crianças e excelente integração com a equipe multidisciplinar do Instituto SER.',
    supervisorName: 'Camila Rodrigues Martins',
    supervisorRole: 'Coordenadora Pedagógica — Instituto SER',
    city: 'São Paulo/SP',
    issueDate: '2026-11-23',
  });

  // Form state for Student Participation Declaration
  const [studentForm, setStudentForm] = useState({
    selectedStudentId: '',
    studentName: '',
    birthDate: '',
    guardianName: '',
    schoolName: '',
    schoolYear: '',
    programs: 'Reforço Escolar',
    entryDate: '2026-02-10',
    attendanceRate: '94',
    shift: 'Contraturno Escolar',
    purpose: 'Comprovação de participação em atividades socioeducativas junto à escola ou órgão solicitante.',
    signerName: 'Fernanda Costa Lima',
    signerRole: 'Coordenação Social — Instituto SER',
    city: 'São Paulo/SP',
    issueDate: '2026-11-23',
  });

  // Form state for Health Attendance Certificate
  const [healthForm, setHealthForm] = useState({
    selectedPatientId: '',
    patientName: '',
    guardianName: '',
    serviceDate: '2026-11-23',
    startTime: '09:00',
    endTime: '10:00',
    specialty: 'Psicologia',
    professionalName: 'Dra. Beatriz Alencar',
    professionalRegistry: 'CRP 06/142890',
    notes: 'Compareceu ao atendimento clínico agendado no Instituto SER, acompanhado(a) de seu responsável legal.',
    city: 'São Paulo/SP',
    issueDate: '2026-11-23',
  });

  // Form state for Donation Receipt
  const [donorForm, setDonorForm] = useState({
    selectedDonorId: '',
    donorName: '',
    document: '',
    amount: '1500.00',
    donationDate: '2026-11-23',
    paymentMethod: 'PIX / Transferência Bancária',
    projectName: 'Fundo Institucional Geral',
    notes: 'Recurso integralmente destinado às ações de desenvolvimento infantil e assistência às famílias acompanhadas pelo Instituto SER.',
    signerName: 'Diretoria Financeira',
    signerRole: 'Departamento Financeiro — Instituto SER',
    city: 'São Paulo/SP',
    issueDate: '2026-11-23',
  });

  // Form state for Custom Official Document
  const [customForm, setCustomForm] = useState({
    title: 'Declaração Institucional',
    recipient: 'A quem possa interessar',
    body: 'Declaramos, para os devidos fins, que o Instituto SER desenvolve ações contínuas de reforço escolar, apoio psicológico, acesso à saúde, esporte e assistência familiar para crianças e adolescentes em situação de vulnerabilidade social.',
    signerName: 'Diretoria Executiva',
    signerRole: 'Instituto SER — Gestão Integrada',
    city: 'São Paulo/SP',
    issueDate: '2026-11-23',
  });

  useEffect(() => {
    apiRequest<Volunteer[]>('/api/volunteers').then(setVolunteers).catch(() => {});
    apiRequest<Student[]>('/api/students').then(setStudents).catch(() => {});
    apiRequest<Project[]>('/api/projects').then(setProjects).catch(() => {});
    if (canSeeHealth) {
      apiRequest<Patient[]>('/api/patients').then(setPatients).catch(() => {});
    }
    if (canSeeFinance) {
      apiRequest<Donor[]>('/api/donors').then(setDonors).catch(() => {});
    }
  }, [canSeeFinance, canSeeHealth]);

  function handleSelectVolunteer(volId: string) {
    if (!volId) {
      setInternForm((f) => ({ ...f, selectedVolunteerId: '' }));
      return;
    }
    const vol = volunteers.find((v) => v.id === Number(volId));
    if (!vol) return;
    setInternForm((f) => ({
      ...f,
      selectedVolunteerId: volId,
      fullName: vol.full_name,
      document: vol.cpf,
      area: vol.area,
      projectName: vol.project_name || 'Apoio Institucional Geral',
      startDate: vol.entry_date || f.startDate,
      totalHours: vol.total_hours && vol.total_hours > 0 ? String(vol.total_hours) : f.totalHours,
    }));
  }

  function handleSelectStudent(stuId: string) {
    if (!stuId) {
      setStudentForm((f) => ({ ...f, selectedStudentId: '' }));
      return;
    }
    const stu = students.find((s) => s.id === Number(stuId));
    if (!stu) return;
    setStudentForm((f) => ({
      ...f,
      selectedStudentId: stuId,
      studentName: stu.full_name,
      birthDate: stu.birth_date,
      guardianName: stu.guardian_name,
      schoolName: stu.school_name,
      schoolYear: stu.school_year,
      programs: stu.programs.join(', ') || 'Reforço Escolar',
      entryDate: stu.entry_date,
      attendanceRate: stu.attendance_rate != null ? String(stu.attendance_rate) : '90',
    }));
  }

  function handleSelectPatient(patId: string) {
    if (!patId) {
      setHealthForm((f) => ({ ...f, selectedPatientId: '' }));
      return;
    }
    const pat = patients.find((p) => p.id === Number(patId));
    if (!pat) return;
    setHealthForm((f) => ({
      ...f,
      selectedPatientId: patId,
      patientName: pat.full_name,
      guardianName: pat.guardian_name,
      specialty: pat.specialty,
      professionalName: pat.responsible_professional,
    }));
  }

  function handleSelectDonor(donId: string) {
    if (!donId) {
      setDonorForm((f) => ({ ...f, selectedDonorId: '' }));
      return;
    }
    const don = donors.find((d) => d.id === Number(donId));
    if (!don) return;
    setDonorForm((f) => ({
      ...f,
      selectedDonorId: donId,
      donorName: don.name,
      document: don.document,
      projectName: don.supported_projects?.join(', ') || 'Fundo Institucional Geral',
    }));
  }

  function buildPDFPayload(): InstitutionalDocumentPDFInput {
    switch (template) {
      case 'estagio_voluntario': {
        const periodLabel = `${formatDateBR(internForm.startDate)} a ${formatDateBR(internForm.endDate)}`;
        return {
          docTitle: 'Relatório e Declaração de Estágio / Voluntariado',
          docCategory: 'Documento Oficial para Instituição de Ensino',
          cityAndDate: `${internForm.city}, ${formatDateBR(internForm.issueDate)}`,
          fields: [
            { label: 'Estagiário / Voluntário', value: internForm.fullName || 'Não informado' },
            { label: 'CPF / RG', value: [internForm.document, internForm.rg].filter(Boolean).join(' · ') },
            { label: 'Instituição de Ensino', value: internForm.institution || 'Não informada' },
            {
              label: 'Curso / Matrícula',
              value: [internForm.course, internForm.registrationNumber ? `RA ${internForm.registrationNumber}` : '']
                .filter(Boolean)
                .join(' · '),
            },
            { label: 'Projeto / Área de Atuação', value: `${internForm.projectName} — ${internForm.area}` },
            { label: 'Período Realizado', value: periodLabel },
            {
              label: 'Carga Horária Cumprida',
              value: `${internForm.totalHours} horas totais (${internForm.weeklyHours}h semanais)`,
            },
          ],
          paragraphs: [
            `Declaramos para os devidos fins acadêmicos e escolares, especialmente para apresentação junto à instituição ${internForm.institution || 'de ensino'}, que ${internForm.fullName || 'o(a) estudante'} cumpriu atividades de estágio e voluntariado social no Instituto SER no período de ${periodLabel}, totalizando ${internForm.totalHours} horas efetivas de dedicação.`,
            `Atividades desenvolvidas: ${internForm.activities}`,
            `Parecer da supervisão: ${internForm.evaluation}`,
          ],
          signerLeftTitle: internForm.supervisorName,
          signerLeftSub: internForm.supervisorRole,
          signerRightTitle: internForm.fullName || 'Estagiário / Voluntário',
          signerRightSub: internForm.institution || 'Estudante / Voluntário',
          filename: `relatorio-estagio-${(internForm.fullName || 'voluntario').toLowerCase().replace(/\s+/g, '-')}.pdf`,
        };
      }

      case 'declaracao_aluno':
        return {
          docTitle: 'Declaração de Participação e Frequência Escolar',
          docCategory: 'Coordenação Pedagógica e Social',
          cityAndDate: `${studentForm.city}, ${formatDateBR(studentForm.issueDate)}`,
          fields: [
            { label: 'Nome do Aluno', value: studentForm.studentName || 'Não informado' },
            { label: 'Data de Nascimento', value: studentForm.birthDate ? formatDateBR(studentForm.birthDate) : '' },
            { label: 'Responsável Legal', value: studentForm.guardianName },
            { label: 'Escola Regular', value: `${studentForm.schoolName} (${studentForm.schoolYear})` },
            { label: 'Programas no Instituto SER', value: studentForm.programs },
            { label: 'Data de Ingresso / Frequência', value: `${formatDateBR(studentForm.entryDate)} · Frequência: ${studentForm.attendanceRate}%` },
          ],
          paragraphs: [
            `Declaramos que o(a) aluno(a) ${studentForm.studentName || '—'}, sob responsabilidade legal de ${studentForm.guardianName || '—'}, encontra-se regularmente matriculado(a) e frequentando as atividades do Instituto SER em regime de ${studentForm.shift}, participando dos programas: ${studentForm.programs}.`,
            studentForm.purpose,
          ],
          signerLeftTitle: studentForm.signerName,
          signerLeftSub: studentForm.signerRole,
          filename: `declaracao-aluno-${(studentForm.studentName || 'aluno').toLowerCase().replace(/\s+/g, '-')}.pdf`,
        };

      case 'declaracao_saude':
        return {
          docTitle: 'Declaração de Comparecimento em Atendimento de Saúde',
          docCategory: 'Núcleo de Psicologia e Saúde — Instituto SER',
          cityAndDate: `${healthForm.city}, ${formatDateBR(healthForm.issueDate)}`,
          fields: [
            { label: 'Paciente', value: healthForm.patientName || 'Não informado' },
            { label: 'Responsável Legal', value: healthForm.guardianName },
            { label: 'Data e Horário', value: `${formatDateBR(healthForm.serviceDate)} · das ${healthForm.startTime} às ${healthForm.endTime}` },
            { label: 'Especialidade', value: healthForm.specialty },
            { label: 'Profissional Responsável', value: `${healthForm.professionalName} (${healthForm.professionalRegistry})` },
          ],
          paragraphs: [
            `Atestamos para os devidos fins que o(a) paciente ${healthForm.patientName || '—'} compareceu ao atendimento de ${healthForm.specialty} no Instituto SER na data de ${formatDateBR(healthForm.serviceDate)}, no período das ${healthForm.startTime} às ${healthForm.endTime}.`,
            healthForm.notes,
          ],
          signerLeftTitle: healthForm.professionalName,
          signerLeftSub: `${healthForm.specialty} · ${healthForm.professionalRegistry}`,
          filename: `comparecimento-${(healthForm.patientName || 'paciente').toLowerCase().replace(/\s+/g, '-')}.pdf`,
        };

      case 'recibo_doacao': {
        const val = Number(donorForm.amount) || 0;
        return {
          docTitle: 'Recibo e Declaração de Doação Institucional',
          docCategory: 'Departamento Financeiro — Prestação de Contas',
          cityAndDate: `${donorForm.city}, ${formatDateBR(donorForm.issueDate)}`,
          fields: [
            { label: 'Doador / Apoiador', value: donorForm.donorName || 'Não informado' },
            { label: 'CPF / CNPJ', value: donorForm.document },
            { label: 'Valor da Contribuição', value: formatBRL(val) },
            { label: 'Data do Recebimento', value: formatDateBR(donorForm.donationDate) },
            { label: 'Forma de Recebimento', value: donorForm.paymentMethod },
            { label: 'Destinação / Projeto', value: donorForm.projectName },
          ],
          paragraphs: [
            `O Instituto SER declara haver recebido de ${donorForm.donorName || '—'} (CPF/CNPJ: ${donorForm.document || '—'}) a importância de ${formatBRL(val)} em ${formatDateBR(donorForm.donationDate)}, via ${donorForm.paymentMethod}, destinada ao projeto ${donorForm.projectName}.`,
            donorForm.notes,
          ],
          signerLeftTitle: donorForm.signerName,
          signerLeftSub: donorForm.signerRole,
          filename: `recibo-doacao-${(donorForm.donorName || 'doador').toLowerCase().replace(/\s+/g, '-')}.pdf`,
        };
      }

      case 'oficio_geral':
      default:
        return {
          docTitle: customForm.title || 'Declaração Institucional',
          docCategory: 'Secretaria e Governança Institucional',
          cityAndDate: `${customForm.city}, ${formatDateBR(customForm.issueDate)}`,
          fields: customForm.recipient
            ? [{ label: 'Destinatário / Referência', value: customForm.recipient }]
            : [],
          paragraphs: customForm.body.split('\n').filter((l) => l.trim().length > 0),
          signerLeftTitle: customForm.signerName,
          signerLeftSub: customForm.signerRole,
          filename: `documento-instituto-ser-${customForm.issueDate}.pdf`,
        };
    }
  }

  const previewPayload = buildPDFPayload();

  async function handleGeneratePDF(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const payload = buildPDFPayload();
    generateInstitutionalDocumentPDF(payload);
    await apiRequest('/api/audit-export', {
      method: 'POST',
      body: JSON.stringify({
        reportName: `${payload.docTitle} (${payload.fields[0]?.value || 'Institucional'})`,
        format: 'PDF',
      }),
    }).catch(() => {});
    setFeedback(`PDF "${payload.filename}" gerado e baixado com sucesso.`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Gerador de Documentos em PDF
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Preencha os dados solicitados (ou selecione um cadastro existente) para gerar declarações, relatórios de estágio e recibos em PDF prontos para impressão.
        </p>
      </div>

      {/* Template Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {availableTemplates.map((t) => {
          const active = template === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTemplate(t.id);
                setFeedback(null);
              }}
              className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                active
                  ? 'bg-[#144A47] text-white border-[#144A47]'
                  : 'bg-white text-[#182424] border-[#E5E1D8] hover:border-[#144A47]/40'
              }`}
            >
              <div className="flex items-center gap-2 font-display font-semibold text-sm">
                <FileText className={`w-4 h-4 shrink-0 ${active ? 'text-[#EBB428]' : 'text-[#144A47]'}`} />
                <span>{t.label}</span>
              </div>
              <p className={`text-xs mt-1 leading-relaxed ${active ? 'text-white/85' : 'text-[#556262]'}`}>
                {t.description}
              </p>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <FileCheck2 className="w-4 h-4 shrink-0" />
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Data Entry Form */}
        <form
          onSubmit={handleGeneratePDF}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-xs"
        >
          {template === 'estagio_voluntario' && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Dados para Relatório de Estágio / Voluntariado
                  </h2>
                  <p className="text-slate-500">
                    Digite os dados diretamente ou importe de um voluntário já cadastrado.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setInternForm({
                      ...internForm,
                      selectedVolunteerId: '',
                      fullName: '',
                      document: '',
                      rg: '',
                      institution: '',
                      course: '',
                      registrationNumber: '',
                    })
                  }
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Limpar dados
                </button>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Importar de voluntário cadastrado (opcional)
                </label>
                <select
                  value={internForm.selectedVolunteerId}
                  onChange={(e) => handleSelectVolunteer(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Preencher manualmente...</option>
                  {volunteers.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.full_name} ({v.area} · {(v.total_hours ?? 0).toFixed(1)}h registradas)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    Nome completo do voluntário / estagiário *
                  </label>
                  <input
                    type="text"
                    required
                    value={internForm.fullName}
                    onChange={(e) => setInternForm({ ...internForm, fullName: e.target.value })}
                    placeholder="Ex.: Mariana Ferreira Souza"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">CPF</label>
                  <input
                    type="text"
                    value={internForm.document}
                    onChange={(e) => setInternForm({ ...internForm, document: e.target.value })}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">RG</label>
                  <input
                    type="text"
                    value={internForm.rg}
                    onChange={(e) => setInternForm({ ...internForm, rg: e.target.value })}
                    placeholder="00.000.000-0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    Escola / Faculdade / Instituição de Ensino *
                  </label>
                  <input
                    type="text"
                    required
                    value={internForm.institution}
                    onChange={(e) => setInternForm({ ...internForm, institution: e.target.value })}
                    placeholder="Ex.: Universidade de São Paulo (USP) ou ETEC..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Curso / Série</label>
                  <input
                    type="text"
                    value={internForm.course}
                    onChange={(e) => setInternForm({ ...internForm, course: e.target.value })}
                    placeholder="Ex.: Pedagogia — 5º semestre"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Matrícula / RA</label>
                  <input
                    type="text"
                    value={internForm.registrationNumber}
                    onChange={(e) => setInternForm({ ...internForm, registrationNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Projeto no Instituto SER</label>
                  <input
                    type="text"
                    list="projetos-ser"
                    value={internForm.projectName}
                    onChange={(e) => setInternForm({ ...internForm, projectName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                  <datalist id="projetos-ser">
                    {projects.map((p) => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Área de atuação</label>
                  <input
                    type="text"
                    value={internForm.area}
                    onChange={(e) => setInternForm({ ...internForm, area: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Data de início *</label>
                  <input
                    type="date"
                    required
                    value={internForm.startDate}
                    onChange={(e) => setInternForm({ ...internForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Data de término *</label>
                  <input
                    type="date"
                    required
                    value={internForm.endDate}
                    onChange={(e) => setInternForm({ ...internForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Carga horária semanal (h)</label>
                  <input
                    type="number"
                    min={1}
                    value={internForm.weeklyHours}
                    onChange={(e) => setInternForm({ ...internForm, weeklyHours: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Carga horária total cumprida (h) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    step="0.5"
                    value={internForm.totalHours}
                    onChange={(e) => setInternForm({ ...internForm, totalHours: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Atividades realizadas *</label>
                  <textarea
                    rows={3}
                    required
                    value={internForm.activities}
                    onChange={(e) => setInternForm({ ...internForm, activities: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Avaliação / Parecer do supervisor</label>
                  <textarea
                    rows={2}
                    value={internForm.evaluation}
                    onChange={(e) => setInternForm({ ...internForm, evaluation: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nome do supervisor</label>
                  <input
                    type="text"
                    value={internForm.supervisorName}
                    onChange={(e) => setInternForm({ ...internForm, supervisorName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Cargo / Registro</label>
                  <input
                    type="text"
                    value={internForm.supervisorRole}
                    onChange={(e) => setInternForm({ ...internForm, supervisorRole: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </>
          )}

          {template === 'declaracao_aluno' && (
            <>
              <h2 className="font-display text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
                Declaração de Participação e Frequência do Aluno
              </h2>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Importar de aluno cadastrado (opcional)
                </label>
                <select
                  value={studentForm.selectedStudentId}
                  onChange={(e) => handleSelectStudent(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Preencher manualmente...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.school_name})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Nome completo do aluno *</label>
                  <input
                    type="text"
                    required
                    value={studentForm.studentName}
                    onChange={(e) => setStudentForm({ ...studentForm, studentName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Data de nascimento</label>
                  <input
                    type="date"
                    value={studentForm.birthDate}
                    onChange={(e) => setStudentForm({ ...studentForm, birthDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Responsável legal *</label>
                  <input
                    type="text"
                    required
                    value={studentForm.guardianName}
                    onChange={(e) => setStudentForm({ ...studentForm, guardianName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Escola regular</label>
                  <input
                    type="text"
                    value={studentForm.schoolName}
                    onChange={(e) => setStudentForm({ ...studentForm, schoolName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Frequência apurada (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={studentForm.attendanceRate}
                    onChange={(e) => setStudentForm({ ...studentForm, attendanceRate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Programas participantes</label>
                  <input
                    type="text"
                    value={studentForm.programs}
                    onChange={(e) => setStudentForm({ ...studentForm, programs: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Finalidade / Observação</label>
                  <textarea
                    rows={2}
                    value={studentForm.purpose}
                    onChange={(e) => setStudentForm({ ...studentForm, purpose: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </>
          )}

          {template === 'declaracao_saude' && canSeeHealth && (
            <>
              <h2 className="font-display text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
                Declaração de Comparecimento — Saúde (Acesso Restrito)
              </h2>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Importar de paciente cadastrado (opcional)
                </label>
                <select
                  value={healthForm.selectedPatientId}
                  onChange={(e) => handleSelectPatient(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Preencher manualmente...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.specialty})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Nome do paciente *</label>
                  <input
                    type="text"
                    required
                    value={healthForm.patientName}
                    onChange={(e) => setHealthForm({ ...healthForm, patientName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Responsável legal</label>
                  <input
                    type="text"
                    value={healthForm.guardianName}
                    onChange={(e) => setHealthForm({ ...healthForm, guardianName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Data do atendimento</label>
                  <input
                    type="date"
                    value={healthForm.serviceDate}
                    onChange={(e) => setHealthForm({ ...healthForm, serviceDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Horário inicial</label>
                  <input
                    type="time"
                    value={healthForm.startTime}
                    onChange={(e) => setHealthForm({ ...healthForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Horário final</label>
                  <input
                    type="time"
                    value={healthForm.endTime}
                    onChange={(e) => setHealthForm({ ...healthForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Profissional *</label>
                  <input
                    type="text"
                    required
                    value={healthForm.professionalName}
                    onChange={(e) => setHealthForm({ ...healthForm, professionalName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">CRP / CRM</label>
                  <input
                    type="text"
                    value={healthForm.professionalRegistry}
                    onChange={(e) => setHealthForm({ ...healthForm, professionalRegistry: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
            </>
          )}

          {template === 'recibo_doacao' && canSeeFinance && (
            <>
              <h2 className="font-display text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
                Comprovante de Doação — Financeiro
              </h2>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Importar de doador cadastrado (opcional)
                </label>
                <select
                  value={donorForm.selectedDonorId}
                  onChange={(e) => handleSelectDonor(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Preencher manualmente...</option>
                  {donors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.document})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Nome / Razão Social do doador *</label>
                  <input
                    type="text"
                    required
                    value={donorForm.donorName}
                    onChange={(e) => setDonorForm({ ...donorForm, donorName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">CPF / CNPJ</label>
                  <input
                    type="text"
                    value={donorForm.document}
                    onChange={(e) => setDonorForm({ ...donorForm, document: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Valor doado (R$) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={donorForm.amount}
                    onChange={(e) => setDonorForm({ ...donorForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Data do recebimento</label>
                  <input
                    type="date"
                    value={donorForm.donationDate}
                    onChange={(e) => setDonorForm({ ...donorForm, donationDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Projeto / Destinação</label>
                  <input
                    type="text"
                    value={donorForm.projectName}
                    onChange={(e) => setDonorForm({ ...donorForm, projectName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </>
          )}

          {template === 'oficio_geral' && (
            <>
              <h2 className="font-display text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
                Ofício ou Declaração Institucional Personalizada
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Título do documento *</label>
                  <input
                    type="text"
                    required
                    value={customForm.title}
                    onChange={(e) => setCustomForm({ ...customForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Destinatário / Referência</label>
                  <input
                    type="text"
                    value={customForm.recipient}
                    onChange={(e) => setCustomForm({ ...customForm, recipient: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Texto do documento *</label>
                  <textarea
                    rows={5}
                    required
                    value={customForm.body}
                    onChange={(e) => setCustomForm({ ...customForm, body: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Nome do signatário</label>
                    <input
                      type="text"
                      value={customForm.signerName}
                      onChange={(e) => setCustomForm({ ...customForm, signerName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Cargo / Função</label>
                    <input
                      type="text"
                      value={customForm.signerRole}
                      onChange={(e) => setCustomForm({ ...customForm, signerRole: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="pt-3 border-t border-[#E5E1D8] flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 py-2.5 px-5 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Gerar Documento em PDF
            </button>
          </div>
        </form>

        {/* Right: Live A4 Preview */}
        <div className="lg:col-span-5 bg-white border border-[#E5E1D8] rounded-xl overflow-hidden shadow-xs">
          <div className="bg-[#144A47] text-white px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#F7F5F0] flex items-center justify-center p-1 shrink-0">
              <BrandLogo className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-sm leading-tight">INSTITUTO SER — GESTÃO INTEGRADA</div>
              <div className="text-[11px] text-[#EBB428] mt-0.5">Vida em movimento. Propósito em ação.</div>
              <div className="text-[10px] text-white/80 uppercase tracking-wider mt-0.5">{previewPayload.docCategory}</div>
            </div>
          </div>
          <BrandStrip className="h-[3px]" />

          <div className="p-5 space-y-4 text-xs">
            <div className="text-center font-display font-bold text-slate-900 text-sm uppercase">
              {previewPayload.docTitle}
            </div>

            {previewPayload.fields.some((f) => f.value.trim()) && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-[11px]">
                  <tbody>
                    {previewPayload.fields
                      .filter((f) => f.value.trim())
                      .map((f) => (
                        <tr key={f.label} className="border-b border-slate-100 last:border-b-0">
                          <td className="py-1.5 px-3 bg-slate-50 font-semibold text-slate-600 w-40">
                            {f.label}
                          </td>
                          <td className="py-1.5 px-3 text-slate-900">{f.value}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-2.5 text-slate-700 leading-relaxed">
              {previewPayload.paragraphs.map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>

            <div className="pt-2 text-slate-600 font-medium">{previewPayload.cityAndDate}</div>

            <div className="pt-6 grid grid-cols-2 gap-4 text-[11px]">
              <div className="border-t border-slate-400 pt-1.5">
                <div className="font-semibold text-slate-900 truncate">{previewPayload.signerLeftTitle}</div>
                <div className="text-slate-500 truncate">{previewPayload.signerLeftSub}</div>
              </div>
              {previewPayload.signerRightTitle && (
                <div className="border-t border-slate-400 pt-1.5">
                  <div className="font-semibold text-slate-900 truncate">{previewPayload.signerRightTitle}</div>
                  <div className="text-slate-500 truncate">{previewPayload.signerRightSub}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
