import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Download, FileText, Plus, Upload } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatDateBR } from '../lib/format';
import { FINANCE_ROLES, HEALTH_ROLES, hasAnyRole, type InstitutionalDocument, type Project, type RoleInput, type Student } from '../types';

const DOC_CATEGORIES = [
  'Documento do Aluno',
  'Autorização de Responsável',
  'Termo de Consentimento LGPD',
  'Documento de Profissional',
  'Contrato',
  'Nota Fiscal',
  'Comprovante Financeiro',
  'Relatório Institucional',
  'Documento Jurídico',
];

export function DocumentsView({ role }: { role: RoleInput }) {
  const [docs, setDocs] = useState<InstitutionalDocument[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [catFilter, setCatFilter] = useState('todas');
  const [projFilter, setProjFilter] = useState('todos');
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
    title: '',
    category: DOC_CATEGORIES[2],
    person_type: 'aluno' as 'aluno' | 'paciente' | 'voluntario' | 'fornecedor' | 'geral',
    person_id: '',
    person_name: '',
    project_id: '',
    access_level: 'geral' as 'geral' | 'restrito_saude' | 'restrito_financeiro' | 'restrito_diretoria',
    file_name: '',
    file_mime: 'application/pdf',
    file_size: 0,
    file_data_url: '',
  });

  async function loadAll() {
    try {
      const [dRes, pRes, sRes] = await Promise.all([
        apiRequest<InstitutionalDocument[]>('/api/documents'),
        apiRequest<Project[]>('/api/projects'),
        apiRequest<Student[]>('/api/students'),
      ]);
      setDocs(dRes);
      setProjects(pRes);
      setStudents(sRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar documentos.');
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_800_000) {
      setError('O arquivo excede o limite de 1,8 MB para armazenamento institucional.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({
        ...prev,
        file_name: file.name,
        file_mime: file.type || 'application/octet-stream',
        file_size: file.size,
        file_data_url: typeof reader.result === 'string' ? reader.result : '',
      }));
    };
    reader.readAsDataURL(file);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let personName = form.person_name;
    if (form.person_type === 'aluno' && form.person_id) {
      const st = students.find((s) => s.id === Number(form.person_id));
      if (st) personName = st.full_name;
    }
    try {
      await apiRequest('/api/documents', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          person_id: form.person_id ? Number(form.person_id) : null,
          person_name: personName || 'Instituto SER',
          project_id: form.project_id ? Number(form.project_id) : null,
        }),
      });
      setShowModal(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao anexar documento.');
    }
  }

  async function handleDownload(docItem: InstitutionalDocument) {
    try {
      const res = await apiRequest<{
        file_name: string;
        file_data_url: string | null;
        title: string;
        category: string;
        person_name: string;
        uploaded_by: string;
        uploaded_at: string;
      }>(`/api/documents/${docItem.id}/download`);

      if (res.file_data_url) {
        const a = document.createElement('a');
        a.href = res.file_data_url;
        a.download = res.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // Generate clean text receipt summary for seeded reference docs
        const content = `INSTITUTO SER — COMPROVANTE DE DOCUMENTO ARQUIVADO\nTítulo: ${res.title}\nCategoria: ${res.category}\nVinculado a: ${res.person_name}\nArquivo: ${res.file_name}\nRegistrado por: ${res.uploaded_by} em ${formatDateBR(res.uploaded_at)}\n`;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${res.file_name}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao baixar documento.');
    }
  }

  const filtered = docs.filter((d) => {
    const cOk = catFilter === 'todas' || d.category === catFilter;
    const pOk = projFilter === 'todos' || String(d.project_id || '') === projFilter;
    return cOk && pOk;
  });

  const canUpload = hasAnyRole(role, ['admin', 'diretoria', 'financeiro', 'coordenacao_social', 'saude', 'psicologo', 'medico', 'professor']);
  const canSeeFinance = hasAnyRole(role, FINANCE_ROLES);
  const canSeeHealth = hasAnyRole(role, HEALTH_ROLES);
  const canSeeDiretoria = hasAnyRole(role, ['admin', 'diretoria']);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Repositório Digital de Documentos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Armazenamento organizado por categoria, pessoa e projeto com níveis de acesso controlados.
          </p>
        </div>

        {canUpload && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 py-2 px-4 bg-[#144A47] hover:bg-[#0E3735] text-white text-xs font-medium rounded-lg cursor-pointer self-start"
          >
            <Plus className="w-4 h-4" />
            Anexar Documento
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="todas">Todas as categorias</option>
          {DOC_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={projFilter}
          onChange={(e) => setProjFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="todos">Todos os projetos</option>
          {projects.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
              <th className="py-3 px-4">Documento</th>
              <th className="py-3 px-4">Categoria</th>
              <th className="py-3 px-4">Pessoa / Origem</th>
              <th className="py-3 px-4">Projeto</th>
              <th className="py-3 px-4">Nível de Acesso</th>
              <th className="py-3 px-4">Data</th>
              <th className="py-3 px-4 text-right">Arquivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50/70">
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-900 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-[#144A47] shrink-0" />
                    {d.title}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 pl-5">{d.file_name}</div>
                </td>
                <td className="py-3 px-4 text-slate-700">{d.category}</td>
                <td className="py-3 px-4 text-slate-700">{d.person_name || 'Institucional'}</td>
                <td className="py-3 px-4 text-slate-600">{d.project_name || 'Geral'}</td>
                <td className="py-3 px-4 text-slate-600">
                  {d.access_level === 'geral'
                    ? 'Geral'
                    : d.access_level === 'restrito_saude'
                      ? 'Restrito Saúde'
                      : d.access_level === 'restrito_financeiro'
                        ? 'Restrito Financeiro'
                        : 'Restrito Diretoria'}
                </td>
                <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                  {formatDateBR(d.uploaded_at)}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => handleDownload(d)}
                    className="inline-flex items-center gap-1 text-[#0E5A75] hover:underline font-medium cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900">Anexar Novo Documento</h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-xs text-slate-500 cursor-pointer">
                Fechar
              </button>
            </div>
            <form onSubmit={handleSave} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Título do documento *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Categoria *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {DOC_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nível de acesso</label>
                  <select
                    value={form.access_level}
                    onChange={(e) => setForm({ ...form, access_level: e.target.value as typeof form.access_level })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="geral">Geral (Equipe autenticada)</option>
                    {canSeeHealth && <option value="restrito_saude">Restrito Saúde (LGPD)</option>}
                    {canSeeFinance && <option value="restrito_financeiro">Restrito Financeiro</option>}
                    {canSeeDiretoria && <option value="restrito_diretoria">Restrito Diretoria</option>}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Vínculo</label>
                  <select
                    value={form.person_type}
                    onChange={(e) => setForm({ ...form, person_type: e.target.value as typeof form.person_type })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="aluno">Aluno</option>
                    <option value="paciente">Paciente</option>
                    <option value="fornecedor">Fornecedor</option>
                    <option value="voluntario">Voluntário</option>
                    <option value="geral">Institucional / Geral</option>
                  </select>
                </div>
                {form.person_type === 'aluno' ? (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Selecionar aluno</label>
                    <select
                      value={form.person_id}
                      onChange={(e) => setForm({ ...form, person_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Escolha...</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Nome vinculado</label>
                    <input
                      type="text"
                      value={form.person_name}
                      onChange={(e) => setForm({ ...form, person_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Projeto relacionado</label>
                <select
                  value={form.project_id}
                  onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Geral / Institucional</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Arquivo (PDF, imagem ou documento até 1,8 MB)</label>
                <label className="flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                  <Upload className="w-4 h-4 text-[#144A47]" />
                  <span>{form.file_name || 'Selecionar arquivo do computador'}</span>
                  <input type="file" onChange={handleFileChange} className="hidden" />
                </label>
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
                  Salvar Documento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
