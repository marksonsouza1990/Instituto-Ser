import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  List,
  Plus,
  Search,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { exportToPDF, formatBRL, formatDateBR, formatDateTimeBR } from '../lib/format';
import {
  FINANCE_ROLES,
  hasAnyRole,
  type Donor,
  type FinancialHistoryEntry,
  type FinancialTransaction,
  type Project,
  type RoleInput,
  type Supplier,
} from '../types';

const REVENUE_CATEGORIES = [
  'Doações individuais',
  'Doações recorrentes',
  'Contribuições de empresas',
  'Patrocínios',
  'Editais e projetos',
  'Eventos beneficentes',
  'Outras receitas',
];

const EXPENSE_CATEGORIES = [
  'Fornecedores',
  'Alimentação',
  'Materiais escolares',
  'Materiais esportivos',
  'Profissionais e serviços',
  'Despesas administrativas',
  'Saúde',
  'Transporte',
  'Infraestrutura',
  'Outras despesas',
];

const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1, 12, 0, 0));
}

function formatUTCISO(dt: Date): string {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

function diffDaysISO(fromISO: string, toISO: string): number {
  const a = parseUTC(fromISO).getTime();
  const b = parseUTC(toISO).getTime();
  return Math.round((b - a) / 86_400_000);
}

function addDaysISO(dateStr: string, days: number): string {
  const dt = parseUTC(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatUTCISO(dt);
}

function addMonthsISO(dateStr: string, months: number): string {
  const dt = parseUTC(dateStr);
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return formatUTCISO(dt);
}

function getMonthGrid(anchorDate: string): { date: string; inMonth: boolean }[] {
  const dt = parseUTC(anchorDate);
  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1, 12, 0, 0));
  const last = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0));

  const firstDow = first.getUTCDay();
  const startOffset = firstDow === 0 ? -6 : 1 - firstDow;
  const start = addDaysISO(formatUTCISO(first), startOffset);

  const lastDow = last.getUTCDay();
  const endOffset = lastDow === 0 ? 0 : 7 - lastDow;
  const end = addDaysISO(formatUTCISO(last), endOffset);

  const cells: { date: string; inMonth: boolean }[] = [];
  let cursor = start;
  while (cursor <= end && cells.length < 42) {
    const cDt = parseUTC(cursor);
    cells.push({
      date: cursor,
      inMonth: cDt.getUTCMonth() === month && cDt.getUTCFullYear() === year,
    });
    cursor = addDaysISO(cursor, 1);
  }
  return cells;
}

export function FinanceView({ role }: { role: RoleInput }) {
  const todayISO = useMemo(() => getTodayISO(), []);
  const [subTab, setSubTab] = useState<
    'agenda' | 'fluxo' | 'receitas' | 'despesas' | 'contas' | 'historico'
  >('agenda');
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [history, setHistory] = useState<FinancialHistoryEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Agenda Financeira controls
  const [agendaMode, setAgendaMode] = useState<'cronograma' | 'calendario'>('cronograma');
  const [agendaWindow, setAgendaWindow] = useState<
    'pendentes' | 'vencidos' | '7dias' | '30dias' | 'todos'
  >('pendentes');
  const [agendaTypeFilter, setAgendaTypeFilter] = useState<'todos' | 'despesa' | 'receita'>('todos');
  const [agendaRecurrenceFilter, setAgendaRecurrenceFilter] = useState<string>('todas');
  const [agendaSearch, setAgendaSearch] = useState('');
  const [calendarMonthAnchor, setCalendarMonthAnchor] = useState<string>(todayISO);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string>(todayISO);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    type: 'despesa' as 'receita' | 'despesa',
    description: '',
    category: 'Alimentação',
    amount: '',
    status: 'Pendente',
    issue_date: todayISO,
    due_date: addDaysISO(todayISO, 7),
    payment_method: 'PIX',
    recurrence: 'Única',
    cost_center: 'Institucional',
    project_id: '',
    supplier_id: '',
    donor_id: '',
    receipt_ref: '',
    notes: '',
  });

  const canWrite = hasAnyRole(role, FINANCE_ROLES);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [txRes, histRes, projRes, supRes, donRes] = await Promise.all([
        apiRequest<FinancialTransaction[]>('/api/finance/transactions'),
        apiRequest<FinancialHistoryEntry[]>('/api/finance/history').catch(
          () => [] as FinancialHistoryEntry[]
        ),
        apiRequest<Project[]>('/api/projects'),
        apiRequest<Supplier[]>('/api/suppliers'),
        apiRequest<Donor[]>('/api/donors'),
      ]);
      setTransactions(txRes);
      setHistory(histRes);
      setProjects(projRes);
      setSuppliers(supRes);
      setDonors(donRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados financeiros.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiRequest('/api/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          project_id: form.project_id ? Number(form.project_id) : null,
          supplier_id: form.type === 'despesa' && form.supplier_id ? Number(form.supplier_id) : null,
          donor_id: form.type === 'receita' && form.donor_id ? Number(form.donor_id) : null,
        }),
      });
      setShowModal(false);
      setFeedback('Compromisso financeiro registrado com sucesso.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar lançamento.');
    }
  }

  async function handleSettle(id: number) {
    setError(null);
    setFeedback(null);
    try {
      await apiRequest(`/api/finance/transactions/${id}/settle`, {
        method: 'PATCH',
        body: JSON.stringify({ settlement_date: todayISO }),
      });
      setFeedback('Baixa financeira registrada e histórico atualizado.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao dar baixa.');
    }
  }

  function openNewCommitmentModal(presetType?: 'receita' | 'despesa', presetDueDate?: string) {
    const nextType = presetType || (subTab === 'receitas' ? 'receita' : 'despesa');
    setForm({
      type: nextType,
      description: '',
      category: nextType === 'receita' ? REVENUE_CATEGORIES[0] : EXPENSE_CATEGORIES[0],
      amount: '',
      status: 'Pendente',
      issue_date: todayISO,
      due_date: presetDueDate || addDaysISO(todayISO, 7),
      payment_method: 'PIX',
      recurrence: 'Única',
      cost_center: 'Institucional',
      project_id: '',
      supplier_id: '',
      donor_id: '',
      receipt_ref: '',
      notes: '',
    });
    setShowModal(true);
  }

  const totalReceived = transactions
    .filter((t) => t.type === 'receita' && t.status === 'Recebido')
    .reduce((s, t) => s + t.amount, 0);
  const totalPaid = transactions
    .filter((t) => t.type === 'despesa' && t.status === 'Pago')
    .reduce((s, t) => s + t.amount, 0);
  const balance = totalReceived - totalPaid;

  const pendingReceivable = transactions
    .filter((t) => t.type === 'receita' && t.status === 'Pendente')
    .reduce((s, t) => s + t.amount, 0);
  const pendingPayable = transactions
    .filter((t) => t.type === 'despesa' && (t.status === 'Pendente' || t.status === 'Vencido'))
    .reduce((s, t) => s + t.amount, 0);
  const projectedBalance = balance + pendingReceivable - pendingPayable;

  // Agenda Financeira metrics
  const openCommitments = useMemo(
    () =>
      transactions
        .filter((t) => t.status === 'Pendente' || t.status === 'Vencido')
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [transactions]
  );

  const overdueItems = useMemo(
    () =>
      openCommitments.filter((t) => t.status === 'Vencido' || diffDaysISO(todayISO, t.due_date) < 0),
    [openCommitments, todayISO]
  );
  const due7DaysItems = useMemo(
    () =>
      openCommitments.filter((t) => {
        const d = diffDaysISO(todayISO, t.due_date);
        return t.status !== 'Vencido' && d >= 0 && d <= 7;
      }),
    [openCommitments, todayISO]
  );
  const due30DaysItems = useMemo(
    () =>
      openCommitments.filter((t) => {
        const d = diffDaysISO(todayISO, t.due_date);
        return t.status !== 'Vencido' && d >= 0 && d <= 30;
      }),
    [openCommitments, todayISO]
  );
  const recurringOpenCount = useMemo(
    () => openCommitments.filter((t) => t.recurrence && t.recurrence !== 'Única').length,
    [openCommitments]
  );

  const filteredAgendaItems = useMemo(() => {
    const q = agendaSearch.trim().toLowerCase();
    return transactions
      .filter((tx) => {
        const isOpen = tx.status === 'Pendente' || tx.status === 'Vencido';
        const d = diffDaysISO(todayISO, tx.due_date);
        const isOverdue = tx.status === 'Vencido' || (isOpen && d < 0);

        if (agendaWindow === 'pendentes' && !isOpen) return false;
        if (agendaWindow === 'vencidos' && !isOverdue) return false;
        if (agendaWindow === '7dias' && (!isOpen || d < 0 || d > 7)) return false;
        if (agendaWindow === '30dias' && (!isOpen || d < 0 || d > 30)) return false;

        if (agendaTypeFilter !== 'todos' && tx.type !== agendaTypeFilter) return false;
        if (agendaRecurrenceFilter !== 'todas' && tx.recurrence !== agendaRecurrenceFilter) return false;

        if (q) {
          const hay = [
            tx.description,
            tx.category,
            tx.supplier_name || '',
            tx.donor_name || '',
            tx.project_name || '',
            tx.cost_center,
            tx.receipt_ref || '',
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [
    transactions,
    todayISO,
    agendaWindow,
    agendaTypeFilter,
    agendaRecurrenceFilter,
    agendaSearch,
  ]);

  const calendarCells = useMemo(() => getMonthGrid(calendarMonthAnchor), [calendarMonthAnchor]);
  const agendaByDay = useMemo(() => {
    const map = new Map<string, FinancialTransaction[]>();
    for (const tx of filteredAgendaItems) {
      const list = map.get(tx.due_date) ?? [];
      list.push(tx);
      map.set(tx.due_date, list);
    }
    return map;
  }, [filteredAgendaItems]);

  const calendarMonthDate = parseUTC(calendarMonthAnchor);
  const calendarMonthLabel = `${MONTH_NAMES[calendarMonthDate.getUTCMonth()]} de ${calendarMonthDate.getUTCFullYear()}`;
  const selectedDayCommitments = agendaByDay.get(selectedCalendarDay) ?? [];

  function exportAgendaFinanceiraPDF() {
    const headers = [
      'Vencimento',
      'Tipo',
      'Descrição',
      'Fornecedor / Doador',
      'Recorrência',
      'Status',
      'Valor (R$)',
    ];
    const rows = filteredAgendaItems.map((tx) => [
      formatDateBR(tx.due_date),
      tx.type === 'receita' ? 'A Receber' : 'A Pagar',
      tx.description,
      tx.donor_name || tx.supplier_name || tx.project_name || 'Institucional',
      tx.recurrence || 'Única',
      tx.status,
      `${tx.type === 'receita' ? '+' : '-'} ${formatBRL(tx.amount)}`,
    ]);
    exportToPDF(
      'Agenda de Compromissos Financeiros — Instituto SER',
      `${filteredAgendaItems.length} compromissos listados · Referência: ${formatDateBR(todayISO)}`,
      headers,
      rows,
      `agenda_financeira_${todayISO}`
    );
  }

  // Monthly cash flow aggregation
  const monthlyMap = new Map<string, { inflows: number; outflows: number }>();
  for (const t of transactions) {
    const ym = t.issue_date.slice(0, 7);
    const cur = monthlyMap.get(ym) || { inflows: 0, outflows: 0 };
    if (t.type === 'receita' && t.status === 'Recebido') cur.inflows += t.amount;
    if (t.type === 'despesa' && t.status === 'Pago') cur.outflows += t.amount;
    monthlyMap.set(ym, cur);
  }
  const monthlyCashflow = Array.from(monthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const filteredTx = transactions.filter((t) => {
    if (subTab === 'receitas') return t.type === 'receita';
    if (subTab === 'despesas') return t.type === 'despesa';
    if (subTab === 'contas') return t.status === 'Pendente' || t.status === 'Vencido';
    return true;
  });

  function renderUrgencyBadge(tx: FinancialTransaction) {
    if (tx.status === 'Pago' || tx.status === 'Recebido') {
      return <span className="text-[11px] font-medium text-emerald-700">{tx.status}</span>;
    }
    const diff = diffDaysISO(todayISO, tx.due_date);
    if (tx.status === 'Vencido' || diff < 0) {
      return (
        <span className="text-[11px] font-semibold text-[#BD4B22]">
          Vencido {Math.abs(diff) > 0 ? `há ${Math.abs(diff)}d` : ''}
        </span>
      );
    }
    if (diff === 0) {
      return <span className="text-[11px] font-semibold text-[#875F00]">Vence hoje</span>;
    }
    if (diff <= 7) {
      return <span className="text-[11px] font-semibold text-[#875F00]">Vence em {diff}d</span>;
    }
    return <span className="text-[11px] font-medium text-[#0E5A75]">Em {diff}d</span>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Gestão Financeira</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Agenda de compromissos e vencimentos, receitas, despesas por projeto, fluxo de caixa e trilha de alterações.
          </p>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => openNewCommitmentModal()}
            className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg cursor-pointer self-start whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Novo Lançamento / Compromisso
          </button>
        )}
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-[#EFECE4] border border-[#E5E1D8] rounded-lg w-fit">
        {[
          { id: 'agenda', label: `Agenda Financeira (${openCommitments.length})` },
          { id: 'fluxo', label: 'Fluxo de Caixa e Projeção' },
          { id: 'receitas', label: 'Receitas' },
          { id: 'despesas', label: 'Despesas' },
          { id: 'contas', label: 'Contas a Pagar e Receber' },
          { id: 'historico', label: 'Histórico de Alterações' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id as typeof subTab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
              subTab === tab.id ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
      )}
      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {feedback}
        </div>
      )}

      {/* Cash flow summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Entradas realizadas</div>
          <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-emerald-700">
            {formatBRL(totalReceived)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Saídas pagas</div>
          <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-slate-900">
            {formatBRL(totalPaid)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Saldo atual em caixa</div>
          <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-[#0E5A75]">
            {formatBRL(balance)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">A receber / A pagar</div>
          <div className="mt-1 text-sm font-mono tabular-nums text-slate-800">
            +{formatBRL(pendingReceivable)} / -{formatBRL(pendingPayable)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Saldo projetado</div>
          <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-slate-900">
            {formatBRL(projectedBalance)}
          </div>
        </div>
      </div>

      {/* Urgent reminder strip when outside agenda tab */}
      {subTab !== 'agenda' && (overdueItems.length > 0 || due7DaysItems.length > 0) && (
        <div className="bg-[#EBB428]/12 border border-[#EBB428]/45 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#182424]">
            <CalendarClock className="w-4 h-4 text-[#875F00] shrink-0" />
            <span>
              <strong>Agenda do Departamento Financeiro:</strong>{' '}
              {overdueItems.length > 0 && (
                <span className="text-[#BD4B22] font-semibold">
                  {overdueItems.length} vencido(s)
                </span>
              )}
              {overdueItems.length > 0 && due7DaysItems.length > 0 && ' · '}
              {due7DaysItems.length > 0 && (
                <span className="text-[#875F00] font-semibold">
                  {due7DaysItems.length} vencendo nos próximos 7 dias
                </span>
              )}
              .
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSubTab('agenda')}
            className="px-3 py-1.5 rounded-lg bg-[#144A47] text-white font-medium hover:bg-[#0E3735] cursor-pointer whitespace-nowrap"
          >
            Abrir Agenda Financeira
          </button>
        </div>
      )}

      {subTab === 'agenda' ? (
        <div className="space-y-4">
          {/* Urgency KPI Strip */}
          <div className="bg-white border border-[#E5E1D8] rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#E5E1D8]">
            <div className="p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#556262]">
                <AlertTriangle className="w-3.5 h-3.5 text-[#BD4B22]" />
                Em Atraso / Vencidos
              </div>
              <div className="font-mono tabular-nums text-xl font-bold text-[#BD4B22] mt-1">
                {formatBRL(overdueItems.reduce((s, t) => s + t.amount, 0))}
              </div>
              <div className="text-[11px] text-[#556262] mt-0.5 font-mono tabular-nums">
                {overdueItems.length} compromisso(s)
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#556262]">
                <Clock className="w-3.5 h-3.5 text-[#875F00]" />
                Vencem em até 7 dias
              </div>
              <div className="font-mono tabular-nums text-xl font-bold text-[#875F00] mt-1">
                {formatBRL(due7DaysItems.reduce((s, t) => s + t.amount, 0))}
              </div>
              <div className="text-[11px] text-[#556262] mt-0.5 font-mono tabular-nums">
                {due7DaysItems.length} compromisso(s)
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#556262]">
                <CalendarDays className="w-3.5 h-3.5 text-[#0E5A75]" />
                Próximos 30 dias
              </div>
              <div className="font-mono tabular-nums text-xl font-bold text-[#0E5A75] mt-1">
                {formatBRL(due30DaysItems.reduce((s, t) => s + t.amount, 0))}
              </div>
              <div className="text-[11px] text-[#556262] mt-0.5 font-mono tabular-nums">
                {due30DaysItems.length} compromisso(s) previstos
              </div>
            </div>
            <div className="p-4">
              <div className="text-[11px] font-medium text-[#556262]">
                Compromissos Recorrentes Abertos
              </div>
              <div className="font-mono tabular-nums text-xl font-bold text-[#144A47] mt-1">
                {recurringOpenCount}
              </div>
              <div className="text-[11px] text-[#556262] mt-0.5">Mensais / Trimestrais / Anuais</div>
            </div>
          </div>

          {/* Agenda Filter & Mode Bar */}
          <div className="bg-white border border-[#E5E1D8] rounded-xl p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="inline-flex bg-[#F7F5F0] border border-[#E5E1D8] rounded-lg p-1 self-start">
                <button
                  type="button"
                  onClick={() => setAgendaMode('cronograma')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                    agendaMode === 'cronograma'
                      ? 'bg-[#144A47] text-white'
                      : 'text-[#556262] hover:text-[#182424]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  Cronograma de Vencimentos
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaMode('calendario')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                    agendaMode === 'calendario'
                      ? 'bg-[#144A47] text-white'
                      : 'text-[#556262] hover:text-[#182424]'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Calendário Financeiro
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => openNewCommitmentModal('despesa')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#144A47] text-white text-xs font-medium hover:bg-[#0E3735] cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Agendar Compromisso
                  </button>
                )}
                <button
                  type="button"
                  onClick={exportAgendaFinanceiraPDF}
                  disabled={filteredAgendaItems.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#144A47]/30 text-[#144A47] text-xs font-medium hover:bg-[#144A47]/5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar Agenda PDF
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#556262] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={agendaSearch}
                  onChange={(e) => setAgendaSearch(e.target.value)}
                  placeholder="Buscar conta, fornecedor, projeto, NF..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-[#E5E1D8] text-xs bg-white"
                />
              </div>

              <select
                value={agendaWindow}
                onChange={(e) => setAgendaWindow(e.target.value as typeof agendaWindow)}
                aria-label="Filtrar prazo dos compromissos"
                className="px-3 py-2 rounded-lg border border-[#E5E1D8] text-xs bg-white"
              >
                <option value="pendentes">Prazo: Todos Pendentes / Vencidos</option>
                <option value="vencidos">Somente Em Atraso / Vencidos</option>
                <option value="7dias">Vencem nos Próximos 7 Dias</option>
                <option value="30dias">Vencem nos Próximos 30 Dias</option>
                <option value="todos">Todos (Incluindo Liquidados)</option>
              </select>

              <select
                value={agendaTypeFilter}
                onChange={(e) => setAgendaTypeFilter(e.target.value as typeof agendaTypeFilter)}
                aria-label="Filtrar tipo de compromisso"
                className="px-3 py-2 rounded-lg border border-[#E5E1D8] text-xs bg-white"
              >
                <option value="todos">Tipo: Pagar e Receber</option>
                <option value="despesa">Somente Contas a Pagar (Despesas)</option>
                <option value="receita">Somente Recebimentos Previstos</option>
              </select>

              <select
                value={agendaRecurrenceFilter}
                onChange={(e) => setAgendaRecurrenceFilter(e.target.value)}
                aria-label="Filtrar recorrência"
                className="px-3 py-2 rounded-lg border border-[#E5E1D8] text-xs bg-white"
              >
                <option value="todas">Recorrência: Todas</option>
                <option value="Única">Única</option>
                <option value="Mensal">Mensal</option>
                <option value="Trimestral">Trimestral</option>
                <option value="Anual">Anual</option>
              </select>
            </div>
          </div>

          {agendaMode === 'cronograma' ? (
            <div className="bg-white border border-[#E5E1D8] rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E5E1D8] bg-[#F7F5F0] text-[#556262] font-semibold">
                    <th className="py-3 px-4">Vencimento / Prazo</th>
                    <th className="py-3 px-4">Compromisso / Categoria</th>
                    <th className="py-3 px-4">Fornecedor / Doador / Projeto</th>
                    <th className="py-3 px-4">Recorrência</th>
                    <th className="py-3 px-4 text-right">Valor</th>
                    {canWrite && <th className="py-3 px-4 text-right">Ação</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E1D8]">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Carregando agenda financeira...
                      </td>
                    </tr>
                  ) : filteredAgendaItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        Nenhum compromisso financeiro encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredAgendaItems.map((tx) => (
                      <tr key={tx.id} className="hover:bg-[#F7F5F0]/60">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono tabular-nums font-semibold text-[#182424]">
                            {formatDateBR(tx.due_date)}
                          </div>
                          <div>{renderUrgencyBadge(tx)}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{tx.description}</div>
                          <div className="text-[11px] text-slate-500">
                            {tx.type === 'receita' ? 'Recebimento previsto' : 'Conta a pagar'} ·{' '}
                            {tx.category} · {tx.payment_method}
                            {tx.receipt_ref ? ` · ${tx.receipt_ref}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <div>{tx.donor_name || tx.supplier_name || 'Institucional'}</div>
                          <div className="text-[11px] text-slate-400">
                            {tx.project_name || tx.cost_center}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {tx.recurrence || 'Única'}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                            tx.type === 'receita' ? 'text-emerald-700' : 'text-slate-900'
                          }`}
                        >
                          {tx.type === 'receita' ? '+' : '-'} {formatBRL(tx.amount)}
                        </td>
                        {canWrite && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {(tx.status === 'Pendente' || tx.status === 'Vencido') ? (
                              <button
                                type="button"
                                onClick={() => handleSettle(tx.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0E5A75]/10 text-[#0E5A75] hover:bg-[#0E5A75]/20 font-medium cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {tx.type === 'receita' ? 'Confirmar Receb.' : 'Dar baixa'}
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">Liquidado</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              {/* Monthly Financial Calendar */}
              <div className="xl:col-span-8 bg-white border border-[#E5E1D8] rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#E5E1D8] flex items-center justify-between bg-[#F7F5F0]/60">
                  <div className="font-display font-bold text-sm text-[#182424]">
                    {calendarMonthLabel}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCalendarMonthAnchor(addMonthsISO(calendarMonthAnchor, -1))}
                      className="p-1.5 rounded-lg border border-[#E5E1D8] bg-white hover:bg-[#F7F5F0] cursor-pointer"
                      aria-label="Mês anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarMonthAnchor(todayISO);
                        setSelectedCalendarDay(todayISO);
                      }}
                      className="px-2.5 py-1 rounded-lg border border-[#E5E1D8] bg-white text-xs font-medium text-[#144A47] cursor-pointer"
                    >
                      Mês Atual
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarMonthAnchor(addMonthsISO(calendarMonthAnchor, 1))}
                      className="p-1.5 rounded-lg border border-[#E5E1D8] bg-white hover:bg-[#F7F5F0] cursor-pointer"
                      aria-label="Próximo mês"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 border-b border-[#E5E1D8] bg-[#F7F5F0]">
                  {WEEKDAY_SHORT.map((d) => (
                    <div
                      key={d}
                      className="py-2 text-center text-[11px] font-semibold text-[#556262] border-r last:border-r-0 border-[#E5E1D8]"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {calendarCells.map((cell) => {
                    const dayItems = agendaByDay.get(cell.date) ?? [];
                    const isSelected = selectedCalendarDay === cell.date;
                    const isToday = cell.date === todayISO;
                    return (
                      <button
                        key={cell.date}
                        type="button"
                        onClick={() => setSelectedCalendarDay(cell.date)}
                        className={`min-h-[96px] p-1.5 border-b border-r border-[#E5E1D8] text-left align-top cursor-pointer transition-colors ${
                          !cell.inMonth ? 'bg-[#F7F5F0]/55 text-slate-400' : 'bg-white hover:bg-[#F7F5F0]/40'
                        } ${isSelected ? 'ring-2 ring-inset ring-[#144A47]' : ''}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`font-mono tabular-nums text-xs font-semibold w-6 h-6 inline-flex items-center justify-center rounded ${
                              isToday ? 'bg-[#144A47] text-white' : ''
                            }`}
                          >
                            {Number(cell.date.slice(8, 10))}
                          </span>
                          {dayItems.length > 0 && (
                            <span className="font-mono tabular-nums text-[10px] text-[#556262]">
                              {dayItems.length}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          {dayItems.slice(0, 2).map((tx) => (
                            <div
                              key={tx.id}
                              className={`px-1.5 py-0.5 rounded border text-[10px] truncate ${
                                tx.type === 'receita'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : tx.status === 'Vencido' || diffDaysISO(todayISO, tx.due_date) < 0
                                    ? 'bg-red-50 border-red-200 text-red-800'
                                    : 'bg-amber-50 border-amber-200 text-amber-900'
                              }`}
                            >
                              {tx.type === 'receita' ? '+' : '-'} {formatBRL(tx.amount)}
                            </div>
                          ))}
                          {dayItems.length > 2 && (
                            <div className="text-[10px] font-medium text-[#144A47] px-1">
                              +{dayItems.length - 2} mais
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Day Commitments Inspector */}
              <div className="xl:col-span-4 bg-white border border-[#E5E1D8] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-2.5">
                  <div>
                    <div className="text-[11px] text-[#556262]">Vencimentos do dia</div>
                    <div className="font-display font-bold text-sm text-[#182424] font-mono tabular-nums">
                      {formatDateBR(selectedCalendarDay)}
                    </div>
                  </div>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => openNewCommitmentModal('despesa', selectedCalendarDay)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#E5E1D8] text-[11px] font-medium text-[#144A47] hover:bg-[#F7F5F0] cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      Agendar nesta data
                    </button>
                  )}
                </div>

                {selectedDayCommitments.length === 0 ? (
                  <div className="text-xs text-[#556262] py-6 text-center">
                    Nenhum vencimento financeiro filtrado nesta data.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedDayCommitments.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3 rounded-lg border border-[#E5E1D8] bg-[#F7F5F0]/45 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[11px] font-semibold ${
                              tx.type === 'receita' ? 'text-emerald-700' : 'text-[#BD4B22]'
                            }`}
                          >
                            {tx.type === 'receita' ? 'Recebimento Previsto' : 'Conta a Pagar'}
                          </span>
                          {renderUrgencyBadge(tx)}
                        </div>
                        <div className="font-semibold text-[#182424]">{tx.description}</div>
                        <div className="text-[11px] text-[#556262]">
                          {tx.donor_name || tx.supplier_name || 'Institucional'} · {tx.recurrence}
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="font-mono tabular-nums font-bold text-sm text-[#182424]">
                            {tx.type === 'receita' ? '+' : '-'} {formatBRL(tx.amount)}
                          </span>
                          {canWrite && (tx.status === 'Pendente' || tx.status === 'Vencido') && (
                            <button
                              type="button"
                              onClick={() => handleSettle(tx.id)}
                              className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Dar baixa
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : subTab === 'fluxo' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Demonstrativo Mensal de Fluxo de Caixa (Realizado)
            </h2>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                <th className="py-3 px-4">Competência</th>
                <th className="py-3 px-4 text-right">Entradas</th>
                <th className="py-3 px-4 text-right">Saídas</th>
                <th className="py-3 px-4 text-right">Resultado do Mês</th>
                <th className="py-3 px-4 text-right">Saldo Acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                let running = 0;
                return monthlyCashflow.map(([ym, vals]) => {
                  const net = vals.inflows - vals.outflows;
                  running += net;
                  return (
                    <tr key={ym} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono">{ym.split('-').reverse().join('/')}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                        {formatBRL(vals.inflows)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                        {formatBRL(vals.outflows)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-medium ${
                          net >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {formatBRL(net)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatBRL(running)}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      ) : subTab === 'historico' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                <th className="py-3 px-4">Data / Hora</th>
                <th className="py-3 px-4">Lançamento #</th>
                <th className="py-3 px-4">Operação</th>
                <th className="py-3 px-4">Responsável</th>
                <th className="py-3 px-4">Registro Anterior / Novo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                    {formatDateTimeBR(h.changed_at)}
                  </td>
                  <td className="py-3 px-4 font-mono">#{h.transaction_id}</td>
                  <td className="py-3 px-4 font-medium text-slate-800">{h.change_type}</td>
                  <td className="py-3 px-4">{h.changed_by}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600 max-w-md truncate">
                    {h.new_json || h.previous_json}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                <th className="py-3 px-4">Lançamento / Categoria</th>
                <th className="py-3 px-4">Origem / Fornecedor / Projeto</th>
                <th className="py-3 px-4">Vencimento</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Valor</th>
                {canWrite && <th className="py-3 px-4 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Carregando lançamentos...
                  </td>
                </tr>
              ) : filteredTx.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Nenhum lançamento encontrado.
                  </td>
                </tr>
              ) : (
                filteredTx.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{tx.description}</div>
                      <div className="text-[11px] text-slate-500">
                        {tx.type === 'receita' ? 'Receita' : 'Despesa'} · {tx.category} ·{' '}
                        {tx.payment_method}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{tx.donor_name || tx.supplier_name || 'Institucional'}</div>
                      <div className="text-[11px] text-slate-400">
                        {tx.project_name || tx.cost_center}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                      {formatDateBR(tx.due_date)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-medium ${
                          tx.status === 'Pago' || tx.status === 'Recebido'
                            ? 'text-emerald-700'
                            : tx.status === 'Vencido'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-semibold tabular-nums ${
                        tx.type === 'receita' ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {tx.type === 'receita' ? '+' : '-'} {formatBRL(tx.amount)}
                    </td>
                    {canWrite && (
                      <td className="py-3 px-4 text-right">
                        {(tx.status === 'Pendente' || tx.status === 'Vencido') && (
                          <button
                            type="button"
                            onClick={() => handleSettle(tx.id)}
                            className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Dar baixa
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Novo Lançamento / Compromisso */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Novo Lançamento / Compromisso Financeiro
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-xs text-slate-500 cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      type: 'receita',
                      category: REVENUE_CATEGORIES[0],
                      status: 'Pendente',
                    })
                  }
                  className={`flex-1 py-1.5 rounded-md font-medium cursor-pointer ${
                    form.type === 'receita' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Receita / A Receber
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      type: 'despesa',
                      category: EXPENSE_CATEGORIES[0],
                      status: 'Pendente',
                    })
                  }
                  className={`flex-1 py-1.5 rounded-md font-medium cursor-pointer ${
                    form.type === 'despesa' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Despesa / Conta a Pagar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Descrição *</label>
                  <input
                    type="text"
                    required
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Categoria *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {(form.type === 'receita' ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Projeto relacionado</label>
                  <select
                    value={form.project_id}
                    onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Institucional / Geral</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                {form.type === 'receita' ? (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Doador / Origem</label>
                    <select
                      value={form.donor_id}
                      onChange={(e) => setForm({ ...form, donor_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Sem vínculo / Avulso</option>
                      {donors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Fornecedor vinculado</label>
                    <select
                      value={form.supplier_id}
                      onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Sem fornecedor</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.trade_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Data de vencimento</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Situação</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {form.type === 'receita' ? (
                      <>
                        <option value="Pendente">A receber (Agendado)</option>
                        <option value="Recebido">Recebido</option>
                      </>
                    ) : (
                      <>
                        <option value="Pendente">Pendente (Agendado)</option>
                        <option value="Pago">Pago</option>
                        <option value="Vencido">Vencido</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Recorrência</label>
                  <select
                    value={form.recurrence}
                    onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Única">Única</option>
                    <option value="Mensal">Mensal</option>
                    <option value="Trimestral">Trimestral</option>
                    <option value="Anual">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Forma de pagamento</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="PIX">PIX</option>
                    <option value="Transferência Bancária">Transferência Bancária</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Cartão">Cartão</option>
                    <option value="TED">TED</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Comprovante / NF</label>
                  <input
                    type="text"
                    value={form.receipt_ref}
                    onChange={(e) => setForm({ ...form, receipt_ref: e.target.value })}
                    placeholder="Ex.: NF-9501"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="py-2 px-4 border border-slate-300 rounded-lg text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white font-medium rounded-lg cursor-pointer"
                >
                  Registrar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
