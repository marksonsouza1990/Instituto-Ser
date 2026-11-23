import { useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatBRL, formatDateBR } from '../lib/format';
import { FINANCE_ROLES, type Donor, type UserRole } from '../types';

export function DonorsView({ role }: { role: UserRole }) {
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
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

  const canWrite = ['admin', 'financeiro', 'diretoria', 'coordenacao_social'].includes(role);
  const canSeeFinance = FINANCE_ROLES.includes(role);

  async function loadDonors() {
    setLoading(true);
    try {
      const res = await apiRequest<Donor[]>('/api/donors');
      setDonors(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar doadores.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDonors();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/donors', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowModal(false);
      await loadDonors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar doador.');
    }
  }

  const activeDonors = donors.filter((d) => d.status === 'ativo');
  const inactiveDonors = donors.filter((d) => d.status === 'inativo');
  const totalRaised = donors.reduce((s, d) => s + (d.total_donated ?? 0), 0);
  const totalDonationsCount = donors.reduce((s, d) => s + (d.donations_count ?? 0), 0);
  const averageTicket = totalDonationsCount > 0 ? totalRaised / totalDonationsCount : 0;
  const recurringDonors = donors.filter((d) => d.frequency !== 'Única' && d.status === 'ativo').length;
  const newDonors = donors.filter((d) => d.created_at.startsWith('2026-11')).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Doadores e Apoiadores
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Relacionamento com mantenedores, empresas parceiras, editais e rastreabilidade por projeto.
          </p>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg cursor-pointer self-start"
          >
            <Plus className="w-4 h-4" />
            Novo Apoiador
          </button>
        )}
      </div>

      {/* Donor Indicators */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${canSeeFinance ? 'lg:grid-cols-6' : 'lg:grid-cols-4'} gap-4`}>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Doadores ativos</div>
          <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-slate-900">
            {activeDonors.length}
          </div>
        </div>
        {canSeeFinance && (
          <>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total arrecadado</div>
              <div className="mt-1 text-lg font-display font-bold font-mono tabular-nums text-emerald-700">
                {formatBRL(totalRaised)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Ticket médio</div>
              <div className="mt-1 text-lg font-display font-bold font-mono tabular-nums text-slate-900">
                {formatBRL(averageTicket)}
              </div>
            </div>
          </>
        )}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Doações recorrentes</div>
          <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-[#0E5A75]">
            {recurringDonors}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Novos doadores</div>
          <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-slate-900">
            {newDonors}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Doadores inativos</div>
          <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-slate-500">
            {inactiveDonors.length}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
              <th className="py-3 px-4">Doador / Apoiador</th>
              <th className="py-3 px-4">Tipo e Frequência</th>
              <th className="py-3 px-4">Projetos Financiados</th>
              <th className="py-3 px-4">Última Contribuição</th>
              {canSeeFinance && <th className="py-3 px-4 text-right">Total Doado</th>}
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={canSeeFinance ? 6 : 5} className="py-8 text-center text-slate-400">
                  Carregando doadores...
                </td>
              </tr>
            ) : (
              donors.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{d.name}</div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {d.document} · {d.email}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {d.donor_type} · {d.frequency}
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs">
                    {d.supported_projects && d.supported_projects.length > 0
                      ? d.supported_projects.join(' · ')
                      : 'Fundo Institucional Geral'}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                    {formatDateBR(d.last_donation_date)}
                  </td>
                  {canSeeFinance && (
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-emerald-700">
                      {formatBRL(d.total_donated)}
                    </td>
                  )}
                  <td className="py-3 px-4">
                    <span className={d.status === 'ativo' ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                      {d.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">Cadastrar Doador / Apoiador</h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-xs text-slate-500 cursor-pointer">
                Fechar
              </button>
            </div>
            <form onSubmit={handleSave} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nome / Razão Social *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">CPF / CNPJ *</label>
                  <input
                    type="text"
                    required
                    value={form.document}
                    onChange={(e) => setForm({ ...form, document: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tipo de apoiador</label>
                  <select
                    value={form.donor_type}
                    onChange={(e) => setForm({ ...form, donor_type: e.target.value })}
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
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Mensal">Mensal</option>
                    <option value="Trimestral">Trimestral</option>
                    <option value="Anual">Anual</option>
                    <option value="Única">Única</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
                  Salvar Doador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
