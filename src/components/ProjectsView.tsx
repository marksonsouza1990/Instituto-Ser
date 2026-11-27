import { useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatBRL, formatDateBR } from '../lib/format';
import { FINANCE_ROLES, hasAnyRole, type Project, type RoleInput } from '../types';

export function ProjectsView({ role }: { role: RoleInput }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    objective: '',
    target_audience: '',
    manager_name: '',
    start_date: '2026-11-23',
    end_date: '2027-11-23',
    planned_budget: '50000',
    target_beneficiaries: '40',
    impact_indicator_label: '',
    impact_indicator_value: '',
    status: 'Ativo',
  });

  const canWrite = hasAnyRole(role, ['admin', 'diretoria', 'coordenacao_social']);
  const canSeeFinance = hasAnyRole(role, FINANCE_ROLES);

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await apiRequest<Project[]>('/api/projects');
      setProjects(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar projetos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          planned_budget: Number(form.planned_budget),
          target_beneficiaries: Number(form.target_beneficiaries),
        }),
      });
      setShowModal(false);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar projeto.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Projetos e Iniciativas Sociais
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Acompanhamento de orçamento previsto versus realizado, beneficiários e indicadores de impacto.
          </p>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg cursor-pointer self-start whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Novo Projeto
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="text-xs text-slate-400">Carregando projetos...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {projects.map((p) => {
            const showBudget = canSeeFinance && p.planned_budget !== null;
            const planned = p.planned_budget ?? 0;
            const realized = p.realized_expenses ?? 0;
            const execPct = planned > 0 ? Math.min(100, Math.round((realized / planned) * 100)) : 0;
            return (
              <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">{p.name}</h2>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Coord.: {p.manager_name} · {formatDateBR(p.start_date)} até {formatDateBR(p.end_date)}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 shrink-0">{p.status}</span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{p.description}</p>

                {showBudget ? (
                  <>
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <div className="text-slate-500">Orçamento previsto</div>
                        <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                          {formatBRL(p.planned_budget)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Recursos recebidos</div>
                        <div className="font-mono font-semibold text-emerald-700 tabular-nums mt-0.5">
                          {formatBRL(p.received_resources)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Despesas realizadas</div>
                        <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                          {formatBRL(p.realized_expenses)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Execução orçamentária</span>
                        <span className="font-mono font-semibold tabular-nums text-slate-800">{execPct}%</span>
                      </div>
                      <div className="w-full h-2 bg-[#EFECE4] rounded-sm overflow-hidden">
                        <div className="h-full bg-[#144A47]" style={{ width: `${execPct}%` }} />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <div className="text-slate-500">Público-alvo</div>
                      <div className="font-medium text-slate-800 mt-0.5">{p.target_audience || 'Crianças e famílias'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Objetivo</div>
                      <div className="font-medium text-slate-800 mt-0.5">{p.objective || 'Desenvolvimento integral'}</div>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    Beneficiários: <strong className="font-mono tabular-nums">{p.beneficiaries_count}</strong> / {p.target_beneficiaries}
                  </span>
                  {p.impact_indicator_label && (
                    <span>
                      {p.impact_indicator_label}: <strong className="text-[#144A47]">{p.impact_indicator_value}</strong>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">Cadastrar Novo Projeto</h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-xs text-slate-500 cursor-pointer">
                Fechar
              </button>
            </div>
            <form onSubmit={handleCreate} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nome do projeto *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Responsável *</label>
                  <input
                    type="text"
                    required
                    value={form.manager_name}
                    onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Público-alvo</label>
                  <input
                    type="text"
                    value={form.target_audience}
                    onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Data de início</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Data de encerramento</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Orçamento previsto (R$)</label>
                  <input
                    type="number"
                    value={form.planned_budget}
                    onChange={(e) => setForm({ ...form, planned_budget: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Meta de beneficiários</label>
                  <input
                    type="number"
                    value={form.target_beneficiaries}
                    onChange={(e) => setForm({ ...form, target_beneficiaries: e.target.value })}
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
                  Salvar Projeto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
