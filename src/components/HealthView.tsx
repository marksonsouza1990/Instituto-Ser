import { useEffect, useState, type FormEvent } from 'react';
import {
  CheckSquare,
  ClipboardList,
  FileDown,
  Filter,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Stethoscope,
  Brain,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatDateBR, generateInstitutionalDocumentPDF } from '../lib/format';
import {
  HEALTH_ROLES,
  hasAnyRole,
  type Appointment,
  type MedicalRecord,
  type Patient,
  type RoleInput,
  type Student,
} from '../types';

const MEDICAL_CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: 'vacinacao', label: 'Carteira de vacinação verificada' },
  { key: 'nutricional', label: 'Avaliação nutricional e crescimento' },
  { key: 'triagem_sensorial', label: 'Triagem visual e auditiva' },
  { key: 'exame_fisico', label: 'Exame físico geral realizado' },
  { key: 'alergias_medicacoes', label: 'Alergias e medicações conferidas' },
  { key: 'orientacao_preventiva', label: 'Orientações preventivas ao responsável' },
];

const PSYCH_CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: 'vinculo', label: 'Acolhimento e vínculo terapêutico' },
  { key: 'emocional', label: 'Avaliação emocional e ansiedade' },
  { key: 'dinamica_familiar', label: 'Escuta sobre dinâmica familiar' },
  { key: 'adaptacao_escolar', label: 'Acompanhamento de adaptação escolar' },
  { key: 'socializacao', label: 'Observação lúdica e socialização' },
  { key: 'devolutiva', label: 'Devolutiva ao responsável legal' },
];

const ALL_CHECKLIST_LABELS: Record<string, string> = Object.fromEntries([
  ...MEDICAL_CHECKLIST_ITEMS.map((i) => [i.key, i.label]),
  ...PSYCH_CHECKLIST_ITEMS.map((i) => [i.key, i.label]),
]);

export function HealthView({ role }: { role: RoleInput }) {
  const [subTab, setSubTab] = useState<'pacientes' | 'consultas' | 'prontuario'>('pacientes');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [recordFilter, setRecordFilter] = useState<'Todos' | 'Médico' | 'Psicológico'>('Todos');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtros da aba Pacientes
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSpecialtyFilter, setPatientSpecialtyFilter] = useState('Todas');
  const [patientStatusFilter, setPatientStatusFilter] = useState('Todos');
  const [patientProfessionalFilter, setPatientProfessionalFilter] = useState('Todos');

  // Filtros da aba Consultas
  const [appSearch, setAppSearch] = useState('');
  const [appSpecialtyFilter, setAppSpecialtyFilter] = useState('Todas');
  const [appStatusFilter, setAppStatusFilter] = useState('Todos');
  const [appDateFrom, setAppDateFrom] = useState('');
  const [appDateTo, setAppDateTo] = useState('');

  // Filtros do Prontuário & Cabeçalho do Relatório
  const [showHeaderFilterPanel, setShowHeaderFilterPanel] = useState(true);
  const [recordSearch, setRecordSearch] = useState('');
  const [recordAuthorFilter, setRecordAuthorFilter] = useState('Todos');
  const [recordDateFrom, setRecordDateFrom] = useState('');
  const [recordDateTo, setRecordDateTo] = useState('');
  const [pdfRecordsLimit, setPdfRecordsLimit] = useState<'all' | '5' | '10'>('all');
  const [reportHeaderConfig, setReportHeaderConfig] = useState({
    preset: 'geral' as 'geral' | 'medico' | 'psicologico' | 'personalizado',
    docTitle: 'Resumo de Prontuário Clínico e Psicológico (Sigiloso · LGPD)',
    docCategory: 'Núcleo de Saúde e Psicologia — Instituto SER',
    issuerUnit: 'Unidade Sede — Equipe Multidisciplinar',
    showIdentity: true,
    showProfessional: true,
    showStatusAndBlood: true,
    showAllergiesMeds: true,
    showAnamnesis: true,
    showSchoolObs: true,
    showFamilyDynamics: true,
    showVitalsInReport: true,
    showChecklistInReport: true,
  });

  const canAccessMedicalRecords = hasAnyRole(role, HEALTH_ROLES);
  const canWritePatient = hasAnyRole(role, HEALTH_ROLES);
  const isMedico = hasAnyRole(role, ['medico']);
  const isPsicologo = hasAnyRole(role, ['psicologo']);

  const defaultRecordType: 'Médico' | 'Psicológico' =
    isMedico ? 'Médico' : 'Psicológico';

  // Modal: Novo Paciente
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [linkMode, setLinkMode] = useState<'student' | 'community'>('student');
  const [pForm, setPForm] = useState({
    student_id: '',
    full_name: '',
    birth_date: '',
    cpf: '',
    guardian_name: '',
    contact_phone: '',
    responsible_professional: isMedico ? 'Dr. Rafael Mendes' : 'Dra. Beatriz Alencar',
    specialty: isMedico ? 'Pediatria' : 'Psicologia',
    follow_up_status: 'Em acompanhamento',
    blood_type: '',
    emergency_contact: '',
    clinical_allergies: '',
    clinical_medications: '',
    clinical_history: '',
  });

  // Modal: Agendar Consulta
  const [showAppModal, setShowAppModal] = useState(false);
  const [aForm, setAForm] = useState({
    patient_id: '',
    professional_name: isMedico ? 'Dr. Rafael Mendes' : 'Dra. Beatriz Alencar',
    specialty: isMedico ? 'Pediatria' : 'Psicologia',
    scheduled_date: '2026-11-26',
    scheduled_time: '10:00',
    status: 'Agendada',
    is_return: false,
    referral_to: '',
    notes: '',
  });

  // Ficha Clínica Completa do Paciente (Prontuário Base)
  const [clinicalProfile, setClinicalProfile] = useState({
    responsible_professional: '',
    specialty: '',
    follow_up_status: 'Em acompanhamento',
    blood_type: '',
    emergency_contact: '',
    clinical_allergies: '',
    clinical_medications: '',
    clinical_history: '',
    school_observations: '',
    family_dynamics: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Novo Registro de Prontuário + Checklists
  const [recordMode, setRecordMode] = useState<'Médico' | 'Psicológico'>(defaultRecordType);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [medVitals, setMedVitals] = useState({
    queixa_principal: '',
    peso_kg: '',
    altura_cm: '',
    temperatura_c: '',
    pressao_arterial: '',
    freq_cardiaca: '',
  });
  const [psychObs, setPsychObs] = useState({
    demanda_sessao: '',
    humor_afeto: '',
    interacao_comportamento: '',
  });
  const [mForm, setMForm] = useState({
    specialty: isMedico ? 'Pediatria' : 'Psicologia',
    recorded_at: '2026-11-23',
    evolution_text: '',
    professional_notes: '',
    referrals: '',
    lgpd_consent_verified: true,
  });

  function syncProfileForm(pat: Patient) {
    setClinicalProfile({
      responsible_professional: pat.responsible_professional || '',
      specialty: pat.specialty || '',
      follow_up_status: pat.follow_up_status || 'Em acompanhamento',
      blood_type: pat.blood_type || '',
      emergency_contact: pat.emergency_contact || '',
      clinical_allergies: pat.clinical_allergies || '',
      clinical_medications: pat.clinical_medications || '',
      clinical_history: pat.clinical_history || '',
      school_observations: pat.school_observations || '',
      family_dynamics: pat.family_dynamics || '',
    });
  }

  async function loadData() {
    if (!canAccessMedicalRecords) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [patRes, appRes, stuRes] = await Promise.all([
        apiRequest<Patient[]>('/api/patients'),
        apiRequest<Appointment[]>('/api/appointments'),
        apiRequest<Student[]>('/api/students'),
      ]);
      setPatients(patRes);
      setAppointments(appRes);
      setStudents(stuRes);
      if (selectedPatient) {
        const refreshed = patRes.find((p) => p.id === selectedPatient.id);
        if (refreshed) {
          setSelectedPatient(refreshed);
          syncProfileForm(refreshed);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar módulo de saúde.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function openMedicalRecord(pat: Patient) {
    setSelectedPatient(pat);
    syncProfileForm(pat);
    setSubTab('prontuario');
    setSuccessMsg(null);

    const inferredMode: 'Médico' | 'Psicológico' =
      isMedico && !isPsicologo
        ? 'Médico'
        : isPsicologo && !isMedico
          ? 'Psicológico'
          : pat.specialty.toLowerCase().includes('psic')
            ? 'Psicológico'
            : 'Médico';
    setRecordMode(inferredMode);
    setMForm((prev) => ({
      ...prev,
      specialty: inferredMode === 'Médico' ? (pat.specialty.includes('Psic') ? 'Pediatria' : pat.specialty) : 'Psicologia',
    }));

    if (!canAccessMedicalRecords) return;
    setError(null);
    try {
      const recs = await apiRequest<MedicalRecord[]>(`/api/patients/${pat.id}/medical-records`);
      setMedicalRecords(recs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Acesso restrito ao prontuário.');
    }
  }

  async function handleSavePatient(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/patients', {
        method: 'POST',
        body: JSON.stringify({
          ...pForm,
          student_id: linkMode === 'student' && pForm.student_id ? Number(pForm.student_id) : null,
        }),
      });
      setShowPatientModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar paciente.');
    }
  }

  async function handleSaveAppointment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          ...aForm,
          patient_id: Number(aForm.patient_id),
        }),
      });
      setShowAppModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao agendar consulta.');
    }
  }

  async function updateAppointmentStatus(id: number, status: string) {
    try {
      await apiRequest(`/api/appointments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar consulta.');
    }
  }

  async function handleSaveClinicalProfile(e: FormEvent) {
    e.preventDefault();
    if (!selectedPatient) return;
    setSavingProfile(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await apiRequest<Patient>(`/api/patients/${selectedPatient.id}/clinical-profile`, {
        method: 'PUT',
        body: JSON.stringify(clinicalProfile),
      });
      setSelectedPatient(updated);
      setPatients((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      setSuccessMsg('Ficha clínica geral do paciente salva no prontuário.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar ficha clínica.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAddMedicalRecord(e: FormEvent) {
    e.preventDefault();
    if (!selectedPatient) return;
    setError(null);
    setSuccessMsg(null);

    const vitalsPayload: Record<string, string> =
      recordMode === 'Médico'
        ? {
            ...(medVitals.queixa_principal ? { 'Queixa principal': medVitals.queixa_principal } : {}),
            ...(medVitals.peso_kg ? { 'Peso (kg)': medVitals.peso_kg } : {}),
            ...(medVitals.altura_cm ? { 'Altura (cm)': medVitals.altura_cm } : {}),
            ...(medVitals.temperatura_c ? { 'Temperatura (°C)': medVitals.temperatura_c } : {}),
            ...(medVitals.pressao_arterial ? { 'Pressão arterial': medVitals.pressao_arterial } : {}),
            ...(medVitals.freq_cardiaca ? { 'Freq. cardíaca (bpm)': medVitals.freq_cardiaca } : {}),
          }
        : {
            ...(psychObs.demanda_sessao ? { 'Demanda / Foco da sessão': psychObs.demanda_sessao } : {}),
            ...(psychObs.humor_afeto ? { 'Humor e afeto': psychObs.humor_afeto } : {}),
            ...(psychObs.interacao_comportamento ? { 'Interação e comportamento': psychObs.interacao_comportamento } : {}),
          };

    try {
      await apiRequest(`/api/patients/${selectedPatient.id}/medical-records`, {
        method: 'POST',
        body: JSON.stringify({
          record_type: recordMode,
          specialty: mForm.specialty,
          checklist,
          vitals: vitalsPayload,
          evolution_text: mForm.evolution_text,
          professional_notes: mForm.professional_notes,
          referrals: mForm.referrals,
          lgpd_consent_verified: mForm.lgpd_consent_verified,
          recorded_at: mForm.recorded_at || '2026-11-23',
        }),
      });
      setChecklist({});
      setMedVitals({
        queixa_principal: '',
        peso_kg: '',
        altura_cm: '',
        temperatura_c: '',
        pressao_arterial: '',
        freq_cardiaca: '',
      });
      setPsychObs({
        demanda_sessao: '',
        humor_afeto: '',
        interacao_comportamento: '',
      });
      setMForm((prev) => ({
        ...prev,
        evolution_text: '',
        professional_notes: '',
        referrals: '',
      }));
      await openMedicalRecord(selectedPatient);
      setSuccessMsg(`Atendimento ${recordMode.toLowerCase()} e checklist salvos no prontuário.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar prontuário.');
    }
  }

  function applyHeaderPreset(preset: 'geral' | 'medico' | 'psicologico') {
    if (preset === 'medico') {
      setRecordFilter('Médico');
      setReportHeaderConfig((prev) => ({
        ...prev,
        preset: 'medico',
        docTitle: 'Prontuário Médico e Pediátrico (Sigiloso · LGPD)',
        docCategory: 'Núcleo de Saúde Médica — Instituto SER',
        showAnamnesis: true,
        showAllergiesMeds: true,
        showStatusAndBlood: true,
        showSchoolObs: false,
        showFamilyDynamics: false,
      }));
    } else if (preset === 'psicologico') {
      setRecordFilter('Psicológico');
      setReportHeaderConfig((prev) => ({
        ...prev,
        preset: 'psicologico',
        docTitle: 'Prontuário de Acompanhamento Psicológico (Sigiloso · LGPD)',
        docCategory: 'Núcleo de Psicologia — Instituto SER',
        showAnamnesis: true,
        showAllergiesMeds: false,
        showStatusAndBlood: false,
        showSchoolObs: true,
        showFamilyDynamics: true,
      }));
    } else {
      setRecordFilter('Todos');
      setReportHeaderConfig((prev) => ({
        ...prev,
        preset: 'geral',
        docTitle: 'Resumo de Prontuário Clínico e Psicológico (Sigiloso · LGPD)',
        docCategory: 'Núcleo de Saúde e Psicologia — Instituto SER',
        showIdentity: true,
        showProfessional: true,
        showStatusAndBlood: true,
        showAllergiesMeds: true,
        showAnamnesis: true,
        showSchoolObs: true,
        showFamilyDynamics: true,
      }));
    }
  }

  function handleExportPatientDossierPDF() {
    if (!selectedPatient) return;

    const recordsForPdf =
      pdfRecordsLimit === 'all'
        ? filteredRecords
        : filteredRecords.slice(0, Number(pdfRecordsLimit));

    const headerFields: { label: string; value: string }[] = [
      { label: 'Paciente', value: selectedPatient.full_name },
    ];
    if (reportHeaderConfig.showIdentity) {
      headerFields.push({
        label: 'Nascimento / CPF',
        value: `${formatDateBR(selectedPatient.birth_date)}${selectedPatient.cpf ? ` · CPF ${selectedPatient.cpf}` : ''}`,
      });
      headerFields.push({
        label: 'Responsável Legal / Telefone',
        value: `${selectedPatient.guardian_name} · ${selectedPatient.contact_phone}`,
      });
    }
    if (reportHeaderConfig.showProfessional) {
      headerFields.push({
        label: 'Profissional / Especialidade',
        value: `${clinicalProfile.responsible_professional} (${clinicalProfile.specialty})`,
      });
    }
    if (reportHeaderConfig.showStatusAndBlood) {
      headerFields.push({
        label: 'Status / Tipo Sanguíneo',
        value: `${clinicalProfile.follow_up_status}${clinicalProfile.blood_type ? ` · Tipo ${clinicalProfile.blood_type}` : ''}${
          clinicalProfile.emergency_contact ? ` · Emerg.: ${clinicalProfile.emergency_contact}` : ''
        }`,
      });
    }
    if (reportHeaderConfig.showAllergiesMeds) {
      headerFields.push({
        label: 'Alergias Conhecidas',
        value: clinicalProfile.clinical_allergies || 'Nenhuma informada',
      });
      headerFields.push({
        label: 'Medicações em Uso',
        value: clinicalProfile.clinical_medications || 'Nenhuma informada',
      });
    }
    if (reportHeaderConfig.issuerUnit.trim()) {
      headerFields.push({
        label: 'Unidade / Referência',
        value: `${reportHeaderConfig.issuerUnit.trim()}${
          recordDateFrom || recordDateTo
            ? ` · Período: ${recordDateFrom ? formatDateBR(recordDateFrom) : 'Início'} a ${
                recordDateTo ? formatDateBR(recordDateTo) : 'Atual'
              }`
            : ''
        }`,
      });
    }

    const formattedRecords = recordsForPdf.map((r) => {
      const parts: string[] = [
        `[${formatDateBR(r.recorded_at)} · ${r.record_type || 'Clínico'} (${r.specialty}) · ${r.author_name}] ${r.evolution_text}`,
      ];
      if (reportHeaderConfig.showVitalsInReport && r.vitals) {
        const vitalsList = Object.entries(r.vitals)
          .filter(([, v]) => Boolean(v))
          .map(([k, v]) => `${k}: ${v}`);
        if (vitalsList.length > 0) parts.push(`Indicadores/Vitais: ${vitalsList.join(' | ')}`);
      }
      if (reportHeaderConfig.showChecklistInReport && r.checklist) {
        const checked = Object.entries(r.checklist)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => ALL_CHECKLIST_LABELS[k] || k);
        if (checked.length > 0) parts.push(`Checklist verificado: ${checked.join('; ')}`);
      }
      if (r.professional_notes) parts.push(`Conduta/Notas: ${r.professional_notes}`);
      if (r.referrals) parts.push(`Encaminhamentos: ${r.referrals}`);
      return parts.join(' — ');
    });

    generateInstitutionalDocumentPDF({
      docTitle: reportHeaderConfig.docTitle.trim() || 'Resumo de Prontuário Clínico e Psicológico',
      docCategory: reportHeaderConfig.docCategory.trim() || 'Núcleo de Saúde e Psicologia — Instituto SER',
      cityAndDate: `São Paulo/SP, ${formatDateBR(new Date().toISOString().slice(0, 10))}`,
      fields: headerFields,
      paragraphs: [
        reportHeaderConfig.showAnamnesis && clinicalProfile.clinical_history
          ? `Histórico Clínico e Anamnese: ${clinicalProfile.clinical_history}`
          : '',
        reportHeaderConfig.showSchoolObs && clinicalProfile.school_observations
          ? `Observações Escolares: ${clinicalProfile.school_observations}`
          : '',
        reportHeaderConfig.showFamilyDynamics && clinicalProfile.family_dynamics
          ? `Dinâmica Familiar: ${clinicalProfile.family_dynamics}`
          : '',
        ...formattedRecords,
      ].filter(Boolean),
      signerLeftTitle: clinicalProfile.responsible_professional || 'Profissional Responsável',
      signerLeftSub: `${clinicalProfile.specialty} — Instituto SER`,
      filename: `prontuario-${selectedPatient.full_name.toLowerCase().replace(/\s+/g, '-')}.pdf`,
    });
  }

  if (!canAccessMedicalRecords) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-lg mx-auto my-8 space-y-3">
        <ShieldAlert className="w-9 h-9 text-amber-600 mx-auto" />
        <h1 className="font-display text-lg font-bold text-slate-900">
          Acesso Restrito — Equipe de Saúde e Administração
        </h1>
        <p className="text-xs text-slate-600 leading-relaxed">
          Em conformidade com a LGPD e o sigilo profissional, os dados de pacientes, consultas e prontuários médicos e psicológicos são visíveis exclusivamente para Médicos, Psicólogos e Administradores autorizados.
        </p>
      </div>
    );
  }

  const unlinkedStudents = students.filter(
    (s) => !patients.some((p) => p.student_id === s.id)
  );

  const activeChecklistItems =
    recordMode === 'Médico' ? MEDICAL_CHECKLIST_ITEMS : PSYCH_CHECKLIST_ITEMS;

  const patientSpecialties = Array.from(new Set(patients.map((p) => p.specialty).filter(Boolean))).sort();
  const patientProfessionals = Array.from(
    new Set(patients.map((p) => p.responsible_professional).filter(Boolean))
  ).sort();

  const filteredPatients = patients.filter((pat) => {
    const q = patientSearch.trim().toLowerCase();
    if (q) {
      const hay = `${pat.full_name} ${pat.cpf || ''} ${pat.guardian_name} ${pat.contact_phone} ${pat.responsible_professional}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (patientSpecialtyFilter !== 'Todas' && pat.specialty !== patientSpecialtyFilter) return false;
    if (patientStatusFilter !== 'Todos' && pat.follow_up_status !== patientStatusFilter) return false;
    if (patientProfessionalFilter !== 'Todos' && pat.responsible_professional !== patientProfessionalFilter)
      return false;
    return true;
  });

  const appSpecialties = Array.from(new Set(appointments.map((a) => a.specialty).filter(Boolean))).sort();
  const filteredAppointments = appointments.filter((app) => {
    const q = appSearch.trim().toLowerCase();
    if (q) {
      const hay = `${app.patient_name || ''} ${app.professional_name} ${app.specialty} ${app.referral_to} ${app.notes}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (appSpecialtyFilter !== 'Todas' && app.specialty !== appSpecialtyFilter) return false;
    if (appStatusFilter !== 'Todos' && app.status !== appStatusFilter) return false;
    if (appDateFrom && app.scheduled_date < appDateFrom) return false;
    if (appDateTo && app.scheduled_date > appDateTo) return false;
    return true;
  });

  const recordAuthors = Array.from(new Set(medicalRecords.map((r) => r.author_name).filter(Boolean))).sort();
  const filteredRecords = medicalRecords.filter((rec) => {
    const type = rec.record_type || (rec.specialty.toLowerCase().includes('psic') ? 'Psicológico' : 'Médico');
    if (recordFilter !== 'Todos' && type !== recordFilter) return false;
    if (recordAuthorFilter !== 'Todos' && rec.author_name !== recordAuthorFilter) return false;
    if (recordDateFrom && rec.recorded_at < recordDateFrom) return false;
    if (recordDateTo && rec.recorded_at > recordDateTo) return false;
    const q = recordSearch.trim().toLowerCase();
    if (q) {
      const hay = `${rec.evolution_text} ${rec.professional_notes} ${rec.referrals} ${rec.specialty} ${rec.author_name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Pacientes, Prontuário Médico e Psicológico
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Acompanhamento completo dentro da plataforma com ficha clínica, checklists médico e psicológico e proteção LGPD.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#EFECE4] border border-[#E5E1D8] rounded-lg">
            <button
              type="button"
              onClick={() => setSubTab('pacientes')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                subTab === 'pacientes' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
              }`}
            >
              Pacientes ({patients.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('consultas')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                subTab === 'consultas' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
              }`}
            >
              Agenda e Consultas ({appointments.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setSubTab('prontuario');
                if (!selectedPatient && patients.length > 0) {
                  openMedicalRecord(patients[0]);
                }
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer inline-flex items-center gap-1 ${
                subTab === 'prontuario' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
              }`}
            >
              <Lock className="w-3 h-3" /> Prontuário e Checklists
            </button>
          </div>

          {canWritePatient && (
            <button
              type="button"
              onClick={() => setShowPatientModal(true)}
              className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Novo Paciente
            </button>
          )}
          {canWritePatient && (
            <button
              type="button"
              onClick={() => {
                if (patients.length > 0) {
                  setAForm((f) => ({ ...f, patient_id: String(patients[0].id) }));
                }
                setShowAppModal(true);
              }}
              className="inline-flex items-center gap-1.5 py-2 px-4 border border-slate-300 bg-white text-slate-800 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
            >
              Agendar Consulta
            </button>
          )}
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

      {subTab === 'pacientes' && (
        <div className="space-y-4">
          {/* Barra de Filtros de Pacientes */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#144A47]" />
                Filtros da Lista de Pacientes
              </span>
              <span className="text-slate-500 tabular-nums">
                Exibindo {filteredPatients.length} de {patients.length} pacientes
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative lg:col-span-2">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Buscar por paciente, CPF, responsável ou telefone..."
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <select
                value={patientSpecialtyFilter}
                onChange={(e) => setPatientSpecialtyFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Todas">Especialidade: Todas</option>
                {patientSpecialties.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={patientStatusFilter}
                onChange={(e) => setPatientStatusFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Todos">Status: Todos</option>
                <option value="Em acompanhamento">Em acompanhamento</option>
                <option value="Aguardando triagem">Aguardando triagem</option>
                <option value="Encaminhado">Encaminhado</option>
                <option value="Alta">Alta</option>
              </select>
              <div className="flex items-center gap-2">
                <select
                  value={patientProfessionalFilter}
                  onChange={(e) => setPatientProfessionalFilter(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg bg-white min-w-0"
                >
                  <option value="Todos">Profissional: Todos</option>
                  {patientProfessionals.map((prof) => (
                    <option key={prof} value={prof}>
                      {prof}
                    </option>
                  ))}
                </select>
                {(patientSearch ||
                  patientSpecialtyFilter !== 'Todas' ||
                  patientStatusFilter !== 'Todos' ||
                  patientProfessionalFilter !== 'Todos') && (
                  <button
                    type="button"
                    onClick={() => {
                      setPatientSearch('');
                      setPatientSpecialtyFilter('Todas');
                      setPatientStatusFilter('Todos');
                      setPatientProfessionalFilter('Todos');
                    }}
                    className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer shrink-0"
                    title="Limpar filtros"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                  <th className="py-3 px-4">Paciente</th>
                  <th className="py-3 px-4">Vínculo</th>
                  <th className="py-3 px-4">Responsável / Contato</th>
                  <th className="py-3 px-4">Profissional e Especialidade</th>
                  <th className="py-3 px-4">Alertas Clínicos</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Consultas</th>
                  <th className="py-3 px-4 text-right">Prontuário</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Carregando pacientes...
                    </td>
                  </tr>
                ) : filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Nenhum paciente encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((pat) => (
                    <tr key={pat.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{pat.full_name}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          Nasc.: {formatDateBR(pat.birth_date)}
                          {pat.blood_type ? ` · Tipo ${pat.blood_type}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {pat.student_id ? `Aluno #${pat.student_id}` : 'Comunidade'}
                      </td>
                      <td className="py-3 px-4">
                        <div>{pat.guardian_name}</div>
                        <div className="text-[11px] font-mono text-slate-500">{pat.contact_phone}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{pat.specialty}</div>
                        <div className="text-[11px] text-slate-500">{pat.responsible_professional}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs">
                        {pat.clinical_allergies ? (
                          <span className="text-amber-700 font-medium">Alergia: {pat.clinical_allergies}</span>
                        ) : (
                          <span className="text-slate-400">Sem alergias registradas</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#144A47]">{pat.follow_up_status}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {pat.total_appointments ?? 0}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openMedicalRecord(pat)}
                          className="text-[#0E5A75] hover:underline font-medium cursor-pointer"
                        >
                          Abrir Prontuário
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'consultas' && (
        <div className="space-y-4">
          {/* Barra de Filtros da Agenda */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#144A47]" />
                Filtros da Agenda e Consultas
              </span>
              <span className="text-slate-500 tabular-nums">
                Exibindo {filteredAppointments.length} de {appointments.length} consultas
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="relative lg:col-span-2">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={appSearch}
                  onChange={(e) => setAppSearch(e.target.value)}
                  placeholder="Buscar por paciente, profissional ou notas..."
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <select
                value={appSpecialtyFilter}
                onChange={(e) => setAppSpecialtyFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Todas">Especialidade: Todas</option>
                {appSpecialties.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={appStatusFilter}
                onChange={(e) => setAppStatusFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Todos">Status: Todos</option>
                <option value="Agendada">Agendada</option>
                <option value="Retorno Agendado">Retorno Agendado</option>
                <option value="Realizada">Realizada</option>
                <option value="Falta">Falta</option>
                <option value="Cancelada">Cancelada</option>
              </select>
              <input
                type="date"
                value={appDateFrom}
                onChange={(e) => setAppDateFrom(e.target.value)}
                title="Data inicial"
                className="px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
              />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={appDateTo}
                  onChange={(e) => setAppDateTo(e.target.value)}
                  title="Data final"
                  className="flex-1 px-2.5 py-2 border border-slate-300 rounded-lg font-mono min-w-0"
                />
                {(appSearch ||
                  appSpecialtyFilter !== 'Todas' ||
                  appStatusFilter !== 'Todos' ||
                  appDateFrom ||
                  appDateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAppSearch('');
                      setAppSpecialtyFilter('Todas');
                      setAppStatusFilter('Todos');
                      setAppDateFrom('');
                      setAppDateTo('');
                    }}
                    className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer shrink-0"
                    title="Limpar filtros"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                  <th className="py-3 px-4">Data / Horário</th>
                  <th className="py-3 px-4">Paciente</th>
                  <th className="py-3 px-4">Especialidade / Profissional</th>
                  <th className="py-3 px-4">Encaminhamento / Notas</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Nenhuma consulta encontrada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredAppointments.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono tabular-nums">
                        <div>{formatDateBR(app.scheduled_date)}</div>
                        <div className="text-[11px] text-slate-500">{app.scheduled_time}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {app.patient_name}
                        {app.is_return === 1 && (
                          <span className="ml-1.5 text-[11px] text-[#0E5A75]">· Retorno</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div>{app.specialty}</div>
                        <div className="text-[11px] text-slate-500">{app.professional_name}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs">
                        {app.referral_to ? `Encam.: ${app.referral_to} · ` : ''}
                        {app.notes || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-medium ${
                            app.status === 'Realizada'
                              ? 'text-emerald-700'
                              : app.status === 'Falta' || app.status === 'Cancelada'
                                ? 'text-red-700'
                                : 'text-amber-700'
                          }`}
                        >
                          {app.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        {canWritePatient && app.status !== 'Realizada' && (
                          <button
                            type="button"
                            onClick={() => updateAppointmentStatus(app.id, 'Realizada')}
                            className="text-emerald-700 hover:underline font-medium cursor-pointer"
                          >
                            Realizada
                          </button>
                        )}
                        {canWritePatient && app.status !== 'Falta' && app.status !== 'Realizada' && (
                          <button
                            type="button"
                            onClick={() => updateAppointmentStatus(app.id, 'Falta')}
                            className="text-red-700 hover:underline font-medium cursor-pointer"
                          >
                            Falta
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'prontuario' && (
        <div className="space-y-6">
          {/* Patient selector header */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Prontuário Médico e Psicológico Integrado (LGPD)
                </h2>
                <p className="text-xs text-slate-500">
                  Todos os dados clínicos, anamnese e checklists ficam armazenados com segurança na plataforma e auditados.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedPatient?.id || ''}
                  onChange={(e) => {
                    const pat = patients.find((p) => p.id === Number(e.target.value));
                    if (pat) openMedicalRecord(pat);
                  }}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white min-w-[230px]"
                >
                  <option value="">Selecione um paciente...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.specialty})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowHeaderFilterPanel((v) => !v)}
                  className={`inline-flex items-center gap-1.5 py-2 px-3 border text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap ${
                    showHeaderFilterPanel
                      ? 'border-[#144A47] bg-[#F7F5F0] text-[#144A47]'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filtrar Cabeçalho do Relatório
                </button>
                {selectedPatient && (
                  <button
                    type="button"
                    onClick={handleExportPatientDossierPDF}
                    className="inline-flex items-center gap-1.5 py-2 px-3 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    Exportar Relatório PDF
                  </button>
                )}
              </div>
            </div>

            {showHeaderFilterPanel && (
              <div className="pt-4 border-t border-slate-100 space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-[#144A47]" />
                    Filtro do Cabeçalho e Campos do Relatório do Prontuário
                  </div>
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-[#EFECE4] rounded-lg">
                    {(
                      [
                        ['geral', 'Cabeçalho Geral'],
                        ['medico', 'Somente Médico'],
                        ['psicologico', 'Somente Psicológico'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applyHeaderPreset(key)}
                        className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                          reportHeaderConfig.preset === key
                            ? 'bg-white text-[#144A47] shadow-xs'
                            : 'text-slate-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Título do Cabeçalho (PDF)</label>
                    <input
                      type="text"
                      value={reportHeaderConfig.docTitle}
                      onChange={(e) =>
                        setReportHeaderConfig({
                          ...reportHeaderConfig,
                          preset: 'personalizado',
                          docTitle: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Núcleo / Subtítulo Institucional</label>
                    <input
                      type="text"
                      value={reportHeaderConfig.docCategory}
                      onChange={(e) =>
                        setReportHeaderConfig({
                          ...reportHeaderConfig,
                          preset: 'personalizado',
                          docCategory: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Unidade / Referência no Cabeçalho</label>
                    <input
                      type="text"
                      value={reportHeaderConfig.issuerUnit}
                      onChange={(e) =>
                        setReportHeaderConfig({
                          ...reportHeaderConfig,
                          issuerUnit: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Evoluções no PDF</label>
                    <select
                      value={pdfRecordsLimit}
                      onChange={(e) => setPdfRecordsLimit(e.target.value as 'all' | '5' | '10')}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="all">Todas as filtradas ({filteredRecords.length})</option>
                      <option value="5">Últimas 5 filtradas</option>
                      <option value="10">Últimas 10 filtradas</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="font-medium text-slate-700 mb-2">
                    Campos visíveis no cabeçalho e corpo do relatório:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {[
                      ['showIdentity', 'Nascimento, CPF e Responsável'],
                      ['showProfessional', 'Profissional e Especialidade'],
                      ['showStatusAndBlood', 'Status, Tipo Sanguíneo e Emergência'],
                      ['showAllergiesMeds', 'Alergias e Medicações'],
                      ['showAnamnesis', 'Histórico Clínico e Anamnese'],
                      ['showSchoolObs', 'Observações Escolares'],
                      ['showFamilyDynamics', 'Dinâmica Familiar'],
                      ['showVitalsInReport', 'Dados Vitais / Indicadores'],
                      ['showChecklistInReport', 'Itens de Checklist Verificados'],
                    ].map(([fieldKey, label]) => (
                      <label
                        key={fieldKey}
                        className="flex items-center gap-2 text-slate-700 bg-[#F7F5F0]/70 px-2.5 py-1.5 rounded-lg border border-[#E5E1D8] cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(reportHeaderConfig[fieldKey as keyof typeof reportHeaderConfig])}
                          onChange={(e) =>
                            setReportHeaderConfig((prev) => ({
                              ...prev,
                              preset: 'personalizado',
                              [fieldKey]: e.target.checked,
                            }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {selectedPatient && (
                  <div className="p-3 bg-[#F7F5F0] border border-[#E5E1D8] rounded-lg space-y-1.5">
                    <div className="text-[11px] font-semibold text-[#144A47] uppercase tracking-wide">
                      Prévia do Cabeçalho Filtrado — {reportHeaderConfig.docTitle}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] text-slate-700">
                      <div>
                        <span className="text-slate-500">Paciente:</span>{' '}
                        <strong className="text-slate-900">{selectedPatient.full_name}</strong>
                      </div>
                      {reportHeaderConfig.showIdentity && (
                        <div>
                          <span className="text-slate-500">Nasc./Resp.:</span>{' '}
                          {formatDateBR(selectedPatient.birth_date)} · {selectedPatient.guardian_name}
                        </div>
                      )}
                      {reportHeaderConfig.showProfessional && (
                        <div>
                          <span className="text-slate-500">Profissional:</span>{' '}
                          {clinicalProfile.responsible_professional} ({clinicalProfile.specialty})
                        </div>
                      )}
                      {reportHeaderConfig.showStatusAndBlood && (
                        <div>
                          <span className="text-slate-500">Status/Sangue:</span>{' '}
                          {clinicalProfile.follow_up_status}
                          {clinicalProfile.blood_type ? ` · ${clinicalProfile.blood_type}` : ''}
                        </div>
                      )}
                      {reportHeaderConfig.showAllergiesMeds && (
                        <div className="sm:col-span-2">
                          <span className="text-slate-500">Alergias/Medicações:</span>{' '}
                          {clinicalProfile.clinical_allergies || 'Sem alergias'} ·{' '}
                          {clinicalProfile.clinical_medications || 'Sem medicações'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedPatient ? (
            <>
              {/* Section 1: Ficha Clínica Geral & Anamnese do Paciente */}
              <form
                onSubmit={handleSaveClinicalProfile}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900">
                      Ficha Clínica e Anamnese — {selectedPatient.full_name}
                    </h3>
                    <p className="text-slate-500">
                      Nascimento: {formatDateBR(selectedPatient.birth_date)} · Responsável: {selectedPatient.guardian_name} ({selectedPatient.contact_phone})
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white font-medium rounded-lg cursor-pointer self-start disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingProfile ? 'Salvando...' : 'Salvar Ficha Clínica'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Profissional responsável</label>
                    <input
                      type="text"
                      value={clinicalProfile.responsible_professional}
                      onChange={(e) =>
                        setClinicalProfile({ ...clinicalProfile, responsible_professional: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Especialidade principal</label>
                    <input
                      type="text"
                      value={clinicalProfile.specialty}
                      onChange={(e) =>
                        setClinicalProfile({ ...clinicalProfile, specialty: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Status do acompanhamento</label>
                    <select
                      value={clinicalProfile.follow_up_status}
                      onChange={(e) =>
                        setClinicalProfile({ ...clinicalProfile, follow_up_status: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Em acompanhamento">Em acompanhamento</option>
                      <option value="Aguardando triagem">Aguardando triagem</option>
                      <option value="Encaminhado">Encaminhado</option>
                      <option value="Alta">Alta</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Tipo sanguíneo</label>
                      <input
                        type="text"
                        placeholder="Ex.: O+"
                        value={clinicalProfile.blood_type}
                        onChange={(e) =>
                          setClinicalProfile({ ...clinicalProfile, blood_type: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Emergência</label>
                      <input
                        type="text"
                        placeholder="Telefone"
                        value={clinicalProfile.emergency_contact}
                        onChange={(e) =>
                          setClinicalProfile({ ...clinicalProfile, emergency_contact: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Alergias e restrições clínicas</label>
                    <input
                      type="text"
                      value={clinicalProfile.clinical_allergies}
                      onChange={(e) =>
                        setClinicalProfile({ ...clinicalProfile, clinical_allergies: e.target.value })
                      }
                      placeholder="Ex.: Dipirona, lactose, sem alergias conhecidas..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Medicações de uso contínuo</label>
                    <input
                      type="text"
                      value={clinicalProfile.clinical_medications}
                      onChange={(e) =>
                        setClinicalProfile({ ...clinicalProfile, clinical_medications: e.target.value })
                      }
                      placeholder="Ex.: Nenhuma ou nome/dosagem..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Histórico clínico / Anamnese</label>
                    <textarea
                      rows={3}
                      value={clinicalProfile.clinical_history}
                      onChange={(e) =>
                        setClinicalProfile({ ...clinicalProfile, clinical_history: e.target.value })
                      }
                      placeholder="Antecedentes médicos, parto, doenças prévias, desenvolvimento..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Observações escolares e aprendizagem</label>
                    <textarea
                      rows={3}
                      value={clinicalProfile.school_observations}
                      onChange={(e) =>
                        setClinicalProfile({ ...clinicalProfile, school_observations: e.target.value })
                      }
                      placeholder="Concentração, socialização na escola, queixas pedagógicas..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Dinâmica familiar e contexto</label>
                    <textarea
                      rows={3}
                      value={clinicalProfile.family_dynamics}
                      onChange={(e) =>
                        setClinicalProfile({ ...clinicalProfile, family_dynamics: e.target.value })
                      }
                      placeholder="Relação com responsáveis, moradia, rede de apoio..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </form>

              {/* Section 2: Checklist + Nova Evolução & Histórico */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Checklist Form */}
                <form
                  onSubmit={handleAddMedicalRecord}
                  className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <h3 className="font-display font-bold text-sm text-slate-900 flex items-center gap-1.5">
                      <ClipboardList className="w-4 h-4 text-[#144A47]" />
                      Novo Atendimento no Prontuário
                    </h3>
                  </div>

                  {/* Mode Switcher: Médico vs Psicológico */}
                  <div className="grid grid-cols-2 gap-2 p-1 bg-[#EFECE4] rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setRecordMode('Médico');
                        setChecklist({});
                        setMForm((prev) => ({ ...prev, specialty: 'Pediatria / Clínica Médica' }));
                      }}
                      className={`py-2 px-3 rounded-md font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                        recordMode === 'Médico' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      <Stethoscope className="w-3.5 h-3.5" />
                      Checklist Médico
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRecordMode('Psicológico');
                        setChecklist({});
                        setMForm((prev) => ({ ...prev, specialty: 'Psicologia' }));
                      }}
                      className={`py-2 px-3 rounded-md font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                        recordMode === 'Psicológico' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      <Brain className="w-3.5 h-3.5" />
                      Checklist Psicológico
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Especialidade</label>
                      <input
                        type="text"
                        required
                        value={mForm.specialty}
                        onChange={(e) => setMForm({ ...mForm, specialty: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Data do atendimento</label>
                      <input
                        type="date"
                        required
                        value={mForm.recorded_at}
                        onChange={(e) => setMForm({ ...mForm, recorded_at: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  {/* Structured Vitals or Psychological Session Indicators */}
                  {recordMode === 'Médico' ? (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                      <div className="font-semibold text-slate-800">Dados Vitais e Queixa Clínica</div>
                      <div>
                        <input
                          type="text"
                          placeholder="Queixa principal / Motivo da consulta"
                          value={medVitals.queixa_principal}
                          onChange={(e) => setMedVitals({ ...medVitals, queixa_principal: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="Peso (kg)"
                          value={medVitals.peso_kg}
                          onChange={(e) => setMedVitals({ ...medVitals, peso_kg: e.target.value })}
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Altura (cm)"
                          value={medVitals.altura_cm}
                          onChange={(e) => setMedVitals({ ...medVitals, altura_cm: e.target.value })}
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Temp. (°C)"
                          value={medVitals.temperatura_c}
                          onChange={(e) => setMedVitals({ ...medVitals, temperatura_c: e.target.value })}
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md font-mono"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Pressão arterial (ex: 110/70)"
                          value={medVitals.pressao_arterial}
                          onChange={(e) => setMedVitals({ ...medVitals, pressao_arterial: e.target.value })}
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Freq. cardíaca (bpm)"
                          value={medVitals.freq_cardiaca}
                          onChange={(e) => setMedVitals({ ...medVitals, freq_cardiaca: e.target.value })}
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md font-mono"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                      <div className="font-semibold text-slate-800">Observações Estruturadas da Sessão</div>
                      <input
                        type="text"
                        placeholder="Demanda / Foco principal da sessão"
                        value={psychObs.demanda_sessao}
                        onChange={(e) => setPsychObs({ ...psychObs, demanda_sessao: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                      />
                      <input
                        type="text"
                        placeholder="Humor e afeto observados (ex.: receptivo, ansioso, calmo)"
                        value={psychObs.humor_afeto}
                        onChange={(e) => setPsychObs({ ...psychObs, humor_afeto: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                      />
                      <input
                        type="text"
                        placeholder="Interação, fala e comportamento observado"
                        value={psychObs.interacao_comportamento}
                        onChange={(e) => setPsychObs({ ...psychObs, interacao_comportamento: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                  )}

                  {/* Checklist Checkboxes */}
                  <div className="p-3 border border-slate-200 rounded-lg space-y-2">
                    <div className="font-semibold text-slate-800">
                      Checklist {recordMode === 'Médico' ? 'de Consulta Médica' : 'de Sessão Psicológica'}
                    </div>
                    <div className="space-y-1.5">
                      {activeChecklistItems.map((item) => (
                        <label
                          key={item.key}
                          className="flex items-start gap-2 text-slate-700 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(checklist[item.key])}
                            onChange={(e) =>
                              setChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }))
                            }
                            className="mt-0.5"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      {recordMode === 'Médico' ? 'Avaliação clínica e evolução *' : 'Evolução psicológica *'}
                    </label>
                    <textarea
                      rows={4}
                      required
                      value={mForm.evolution_text}
                      onChange={(e) => setMForm({ ...mForm, evolution_text: e.target.value })}
                      placeholder={
                        recordMode === 'Médico'
                          ? 'Descreva os achados do exame, evolução clínica e diagnóstico...'
                          : 'Descreva o andamento da sessão, avanços emocionais e observações...'
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      {recordMode === 'Médico'
                        ? 'Conduta médica / Prescrições / Orientações'
                        : 'Anotações técnicas sigilosas / Plano terapêutico'}
                    </label>
                    <textarea
                      rows={2}
                      value={mForm.professional_notes}
                      onChange={(e) => setMForm({ ...mForm, professional_notes: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Encaminhamentos realizados</label>
                    <input
                      type="text"
                      value={mForm.referrals}
                      onChange={(e) => setMForm({ ...mForm, referrals: e.target.value })}
                      placeholder="Ex.: Oftalmologia, fonoaudiologia, UBS..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      checked={mForm.lgpd_consent_verified}
                      onChange={(e) =>
                        setMForm({ ...mForm, lgpd_consent_verified: e.target.checked })
                      }
                    />
                    Termo de consentimento do responsável legal verificado (LGPD)
                  </label>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white font-medium rounded-lg cursor-pointer"
                  >
                    Salvar Registro e Checklist no Prontuário
                  </button>
                </form>

                {/* Right: Complete Chronological History */}
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <h3 className="font-display font-bold text-sm text-slate-900">
                      Histórico Completo do Prontuário — {selectedPatient.full_name}
                    </h3>
                    <div className="flex items-center gap-1 p-1 bg-[#EFECE4] rounded-lg text-xs">
                      {(['Todos', 'Médico', 'Psicológico'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setRecordFilter(f)}
                          className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                            recordFilter === f ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Filtros adicionais das evoluções do prontuário */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs pb-2 border-b border-slate-100">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={recordSearch}
                        onChange={(e) => setRecordSearch(e.target.value)}
                        placeholder="Filtrar evoluções..."
                        className="w-full pl-8 pr-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <select
                      value={recordAuthorFilter}
                      onChange={(e) => setRecordAuthorFilter(e.target.value)}
                      className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Todos">Profissional: Todos</option>
                      {recordAuthors.map((auth) => (
                        <option key={auth} value={auth}>
                          {auth}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={recordDateFrom}
                      onChange={(e) => setRecordDateFrom(e.target.value)}
                      title="Data inicial do histórico"
                      className="px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={recordDateTo}
                        onChange={(e) => setRecordDateTo(e.target.value)}
                        title="Data final do histórico"
                        className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono min-w-0"
                      />
                      {(recordFilter !== 'Todos' ||
                        recordAuthorFilter !== 'Todos' ||
                        recordSearch ||
                        recordDateFrom ||
                        recordDateTo) && (
                        <button
                          type="button"
                          onClick={() => {
                            setRecordFilter('Todos');
                            setRecordAuthorFilter('Todos');
                            setRecordSearch('');
                            setRecordDateFrom('');
                            setRecordDateTo('');
                          }}
                          className="p-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer shrink-0"
                          title="Limpar filtros do histórico"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {filteredRecords.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">
                      Nenhuma evolução registrada para este filtro.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {filteredRecords.map((rec) => {
                        const rType =
                          rec.record_type ||
                          (rec.specialty.toLowerCase().includes('psic') ? 'Psicológico' : 'Médico');
                        const checkedKeys = Object.entries(rec.checklist || {})
                          .filter(([, v]) => Boolean(v))
                          .map(([k]) => k);
                        const vitalsEntries = Object.entries(rec.vitals || {}).filter(([, v]) => Boolean(v));

                        return (
                          <div key={rec.id} className="p-4 border border-slate-200 rounded-lg text-xs space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900">
                                  {rType} · {rec.specialty}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-600">{rec.author_name}</span>
                              </div>
                              <span className="font-mono text-slate-500 tabular-nums">
                                {formatDateBR(rec.recorded_at)}
                              </span>
                            </div>

                            {vitalsEntries.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2.5 bg-slate-50 rounded-md border border-slate-100">
                                {vitalsEntries.map(([k, v]) => (
                                  <div key={k} className="text-[11px] text-slate-700">
                                    <span className="font-medium text-slate-500">{k}:</span>{' '}
                                    <span className="font-medium text-slate-900">{v}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {checkedKeys.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[11px] font-medium text-slate-500">
                                  Itens verificados no checklist:
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                  {checkedKeys.map((ck) => (
                                    <div key={ck} className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                                      <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                                      <span>{ALL_CHECKLIST_LABELS[ck] || ck}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <p className="text-slate-800 leading-relaxed whitespace-pre-line">
                              {rec.evolution_text}
                            </p>

                            {rec.professional_notes && (
                              <p className="text-slate-600">
                                <span className="font-medium text-slate-700">Conduta / Notas técnicas:</span>{' '}
                                {rec.professional_notes}
                              </p>
                            )}

                            {rec.referrals && (
                              <p className="text-[#0E5A75]">
                                <span className="font-medium">Encaminhamento:</span> {rec.referrals}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              Selecione um paciente acima para abrir ou preencher o prontuário médico e psicológico.
            </div>
          )}
        </div>
      )}

      {/* Modal New Patient */}
      {showPatientModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">Cadastrar Paciente</h2>
              <button
                type="button"
                onClick={() => setShowPatientModal(false)}
                className="text-xs text-slate-500 cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSavePatient} className="mt-4 space-y-4 text-xs">
              <div className="flex gap-2 p-1 bg-[#EFECE4] rounded-lg">
                <button
                  type="button"
                  onClick={() => setLinkMode('student')}
                  className={`flex-1 py-1.5 rounded-md font-medium cursor-pointer ${
                    linkMode === 'student' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Vincular aluno já cadastrado (sem duplicar)
                </button>
                <button
                  type="button"
                  onClick={() => setLinkMode('community')}
                  className={`flex-1 py-1.5 rounded-md font-medium cursor-pointer ${
                    linkMode === 'community' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Paciente externo / comunidade
                </button>
              </div>

              {linkMode === 'student' ? (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Selecionar aluno *</label>
                  <select
                    required
                    value={pForm.student_id}
                    onChange={(e) => setPForm({ ...pForm, student_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Escolha um aluno...</option>
                    {unlinkedStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} (Resp.: {s.guardian_name})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Nome completo *</label>
                    <input
                      type="text"
                      required
                      value={pForm.full_name}
                      onChange={(e) => setPForm({ ...pForm, full_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Data de nascimento *</label>
                    <input
                      type="date"
                      required
                      value={pForm.birth_date}
                      onChange={(e) => setPForm({ ...pForm, birth_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Responsável legal *</label>
                    <input
                      type="text"
                      required
                      value={pForm.guardian_name}
                      onChange={(e) => setPForm({ ...pForm, guardian_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Telefone *</label>
                    <input
                      type="text"
                      required
                      value={pForm.contact_phone}
                      onChange={(e) => setPForm({ ...pForm, contact_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Especialidade *</label>
                  <select
                    value={pForm.specialty}
                    onChange={(e) => setPForm({ ...pForm, specialty: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Psicologia">Psicologia</option>
                    <option value="Pediatria">Pediatria</option>
                    <option value="Clínico Geral">Clínico Geral</option>
                    <option value="Fonoaudiologia">Fonoaudiologia</option>
                    <option value="Nutrição">Nutrição</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Profissional responsável *</label>
                  <input
                    type="text"
                    required
                    value={pForm.responsible_professional}
                    onChange={(e) => setPForm({ ...pForm, responsible_professional: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tipo sanguíneo</label>
                  <input
                    type="text"
                    placeholder="Ex.: O+, A-..."
                    value={pForm.blood_type}
                    onChange={(e) => setPForm({ ...pForm, blood_type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Contato de emergência</label>
                  <input
                    type="text"
                    value={pForm.emergency_contact}
                    onChange={(e) => setPForm({ ...pForm, emergency_contact: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Alergias e medicações iniciais</label>
                  <input
                    type="text"
                    value={pForm.clinical_allergies}
                    onChange={(e) => setPForm({ ...pForm, clinical_allergies: e.target.value })}
                    placeholder="Alergias conhecidas ou restrições"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Histórico clínico / Motivo inicial</label>
                  <textarea
                    rows={2}
                    value={pForm.clinical_history}
                    onChange={(e) => setPForm({ ...pForm, clinical_history: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPatientModal(false)}
                  className="py-2 px-4 border border-slate-300 rounded-lg text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white font-medium rounded-lg cursor-pointer"
                >
                  Salvar Paciente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Agendar Consulta */}
      {showAppModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">Agendar Consulta</h2>
              <button
                type="button"
                onClick={() => setShowAppModal(false)}
                className="text-xs text-slate-500 cursor-pointer"
              >
                Fechar
              </button>
            </div>
            <form onSubmit={handleSaveAppointment} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Paciente *</label>
                <select
                  required
                  value={aForm.patient_id}
                  onChange={(e) => setAForm({ ...aForm, patient_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.specialty})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Data *</label>
                  <input
                    type="date"
                    required
                    value={aForm.scheduled_date}
                    onChange={(e) => setAForm({ ...aForm, scheduled_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Horário *</label>
                  <input
                    type="time"
                    required
                    value={aForm.scheduled_time}
                    onChange={(e) => setAForm({ ...aForm, scheduled_time: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Especialidade</label>
                  <input
                    type="text"
                    required
                    value={aForm.specialty}
                    onChange={(e) => setAForm({ ...aForm, specialty: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Profissional</label>
                  <input
                    type="text"
                    required
                    value={aForm.professional_name}
                    onChange={(e) => setAForm({ ...aForm, professional_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={aForm.is_return}
                  onChange={(e) => setAForm({ ...aForm, is_return: e.target.checked })}
                />
                Consulta de retorno
              </label>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Observações / Encaminhamento</label>
                <input
                  type="text"
                  value={aForm.notes}
                  onChange={(e) => setAForm({ ...aForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAppModal(false)}
                  className="py-2 px-4 border border-slate-300 rounded-lg text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white font-medium rounded-lg cursor-pointer"
                >
                  Confirmar Agendamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
