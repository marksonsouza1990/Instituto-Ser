import { useEffect, useState, type FormEvent } from 'react';
import { Database, Plus, Shield } from 'lucide-react';
import { apiRequest, getSessionToken } from '../lib/api';
import { formatDateTimeBR } from '../lib/format';
import { ROLE_LABELS, type AuditLog, type AuthUser, type UserRole } from '../types';

export function AdminView({ currentUser }: { currentUser: AuthUser }) {
  const [subTab, setSubTab] = useState<'usuarios' | 'auditoria'>('usuarios');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [onlyLgpd, setOnlyLgpd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'coordenacao_social' as UserRole,
    specialty: '',
    password: '',
  });

  const isAdmin = currentUser.role === 'admin';

  async function loadAll() {
    setError(null);
    try {
      const logsRes = await apiRequest<AuditLog[]>('/api/audit-logs');
      setLogs(logsRes);
      if (isAdmin) {
        const usersRes = await apiRequest<AuthUser[]>('/api/users');
        setUsers(usersRes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar governança.');
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowModal(false);
      setForm({ name: '', email: '', role: 'coordenacao_social', specialty: '', password: '' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    }
  }

  async function toggleUserActive(u: AuthUser) {
    try {
      await apiRequest(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !u.active }),
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar status.');
    }
  }

  async function changeUserRole(u: AuthUser, newRole: UserRole) {
    try {
      await apiRequest(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar perfil.');
    }
  }

  async function handleDownloadBackup() {
    try {
      const res = await fetch('/api/backup', {
        headers: { Authorization: `Bearer ${getSessionToken() || ''}` },
      });
      if (!res.ok) throw new Error('Falha ao gerar backup.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `instituto_ser_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao exportar backup.');
    }
  }

  const displayedLogs = onlyLgpd
    ? logs.filter((l) => l.action === 'ACCESS_MEDICAL_RECORD' || l.entity_type === 'medical_records')
    : logs;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Usuários, Permissões e Auditoria (LGPD)
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Controle de acesso por função (financeiro, psicólogos, médicos e coordenação), trilha de auditoria e backup institucional.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#EFECE4] border border-[#E5E1D8] rounded-lg">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setSubTab('usuarios')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  subTab === 'usuarios' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
                }`}
              >
                Usuários ({users.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setSubTab('auditoria')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                subTab === 'auditoria' || !isAdmin ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
              }`}
            >
              Trilha de Auditoria
            </button>
          </div>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-1.5 py-2 px-4 border border-slate-300 bg-white text-slate-800 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Database className="w-4 h-4 text-[#144A47]" />
                Backup Completo
              </button>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Novo Usuário
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
      )}

      {subTab === 'usuarios' && isAdmin ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">Perfil de Acesso (RBAC)</th>
                <th className="py-3 px-4">Último Acesso</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{u.name}</div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {u.email}
                      {u.specialty ? ` · ${u.specialty}` : ''}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={u.role}
                      disabled={u.id === currentUser.id}
                      onChange={(e) => changeUserRole(u, e.target.value as UserRole)}
                      className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white disabled:bg-slate-50"
                    >
                      {(Object.keys(ROLE_LABELS) as UserRole[]).map((rk) => (
                        <option key={rk} value={rk}>
                          {ROLE_LABELS[rk]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                    {formatDateTimeBR(u.last_login_at)}
                  </td>
                  <td className="py-3 px-4">
                    <span className={u.active ? 'text-emerald-700 font-medium' : 'text-red-700'}>
                      {u.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {u.id !== currentUser.id && (
                      <button
                        type="button"
                        onClick={() => toggleUserActive(u)}
                        className="text-[#0E5A75] hover:underline font-medium cursor-pointer"
                      >
                        {u.active ? 'Desativar' : 'Reativar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <Shield className="w-4 h-4 text-[#144A47]" />
              Registros imutáveis de alterações e acessos
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyLgpd}
                onChange={(e) => setOnlyLgpd(e.target.checked)}
              />
              Somente acessos a prontuários (LGPD)
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Usuário / Perfil</th>
                  <th className="py-3 px-4">Ação</th>
                  <th className="py-3 px-4">Módulo</th>
                  <th className="py-3 px-4">Detalhamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {formatDateTimeBR(l.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-900">{l.user_name}</span>{' '}
                      <span className="text-slate-400">({l.user_role})</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">{l.action}</td>
                    <td className="py-3 px-4 text-slate-600">{l.entity_type}</td>
                    <td className="py-3 px-4 text-slate-700">{l.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">Criar Conta de Usuário</h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-xs text-slate-500 cursor-pointer">
                Fechar
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nome completo *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">E-mail institucional *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Perfil de acesso *</label>
                <select
                  value={form.role}
                  onChange={(e) => {
                    const nextRole = e.target.value as UserRole;
                    const defaultSpec =
                      nextRole === 'psicologo'
                        ? 'Psicologia'
                        : nextRole === 'medico'
                          ? 'Pediatria / Clínica Médica'
                          : nextRole === 'saude'
                            ? form.specialty || 'Saúde'
                            : '';
                    setForm({ ...form, role: nextRole, specialty: defaultSpec });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((rk) => (
                    <option key={rk} value={rk}>
                      {ROLE_LABELS[rk]}
                    </option>
                  ))}
                </select>
              </div>
              {(form.role === 'saude' || form.role === 'psicologo' || form.role === 'medico') && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Especialidade / Registro (Saúde)</label>
                  <input
                    type="text"
                    value={form.specialty}
                    onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                    placeholder="Ex.: Psicologia · CRP ou Pediatria · CRM"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              )}
              <div>
                <label className="block font-medium text-slate-700 mb-1">Senha inicial (mín. 6 caracteres) *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="py-2 px-4 border border-slate-300 rounded-lg text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button type="submit" className="py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white font-medium rounded-lg cursor-pointer">
                  Criar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
