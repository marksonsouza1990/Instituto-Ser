import { useEffect, useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { hasAnyRole, type AttendanceClass, type RoleInput } from '../types';

interface RosterRow {
  id: number;
  full_name: string;
  school_year: string;
  student_status: string;
  attendance_status: 'presente' | 'falta' | 'justificada' | null;
  justification: string | null;
  monthly_rate: number | null;
}

export function AttendanceView({ role }: { role: RoleInput }) {
  const [classes, setClasses] = useState<AttendanceClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [date, setDate] = useState('2026-11-23');
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [draft, setDraft] = useState<Record<number, { status: 'presente' | 'falta' | 'justificada'; justification: string }>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRecord = hasAnyRole(role, ['admin', 'coordenacao_social', 'professor', 'voluntario']);

  useEffect(() => {
    apiRequest<AttendanceClass[]>('/api/attendance/classes')
      .then((res) => {
        setClasses(res);
        if (res.length > 0) setSelectedClassId(res[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar turmas.'));
  }, []);

  async function loadRoster(classId: number, targetDate: string) {
    setError(null);
    try {
      const rows = await apiRequest<RosterRow[]>(`/api/attendance/roster/${classId}?date=${targetDate}`);
      setRoster(rows);
      const initial: typeof draft = {};
      for (const r of rows) {
        initial[r.id] = {
          status: r.attendance_status || 'presente',
          justification: r.justification || '',
        };
      }
      setDraft(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar lista da turma.');
    }
  }

  useEffect(() => {
    if (selectedClassId) {
      loadRoster(selectedClassId, date);
    }
  }, [selectedClassId, date]);

  async function handleSaveAttendance() {
    if (!selectedClassId) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const entries = roster.map((r) => ({
        student_id: r.id,
        status: draft[r.id]?.status || 'presente',
        justification: draft[r.id]?.justification || '',
      }));
      await apiRequest('/api/attendance/record', {
        method: 'POST',
        body: JSON.stringify({ class_id: selectedClassId, date, entries }),
      });
      setMessage('Chamada salva com sucesso.');
      await loadRoster(selectedClassId, date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar frequência.');
    } finally {
      setSaving(false);
    }
  }

  const activeClass = classes.find((c) => c.id === selectedClassId);
  const lowAttendanceStudents = roster.filter((r) => r.monthly_rate != null && r.monthly_rate < 75);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Frequência e Atividades
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Controle diário de presença por turma, justificativa de ausências e alerta de baixa participação.
          </p>
        </div>

        {canRecord && roster.length > 0 && (
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAttendance}
            className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] disabled:opacity-60 text-white text-xs font-medium rounded-lg cursor-pointer self-start whitespace-nowrap"
          >
            <Check className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar Chamada'}
          </button>
        )}
      </div>

      {/* Turma and Date Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-700 mb-1">Turma / Oficina</label>
          <select
            value={selectedClassId ?? ''}
            onChange={(e) => setSelectedClassId(Number(e.target.value))}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.schedule_label})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Data da atividade</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
          />
        </div>
        {activeClass && (
          <div className="text-xs text-slate-500 pb-1">
            {activeClass.activity_type_name && (
              <>
                Atividade: <strong className="text-[#144A47]">{activeClass.activity_type_name}</strong> ·{' '}
              </>
            )}
            Educador: <strong className="text-slate-800">{activeClass.instructor_name}</strong> ·{' '}
            {activeClass.project_name}
          </div>
        )}
      </div>

      {lowAttendanceStudents.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <strong>Atenção — Baixa participação detectada (&lt; 75%):</strong>{' '}
            {lowAttendanceStudents.map((s) => `${s.full_name} (${s.monthly_rate}%)`).join(', ')}.
          </div>
        </div>
      )}

      {message && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {message}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
              <th className="py-3 px-4">Aluno</th>
              <th className="py-3 px-4 text-right">Frequência Geral</th>
              <th className="py-3 px-4">Registro do Dia</th>
              <th className="py-3 px-4">Justificativa de Ausência</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roster.map((stu) => {
              const cur = draft[stu.id] || { status: 'presente', justification: '' };
              const low = stu.monthly_rate != null && stu.monthly_rate < 75;
              return (
                <tr key={stu.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{stu.full_name}</div>
                    <div className="text-[11px] text-slate-500">{stu.school_year}</div>
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                      low ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    {stu.monthly_rate != null ? `${stu.monthly_rate}%` : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      {(['presente', 'falta', 'justificada'] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          disabled={!canRecord}
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              [stu.id]: { ...cur, status: opt },
                            }))
                          }
                          className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                            cur.status === opt
                              ? opt === 'presente'
                                ? 'bg-emerald-600 text-white'
                                : opt === 'falta'
                                  ? 'bg-red-600 text-white'
                                  : 'bg-amber-600 text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt === 'presente' ? 'Presente' : opt === 'falta' ? 'Falta' : 'Justificada'}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="text"
                      disabled={!canRecord || cur.status === 'presente'}
                      value={cur.justification}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [stu.id]: { ...cur, justification: e.target.value },
                        }))
                      }
                      placeholder={cur.status === 'presente' ? '—' : 'Motivo da ausência...'}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
