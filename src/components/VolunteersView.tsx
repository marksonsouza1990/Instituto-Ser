import { useEffect, useState, type FormEvent } from 'react';
import { Clock, Plus } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatDateBR } from '../lib/format';
import { hasAnyRole, type Project, type RoleInput, type Volunteer, type VolunteerHour } from '../types';

export function VolunteersView({ role }: { role: RoleInput }) {
  const [subTab, setSubTab] = useState<'equipe' | 'horas'>('equipe');
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [hoursLog, setHoursLog] = useState<VolunteerHour[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showVolModal, setShowVolModal] = useState(false);
  const [showHourModal, setShowHourModal] = useState(false);

  const [vForm, setVForm] = useState({
    full_name: '',
    cpf: '',
    phone: '',
    email: '',
    area: '',
    education: '',
    availability: '',
    schedule_hours: '',
    project_id: '',
    entry_date: '2026-11-23',
  });

  const [hForm, setHForm] = useState({
    volunteer_id: '',
    project_id: '',
    activity_date: '2026-11-23',
    hours: '4',
    activity_description: '',
  });

  const canManageTeam = hasAnyRole(role, ['admin', 'coordenacao_social', 'diretoria']);

  async function loadAll() {
    try {
      const [vRes, hRes, pRes] = await Promise.all([
        apiRequest<Volunteer[]>('/api/volunteers'),
        apiRequest<VolunteerHour[]>('/api/volunteers/hours'),
        apiRequest<Project[]>('/api/projects'),
      ]);
      setVolunteers(vRes);
      setHoursLog(hRes);
      setProjects(pRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar voluntários.');
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleCreateVolunteer(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/volunteers', {
        method: 'POST',
        body: JSON.stringify({
          ...vForm,
          project_id: vForm.project_id ? Number(vForm.project_id) : null,
        }),
      });
      setShowVolModal(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar voluntário.');
    }
  }

  async function handleLogHours(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/volunteers/hours', {
        method: 'POST',
        body: JSON.stringify({
          ...hForm,
          volunteer_id: Number(hForm.volunteer_id),
          project_id: hForm.project_id ? Number(hForm.project_id) : null,
          hours: Number(hForm.hours),
        }),
      });
      setShowHourModal(false);
      setHForm({ ...hForm, activity_description: '' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar horas.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Voluntários e Colaboradores
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Gestão da equipe social, áreas de atuação, disponibilidade e registro de horas voluntárias.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#EFECE4] border border-[#E5E1D8] rounded-lg">
            <button
              type="button"
              onClick={() => setSubTab('equipe')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                subTab === 'equipe' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
              }`}
            >
              Equipe ({volunteers.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('horas')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                subTab === 'horas' ? 'bg-white text-[#144A47] shadow-xs' : 'text-slate-600'
              }`}
            >
              Horas Registradas ({hoursLog.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (volunteers.length > 0) setHForm((f) => ({ ...f, volunteer_id: String(volunteers[0].id) }));
              setShowHourModal(true);
            }}
            className="inline-flex items-center gap-1.5 py-2 px-4 border border-slate-300 bg-white text-slate-800 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Clock className="w-4 h-4" />
            Registrar Horas
          </button>

          {canManageTeam && (
            <button
              type="button"
              onClick={() => setShowVolModal(true)}
              className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Novo Voluntário
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
      )}

      {subTab === 'equipe' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                <th className="py-3 px-4">Voluntário / Colaborador</th>
                <th className="py-3 px-4">Área e Formação</th>
                <th className="py-3 px-4">Disponibilidade / Horários</th>
                <th className="py-3 px-4">Projeto Vinculado</th>
                <th className="py-3 px-4 text-right">Horas Acumuladas</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {volunteers.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{v.full_name}</div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {v.phone} · Ingresso {formatDateBR(v.entry_date)}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-slate-800">{v.area}</div>
                    <div className="text-[11px] text-slate-500">{v.education}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <div>{v.availability}</div>
                    <div className="text-[11px] text-slate-400">{v.schedule_hours}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-700">{v.project_name || 'Apoio Geral'}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-[#0E5A75]">
                    {(v.total_hours ?? 0).toFixed(1)}h
                  </td>
                  <td className="py-3 px-4">
                    <span className={v.status === 'ativo' ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                      {v.status === 'ativo' ? 'Ativo' : v.status}
                    </span>
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
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4">Voluntário</th>
                <th className="py-3 px-4">Projeto</th>
                <th className="py-3 px-4">Atividade Realizada</th>
                <th className="py-3 px-4 text-right">Horas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hoursLog.map((h) => (
                <tr key={h.id}>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                    {formatDateBR(h.activity_date)}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900">{h.volunteer_name}</td>
                  <td className="py-3 px-4 text-slate-600">{h.project_name || 'Institucional'}</td>
                  <td className="py-3 px-4 text-slate-700">{h.activity_description}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-[#0E5A75]">
                    {h.hours}h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showVolModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">Cadastrar Voluntário</h2>
              <button type="button" onClick={() => setShowVolModal(false)} className="text-xs text-slate-500 cursor-pointer">
                Fechar
              </button>
            </div>
            <form onSubmit={handleCreateVolunteer} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nome completo *</label>
                  <input
                    type="text"
                    required
                    value={vForm.full_name}
                    onChange={(e) => setVForm({ ...vForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">CPF *</label>
                  <input
                    type="text"
                    required
                    value={vForm.cpf}
                    onChange={(e) => setVForm({ ...vForm, cpf: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Área de atuação *</label>
                  <input
                    type="text"
                    required
                    value={vForm.area}
                    onChange={(e) => setVForm({ ...vForm, area: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Formação profissional</label>
                  <input
                    type="text"
                    value={vForm.education}
                    onChange={(e) => setVForm({ ...vForm, education: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={vForm.phone}
                    onChange={(e) => setVForm({ ...vForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Projeto vinculado</label>
                  <select
                    value={vForm.project_id}
                    onChange={(e) => setVForm({ ...vForm, project_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Apoio Geral</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Disponibilidade</label>
                  <input
                    type="text"
                    value={vForm.availability}
                    onChange={(e) => setVForm({ ...vForm, availability: e.target.value })}
                    placeholder="Ex.: Terças e Quintas"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Horário de atuação</label>
                  <input
                    type="text"
                    value={vForm.schedule_hours}
                    onChange={(e) => setVForm({ ...vForm, schedule_hours: e.target.value })}
                    placeholder="Ex.: 14h às 17h"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVolModal(false)}
                  className="py-2 px-4 border border-slate-300 rounded-lg text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button type="submit" className="py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white font-medium rounded-lg cursor-pointer">
                  Salvar Voluntário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showHourModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">Registrar Horas Voluntárias</h2>
              <button type="button" onClick={() => setShowHourModal(false)} className="text-xs text-slate-500 cursor-pointer">
                Fechar
              </button>
            </div>
            <form onSubmit={handleLogHours} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Voluntário *</label>
                <select
                  required
                  value={hForm.volunteer_id}
                  onChange={(e) => setHForm({ ...hForm, volunteer_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {volunteers.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.full_name}
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
                    value={hForm.activity_date}
                    onChange={(e) => setHForm({ ...hForm, activity_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Qtd. Horas *</label>
                  <input
                    type="number"
                    required
                    min="0.5"
                    step="0.5"
                    value={hForm.hours}
                    onChange={(e) => setHForm({ ...hForm, hours: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Projeto</label>
                <select
                  value={hForm.project_id}
                  onChange={(e) => setHForm({ ...hForm, project_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Atividade Geral</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Atividade realizada *</label>
                <textarea
                  rows={2}
                  required
                  value={hForm.activity_description}
                  onChange={(e) => setHForm({ ...hForm, activity_description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowHourModal(false)}
                  className="py-2 px-4 border border-slate-300 rounded-lg text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button type="submit" className="py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white font-medium rounded-lg cursor-pointer">
                  Salvar Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
