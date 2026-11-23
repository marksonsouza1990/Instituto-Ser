import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { apiRequest, setSessionToken } from '../lib/api';
import { BrandLogo, BrandStrip, OfficialLogoImage } from './BrandLogo';
import type { AuthUser } from '../types';

interface LoginViewProps {
  bootstrapped: boolean;
  onAuthenticated: (user: AuthUser) => void;
}

const BRAND_PILLARS = [
  {
    name: 'Azul',
    color: '#0E5A75',
    meaning: 'Fé, confiança, direção e esperança.',
  },
  {
    name: 'Amarelo',
    color: '#EBB428',
    meaning: 'Vida, alegria, luz e propósito.',
  },
  {
    name: 'Vermelho',
    color: '#BD4B22',
    meaning: 'Amor, coragem, serviço e entrega.',
  },
  {
    name: 'Verde',
    color: '#6F873D',
    meaning: 'Crescimento, renovação, vida em abundância.',
  },
];

export function LoginView({ bootstrapped, onAuthenticated }: LoginViewProps) {
  const [mode, setMode] = useState<'login' | 'bootstrap' | 'forgot' | 'reset'>(
    bootstrapped ? 'login' : 'bootstrap'
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (mode === 'bootstrap') {
      if (password !== confirmPassword) {
        setError('As senhas informadas não coincidem.');
        return;
      }
      setLoading(true);
      try {
        const res = await apiRequest<{ token: string; user: AuthUser }>(
          '/api/auth/bootstrap-admin',
          {
            method: 'POST',
            body: JSON.stringify({ name, email, password }),
          }
        );
        setSessionToken(res.token);
        onAuthenticated(res.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao configurar administrador.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'login') {
      setLoading(true);
      try {
        const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setSessionToken(res.token);
        onAuthenticated(res.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'forgot') {
      setLoading(true);
      try {
        const res = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        setInfoMessage(res.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao solicitar recuperação.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'reset') {
      setLoading(true);
      try {
        const res = await apiRequest<{ message: string }>('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email, code: resetCode, newPassword: password }),
        });
        setInfoMessage(res.message);
        setMode('login');
        setPassword('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao redefinir senha.');
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] grid grid-cols-1 lg:grid-cols-12">
      {/* Left Institutional Brand Column */}
      <div className="hidden lg:flex lg:col-span-6 bg-[#144A47] text-white flex-col justify-between p-10 xl:p-14 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F7F5F0] flex items-center justify-center p-1.5">
              <BrandLogo className="w-full h-full" />
            </div>
            <div>
              <div className="font-display font-bold text-base tracking-tight text-white">
                Instituto SER
              </div>
              <div className="text-xs text-[#E5E1D8]/80">Gestão Integrada · Impacto Social</div>
            </div>
          </div>
          <span className="text-xs text-[#E5E1D8]/80 font-medium">
            Plataforma Institucional
          </span>
        </div>

        <div className="my-auto py-8 flex flex-col items-center text-center max-w-lg mx-auto">
          <div className="w-full max-w-[340px] rounded-2xl overflow-hidden bg-[#F7F5F0] border border-white/15 shadow-lg">
            <BrandStrip className="h-1" />
            <OfficialLogoImage className="w-full h-auto block" />
          </div>

          <h1 className="mt-7 font-display text-2xl xl:text-[28px] font-bold leading-snug text-white">
            Vida em movimento. <span className="font-normal italic text-[#EBB428]">Propósito em ação.</span>
          </h1>
          <p className="mt-2.5 text-sm text-[#E5E1D8]/85 leading-relaxed">
            Centralização de reforço escolar, psicologia, medicina, projetos esportivos, voluntariado, prestação de contas e conformidade LGPD.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3 pt-6 border-t border-white/15">
          {BRAND_PILLARS.map((pillar) => (
            <div key={pillar.name} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: pillar.color }}
                />
                <span className="text-[11px] font-display font-bold tracking-wider uppercase text-white">
                  {pillar.name}
                </span>
              </div>
              <p className="text-[11px] text-[#E5E1D8]/80 leading-snug">{pillar.meaning}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right Authentication Form Column */}
      <div className="lg:col-span-6 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-[#E5E1D8] rounded-xl overflow-hidden shadow-xs">
          <BrandStrip className="h-[3px]" />
          <div className="p-8">
            <div className="flex items-center gap-3 mb-6 lg:hidden">
              <div className="w-10 h-10 rounded-xl bg-[#F7F5F0] border border-[#E5E1D8] flex items-center justify-center p-1">
                <BrandLogo className="w-full h-full" />
              </div>
              <div>
                <div className="font-display font-bold text-base text-[#144A47]">Instituto SER</div>
                <div className="text-xs text-[#556262]">Vida em movimento. Propósito em ação.</div>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="font-display text-2xl font-bold text-[#182424]">
                {mode === 'bootstrap'
                  ? 'Configuração Inicial do Administrador'
                  : mode === 'login'
                    ? 'Acessar Plataforma'
                    : mode === 'forgot'
                      ? 'Recuperar Acesso'
                      : 'Redefinir Senha'}
              </h2>
              <p className="text-sm text-[#556262] mt-1.5">
                {mode === 'bootstrap'
                  ? 'Defina o primeiro acesso administrativo para liberar os módulos do Instituto SER.'
                  : mode === 'login'
                    ? 'Entre com suas credenciais institucionais para acessar os módulos autorizados.'
                    : mode === 'forgot'
                      ? 'Informe seu e-mail para registrar uma solicitação de recuperação junto à administração.'
                      : 'Informe o e-mail, o código fornecido e sua nova senha.'}
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
              >
                {error}
              </div>
            )}

            {infoMessage && (
              <div className="mb-4 p-3 rounded-lg bg-[#144A47]/5 border border-[#144A47]/20 text-xs text-[#144A47]">
                {infoMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'bootstrap' && (
                <div>
                  <label className="block text-xs font-medium text-[#182424] mb-1.5">
                    Nome completo do Administrador
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#556262] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex.: Coordenação Executiva"
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#E5E1D8] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#144A47]/20 focus:border-[#144A47]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#182424] mb-1.5">
                  E-mail institucional
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#556262] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nome@institutoser.org.br"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#E5E1D8] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#144A47]/20 focus:border-[#144A47]"
                  />
                </div>
              </div>

              {mode === 'reset' && (
                <div>
                  <label className="block text-xs font-medium text-[#182424] mb-1.5">
                    Código de recuperação
                  </label>
                  <input
                    type="text"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="Código informado pelo administrador"
                    className="w-full px-3 py-2.5 text-sm font-mono border border-[#E5E1D8] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#144A47]/20 focus:border-[#144A47]"
                  />
                </div>
              )}

              {(mode === 'login' || mode === 'bootstrap' || mode === 'reset') && (
                <div>
                  <label className="block text-xs font-medium text-[#182424] mb-1.5">
                    {mode === 'reset' ? 'Nova senha (mín. 6 caracteres)' : 'Senha de acesso'}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#556262] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={mode === 'login' ? 1 : 6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2.5 text-sm border border-[#E5E1D8] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#144A47]/20 focus:border-[#144A47]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#556262] hover:text-[#182424]"
                      aria-label="Alternar visualização da senha"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'bootstrap' && (
                <div>
                  <label className="block text-xs font-medium text-[#182424] mb-1.5">
                    Confirmar senha
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full px-3 py-2.5 text-sm border border-[#E5E1D8] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#144A47]/20 focus:border-[#144A47]"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#144A47] hover:bg-[#0E3735] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {loading
                  ? 'Processando...'
                  : mode === 'bootstrap'
                    ? 'Criar Conta Administrativa e Entrar'
                    : mode === 'login'
                      ? 'Entrar no Sistema'
                      : mode === 'forgot'
                        ? 'Solicitar Recuperação'
                        : 'Salvar Nova Senha'}
              </button>
            </form>

            <div className="mt-5 pt-5 border-t border-[#E5E1D8] flex flex-wrap items-center justify-between gap-2 text-xs text-[#556262]">
              {mode === 'login' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setInfoMessage(null);
                      setMode('forgot');
                    }}
                    className="text-[#0E5A75] hover:underline font-medium cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                  {!bootstrapped && (
                    <button
                      type="button"
                      onClick={() => setMode('bootstrap')}
                      className="text-[#556262] hover:underline cursor-pointer"
                    >
                      Configurar primeiro acesso
                    </button>
                  )}
                </>
              )}

              {mode === 'bootstrap' && (
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-[#0E5A75] hover:underline font-medium cursor-pointer"
                >
                  Já possuo conta / Usar código administrativo
                </button>
              )}

              {(mode === 'forgot' || mode === 'reset') && (
                <>
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-[#0E5A75] hover:underline font-medium cursor-pointer"
                  >
                    Voltar ao login
                  </button>
                  {mode === 'forgot' && (
                    <button
                      type="button"
                      onClick={() => setMode('reset')}
                      className="text-[#556262] hover:underline cursor-pointer"
                    >
                      Já tenho o código
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="mt-5 flex items-start gap-2 text-[11px] text-[#556262] leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-[#144A47] shrink-0 mt-0.5" />
              <span>
                Ambiente protegido por controle de acesso por função (RBAC), trilha de auditoria e proteção LGPD para dados de crianças e prontuários de saúde.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
