import { useEffect, useState, type FormEvent } from 'react';
import { Lock, Plus } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatBRL } from '../lib/format';
import type { Supplier, UserRole } from '../types';

export function SuppliersView({ role }: { role: UserRole }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
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

  const canWrite = role === 'admin' || role === 'financeiro';

  async function loadSuppliers() {
    setLoading(true);
    try {
      const res = await apiRequest<Supplier[]>('/api/suppliers');
      setSuppliers(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar fornecedores.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSuppliers();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/suppliers', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowModal(false);
      await loadSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar fornecedor.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Fornecedores e Prestadores de Serviços
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cadastro integrado às despesas financeiras com proteção de dados bancários.
          </p>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg cursor-pointer self-start"
          >
            <Plus className="w-4 h-4" />
            Novo Fornecedor
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
              <th className="py-3 px-4">Fornecedor</th>
              <th className="py-3 px-4">CPF / CNPJ</th>
              <th className="py-3 px-4">Contato Comercial</th>
              <th className="py-3 px-4">Categoria</th>
              <th className="py-3 px-4">Dados Bancários (Restrito)</th>
              <th className="py-3 px-4 text-right">Total Pago</th>
              <th className="py-3 px-4">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  Carregando fornecedores...
                </td>
              </tr>
            ) : (
              suppliers.map((sup) => (
                <tr key={sup.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{sup.trade_name}</div>
                    <div className="text-[11px] text-slate-500">{sup.legal_name}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700">{sup.document}</td>
                  <td className="py-3 px-4">
                    <div>{sup.commercial_contact}</div>
                    <div className="text-[11px] font-mono text-slate-500">{sup.phone}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-700">{sup.category}</td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs">
                    {sup.bank_details_masked ? (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Lock className="w-3 h-3" /> Acesso restrito ao Financeiro/Diretoria
                      </span>
                    ) : (
                      <span className="font-mono text-[11px]">{sup.bank_details || '—'}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {formatBRL(sup.total_paid)}
                    <div className="text-[11px] font-normal text-slate-400">
                      {sup.purchases_count ?? 0} lançamentos
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={sup.status === 'ativo' ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                      {sup.status === 'ativo' ? 'Ativo' : 'Inativo'}
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
              <h2 className="font-display text-lg font-bold text-slate-900">Cadastrar Fornecedor</h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-xs text-slate-500 cursor-pointer">
                Fechar
              </button>
            </div>
            <form onSubmit={handleSave} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Razão social *</label>
                  <input
                    type="text"
                    required
                    value={form.legal_name}
                    onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nome fantasia</label>
                  <input
                    type="text"
                    value={form.trade_name}
                    onChange={(e) => setForm({ ...form, trade_name: e.target.value })}
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
                  <label className="block font-medium text-slate-700 mb-1">Categoria *</label>
                  <input
                    type="text"
                    required
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Responsável comercial</label>
                  <input
                    type="text"
                    value={form.commercial_contact}
                    onChange={(e) => setForm({ ...form, commercial_contact: e.target.value })}
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
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Dados bancários (acesso restrito)</label>
                  <input
                    type="text"
                    value={form.bank_details}
                    onChange={(e) => setForm({ ...form, bank_details: e.target.value })}
                    placeholder="Banco · Agência · Conta · Chave PIX"
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
                  Salvar Fornecedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
