import { useEffect, useState, type FormEvent } from 'react';
import { Check, Clock, Database, Edit3, Plus, Shield, XCircle } from 'lucide-react';
import { apiRequest, getSessionToken } from '../lib/api';
import { formatDateTimeBR } from '../lib/format';
import {
  ROLE_LABELS,
  formatUserRoles,
  getUserRoles,
  hasAnyRole,
  type AuditLog,
  type AuthUser,
  type UserRole,
} from '../types';

const ALL_ROLE_KEYS = Object.keys(ROLE_LABELS) as UserRole[];

function getRequestedRolesList(u: AuthUser): UserRole[] {
  if (u.requested_roles && u.requested_roles.length > 0) return u.requested_roles;
  if (u.requested_role) return [u.requested_role];
  return getUserRoles(u);
}

function toggleRoleInList(list: UserRole[], roleKey: UserRole, lockAdmin = false): UserRole[] {
  if (lockAdmin && roleKey === 'admin' && list.includes('admin')) {
    return list;
  }
  if (list.includes(roleKey)) {
    if (list.length === 1) return list;
    return list.filter((r) => r !== roleKey);
  }
  return [...list, roleKey];
}

export function AdminView({
  currentUser,
  onPendingCountChange,
  onCurrentUserUpdated,
}: {
  currentUser: AuthUser;
  onPendingCountChange?: (count: number) => void;
  onCurrentUserUpdated?: () => void;
}) {
  const [subTab, setSubTab] = useState<'pendentes' | 'usuarios' | 'auditoria'>('usuarios');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [onlyLgpd, setOnlyLgpd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [roleDrafts, setRoleDrafts] = useState<Record<number, UserRole[]>>({});
  const [processingId, setProcessingId] = useState<number | null>(null);

  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [editRoles, setEditRoles] = useState<UserRole[]>(['voluntario']);
  const [editSpecialty, setEditSpecialty] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    roles: ['coordenacao_social'] as UserRole[],
    specialty: '',
    password: '',
  });

  const isAdmin = hasAnyRole(currentUser, ['admin']);

  async function loadAll(autoFocusPending = false) {
    setError(null);
    try {
      const logsRes = await apiRequest<AuditLog[]>('/api/audit-logs');
      setLogs(logsRes);
      if (isAdmin) {
        const usersRes = await apiRequest<AuthUser[]>('/api/users');
        setUsers(usersRes);
        const pending = usersRes.filter((u) => u.approval_status === 'pendente');
        onPendingCountChange?.(pending.length);
        setRoleDrafts((prev) => {
          const next = { ...prev };
          for (const u of pending) {
            if (!next[u.id] || next[u.id].length === 0) {
              next[u.id] = getRequestedRolesList(u);
            }
          }
          return next;
        });
        if (autoFocusPending && pending.length > 0) {
          setSubTab('pendentes');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar governança.');
    }
  }

  useEffect(() => {
    void loadAll(true);
  }, []);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          role: form.roles[0],
          roles: form.roles,
          specialty: form.specialty,
          password: form.password,
        }),
      });
      setShowModal(false);
      setForm({ name: '', email: '', roles: ['coordenacao_social'], specialty: '', password: '' });
      setFeedback('Usuário criado e autorizado com sucesso.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    }
  }

  async function handleDecision(u: AuthUser, decision: 'aprovar' | 'recusar') {
    setError(null);
    setFeedback(null);
    setProcessingId(u.id);
    try {
      const assignedRoles = roleDrafts[u.id] && roleDrafts[u.id].length > 0
        ? roleDrafts[u.id]
        : getRequestedRolesList(u);
      await apiRequest(`/api/users/${u.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          role: assignedRoles[0],
          roles: assignedRoles,
        }),
      });
      setFeedback(
        decision === 'aprovar'
          ? `Acesso de ${u.name} autorizado nas categorias: ${formatUserRoles(assignedRoles)}.`
          : `Solicitação de ${u.name} recusada.`
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar decisão.');
    } finally {
      setProcessingId(null);
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

  function openEditCategories(u: AuthUser) {
    setEditingUser(u);
    setEditRoles(getUserRoles(u));
    setEditSpecialty(u.specialty || '');
    setError(null);
  }

  async function handleSaveCategories(e: FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    setError(null);
    setFeedback(null);
    try {
      await apiRequest(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: editRoles[0],
          roles: editRoles,
          specialty: editSpecialty,
        }),
      });
      setFeedback(
        `Categorias de ${editingUser.name} atualizadas: ${formatUserRoles(editRoles)}.`
      );
      const updatedSelf = editingUser.id === currentUser.id;
      setEditingUser(null);
      await loadAll();
      if (updatedSelf) {
        onCurrentUserUpdated?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar categorias.');
    } finally {
      setSavingEdit(false);
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

  const pendingUsers = users.filter((u) => u.approval_status === 'pendente');
  const displayedLogs = onlyLgpd
    ? logs.filter((l) => l.action === 'ACCESS_MEDICAL_RECORD' || l.entity_type === 'medical_records')
    : logs;

  const hasHealthInCreate = form.roles.some((r) => r === 'saude' || r === 'psicologo' || r === 'medico');
  const hasHealthInEdit = editRoles.some((r) => r === 'saude' || r === 'psicologo' || r === 'medico');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Usuários, Autorizações e Auditoria (LGPD)
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Autorização obrigatória de primeiro acesso, múltiplas categorias por pessoa (RBAC), auditoria e backup institucional.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#EFECE4] border border-[#E5E1D8] rounded-lg">
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setSubTab('pendentes')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                    subTab === 'pendentes' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-[#BD4B22]" />
                  Autorizações ({pendingUsers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('usuarios')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                    subTab === 'usuarios' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Usuários ({users.length})
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setSubTab('auditoria')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
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
      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {feedback}
        </div>
      )}

      {subTab === 'pendentes' && isAdmin ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Solicitações de Primeiro Acesso Aguardando Autorização
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Selecione uma ou mais categorias para o usuário (ex.: Médico(a) e Diretoria) antes de clicar em Autorizar.
              </p>
            </div>
          </div>

          {pendingUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Nenhuma solicitação pendente de autorização no momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-3 px-4">Solicitante</th>
                    <th className="py-3 px-4">Solicitado em</th>
                    <th className="py-3 px-4">Observação / Especialidade</th>
                    <th className="py-3 px-4">Categorias a Liberar (RBAC)</th>
                    <th className="py-3 px-4 text-right">Decisão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingUsers.map((u) => {
                    const draftRoles = roleDrafts[u.id] || getRequestedRolesList(u);
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70 align-top">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{u.name}</div>
                          <div className="text-[11px] font-mono text-slate-500">{u.email}</div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {formatDateTimeBR(u.created_at)}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-[220px]">
                          {u.specialty && <div className="font-medium text-slate-800">{u.specialty}</div>}
                          <div className="text-[11px] text-slate-500">
                            {u.approval_notes || `Solicitou: ${formatUserRoles(getRequestedRolesList(u))}`}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1.5 max-w-[360px]">
                            {ALL_ROLE_KEYS.map((rk) => {
                              const checked = draftRoles.includes(rk);
                              return (
                                <label
                                  key={rk}
                                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] cursor-pointer transition-colors ${
                                    checked
                                      ? 'bg-[#144A47]/10 border-[#144A47] text-[#144A47] font-medium'
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setRoleDrafts((prev) => ({
                                        ...prev,
                                        [u.id]: toggleRoleInList(prev[u.id] || getRequestedRolesList(u), rk),
                                      }))
                                    }
                                    className="accent-[#144A47]"
                                  />
                                  <span>{ROLE_LABELS[rk]}</span>
                                </label>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={processingId === u.id}
                              onClick={() => handleDecision(u, 'aprovar')}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#144A47] hover:bg-[#0E3735] text-white font-medium cursor-pointer disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Autorizar
                            </button>
                            <button
                              type="button"
                              disabled={processingId === u.id}
                              onClick={() => handleDecision(u, 'recusar')}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-red-200 text-red-700 hover:bg-red-50 font-medium cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Recusar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : subTab === 'usuarios' && isAdmin ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">Categorias de Acesso (RBAC)</th>
                <th className="py-3 px-4">Autorização</th>
                <th className="py-3 px-4">Último Acesso</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const userCategories = getUserRoles(u);
                return (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{u.name}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {u.email}
                        {u.specialty ? ` · ${u.specialty}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {userCategories.map((rk) => (
                          <span
                            key={rk}
                            className="inline-block px-2 py-0.5 rounded bg-[#F7F5F0] border border-[#E5E1D8] text-[11px] font-medium text-[#144A47]"
                          >
                            {ROLE_LABELS[rk]}
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={() => openEditCategories(u)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 text-[11px] text-[#0E5A75] hover:bg-slate-50 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          Editar categorias
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {u.approval_status === 'pendente' ? (
                        <span className="text-amber-700 font-medium">Aguardando aprovação</span>
                      ) : u.approval_status === 'recusado' ? (
                        <span className="text-red-700 font-medium">Recusado</span>
                      ) : (
                        <span className="text-emerald-700 font-medium">
                          Autorizado{u.approved_by ? ` (${u.approved_by})` : ''}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                      {formatDateTimeBR(u.last_login_at)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={u.active ? 'text-emerald-700 font-medium' : 'text-red-700'}>
                        {u.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {u.id !== currentUser.id && u.approval_status === 'pendente' ? (
                        <button
                          type="button"
                          onClick={() => handleDecision(u, 'aprovar')}
                          className="text-[#144A47] hover:underline font-semibold cursor-pointer mr-3"
                        >
                          Autorizar agora
                        </button>
                      ) : u.id !== currentUser.id && u.approval_status === 'recusado' ? (
                        <button
                          type="button"
                          onClick={() => handleDecision(u, 'aprovar')}
                          className="text-[#144A47] hover:underline font-medium cursor-pointer"
                        >
                          Reaprovar acesso
                        </button>
                      ) : u.id !== currentUser.id ? (
                        <button
                          type="button"
                          onClick={() => toggleUserActive(u)}
                          className="text-[#0E5A75] hover:underline font-medium cursor-pointer"
                        >
                          {u.active ? 'Desativar' : 'Reativar'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
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
                  <th className="py-3 px-4">Usuário / Categorias</th>
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

      {/* Modal: Editar Categorias do Usuário Existente */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Categorias de Acesso — {editingUser.name}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{editingUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-xs text-slate-500 cursor-pointer"
              >
                Fechar
              </button>
            </div>
            <form onSubmit={handleSaveCategories} className="mt-4 space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-medium text-slate-700">
                    Selecione 1 ou mais categorias para esta pessoa *
                  </label>
                  <span className="text-[11px] text-slate-500">Ex.: Médico(a) + Diretoria</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ROLE_KEYS.map((rk) => {
                    const checked = editRoles.includes(rk);
                    const lockedSelfAdmin = editingUser.id === currentUser.id && rk === 'admin' && checked;
                    return (
                      <label
                        key={rk}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[#144A47]/10 border-[#144A47] text-[#144A47] font-medium'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        } ${lockedSelfAdmin ? 'opacity-75 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={lockedSelfAdmin}
                          onChange={() =>
                            setEditRoles((prev) =>
                              toggleRoleInList(prev, rk, editingUser.id === currentUser.id)
                            )
                          }
                          className="accent-[#144A47]"
                        />
                        <span>{ROLE_LABELS[rk]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {(hasHealthInEdit || editSpecialty.trim().length > 0) && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Especialidade / Registro (Saúde)
                  </label>
                  <input
                    type="text"
                    value={editSpecialty}
                    onChange={(e) => setEditSpecialty(e.target.value)}
                    placeholder="Ex.: Pediatria · CRM ou Psicologia · CRP"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  Selecionadas: <strong className="text-slate-800">{formatUserRoles(editRoles)}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="py-2 px-4 border border-slate-300 rounded-lg text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white font-medium rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {savingEdit ? 'Salvando...' : 'Salvar Categorias'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Criar Novo Usuário com 1 ou mais categorias */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6">
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-medium text-slate-700">Categorias de acesso *</label>
                  <span className="text-[11px] text-slate-500">Marque 1 ou mais</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ROLE_KEYS.map((rk) => {
                    const checked = form.roles.includes(rk);
                    return (
                      <label
                        key={rk}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[#144A47]/10 border-[#144A47] text-[#144A47] font-medium'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const nextRoles = toggleRoleInList(form.roles, rk);
                            const defaultSpec =
                              form.specialty ||
                              (nextRoles.includes('psicologo')
                                ? 'Psicologia'
                                : nextRoles.includes('medico')
                                  ? 'Pediatria / Clínica Médica'
                                  : nextRoles.includes('saude')
                                    ? 'Saúde'
                                    : '');
                            setForm({ ...form, roles: nextRoles, specialty: defaultSpec });
                          }}
                          className="accent-[#144A47]"
                        />
                        <span>{ROLE_LABELS[rk]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {hasHealthInCreate && (
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
