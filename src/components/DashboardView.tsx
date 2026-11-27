import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  FileWarning,
  Cake,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatBRL, formatDateBR, formatDateTimeBR } from '../lib/format';
import { DonutChart, GroupedBarChart, HorizontalBarChart, LineAreaChart } from './Charts';
import { FINANCE_ROLES, HEALTH_ROLES, hasAnyRole, type DashboardData, type DashboardPeriod, type RoleInput } from '../types';

const PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: 'semanal', label: 'Semanal' },
  { id: 'mensal', label: 'Mensal' },
  { id: 'trimestral', label: 'Trimestral' },
  { id: 'semestral', label: 'Semestral' },
  { id: 'anual', label: 'Anual' },
];

export function DashboardView({
  role,
  onNavigate,
}: {
  role: RoleInput;
  onNavigate: (tab: string) => void;
}) {
  const [period, setPeriod] = useState<DashboardPeriod>('mensal');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canSeeFinance = hasAnyRole(role, FINANCE_ROLES);
  const canSeeHealth = hasAnyRole(role, HEALTH_ROLES);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiRequest<DashboardData>(`/api/dashboard?period=${period}`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Erro ao carregar painel.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [period]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { kpis, charts, feeds } = data;

  const kpiCards: { label: string; value: string; sub: string; highlight?: 'positive' | 'negative' }[] = [
    { label: 'Total de alunos cadastrados', value: String(kpis.totalStudents), sub: 'Base institucional' },
    { label: 'Total de alunos ativos', value: String(kpis.activeStudents), sub: 'Matriculados em atividades' },
    ...(canSeeHealth
      ? [{ label: 'Total de pacientes cadastrados', value: String(kpis.totalPatients), sub: 'Psicologia e medicina' }]
      : []),
    {
      label: 'Atendimentos realizados no período',
      value: String(kpis.periodAttendances),
      sub: canSeeHealth ? 'Saúde + presenças' : 'Presenças em atividades',
    },
    { label: 'Famílias assistidas', value: String(kpis.assistedFamilies), sub: 'Núcleos familiares ativos' },
    { label: 'Voluntários ativos', value: String(kpis.activeVolunteers), sub: 'Equipe e apoiadores' },
    { label: 'Doadores ativos', value: String(kpis.activeDonors), sub: 'Mantenedores e editais' },
    ...(canSeeFinance
      ? [
          {
            label: 'Recursos recebidos no período',
            value: formatBRL(kpis.periodRevenue),
            sub: 'Receitas liquidadas',
          },
          {
            label: 'Despesas no período',
            value: formatBRL(kpis.periodExpenses),
            sub: 'Despesas liquidadas',
          },
          {
            label: 'Saldo financeiro disponível',
            value: formatBRL(kpis.availableBalance),
            sub: 'Caixa consolidado atual',
            highlight: (kpis.availableBalance >= 0 ? 'positive' : 'negative') as 'positive' | 'negative',
          },
        ]
      : []),
    ...(canSeeHealth
      ? [{ label: 'Atendimentos pendentes', value: String(kpis.pendingAttendances), sub: 'Consultas e retornos agendados' }]
      : []),
    { label: 'Crianças beneficiadas', value: String(kpis.benefitedChildren), sub: 'Ativas e em fila de vaga' },
  ];

  return (
    <div className="space-y-8">
      {/* Header & Period Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Painel Executivo — Instituto SER
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Indicadores calculados em tempo real a partir dos registros institucionais.
          </p>
        </div>

        <div
          className="inline-flex items-center gap-1 p-1 bg-[#EFECE4] border border-[#E5E1D8] rounded-lg self-start"
          role="group"
          aria-label="Filtro por período"
        >
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                period === p.id
                  ? 'bg-white text-[#144A47] shadow-xs'
                  : 'text-[#556262] hover:text-[#182424]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 12 KPI Cards */}
      <section aria-label="Indicadores principais">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((card) => (
            <div
              key={card.label}
              className="bg-white border border-[#E5E1D8] rounded-xl p-4 flex flex-col justify-between"
            >
              <span className="text-xs font-medium text-[#556262]">{card.label}</span>
              <div
                className={`mt-2 text-2xl font-display font-bold tabular-nums ${
                  card.highlight === 'positive'
                    ? 'text-[#6F873D]'
                    : card.highlight === 'negative'
                      ? 'text-[#BD4B22]'
                      : 'text-[#182424]'
                }`}
              >
                {card.value}
              </div>
              <span className="mt-1.5 text-[11px] text-[#556262]/80">{card.sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 8 Interactive Charts */}
      <section aria-label="Gráficos analíticos" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
          <div className="mb-3">
            <h2 className="font-display text-sm font-semibold text-[#182424]">
              01. Evolução mensal de crianças atendidas
            </h2>
            <p className="text-xs text-[#556262]">Crescimento acumulado de alunos integrados</p>
          </div>
          <LineAreaChart
            data={charts.monthlyChildrenEvolution.map((d) => ({ label: d.label, value: d.count }))}
            color="#0E5A75"
          />
        </div>

        <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
          <div className="mb-3">
            <h2 className="font-display text-sm font-semibold text-[#182424]">
              02. Atendimentos por modalidade
            </h2>
            <p className="text-xs text-[#556262]">Distribuição ativa nos programas do Instituto</p>
          </div>
          <HorizontalBarChart
            data={charts.attendancesByModality.map((d) => ({ label: d.modality, value: d.count }))}
            color="#0E5A75"
          />
        </div>

        {canSeeFinance && (
          <>
            <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
              <div className="mb-3">
                <h2 className="font-display text-sm font-semibold text-[#182424]">
                  03. Evolução das receitas e despesas
                </h2>
                <p className="text-xs text-[#556262]">Comparativo mensal em reais (R$)</p>
              </div>
              <GroupedBarChart
                data={charts.revenueVsExpenses.map((d) => ({
                  label: d.label,
                  a: d.revenue,
                  b: d.expenses,
                }))}
                seriesA={{ name: 'Receitas', color: '#6F873D' }}
                seriesB={{ name: 'Despesas', color: '#BD4B22' }}
                isCurrency
              />
            </div>

            <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
              <div className="mb-3">
                <h2 className="font-display text-sm font-semibold text-[#182424]">
                  04. Distribuição das despesas por categoria
                </h2>
                <p className="text-xs text-[#556262]">Alocação dos recursos aplicados no período</p>
              </div>
              <DonutChart data={charts.expensesByCategory} />
            </div>

            <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
              <div className="mb-3">
                <h2 className="font-display text-sm font-semibold text-[#182424]">
                  05. Evolução das doações recebidas
                </h2>
                <p className="text-xs text-[#556262]">Captação mensal de apoiadores e editais</p>
              </div>
              <LineAreaChart
                data={charts.donationsEvolution.map((d) => ({ label: d.label, value: d.amount }))}
                color="#6F873D"
                isCurrency
              />
            </div>
          </>
        )}

        {canSeeHealth && (
          <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
            <div className="mb-3">
              <h2 className="font-display text-sm font-semibold text-[#182424]">
                06. Atendimentos psicológicos e médicos
              </h2>
              <p className="text-xs text-[#556262]">Consultas realizadas por frente clínica</p>
            </div>
            <GroupedBarChart
              data={charts.healthAttendances.map((d) => ({
                label: d.label,
                a: d.psicologia,
                b: d.medico,
              }))}
              seriesA={{ name: 'Psicologia', color: '#0E5A75' }}
              seriesB={{ name: 'Médico / Pediatria', color: '#6F873D' }}
            />
          </div>
        )}

        <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
          <div className="mb-3">
            <h2 className="font-display text-sm font-semibold text-[#182424]">
              07. Evolução de famílias assistidas
            </h2>
            <p className="text-xs text-[#556262]">Núcleos familiares acompanhados ao longo dos meses</p>
          </div>
          <LineAreaChart
            data={charts.familiesEvolution.map((d) => ({ label: d.label, value: d.count }))}
            color="#144A47"
          />
        </div>

        <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
          <div className="mb-3">
            <h2 className="font-display text-sm font-semibold text-[#182424]">
              08. Evolução do impacto social
            </h2>
            <p className="text-xs text-[#556262]">
              Índice composto por alunos ativos, atendimentos e horas voluntárias
            </p>
          </div>
          <LineAreaChart
            data={charts.socialImpactEvolution.map((d) => ({
              label: d.label,
              value: d.score,
              secondary: `${d.attendances} atend. · ${d.volunteerHours}h vol.`,
            }))}
            color="#EBB428"
          />
        </div>
      </section>

      {/* Operational Feeds & Alerts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alertas de Contas a Pagar (Somente Admin e Financeiro) */}
        {canSeeFinance && (
          <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-sm font-semibold text-[#182424] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#C79112]" />
                Alertas de contas a pagar
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('financeiro')}
                className="text-xs text-[#0E5A75] hover:underline font-medium cursor-pointer"
              >
                Ver financeiro
              </button>
            </div>
            {feeds.payableAlerts.length === 0 ? (
              <p className="text-xs text-[#556262]">Nenhuma conta vencida ou pendente.</p>
            ) : (
              <ul className="divide-y divide-[#E5E1D8]/70">
                {feeds.payableAlerts.map((tx) => (
                  <li key={tx.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-[#182424] truncate">{tx.description}</div>
                      <div className="text-[#556262] mt-0.5">
                        Venc.: {formatDateBR(tx.due_date)} ·{' '}
                        <span className={tx.status === 'Vencido' ? 'text-[#BD4B22] font-semibold' : 'text-[#B47B08] font-medium'}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-[#182424] tabular-nums shrink-0">
                      {formatBRL(tx.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Alertas de Documentos Pendentes */}
        <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold text-[#182424] flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-[#BD4B22]" />
              Documentos pendentes (LGPD)
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('documentos')}
              className="text-xs text-[#0E5A75] hover:underline font-medium cursor-pointer"
            >
              Anexar
            </button>
          </div>
          {feeds.pendingDocumentsAlerts.length === 0 ? (
            <p className="text-xs text-[#556262]">Todos os alunos ativos possuem termo anexado.</p>
          ) : (
            <ul className="divide-y divide-[#E5E1D8]/70">
              {feeds.pendingDocumentsAlerts.map((item) => (
                <li key={item.student_id} className="py-2.5 text-xs">
                  <div className="font-medium text-[#182424]">{item.student_name}</div>
                  <div className="text-[#BD4B22] mt-0.5">{item.missing}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Aniversariantes do Mês */}
        <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold text-[#182424] flex items-center gap-2">
              <Cake className="w-4 h-4 text-[#144A47]" />
              Aniversariantes do mês
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('alunos')}
              className="text-xs text-[#0E5A75] hover:underline font-medium cursor-pointer"
            >
              Ver alunos
            </button>
          </div>
          {feeds.monthlyBirthdays.length === 0 ? (
            <p className="text-xs text-[#556262]">Nenhum aniversariante registrado neste mês.</p>
          ) : (
            <ul className="divide-y divide-[#E5E1D8]/70">
              {feeds.monthlyBirthdays.map((b) => (
                <li key={`${b.type}-${b.id}`} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-medium text-[#182424]">{b.name}</div>
                    <div className="text-[#556262]">{b.type}</div>
                  </div>
                  <span className="font-mono text-[#182424] tabular-nums">
                    {formatDateBR(b.birth_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Últimas Movimentações Financeiras (Somente Admin e Financeiro) */}
        {canSeeFinance && (
          <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-sm font-semibold text-[#182424]">
                Últimas movimentações financeiras
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('financeiro')}
                className="text-xs text-[#0E5A75] hover:underline font-medium cursor-pointer"
              >
                Abrir módulo
              </button>
            </div>
            <ul className="divide-y divide-[#E5E1D8]/70">
              {feeds.recentTransactions.map((tx) => (
                <li key={tx.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {tx.type === 'receita' ? (
                      <ArrowUpRight className="w-4 h-4 text-[#6F873D] shrink-0" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-[#BD4B22] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-[#182424] truncate">{tx.description}</div>
                      <div className="text-[#556262]">
                        {formatDateBR(tx.issue_date)} · {tx.category} · {tx.status}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`font-mono font-semibold tabular-nums shrink-0 ${
                      tx.type === 'receita' ? 'text-[#6F873D]' : 'text-[#182424]'
                    }`}
                  >
                    {tx.type === 'receita' ? '+' : '-'} {formatBRL(tx.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Próximos Atendimentos Agendados (Somente Saúde e Admin) */}
        {canSeeHealth && (
          <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-sm font-semibold text-[#182424]">
                Próximos atendimentos agendados
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('saude')}
                className="text-xs text-[#0E5A75] hover:underline font-medium cursor-pointer"
              >
                Ver agenda
              </button>
            </div>
            <ul className="divide-y divide-[#E5E1D8]/70">
              {feeds.upcomingAppointments.map((app) => (
                <li key={app.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-[#182424] truncate">{app.patient_name}</div>
                    <div className="text-[#556262] truncate">
                      {app.specialty} · {app.professional_name}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[#182424] tabular-nums">
                      {formatDateBR(app.scheduled_date)} · {app.scheduled_time}
                    </div>
                    <div className="text-[11px] text-[#0E5A75] font-medium">{app.status}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Próximas Atividades e Eventos */}
        <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold text-[#182424] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#144A47]" />
              Próximas atividades e eventos
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('projetos')}
              className="text-xs text-[#0E5A75] hover:underline font-medium cursor-pointer"
            >
              Projetos
            </button>
          </div>
          <ul className="divide-y divide-[#E5E1D8]/70">
            {feeds.upcomingEvents.map((ev) => (
              <li key={ev.id} className="py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[#182424]">{ev.title}</span>
                  <span className="font-mono text-[#556262] tabular-nums shrink-0">
                    {formatDateBR(ev.event_date)} · {ev.event_time}
                  </span>
                </div>
                <div className="text-[#556262] mt-0.5">
                  {ev.location}
                  {ev.project_name ? ` · ${ev.project_name}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Atividades Recentes da Instituição */}
        <div className="bg-white border border-[#E5E1D8] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold text-[#182424] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#144A47]" />
              Atividades recentes da instituição
            </h3>
          </div>
          <ul className="divide-y divide-[#E5E1D8]/70">
            {feeds.recentActivities.map((act) => (
              <li key={act.id} className="py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[#182424] truncate">{act.details}</span>
                  <span className="font-mono text-[11px] text-[#556262] tabular-nums shrink-0">
                    {formatDateTimeBR(act.created_at)}
                  </span>
                </div>
                <div className="text-[#556262] mt-0.5">
                  {act.user_name} · {act.action}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
