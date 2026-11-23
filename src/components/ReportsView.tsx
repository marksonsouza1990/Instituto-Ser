import { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Filter,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { exportToExcelCSV, exportToPDF, formatBRL, formatDateBR } from '../lib/format';
import { FINANCE_ROLES, HEALTH_ROLES, type UserRole } from '../types';

type ReportKey =
  | 'criancas'
  | 'familias'
  | 'atendimentos'
  | 'projetos'
  | 'financeiro'
  | 'doacoes'
  | 'voluntarios'
  | 'investimentos'
  | 'impacto';

const REPORT_LIST: { id: ReportKey; label: string; defaultTitle: string }[] = [
  { id: 'criancas', label: 'Crianças atendidas', defaultTitle: 'Relatório de Crianças Atendidas' },
  { id: 'familias', label: 'Famílias assistidas', defaultTitle: 'Relatório de Famílias Assistidas' },
  { id: 'atendimentos', label: 'Atendimentos realizados', defaultTitle: 'Relatório de Atendimentos Realizados' },
  { id: 'projetos', label: 'Evolução dos projetos', defaultTitle: 'Evolução dos Projetos Sociais' },
  { id: 'financeiro', label: 'Receitas e despesas', defaultTitle: 'Demonstrativo de Receitas e Despesas' },
  { id: 'doacoes', label: 'Doações recebidas', defaultTitle: 'Relatório de Doações Recebidas' },
  { id: 'voluntarios', label: 'Horas voluntárias', defaultTitle: 'Relatório de Horas Voluntárias' },
  {
    id: 'investimentos',
    label: 'Investimentos por projeto',
    defaultTitle: 'Prestação de Contas — Investimentos por Projeto',
  },
  {
    id: 'impacto',
    label: 'Indicadores de impacto social',
    defaultTitle: 'Indicadores de Impacto Social — Instituto SER',
  },
];

interface ReportsPayload {
  startDate: string;
  endDate: string;
  students: {
    id: number;
    full_name: string;
    birth_date: string;
    school_name: string;
    school_year: string;
    school_shift?: string;
    status: string;
    entry_date: string;
    programs_json: string;
    attendance_rate: number | null;
  }[];
  families: {
    id: number;
    responsible_name: string;
    neighborhood: string;
    household_size: number;
    family_income: number;
    vulnerability_level: string;
    student_count: number;
  }[];
  appointments: {
    id: number;
    patient_name: string;
    specialty: string;
    professional_name: string;
    scheduled_date: string;
    status: string;
  }[];
  projects: {
    id: number;
    name: string;
    manager_name: string;
    planned_budget: number;
    period_received: number;
    period_spent: number;
    beneficiaries_count: number;
    target_beneficiaries: number;
    impact_indicator_label: string;
    impact_indicator_value: string;
    status: string;
  }[];
  transactions: {
    id: number;
    type: string;
    description: string;
    category: string;
    amount: number;
    status: string;
    issue_date: string;
    payment_method?: string;
    cost_center?: string;
    project_name: string | null;
    supplier_name: string | null;
    donor_name: string | null;
  }[];
  donations: {
    id: number;
    description: string;
    donor_name: string | null;
    donor_type: string | null;
    donor_frequency?: string | null;
    project_name: string | null;
    amount: number;
    issue_date: string;
    status: string;
  }[];
  volunteerHours: {
    id: number;
    volunteer_name: string;
    area: string;
    project_name: string | null;
    activity_date: string;
    hours: number;
    activity_description: string;
  }[];
}

export function ReportsView({ role }: { role: UserRole }) {
  const [selected, setSelected] = useState<ReportKey>('criancas');
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-12-31');
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtro global & por relatório
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [projectFilter, setProjectFilter] = useState('Todos');
  const [secondaryFilter, setSecondaryFilter] = useState('Todos');
  const [tertiaryFilter, setTertiaryFilter] = useState('Todos');

  // Filtro do cabeçalho & colunas do relatório
  const [showHeaderFilter, setShowHeaderFilter] = useState(false);
  const [customHeaderTitle, setCustomHeaderTitle] = useState('');
  const [customHeaderSubtitle, setCustomHeaderSubtitle] = useState('Prestação de Contas Instituto SER');
  const [hiddenColsByReport, setHiddenColsByReport] = useState<Partial<Record<ReportKey, string[]>>>({});

  const canSeeFinance = FINANCE_ROLES.includes(role);
  const canSeeHealth = HEALTH_ROLES.includes(role);

  useEffect(() => {
    setLoading(true);
    apiRequest<ReportsPayload>(`/api/reports?startDate=${startDate}&endDate=${endDate}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  function resetReportFilters() {
    setSearchText('');
    setStatusFilter('Todos');
    setProjectFilter('Todos');
    setSecondaryFilter('Todos');
    setTertiaryFilter('Todos');
  }

  function handleSelectReport(id: ReportKey) {
    setSelected(id);
    resetReportFilters();
    setCustomHeaderTitle('');
  }

  function toggleColumn(header: string) {
    setHiddenColsByReport((prev) => {
      const currentHidden = prev[selected] || [];
      const nextHidden = currentHidden.includes(header)
        ? currentHidden.filter((h) => h !== header)
        : [...currentHidden, header];
      return { ...prev, [selected]: nextHidden };
    });
  }

  function buildRawTable(): { title: string; headers: string[]; rows: (string | number)[][] } {
    if (!data) return { title: '', headers: [], rows: [] };
    const q = searchText.trim().toLowerCase();

    switch (selected) {
      case 'criancas': {
        const filtered = data.students.filter((s) => {
          let progs: string[] = [];
          try {
            progs = JSON.parse(s.programs_json || '[]');
          } catch {
            progs = [];
          }
          if (statusFilter !== 'Todos' && s.status !== statusFilter) return false;
          if (secondaryFilter !== 'Todos' && !progs.includes(secondaryFilter)) return false;
          if (tertiaryFilter !== 'Todos' && (s.school_shift || 'Manhã') !== tertiaryFilter) return false;
          if (projectFilter !== 'Todos' && s.school_name !== projectFilter) return false;
          if (q) {
            const hay = `${s.full_name} ${s.school_name} ${s.school_year} ${progs.join(' ')} ${s.status}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        return {
          title: 'Relatório de Crianças Atendidas',
          headers: ['Aluno', 'Nascimento', 'Escola / Ano', 'Turno', 'Programas', 'Ingresso', 'Frequência', 'Status'],
          rows: filtered.map((s) => {
            let progs: string[] = [];
            try {
              progs = JSON.parse(s.programs_json || '[]');
            } catch {
              progs = [];
            }
            return [
              s.full_name,
              formatDateBR(s.birth_date),
              `${s.school_name} (${s.school_year})`,
              s.school_shift || 'Manhã',
              progs.join(', ') || '—',
              formatDateBR(s.entry_date),
              s.attendance_rate != null ? `${s.attendance_rate}%` : '—',
              s.status,
            ];
          }),
        };
      }
      case 'familias': {
        const filtered = data.families.filter((f) => {
          if (statusFilter !== 'Todos' && f.vulnerability_level !== statusFilter) return false;
          if (secondaryFilter !== 'Todos' && f.neighborhood !== secondaryFilter) return false;
          if (tertiaryFilter === 'ate_1500' && f.family_income > 1500) return false;
          if (tertiaryFilter === '1501_2500' && (f.family_income <= 1500 || f.family_income > 2500)) return false;
          if (tertiaryFilter === 'acima_2500' && f.family_income <= 2500) return false;
          if (q) {
            const hay = `${f.responsible_name} ${f.neighborhood} ${f.vulnerability_level}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        return {
          title: 'Relatório de Famílias Assistidas',
          headers: ['Responsável', 'Bairro', 'Moradores', 'Renda Familiar', 'Vulnerabilidade', 'Crianças'],
          rows: filtered.map((f) => [
            f.responsible_name,
            f.neighborhood,
            f.household_size,
            formatBRL(f.family_income),
            f.vulnerability_level,
            f.student_count,
          ]),
        };
      }
      case 'atendimentos': {
        const filtered = data.appointments.filter((a) => {
          if (statusFilter !== 'Todos' && a.status !== statusFilter) return false;
          if (secondaryFilter !== 'Todos' && a.specialty !== secondaryFilter) return false;
          if (tertiaryFilter !== 'Todos' && a.professional_name !== tertiaryFilter) return false;
          if (q) {
            const hay = `${a.patient_name} ${a.specialty} ${a.professional_name} ${a.status}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        return {
          title: 'Relatório de Atendimentos Realizados',
          headers: ['Data', 'Paciente', 'Especialidade', 'Profissional', 'Situação'],
          rows: filtered.map((a) => [
            formatDateBR(a.scheduled_date),
            a.patient_name,
            a.specialty,
            a.professional_name,
            a.status,
          ]),
        };
      }
      case 'projetos': {
        const filtered = data.projects.filter((p) => {
          if (statusFilter !== 'Todos' && p.status !== statusFilter) return false;
          if (secondaryFilter !== 'Todos' && p.manager_name !== secondaryFilter) return false;
          if (q) {
            const hay = `${p.name} ${p.manager_name} ${p.impact_indicator_label} ${p.status}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        return {
          title: 'Evolução dos Projetos Sociais',
          headers: ['Projeto', 'Coordenação', 'Beneficiários', 'Meta', 'Indicador', 'Status'],
          rows: filtered.map((p) => [
            p.name,
            p.manager_name,
            p.beneficiaries_count,
            p.target_beneficiaries,
            `${p.impact_indicator_label}: ${p.impact_indicator_value}`,
            p.status,
          ]),
        };
      }
      case 'financeiro': {
        const filtered = data.transactions.filter((t) => {
          if (statusFilter !== 'Todos' && t.status !== statusFilter) return false;
          if (secondaryFilter !== 'Todos' && t.type !== secondaryFilter) return false;
          if (tertiaryFilter !== 'Todos' && t.category !== tertiaryFilter) return false;
          if (projectFilter !== 'Todos' && (t.project_name || 'Institucional') !== projectFilter) return false;
          if (q) {
            const hay = `${t.description} ${t.category} ${t.project_name || ''} ${t.supplier_name || ''} ${t.donor_name || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        return {
          title: 'Demonstrativo de Receitas e Despesas',
          headers: ['Data', 'Tipo', 'Descrição', 'Categoria', 'Projeto', 'Forma Pgto', 'Status', 'Valor'],
          rows: filtered.map((t) => [
            formatDateBR(t.issue_date),
            t.type === 'receita' ? 'Receita' : 'Despesa',
            t.description,
            t.category,
            t.project_name || 'Institucional',
            t.payment_method || '—',
            t.status,
            formatBRL(t.amount),
          ]),
        };
      }
      case 'doacoes': {
        const filtered = data.donations.filter((d) => {
          if (statusFilter !== 'Todos' && d.status !== statusFilter) return false;
          if (secondaryFilter !== 'Todos' && (d.donor_type || 'Evento / Avulso') !== secondaryFilter) return false;
          if (projectFilter !== 'Todos' && (d.project_name || 'Geral') !== projectFilter) return false;
          if (q) {
            const hay = `${d.donor_name || d.description} ${d.donor_type || ''} ${d.project_name || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        return {
          title: 'Relatório de Doações Recebidas',
          headers: ['Data', 'Doador / Origem', 'Tipo', 'Frequência', 'Projeto', 'Status', 'Valor'],
          rows: filtered.map((d) => [
            formatDateBR(d.issue_date),
            d.donor_name || d.description,
            d.donor_type || 'Evento / Avulso',
            d.donor_frequency || 'Única',
            d.project_name || 'Geral',
            d.status,
            formatBRL(d.amount),
          ]),
        };
      }
      case 'voluntarios': {
        const filtered = data.volunteerHours.filter((v) => {
          if (secondaryFilter !== 'Todos' && v.volunteer_name !== secondaryFilter) return false;
          if (tertiaryFilter !== 'Todos' && v.area !== tertiaryFilter) return false;
          if (projectFilter !== 'Todos' && (v.project_name || 'Geral') !== projectFilter) return false;
          if (q) {
            const hay = `${v.volunteer_name} ${v.area} ${v.project_name || ''} ${v.activity_description}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        return {
          title: 'Relatório de Horas Voluntárias',
          headers: ['Data', 'Voluntário', 'Área', 'Projeto', 'Atividade', 'Horas'],
          rows: filtered.map((v) => [
            formatDateBR(v.activity_date),
            v.volunteer_name,
            v.area,
            v.project_name || 'Geral',
            v.activity_description,
            `${v.hours}h`,
          ]),
        };
      }
      case 'investimentos': {
        const filtered = data.projects.filter((p) => {
          if (statusFilter !== 'Todos' && p.status !== statusFilter) return false;
          if (projectFilter !== 'Todos' && p.name !== projectFilter) return false;
          const balance = p.period_received - p.period_spent;
          if (secondaryFilter === 'positivo' && balance <= 0) return false;
          if (secondaryFilter === 'negativo' && balance > 0) return false;
          if (q) {
            const hay = `${p.name} ${p.manager_name} ${p.status}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        return {
          title: 'Prestação de Contas — Investimentos por Projeto',
          headers: ['Projeto', 'Status', 'Orçamento Previsto', 'Recebido no Período', 'Investido no Período', 'Saldo'],
          rows: filtered.map((p) => [
            p.name,
            p.status,
            formatBRL(p.planned_budget),
            formatBRL(p.period_received),
            formatBRL(p.period_spent),
            formatBRL(p.period_received - p.period_spent),
          ]),
        };
      }
      case 'impacto': {
        const relevantHours =
          projectFilter === 'Todos'
            ? data.volunteerHours
            : data.volunteerHours.filter((v) => (v.project_name || 'Geral') === projectFilter);
        const totalHours = relevantHours.reduce((s, h) => s + h.hours, 0);
        const totalAtt = data.appointments.filter((a) => a.status === 'Realizada').length;
        const projRows =
          projectFilter === 'Todos'
            ? data.projects
            : data.projects.filter((p) => p.name === projectFilter);

        const allIndicators: { category: string; row: (string | number)[] }[] = [
          {
            category: 'Pessoas e Famílias',
            row: [
              'Crianças e adolescentes acompanhados',
              data.students.length,
              `Período ${formatDateBR(startDate)} a ${formatDateBR(endDate)}`,
              'Pessoas e Famílias',
            ],
          },
          {
            category: 'Pessoas e Famílias',
            row: [
              'Núcleos familiares assistidos',
              data.families.length,
              'Cadastro socioassistencial ativo',
              'Pessoas e Famílias',
            ],
          },
          ...(canSeeHealth
            ? [
                {
                  category: 'Saúde',
                  row: [
                    'Consultas de psicologia e saúde realizadas',
                    totalAtt,
                    'Atendimentos concluídos no período',
                    'Saúde',
                  ],
                },
              ]
            : []),
          {
            category: 'Voluntariado e Projetos',
            row: [
              'Horas de dedicação voluntária',
              `${totalHours.toFixed(1)}h`,
              projectFilter === 'Todos'
                ? `${relevantHours.length} registros de atividade`
                : `Projeto: ${projectFilter}`,
              'Voluntariado e Projetos',
            ],
          },
          {
            category: 'Voluntariado e Projetos',
            row: [
              'Projetos sociais em operação',
              projRows.filter((p) => p.status === 'Ativo').length,
              projectFilter === 'Todos' ? 'Frentes educativas, saúde e esporte' : projectFilter,
              'Voluntariado e Projetos',
            ],
          },
        ];

        const filtered = allIndicators.filter((item) => {
          if (secondaryFilter !== 'Todos' && item.category !== secondaryFilter) return false;
          if (q && !item.row.join(' ').toLowerCase().includes(q)) return false;
          return true;
        });

        return {
          title: 'Indicadores de Impacto Social — Instituto SER',
          headers: ['Indicador Institucional', 'Resultado Apurado', 'Base / Referência', 'Eixo'],
          rows: filtered.map((i) => i.row),
        };
      }
    }
  }

  const rawTable = buildRawTable();
  const hiddenCols = hiddenColsByReport[selected] || [];
  const visibleIndices = rawTable.headers
    .map((h, idx) => ({ h, idx }))
    .filter(({ h }) => !hiddenCols.includes(h));

  // Always keep at least 1 column visible
  const effectiveIndices =
    visibleIndices.length > 0 ? visibleIndices : rawTable.headers.map((h, idx) => ({ h, idx }));

  const table = {
    title: customHeaderTitle.trim() || rawTable.title,
    headers: effectiveIndices.map((v) => v.h),
    rows: rawTable.rows.map((r) => effectiveIndices.map((v) => r[v.idx])),
  };

  function getActiveFilterSummary(): string {
    const parts: string[] = [];
    if (statusFilter !== 'Todos') parts.push(`Status/Nível: ${statusFilter}`);
    if (projectFilter !== 'Todos') parts.push(`Ref.: ${projectFilter}`);
    if (secondaryFilter !== 'Todos') parts.push(`Filtro: ${secondaryFilter}`);
    if (tertiaryFilter !== 'Todos') parts.push(`Detalhe: ${tertiaryFilter}`);
    if (searchText.trim()) parts.push(`Busca: "${searchText.trim()}"`);
    return parts.join(' · ');
  }

  async function handleExport(type: 'pdf' | 'excel') {
    const filterSummary = getActiveFilterSummary();
    const subtitle = `Período: ${formatDateBR(startDate)} a ${formatDateBR(endDate)} · ${
      customHeaderSubtitle.trim() || 'Prestação de Contas Instituto SER'
    }${filterSummary ? ` · ${filterSummary}` : ''}`;

    if (type === 'pdf') {
      exportToPDF(table.title, subtitle, table.headers, table.rows, `instituto-ser-${selected}.pdf`);
    } else {
      exportToExcelCSV(`instituto-ser-${selected}`, table.headers, table.rows);
    }
    await apiRequest('/api/audit-export', {
      method: 'POST',
      body: JSON.stringify({ reportName: table.title, format: type.toUpperCase() }),
    }).catch(() => {});
  }

  const availableReports = REPORT_LIST.filter((r) => {
    if (!canSeeFinance && ['financeiro', 'doacoes', 'investimentos'].includes(r.id)) return false;
    if (!canSeeHealth && r.id === 'atendimentos') return false;
    return true;
  });

  // Dynamic select options for active report
  const uniqueSchools = data ? Array.from(new Set(data.students.map((s) => s.school_name).filter(Boolean))).sort() : [];
  const uniquePrograms = data
    ? Array.from(
        new Set(
          data.students.flatMap((s) => {
            try {
              return JSON.parse(s.programs_json || '[]') as string[];
            } catch {
              return [];
            }
          })
        )
      ).sort()
    : [];
  const uniqueNeighborhoods = data
    ? Array.from(new Set(data.families.map((f) => f.neighborhood).filter(Boolean))).sort()
    : [];
  const uniqueAppSpecialties = data
    ? Array.from(new Set(data.appointments.map((a) => a.specialty).filter(Boolean))).sort()
    : [];
  const uniqueAppProfessionals = data
    ? Array.from(new Set(data.appointments.map((a) => a.professional_name).filter(Boolean))).sort()
    : [];
  const uniqueManagers = data
    ? Array.from(new Set(data.projects.map((p) => p.manager_name).filter(Boolean))).sort()
    : [];
  const uniqueTxCategories = data
    ? Array.from(new Set(data.transactions.map((t) => t.category).filter(Boolean))).sort()
    : [];
  const uniqueTxProjects = data
    ? Array.from(new Set(data.transactions.map((t) => t.project_name || 'Institucional'))).sort()
    : [];
  const uniqueDonationTypes = data
    ? Array.from(new Set(data.donations.map((d) => d.donor_type || 'Evento / Avulso'))).sort()
    : [];
  const uniqueDonationProjects = data
    ? Array.from(new Set(data.donations.map((d) => d.project_name || 'Geral'))).sort()
    : [];
  const uniqueVolunteers = data
    ? Array.from(new Set(data.volunteerHours.map((v) => v.volunteer_name).filter(Boolean))).sort()
    : [];
  const uniqueVolAreas = data
    ? Array.from(new Set(data.volunteerHours.map((v) => v.area).filter(Boolean))).sort()
    : [];
  const uniqueVolProjects = data
    ? Array.from(new Set(data.volunteerHours.map((v) => v.project_name || 'Geral'))).sort()
    : [];

  const hasActiveFilter =
    Boolean(searchText) ||
    statusFilter !== 'Todos' ||
    projectFilter !== 'Todos' ||
    secondaryFilter !== 'Todos' ||
    tertiaryFilter !== 'Todos';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Relatórios e Prestação de Contas
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Relatórios gerenciais integrados à base oficial do Instituto SER com filtros avançados, cabeçalho configurável e exportação em PDF/Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHeaderFilter((v) => !v)}
            className={`inline-flex items-center gap-1.5 py-2 px-3 border text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap ${
              showHeaderFilter
                ? 'border-[#144A47] bg-[#F7F5F0] text-[#144A47]'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Cabeçalho e Colunas
          </button>
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            Exportar PDF
          </button>
          <button
            type="button"
            onClick={() => handleExport('excel')}
            className="inline-flex items-center gap-1.5 py-2 px-4 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Report selector & Complete Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {availableReports.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleSelectReport(r.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                selected === r.id
                  ? 'bg-[#144A47] text-white'
                  : 'bg-[#F7F5F0] text-[#182424]/80 hover:bg-[#EFECE4]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Date Range + Search + Report-Specific Filters */}
        <div className="pt-3 border-t border-slate-100 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#144A47]" />
              Filtros do Relatório ({REPORT_LIST.find((r) => r.id === selected)?.label})
            </span>
            <div className="flex items-center gap-3">
              <span className="text-slate-500 tabular-nums">
                Exibindo {table.rows.length} registros filtrados
              </span>
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={resetReportFilters}
                  className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-slate-500 shrink-0">De:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-slate-500 shrink-0">Até:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="relative lg:col-span-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Buscar por nome, descrição, escola, projeto..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg"
              />
            </div>

            {selected === 'criancas' && (
              <>
                <select
                  value={secondaryFilter}
                  onChange={(e) => setSecondaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Programa: Todos</option>
                  {uniquePrograms.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Status: Todos</option>
                  <option value="ativo">Ativo</option>
                  <option value="aguardando_vaga">Aguardando vaga</option>
                  <option value="inativo">Inativo</option>
                  <option value="desligado">Desligado</option>
                </select>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Escola: Todas</option>
                  {uniqueSchools.map((sc) => (
                    <option key={sc} value={sc}>
                      {sc}
                    </option>
                  ))}
                </select>
                <select
                  value={tertiaryFilter}
                  onChange={(e) => setTertiaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Turno: Todos</option>
                  <option value="Manhã">Manhã</option>
                  <option value="Tarde">Tarde</option>
                  <option value="Integral">Integral</option>
                  <option value="Noite">Noite</option>
                </select>
              </>
            )}

            {selected === 'familias' && (
              <>
                <select
                  value={secondaryFilter}
                  onChange={(e) => setSecondaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Bairro: Todos</option>
                  {uniqueNeighborhoods.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Vulnerabilidade: Todas</option>
                  <option value="Baixa">Baixa</option>
                  <option value="Moderada">Moderada</option>
                  <option value="Alta">Alta</option>
                  <option value="Extrema">Extrema</option>
                </select>
                <select
                  value={tertiaryFilter}
                  onChange={(e) => setTertiaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Faixa de Renda: Todas</option>
                  <option value="ate_1500">Até R$ 1.500</option>
                  <option value="1501_2500">R$ 1.501 a R$ 2.500</option>
                  <option value="acima_2500">Acima de R$ 2.500</option>
                </select>
              </>
            )}

            {selected === 'atendimentos' && (
              <>
                <select
                  value={secondaryFilter}
                  onChange={(e) => setSecondaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Especialidade: Todas</option>
                  {uniqueAppSpecialties.map((sp) => (
                    <option key={sp} value={sp}>
                      {sp}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Situação: Todas</option>
                  <option value="Realizada">Realizada</option>
                  <option value="Agendada">Agendada</option>
                  <option value="Retorno Agendado">Retorno Agendado</option>
                  <option value="Falta">Falta</option>
                  <option value="Cancelada">Cancelada</option>
                </select>
                <select
                  value={tertiaryFilter}
                  onChange={(e) => setTertiaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Profissional: Todos</option>
                  {uniqueAppProfessionals.map((pr) => (
                    <option key={pr} value={pr}>
                      {pr}
                    </option>
                  ))}
                </select>
              </>
            )}

            {selected === 'projetos' && (
              <>
                <select
                  value={secondaryFilter}
                  onChange={(e) => setSecondaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Coordenação: Todas</option>
                  {uniqueManagers.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Status: Todos</option>
                  <option value="Ativo">Ativo</option>
                  <option value="Planejamento">Planejamento</option>
                  <option value="Pausado">Pausado</option>
                  <option value="Concluído">Concluído</option>
                </select>
              </>
            )}

            {selected === 'financeiro' && (
              <>
                <select
                  value={secondaryFilter}
                  onChange={(e) => setSecondaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Tipo: Receitas e Despesas</option>
                  <option value="receita">Somente Receitas</option>
                  <option value="despesa">Somente Despesas</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Status: Todos</option>
                  <option value="Recebido">Recebido</option>
                  <option value="Pago">Pago</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Vencido">Vencido</option>
                </select>
                <select
                  value={tertiaryFilter}
                  onChange={(e) => setTertiaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Categoria: Todas</option>
                  {uniqueTxCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Projeto: Todos</option>
                  {uniqueTxProjects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </>
            )}

            {selected === 'doacoes' && (
              <>
                <select
                  value={secondaryFilter}
                  onChange={(e) => setSecondaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Tipo de Doador: Todos</option>
                  {uniqueDonationTypes.map((dt) => (
                    <option key={dt} value={dt}>
                      {dt}
                    </option>
                  ))}
                </select>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Projeto: Todos</option>
                  {uniqueDonationProjects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Status: Todos</option>
                  <option value="Recebido">Recebido</option>
                  <option value="Pendente">Pendente</option>
                </select>
              </>
            )}

            {selected === 'voluntarios' && (
              <>
                <select
                  value={secondaryFilter}
                  onChange={(e) => setSecondaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Voluntário: Todos</option>
                  {uniqueVolunteers.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  value={tertiaryFilter}
                  onChange={(e) => setTertiaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Área: Todas</option>
                  {uniqueVolAreas.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Projeto: Todos</option>
                  {uniqueVolProjects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </>
            )}

            {selected === 'investimentos' && (
              <>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Projeto: Todos</option>
                  {(data?.projects || []).map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Status: Todos</option>
                  <option value="Ativo">Ativo</option>
                  <option value="Planejamento">Planejamento</option>
                  <option value="Pausado">Pausado</option>
                  <option value="Concluído">Concluído</option>
                </select>
                <select
                  value={secondaryFilter}
                  onChange={(e) => setSecondaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Saldo: Todos</option>
                  <option value="positivo">Saldo Positivo</option>
                  <option value="negativo">Saldo Zerado / Negativo</option>
                </select>
              </>
            )}

            {selected === 'impacto' && (
              <>
                <select
                  value={secondaryFilter}
                  onChange={(e) => setSecondaryFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Eixo: Todos</option>
                  <option value="Pessoas e Famílias">Pessoas e Famílias</option>
                  {canSeeHealth && <option value="Saúde">Saúde</option>}
                  <option value="Voluntariado e Projetos">Voluntariado e Projetos</option>
                </select>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Todos">Projeto: Todos</option>
                  {(data?.projects || []).map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        {/* Header & Column Customization Panel */}
        {showHeaderFilter && (
          <div className="pt-3 border-t border-slate-100 space-y-3 text-xs">
            <div className="font-semibold text-slate-800">
              Filtro do Cabeçalho e Colunas Visíveis na Visualização, PDF e Excel
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Título Personalizado do Cabeçalho
                </label>
                <input
                  type="text"
                  value={customHeaderTitle}
                  onChange={(e) => setCustomHeaderTitle(e.target.value)}
                  placeholder={rawTable.title}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Subtítulo / Observação do Cabeçalho (PDF)
                </label>
                <input
                  type="text"
                  value={customHeaderSubtitle}
                  onChange={(e) => setCustomHeaderSubtitle(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <div className="font-medium text-slate-700 mb-1.5">Colunas incluídas no relatório:</div>
              <div className="flex flex-wrap gap-2">
                {rawTable.headers.map((header) => {
                  const checked = !hiddenCols.includes(header);
                  return (
                    <label
                      key={header}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#E5E1D8] bg-[#F7F5F0] text-slate-800 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleColumn(header)}
                      />
                      <span>{header}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">{table.title}</h2>
            <p className="text-[11px] text-slate-500">
              {customHeaderSubtitle}
              {getActiveFilterSummary() ? ` · ${getActiveFilterSummary()}` : ''}
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            {formatDateBR(startDate)} — {formatDateBR(endDate)}
          </span>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
              {table.headers.map((h) => (
                <th key={h} className="py-3 px-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={table.headers.length} className="py-8 text-center text-slate-400">
                  Gerando dados do relatório...
                </td>
              </tr>
            ) : table.rows.length === 0 ? (
              <tr>
                <td colSpan={table.headers.length} className="py-8 text-center text-slate-400">
                  Nenhum registro encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              table.rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="py-3 px-4 text-slate-800 tabular-nums">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
