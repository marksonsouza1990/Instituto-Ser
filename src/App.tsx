import { useEffect, useState, type ComponentType } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  GraduationCap,
  HeartPulse,
  ClipboardCheck,
  FolderKanban,
  Users,
  HeartHandshake,
  Wallet,
  Building2,
  FolderOpen,
  FileOutput,
  BarChart3,
  ShieldCheck,
  FolderCog,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { apiRequest, setSessionToken } from './lib/api';
import { BrandLogo, BrandStrip } from './components/BrandLogo';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { AgendaView } from './components/AgendaView';
import { StudentsView } from './components/StudentsView';
import { HealthView } from './components/HealthView';
import { AttendanceView } from './components/AttendanceView';
import { ProjectsView } from './components/ProjectsView';
import { VolunteersView } from './components/VolunteersView';
import { DonorsView } from './components/DonorsView';
import { FinanceView } from './components/FinanceView';
import { SuppliersView } from './components/SuppliersView';
import { DocumentsView } from './components/DocumentsView';
import { DocumentGeneratorView } from './components/DocumentGeneratorView';
import { ReportsView } from './components/ReportsView';
import { AdminView } from './components/AdminView';
import { CadastrosView } from './components/CadastrosView';
import { FINANCE_ROLES, HEALTH_ROLES, ROLE_LABELS, type AuthUser, type UserRole } from './types';

interface NavItem {
  id: string;
  label: string;
  group: string;
  icon: ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard Executivo',
    group: 'Visão Geral',
    icon: LayoutDashboard,
    roles: ['admin', 'diretoria', 'financeiro', 'coordenacao_social', 'saude', 'psicologo', 'medico', 'professor', 'voluntario'],
  },
  {
    id: 'agenda',
    label: 'Agenda Institucional',
    group: 'Visão Geral',
    icon: CalendarDays,
    roles: ['admin', 'diretoria', 'financeiro', 'coordenacao_social', 'saude', 'psicologo', 'medico', 'professor', 'voluntario'],
  },
  {
    id: 'alunos',
    label: 'Alunos e Famílias',
    group: 'Pessoas e Cuidado',
    icon: GraduationCap,
    roles: ['admin', 'diretoria', 'coordenacao_social', ...HEALTH_ROLES, 'professor'],
  },
  {
    id: 'saude',
    label: 'Pacientes e Saúde',
    group: 'Pessoas e Cuidado',
    icon: HeartPulse,
    roles: HEALTH_ROLES,
  },
  {
    id: 'frequencia',
    label: 'Frequência e Atividades',
    group: 'Pessoas e Cuidado',
    icon: ClipboardCheck,
    roles: ['admin', 'coordenacao_social', 'professor', 'voluntario'],
  },
  {
    id: 'projetos',
    label: 'Projetos e Iniciativas',
    group: 'Programas e Rede',
    icon: FolderKanban,
    roles: ['admin', 'diretoria', 'financeiro', 'coordenacao_social', 'professor', 'voluntario'],
  },
  {
    id: 'voluntarios',
    label: 'Voluntários e Equipe',
    group: 'Programas e Rede',
    icon: Users,
    roles: ['admin', 'diretoria', 'coordenacao_social', 'voluntario'],
  },
  {
    id: 'doadores',
    label: 'Doadores e Apoiadores',
    group: 'Programas e Rede',
    icon: HeartHandshake,
    roles: ['admin', 'diretoria', 'financeiro', 'coordenacao_social'],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    group: 'Gestão e Finanças',
    icon: Wallet,
    roles: FINANCE_ROLES,
  },
  {
    id: 'fornecedores',
    label: 'Fornecedores',
    group: 'Gestão e Finanças',
    icon: Building2,
    roles: FINANCE_ROLES,
  },
  {
    id: 'documentos',
    label: 'Documentos',
    group: 'Gestão e Finanças',
    icon: FolderOpen,
    roles: ['admin', 'diretoria', 'financeiro', 'coordenacao_social', 'saude', 'psicologo', 'medico', 'professor', 'voluntario'],
  },
  {
    id: 'gerar_documentos',
    label: 'Gerar Documentos',
    group: 'Gestão e Finanças',
    icon: FileOutput,
    roles: ['admin', 'diretoria', 'financeiro', 'coordenacao_social', 'saude', 'psicologo', 'medico', 'professor', 'voluntario'],
  },
  {
    id: 'relatorios',
    label: 'Relatórios e Contas',
    group: 'Gestão e Finanças',
    icon: BarChart3,
    roles: ['admin', 'diretoria', 'financeiro', 'coordenacao_social', 'psicologo', 'medico', 'saude'],
  },
  {
    id: 'cadastros',
    label: 'Editar Cadastros',
    group: 'Governança',
    icon: FolderCog,
    roles: ['admin', 'diretoria', 'coordenacao_social', 'financeiro', 'professor', 'saude', 'psicologo', 'medico'],
  },
  {
    id: 'usuarios',
    label: 'Usuários e Auditoria',
    group: 'Governança',
    icon: ShieldCheck,
    roles: ['admin', 'diretoria'],
  },
];

export default function App() {
  const [bootstrapped, setBootstrapped] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    apiRequest<{ bootstrapped: boolean }>('/api/auth/status')
      .then((res) => setBootstrapped(res.bootstrapped))
      .catch(() => setBootstrapped(true));
  }, []);

  function handleLogout() {
    setSessionToken(null);
    setUser(null);
    setActiveTab('dashboard');
  }

  if (bootstrapped === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] text-sm text-[#556262]">
        Carregando Instituto SER — Gestão Integrada...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        bootstrapped={bootstrapped}
        onAuthenticated={(loggedUser) => {
          setUser(loggedUser);
          setBootstrapped(true);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  const allowedNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const groups = Array.from(new Set(allowedNav.map((i) => i.group)));
  const currentNavItem = allowedNav.find((i) => i.id === activeTab) || allowedNav[0];
  const currentTabId = currentNavItem ? currentNavItem.id : 'dashboard';

  function navigateTo(tabId: string) {
    if (allowedNav.some((n) => n.id === tabId)) {
      setActiveTab(tabId);
      setMobileMenuOpen(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#182424]/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#E5E1D8] flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <BrandStrip className="h-[3px] shrink-0" />
        <div className="h-16 px-4 border-b border-[#E5E1D8] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#F7F5F0] border border-[#E5E1D8] flex items-center justify-center p-1 shrink-0">
              <BrandLogo className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-extrabold text-sm tracking-tight text-[#144A47] leading-tight whitespace-nowrap">
                Instituto SER
              </div>
              <div className="text-[10px] text-[#556262] truncate">
                Vida em movimento
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden text-[#556262] p-1"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Navegação principal">
          {groups.map((group) => (
            <div key={group}>
              <div className="px-3 mb-1.5 text-[11px] font-medium text-[#556262]/80">
                {group}
              </div>
              <ul className="space-y-0.5">
                {allowedNav
                  .filter((i) => i.group === group)
                  .map((item) => {
                    const Icon = item.icon;
                    const active = currentTabId === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => navigateTo(item.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left ${
                            active
                              ? 'bg-[#144A47] text-white'
                              : 'text-[#182424]/80 hover:bg-[#F7F5F0] hover:text-[#144A47]'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#EBB428]' : 'text-[#556262]/70'}`} />
                          <span className="truncate">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-[#E5E1D8] bg-[#F7F5F0]/60 text-xs text-[#556262]">
          <div className="font-semibold text-[#182424] truncate">{user.name}</div>
          <div className="text-[11px] text-[#0E5A75] font-medium truncate">{ROLE_LABELS[user.role]}</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract (3 clean zones) */}
        <header className="h-14 bg-white border-b border-[#E5E1D8] px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-[#556262] hover:text-[#182424]"
              aria-label="Abrir menu de navegação"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs text-[#556262] truncate">
              <span className="font-medium text-[#144A47]">Instituto SER</span>
              <span className="mx-2 text-[#E5E1D8]">/</span>
              <span className="font-medium text-[#182424]">{currentNavItem?.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:block text-xs text-[#556262] whitespace-nowrap">
              <span className="text-[#182424]">{user.name}</span>
              <span className="mx-1.5 text-[#E5E1D8]">·</span>
              <span className="text-[#144A47] font-medium">{ROLE_LABELS[user.role]}</span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 py-1.5 px-3 border border-[#E5E1D8] rounded-lg text-xs font-medium text-[#182424] hover:bg-[#F7F5F0] cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </button>
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {currentTabId === 'dashboard' && (
            <DashboardView role={user.role} onNavigate={navigateTo} />
          )}
          {currentTabId === 'agenda' && <AgendaView role={user.role} />}
          {currentTabId === 'alunos' && <StudentsView role={user.role} />}
          {currentTabId === 'saude' && <HealthView role={user.role} />}
          {currentTabId === 'frequencia' && <AttendanceView role={user.role} />}
          {currentTabId === 'projetos' && <ProjectsView role={user.role} />}
          {currentTabId === 'voluntarios' && <VolunteersView role={user.role} />}
          {currentTabId === 'doadores' && <DonorsView role={user.role} />}
          {currentTabId === 'financeiro' && <FinanceView role={user.role} />}
          {currentTabId === 'fornecedores' && <SuppliersView role={user.role} />}
          {currentTabId === 'documentos' && <DocumentsView role={user.role} />}
          {currentTabId === 'gerar_documentos' && <DocumentGeneratorView role={user.role} />}
          {currentTabId === 'relatorios' && <ReportsView role={user.role} />}
          {currentTabId === 'cadastros' && <CadastrosView role={user.role} />}
          {currentTabId === 'usuarios' && <AdminView currentUser={user} />}
        </main>
      </div>
    </div>
  );
}
