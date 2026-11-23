import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Plus } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatBRL, formatDateBR, formatDateTimeBR } from '../lib/format';
import type {
  Donor,
  FinancialHistoryEntry,
  FinancialTransaction,
  Project,
  Supplier,
  UserRole,
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

export function FinanceView({ role }: { role: UserRole }) {
  const [subTab, setSubTab] = useState<'fluxo' | 'receitas' | 'despesas' | 'contas' | 'historico'>('fluxo');
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [history, setHistory] = useState<FinancialHistoryEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    type: 'despesa' as 'receita' | 'despesa',
    description: '',
    category: 'Alimentação',
    amount: '',
    status: 'Pendente',
    issue_date: '2026-11-23',
    due_date: '2026-11-30',
    payment_method: 'PIX',
    recurrence: 'Única',
    cost_center: 'Institucional',
    project_id: '',
    supplier_id: '',
    donor_id: '',
    receipt_ref: '',
    notes: '',
  });

  const canWrite = role === 'admin' || role === 'financeiro';

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [txRes, histRes, projRes, supRes, donRes] = await Promise.all([
        apiRequest<FinancialTransaction[]>('/api/finance/transactions'),
        apiRequest<FinancialHistoryEntry[]>('/api/finance/history').catch(() => [] as FinancialHistoryEntry[]),
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
    loadAll();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
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
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar lançamento.');
    }
  }

  async function handleSettle(id: number) {
    try {
      await apiRequest(`/api/finance/transactions/${id}/settle`, {
        method: 'PATCH',
        body: JSON.stringify({ settlement_date: '2026-11-23' }),
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao dar baixa.');
    }
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Gestão Financeira</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Receitas, despesas por centro de custo e projeto, contas a pagar/receber, fluxo de caixa e trilha de alterações.
          </p>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => {
              setForm((f) => ({
                ...f,
                type: subTab === 'receitas' ? 'receita' : 'despesa',
                category: subTab === 'receitas' ? 'Doações individuais' : 'Alimentação',
                status: subTab === 'receitas' ? 'Recebido' : 'Pendente',
              }));
              setShowModal(true);
            }}
            className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg cursor-pointer self-start whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Novo Lançamento
          </button>
        )}
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-[#EFECE4] border border-[#E5E1D8] rounded-lg w-fit">
        {[
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

      {subTab === 'fluxo' ? (
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
                        {tx.type === 'receita' ? 'Receita' : 'Despesa'} · {tx.category} · {tx.payment_method}
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

      {/* Modal Novo Lançamento */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Novo Lançamento Financeiro
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
                      status: 'Recebido',
                    })
                  }
                  className={`flex-1 py-1.5 rounded-md font-medium cursor-pointer ${
                    form.type === 'receita' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Receita / Doação
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
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
                        <option value="Recebido">Recebido</option>
                        <option value="Pendente">A receber</option>
                      </>
                    ) : (
                      <>
                        <option value="Pago">Pago</option>
                        <option value="Pendente">Pendente</option>
                        <option value="Vencido">Vencido</option>
                      </>
                    )}
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
