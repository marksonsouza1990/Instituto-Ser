import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  List,
  Plus,
  RotateCcw,
  Search,
  Stethoscope,
  Brain,
  BookOpen,
  Sparkles,
  Clock,
  MapPin,
  User as UserIcon,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { exportToPDF, formatDateBR } from '../lib/format';
import {
  HEALTH_ROLES,
  hasAnyRole,
  type AgendaData,
  type Appointment,
  type AttendanceClass,
  type InstitutionalEvent,
  type RoleInput,
} from '../types';

type ViewMode = 'semanal' | 'mensal' | 'lista';
type AgendaCategory = 'medico' | 'psicologico' | 'atividade' | 'evento';
type ShiftType = 'Manhã' | 'Tarde' | 'Integral';

interface UnifiedAgendaItem {
  uid: string;
  category: AgendaCategory;
  categoryLabel: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  title: string;
  subtitle: string;
  professionalOrLeader: string;
  specialtyOrActivity: string;
  projectId: number | null;
  projectName: string | null;
  shift: ShiftType;
  patientId?: number;
  patientName?: string;
  status?: string;
  location?: string;
  description?: string;
  classId?: number;
  activityTypeId?: number | null;
  eventId?: number;
  appointmentId?: number;
  rawAppointment?: Appointment;
  rawEvent?: InstitutionalEvent;
  rawClass?: AttendanceClass;
}

const DEFAULT_ANCHOR_DATE = '2026-11-23';

const WEEKDAY_NAMES_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEKDAY_NAMES_FULL = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function parseDateUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1, 12, 0, 0));
}

function formatUTCDateISO(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysISO(dateStr: string, days: number): string {
  const dt = parseDateUTC(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatUTCDateISO(dt);
}

function addMonthsISO(dateStr: string, months: number): string {
  const dt = parseDateUTC(dateStr);
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return formatUTCDateISO(dt);
}

function getMondayOfWeekISO(dateStr: string): string {
  const dt = parseDateUTC(dateStr);
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return formatUTCDateISO(dt);
}

function getWeekDatesISO(anchorDate: string): string[] {
  const monday = getMondayOfWeekISO(anchorDate);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
}

function getMonthGridDatesISO(anchorDate: string): { date: string; inMonth: boolean }[] {
  const dt = parseDateUTC(anchorDate);
  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1, 12, 0, 0));
  const lastOfMonth = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0));

  const startMonday = getMondayOfWeekISO(formatUTCDateISO(firstOfMonth));
  const endDow = lastOfMonth.getUTCDay();
  const endOffset = endDow === 0 ? 0 : 7 - endDow;
  const endSunday = addDaysISO(formatUTCDateISO(lastOfMonth), endOffset);

  const cells: { date: string; inMonth: boolean }[] = [];
  let cursor = startMonday;
  while (cursor <= endSunday && cells.length < 42) {
    const cDt = parseDateUTC(cursor);
    cells.push({
      date: cursor,
      inMonth: cDt.getUTCMonth() === month && cDt.getUTCFullYear() === year,
    });
    cursor = addDaysISO(cursor, 1);
  }
  return cells;
}

function normalizeStr(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseClassRecurrence(scheduleLabel: string, shift: string): { weekdays: number[]; time: string } {
  const norm = normalizeStr(scheduleLabel || '');
  const weekdays: number[] = [];

  if (norm.includes('diar') || norm.includes('seg a sex') || norm.includes('segunda a sexta')) {
    weekdays.push(1, 2, 3, 4, 5);
  } else {
    if (norm.includes('dom')) weekdays.push(0);
    if (norm.includes('seg')) weekdays.push(1);
    if (norm.includes('ter')) weekdays.push(2);
    if (norm.includes('qua')) weekdays.push(3);
    if (norm.includes('qui')) weekdays.push(4);
    if (norm.includes('sex')) weekdays.push(5);
    if (norm.includes('sab')) weekdays.push(6);
  }

  if (weekdays.length === 0) {
    weekdays.push(1, 3, 5);
  }

  const timeMatch = scheduleLabel.match(/(\d{1,2})\s*[h:]\s*(\d{2})/i);
  let time = '09:00';
  if (timeMatch) {
    time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  } else if (normalizeStr(shift) === 'tarde') {
    time = '14:00';
  } else if (normalizeStr(shift) === 'manha') {
    time = '08:30';
  }

  return { weekdays, time };
}

function inferShiftFromTime(timeStr: string, explicitShift?: string): ShiftType {
  if (explicitShift === 'Manhã' || explicitShift === 'Tarde' || explicitShift === 'Integral') {
    return explicitShift;
  }
  const hour = Number((timeStr || '09:00').split(':')[0]);
  if (Number.isFinite(hour)) {
    return hour < 12 ? 'Manhã' : 'Tarde';
  }
  return 'Manhã';
}

function isPsychSpecialty(specialty: string): boolean {
  return normalizeStr(specialty || '').includes('psic');
}

const CATEGORY_META: Record<
  AgendaCategory,
  {
    label: string;
    dotColor: string;
    cardBg: string;
    cardBorder: string;
    accentText: string;
  }
> = {
  medico: {
    label: 'Médico',
    dotColor: 'bg-[#0E5A75]',
    cardBg: 'bg-[#0E5A75]/[0.06]',
    cardBorder: 'border-[#0E5A75]/25',
    accentText: 'text-[#0E5A75]',
  },
  psicologico: {
    label: 'Psicológico',
    dotColor: 'bg-[#144A47]',
    cardBg: 'bg-[#144A47]/[0.06]',
    cardBorder: 'border-[#144A47]/25',
    accentText: 'text-[#144A47]',
  },
  atividade: {
    label: 'Atividade',
    dotColor: 'bg-[#6F873D]',
    cardBg: 'bg-[#6F873D]/[0.07]',
    cardBorder: 'border-[#6F873D]/30',
    accentText: 'text-[#4F6327]',
  },
  evento: {
    label: 'Evento',
    dotColor: 'bg-[#EBB428]',
    cardBg: 'bg-[#EBB428]/[0.12]',
    cardBorder: 'border-[#EBB428]/45',
    accentText: 'text-[#875F00]',
  },
};

export function AgendaView({ role }: { role: RoleInput }) {
  const canSeeHealth = hasAnyRole(role, HEALTH_ROLES);
  const canCreateEvents = hasAnyRole(role, ['admin', 'diretoria', 'coordenacao_social']);

  const [data, setData] = useState<AgendaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Calendar mode & navigation
  const [viewMode, setViewMode] = useState<ViewMode>('semanal');
  const [anchorDate, setAnchorDate] = useState<string>(DEFAULT_ANCHOR_DATE);
  const [selectedDay, setSelectedDay] = useState<string>(DEFAULT_ANCHOR_DATE);
  const [selectedItem, setSelectedItem] = useState<UnifiedAgendaItem | null>(null);

  // Category toggles
  const [showEvents, setShowEvents] = useState(true);
  const [showActivities, setShowActivities] = useState(true);
  const [showMedical, setShowMedical] = useState(true);
  const [showPsychological, setShowPsychological] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [patientFilter, setPatientFilter] = useState('todos');
  const [doctorFilter, setDoctorFilter] = useState('todos');
  const [psychFilter, setPsychFilter] = useState('todos');
  const [activityFilter, setActivityFilter] = useState('todos'); // 'todos' | 'type:<id>' | 'class:<id>'
  const [eventFilter, setEventFilter] = useState('todos'); // 'todos' | 'event:<id>'
  const [educatorFilter, setEducatorFilter] = useState('todos');
  const [projectFilter, setProjectFilter] = useState('todos');
  const [shiftFilter, setShiftFilter] = useState<'todos' | ShiftType>('todos');
  const [statusFilter, setStatusFilter] = useState('todos');

  // Creation Modals
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState(DEFAULT_ANCHOR_DATE);
  const [newEventTime, setNewEventTime] = useState('09:30');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [newEventProjectId, setNewEventProjectId] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);

  const [showApptModal, setShowApptModal] = useState(false);
  const [newApptPatientId, setNewApptPatientId] = useState('');
  const [newApptProfessional, setNewApptProfessional] = useState('');
  const [newApptSpecialty, setNewApptSpecialty] = useState('Psicologia');
  const [newApptDate, setNewApptDate] = useState(DEFAULT_ANCHOR_DATE);
  const [newApptTime, setNewApptTime] = useState('09:00');
  const [newApptIsReturn, setNewApptIsReturn] = useState(false);
  const [newApptNotes, setNewApptNotes] = useState('');
  const [savingAppt, setSavingAppt] = useState(false);

  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

  const loadAgenda = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<AgendaData>('/api/agenda');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar agenda institucional.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgenda();
  }, [loadAgenda]);

  // Visible date list for current view mode
  const weekDates = useMemo(() => getWeekDatesISO(anchorDate), [anchorDate]);
  const monthGridCells = useMemo(() => getMonthGridDatesISO(anchorDate), [anchorDate]);

  const activeRange = useMemo(() => {
    if (viewMode === 'semanal') {
      return {
        start: weekDates[0],
        end: weekDates[6],
        dates: weekDates,
      };
    }
    const dt = parseDateUTC(anchorDate);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth();
    const first = formatUTCDateISO(new Date(Date.UTC(y, m, 1, 12, 0, 0)));
    const last = formatUTCDateISO(new Date(Date.UTC(y, m + 1, 0, 12, 0, 0)));
    const inMonthDates = monthGridCells.filter((c) => c.inMonth).map((c) => c.date);
    return {
      start: first,
      end: last,
      dates: inMonthDates,
    };
  }, [viewMode, weekDates, monthGridCells, anchorDate]);

  // Distinct dropdown options derived from real data
  const doctorOptions = useMemo(() => {
    if (!data || !canSeeHealth) return [];
    const set = new Set<string>();
    for (const a of data.appointments) {
      if (!isPsychSpecialty(a.specialty) && a.professional_name) set.add(a.professional_name);
    }
    for (const p of data.patients) {
      if (!isPsychSpecialty(p.specialty) && p.responsible_professional) set.add(p.responsible_professional);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data, canSeeHealth]);

  const psychOptions = useMemo(() => {
    if (!data || !canSeeHealth) return [];
    const set = new Set<string>();
    for (const a of data.appointments) {
      if (isPsychSpecialty(a.specialty) && a.professional_name) set.add(a.professional_name);
    }
    for (const p of data.patients) {
      if (isPsychSpecialty(p.specialty) && p.responsible_professional) set.add(p.responsible_professional);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data, canSeeHealth]);

  const educatorOptions = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const c of data.classes) {
      if (c.instructor_name) set.add(c.instructor_name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

  // Build unified items for the visible date span (including padding days of month grid if in mensal view)
  const allRangeItems = useMemo<UnifiedAgendaItem[]>(() => {
    if (!data) return [];
    const items: UnifiedAgendaItem[] = [];

    const expandDates =
      viewMode === 'mensal' ? monthGridCells.map((c) => c.date) : activeRange.dates;
    const minDate = expandDates[0];
    const maxDate = expandDates[expandDates.length - 1];

    // 1. Institutional Events
    for (const ev of data.events) {
      if (ev.event_date >= minDate && ev.event_date <= maxDate) {
        items.push({
          uid: `ev-${ev.id}`,
          category: 'evento',
          categoryLabel: 'Evento',
          date: ev.event_date,
          time: ev.event_time || '09:00',
          title: ev.title,
          subtitle: ev.location || 'Sede Instituto SER',
          professionalOrLeader: 'Coordenação Institucional',
          specialtyOrActivity: 'Evento Institucional',
          projectId: ev.project_id,
          projectName: ev.project_name || null,
          shift: inferShiftFromTime(ev.event_time || '09:00'),
          status: 'Confirmado',
          location: ev.location,
          description: ev.description,
          eventId: ev.id,
          rawEvent: ev,
        });
      }
    }

    // 2. Recurring Classes / Activities expanded onto matching weekdays
    for (const cls of data.classes) {
      const { weekdays, time } = parseClassRecurrence(cls.schedule_label, cls.shift);
      for (const dateISO of expandDates) {
        const dow = parseDateUTC(dateISO).getUTCDay();
        if (!weekdays.includes(dow)) continue;
        items.push({
          uid: `cls-${cls.id}-${dateISO}`,
          category: 'atividade',
          categoryLabel: 'Atividade',
          date: dateISO,
          time,
          title: cls.name,
          subtitle: `${cls.activity_type_name || 'Atividade'} · ${cls.instructor_name}`,
          professionalOrLeader: cls.instructor_name,
          specialtyOrActivity: cls.activity_type_name || 'Atividade Socioeducativa',
          projectId: cls.project_id,
          projectName: cls.project_name || null,
          shift: inferShiftFromTime(time, cls.shift),
          status: `${cls.student_count ?? 0} inscritos`,
          location: 'Sede Instituto SER',
          description: `Horário recorrente: ${cls.schedule_label}`,
          classId: cls.id,
          activityTypeId: cls.activity_type_id ?? null,
          rawClass: cls,
        });
      }
    }

    // 3. Health Appointments (STRICT RBAC)
    if (canSeeHealth && data.canSeeHealth) {
      for (const app of data.appointments) {
        if (app.scheduled_date < minDate || app.scheduled_date > maxDate) continue;
        const isPsych = isPsychSpecialty(app.specialty);
        const cat: AgendaCategory = isPsych ? 'psicologico' : 'medico';
        items.push({
          uid: `app-${app.id}`,
          category: cat,
          categoryLabel: isPsych ? 'Psicológico' : 'Médico',
          date: app.scheduled_date,
          time: app.scheduled_time || '09:00',
          title: app.patient_name || `Paciente #${app.patient_id}`,
          subtitle: `${app.specialty} · ${app.professional_name}`,
          professionalOrLeader: app.professional_name,
          specialtyOrActivity: app.specialty,
          projectId: null,
          projectName: 'Clínica Cuidar — Psicologia e Saúde',
          shift: inferShiftFromTime(app.scheduled_time || '09:00'),
          patientId: app.patient_id,
          patientName: app.patient_name || `Paciente #${app.patient_id}`,
          status: app.status,
          location: 'Consultório Instituto SER',
          description: app.notes || (app.referral_to ? `Encaminhamento: ${app.referral_to}` : ''),
          appointmentId: app.id,
          rawAppointment: app,
        });
      }
    }

    items.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });

    return items;
  }, [data, viewMode, monthGridCells, activeRange.dates, canSeeHealth]);

  // Apply all user filters cleanly
  const filteredItems = useMemo(() => {
    const q = normalizeStr(searchTerm.trim());
    const hasHealthProFilter = canSeeHealth && (doctorFilter !== 'todos' || psychFilter !== 'todos');

    return allRangeItems.filter((item) => {
      // Layer toggles
      if (item.category === 'evento' && !showEvents) return false;
      if (item.category === 'atividade' && !showActivities) return false;
      if (item.category === 'medico' && (!canSeeHealth || !showMedical)) return false;
      if (item.category === 'psicologico' && (!canSeeHealth || !showPsychological)) return false;

      // Specific Patient filter -> isolates health appointments for that patient
      if (canSeeHealth && patientFilter !== 'todos') {
        if (String(item.patientId ?? '') !== patientFilter) return false;
      }

      // Specific Doctor and/or Psychologist filter
      if (hasHealthProFilter) {
        const matchesDoctor =
          doctorFilter !== 'todos' &&
          item.category === 'medico' &&
          item.professionalOrLeader === doctorFilter;
        const matchesPsych =
          psychFilter !== 'todos' &&
          item.category === 'psicologico' &&
          item.professionalOrLeader === psychFilter;
        if (!matchesDoctor && !matchesPsych) return false;
      }

      // Specific Activity / Activity Type filter
      if (activityFilter !== 'todos') {
        if (activityFilter.startsWith('type:')) {
          const typeId = Number(activityFilter.slice(5));
          if (item.category !== 'atividade' || item.activityTypeId !== typeId) return false;
        } else if (activityFilter.startsWith('class:')) {
          const classId = Number(activityFilter.slice(6));
          if (item.category !== 'atividade' || item.classId !== classId) return false;
        }
      }

      // Specific Event filter
      if (eventFilter !== 'todos') {
        if (eventFilter === 'only_events') {
          if (item.category !== 'evento') return false;
        } else if (eventFilter.startsWith('event:')) {
          const evId = Number(eventFilter.slice(6));
          if (item.category !== 'evento' || item.eventId !== evId) return false;
        }
      }

      // Educator filter
      if (educatorFilter !== 'todos') {
        if (item.category !== 'atividade' || item.professionalOrLeader !== educatorFilter) return false;
      }

      // Project filter
      if (projectFilter !== 'todos') {
        if (String(item.projectId ?? '') !== projectFilter) return false;
      }

      // Shift filter
      if (shiftFilter !== 'todos' && item.shift !== shiftFilter) {
        return false;
      }

      // Consultation status filter (only applies to clinical items when selected)
      if (canSeeHealth && statusFilter !== 'todos') {
        if (item.category !== 'medico' && item.category !== 'psicologico') return false;
        if (item.status !== statusFilter) return false;
      }

      // Free text search
      if (q) {
        const haystack = normalizeStr(
          [
            item.title,
            item.subtitle,
            item.professionalOrLeader,
            item.specialtyOrActivity,
            item.projectName || '',
            item.location || '',
            item.description || '',
            item.patientName || '',
            item.status || '',
          ].join(' ')
        );
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    allRangeItems,
    searchTerm,
    canSeeHealth,
    showEvents,
    showActivities,
    showMedical,
    showPsychological,
    patientFilter,
    doctorFilter,
    psychFilter,
    activityFilter,
    eventFilter,
    educatorFilter,
    projectFilter,
    shiftFilter,
    statusFilter,
  ]);

  // Items grouped by date for fast lookup in calendar cells
  const itemsByDate = useMemo(() => {
    const map = new Map<string, UnifiedAgendaItem[]>();
    for (const item of filteredItems) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [filteredItems]);

  // Summary KPIs scoped to the primary visible period (activeRange.start..activeRange.end)
  const periodItems = useMemo(
    () =>
      filteredItems.filter(
        (item) => item.date >= activeRange.start && item.date <= activeRange.end
      ),
    [filteredItems, activeRange]
  );

  const summaryCounts = useMemo(() => {
    let eventos = 0;
    let atividades = 0;
    let medicos = 0;
    let psicologicos = 0;
    for (const it of periodItems) {
      if (it.category === 'evento') eventos++;
      else if (it.category === 'atividade') atividades++;
      else if (it.category === 'medico') medicos++;
      else if (it.category === 'psicologico') psicologicos++;
    }
    return {
      total: periodItems.length,
      eventos,
      atividades,
      medicos,
      psicologicos,
    };
  }, [periodItems]);

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
      !showEvents ||
      !showActivities ||
      (canSeeHealth && (!showMedical || !showPsychological)) ||
      patientFilter !== 'todos' ||
      doctorFilter !== 'todos' ||
      psychFilter !== 'todos' ||
      activityFilter !== 'todos' ||
      eventFilter !== 'todos' ||
      educatorFilter !== 'todos' ||
      projectFilter !== 'todos' ||
      shiftFilter !== 'todos' ||
      statusFilter !== 'todos'
  );

  function resetAllFilters() {
    setSearchTerm('');
    setShowEvents(true);
    setShowActivities(true);
    setShowMedical(true);
    setShowPsychological(true);
    setPatientFilter('todos');
    setDoctorFilter('todos');
    setPsychFilter('todos');
    setActivityFilter('todos');
    setEventFilter('todos');
    setEducatorFilter('todos');
    setProjectFilter('todos');
    setShiftFilter('todos');
    setStatusFilter('todos');
  }

  function handleNavigate(direction: -1 | 0 | 1) {
    if (direction === 0) {
      setAnchorDate(DEFAULT_ANCHOR_DATE);
      setSelectedDay(DEFAULT_ANCHOR_DATE);
      return;
    }
    if (viewMode === 'semanal') {
      const next = addDaysISO(anchorDate, direction * 7);
      setAnchorDate(next);
      setSelectedDay(next);
    } else {
      const next = addMonthsISO(anchorDate, direction);
      setAnchorDate(next);
      setSelectedDay(next);
    }
  }

  const periodHeading = useMemo(() => {
    if (viewMode === 'semanal') {
      return `${formatDateBR(weekDates[0])} a ${formatDateBR(weekDates[6])}`;
    }
    const dt = parseDateUTC(anchorDate);
    return `${MONTH_NAMES[dt.getUTCMonth()]} de ${dt.getUTCFullYear()}`;
  }, [viewMode, weekDates, anchorDate]);

  async function handleExportAgendaPDF() {
    const filterTags: string[] = [];
    if (patientFilter !== 'todos' && data) {
      const pat = data.patients.find((p) => String(p.id) === patientFilter);
      if (pat) filterTags.push(`Paciente: ${pat.full_name}`);
    }
    if (doctorFilter !== 'todos') filterTags.push(`Médico: ${doctorFilter}`);
    if (psychFilter !== 'todos') filterTags.push(`Psicólogo: ${psychFilter}`);
    if (educatorFilter !== 'todos') filterTags.push(`Educador: ${educatorFilter}`);
    if (shiftFilter !== 'todos') filterTags.push(`Turno: ${shiftFilter}`);
    if (statusFilter !== 'todos') filterTags.push(`Status: ${statusFilter}`);
    if (searchTerm.trim()) filterTags.push(`Busca: "${searchTerm.trim()}"`);

    const subtitle = `Período: ${periodHeading} (${periodItems.length} registros)${
      filterTags.length > 0 ? ` · Filtros: ${filterTags.join(' | ')}` : ''
    }`;

    const headers = ['Data', 'Horário', 'Tipo', 'Compromisso / Título', 'Responsável', 'Turno', 'Status / Local'];
    const rows = periodItems.map((it) => [
      formatDateBR(it.date),
      it.time,
      it.categoryLabel,
      it.title,
      it.professionalOrLeader,
      it.shift,
      it.category === 'evento'
        ? it.location || 'Confirmado'
        : it.category === 'atividade'
          ? it.status || 'Recorrente'
          : it.status || 'Agendada',
    ]);

    exportToPDF(
      'Agenda Institucional — Instituto SER',
      subtitle,
      headers,
      rows,
      `agenda_institucional_${activeRange.start}`
    );

    try {
      await apiRequest('/api/audit-export', {
        method: 'POST',
        body: JSON.stringify({
          reportName: `Agenda Institucional (${periodHeading})`,
          format: 'PDF',
        }),
      });
    } catch {
      // Ignore non-blocking audit log error
    }
  }

  async function handleUpdateAppointmentStatus(appointmentId: number, status: string) {
    setUpdatingStatusId(appointmentId);
    try {
      await apiRequest(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setFeedback(`Status da consulta atualizado para "${status}".`);
      await loadAgenda();
      setSelectedItem((prev) =>
        prev && prev.appointmentId === appointmentId ? { ...prev, status } : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar status da consulta.');
    } finally {
      setUpdatingStatusId(null);
    }
  }

  async function handleCreateEvent(e: FormEvent) {
    e.preventDefault();
    setSavingEvent(true);
    setError('');
    try {
      await apiRequest('/api/events', {
        method: 'POST',
        body: JSON.stringify({
          title: newEventTitle,
          event_date: newEventDate,
          event_time: newEventTime,
          location: newEventLocation,
          project_id: newEventProjectId ? Number(newEventProjectId) : null,
          description: newEventDesc,
        }),
      });
      setShowEventModal(false);
      setNewEventTitle('');
      setNewEventLocation('');
      setNewEventDesc('');
      setNewEventProjectId('');
      setFeedback('Evento institucional adicionado à agenda.');
      setAnchorDate(newEventDate);
      setSelectedDay(newEventDate);
      await loadAgenda();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar evento.');
    } finally {
      setSavingEvent(false);
    }
  }

  async function handleCreateAppointment(e: FormEvent) {
    e.preventDefault();
    setSavingAppt(true);
    setError('');
    try {
      await apiRequest('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: Number(newApptPatientId),
          professional_name: newApptProfessional,
          specialty: newApptSpecialty,
          scheduled_date: newApptDate,
          scheduled_time: newApptTime,
          status: 'Agendada',
          is_return: newApptIsReturn,
          notes: newApptNotes,
        }),
      });
      setShowApptModal(false);
      setNewApptNotes('');
      setNewApptIsReturn(false);
      setFeedback('Consulta agendada na agenda institucional.');
      setAnchorDate(newApptDate);
      setSelectedDay(newApptDate);
      await loadAgenda();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao agendar consulta.');
    } finally {
      setSavingAppt(false);
    }
  }

  const selectedDayItems = useMemo(() => itemsByDate.get(selectedDay) ?? [], [itemsByDate, selectedDay]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#182424] tracking-tight">
            Agenda Institucional
          </h1>
          <p className="text-sm text-[#556262] mt-0.5">
            Visualização integrada semanal e mensal de eventos, atividades socioeducativas
            {canSeeHealth ? ', atendimentos médicos e psicológicos' : ''}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canCreateEvents && (
            <button
              type="button"
              onClick={() => {
                setNewEventDate(selectedDay);
                setShowEventModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E5E1D8] bg-white text-xs font-medium text-[#182424] hover:bg-[#F7F5F0] cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-[#875F00]" />
              Novo Evento
            </button>
          )}
          {canSeeHealth && (
            <button
              type="button"
              onClick={() => {
                setNewApptDate(selectedDay);
                if (data?.patients[0] && !newApptPatientId) {
                  setNewApptPatientId(String(data.patients[0].id));
                  setNewApptProfessional(data.patients[0].responsible_professional);
                  setNewApptSpecialty(data.patients[0].specialty);
                }
                setShowApptModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#144A47] text-xs font-medium text-white hover:bg-[#0F3936] cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-[#EBB428]" />
              Agendar Consulta
            </button>
          )}
          <button
            type="button"
            onClick={handleExportAgendaPDF}
            disabled={periodItems.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#144A47]/30 bg-white text-xs font-medium text-[#144A47] hover:bg-[#144A47]/5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Agenda PDF
          </button>
        </div>
      </div>

      {/* Feedback & Error banners */}
      {error && (
        <div className="bg-[#BD4B22]/10 border border-[#BD4B22]/30 text-[#8B3212] px-4 py-2.5 rounded-lg text-xs flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button type="button" onClick={() => setError('')} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {feedback && (
        <div className="bg-[#6F873D]/12 border border-[#6F873D]/30 text-[#3F511A] px-4 py-2.5 rounded-lg text-xs flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {feedback}
          </span>
          <button type="button" onClick={() => setFeedback('')} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Single-elevation Summary Bar */}
      <div className="bg-white border border-[#E5E1D8] rounded-xl grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-[#E5E1D8]">
        <div className="p-4">
          <div className="text-[11px] font-medium text-[#556262]">Compromissos Filtrados</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#182424] mt-1">
            {summaryCounts.total}
          </div>
          <div className="text-[11px] text-[#556262] mt-0.5 truncate">{periodHeading}</div>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#556262]">
            <span className="w-2 h-2 rounded-full bg-[#EBB428]" />
            Eventos
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#875F00] mt-1">
            {summaryCounts.eventos}
          </div>
          <div className="text-[11px] text-[#556262] mt-0.5">Agenda institucional</div>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#556262]">
            <span className="w-2 h-2 rounded-full bg-[#6F873D]" />
            Atividades e Turmas
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#4F6327] mt-1">
            {summaryCounts.atividades}
          </div>
          <div className="text-[11px] text-[#556262] mt-0.5">Sessões no período</div>
        </div>
        {canSeeHealth ? (
          <>
            <div className="p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#556262]">
                <span className="w-2 h-2 rounded-full bg-[#0E5A75]" />
                Atendimentos Médicos
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-[#0E5A75] mt-1">
                {summaryCounts.medicos}
              </div>
              <div className="text-[11px] text-[#556262] mt-0.5">Pediatria e clínica</div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#556262]">
                <span className="w-2 h-2 rounded-full bg-[#144A47]" />
                Atend. Psicológicos
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-[#144A47] mt-1">
                {summaryCounts.psicologicos}
              </div>
              <div className="text-[11px] text-[#556262] mt-0.5">Psicologia infantil</div>
            </div>
          </>
        ) : (
          <div className="p-4 col-span-2">
            <div className="text-[11px] font-medium text-[#556262]">Escopo de Visualização</div>
            <div className="text-sm font-semibold text-[#144A47] mt-1">
              Eventos e Atividades Socioeducativas
            </div>
            <div className="text-[11px] text-[#556262] mt-0.5">
              Dados clínicos restritos à equipe de Saúde (LGPD).
            </div>
          </div>
        )}
      </div>

      {/* Period Navigation & View Switcher */}
      <div className="bg-white border border-[#E5E1D8] rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-[#E5E1D8]">
          {/* Segmented View Mode */}
          <div className="inline-flex bg-[#F7F5F0] border border-[#E5E1D8] rounded-lg p-1 self-start">
            <button
              type="button"
              onClick={() => setViewMode('semanal')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'semanal'
                  ? 'bg-[#144A47] text-white'
                  : 'text-[#556262] hover:text-[#182424]'
              }`}
            >
              Agenda Semanal
            </button>
            <button
              type="button"
              onClick={() => setViewMode('mensal')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'mensal'
                  ? 'bg-[#144A47] text-white'
                  : 'text-[#556262] hover:text-[#182424]'
              }`}
            >
              Agenda Mensal
            </button>
            <button
              type="button"
              onClick={() => setViewMode('lista')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'lista'
                  ? 'bg-[#144A47] text-white'
                  : 'text-[#556262] hover:text-[#182424]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Lista Cronológica
            </button>
          </div>

          {/* Date Navigation */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleNavigate(-1)}
              className="p-2 rounded-lg border border-[#E5E1D8] text-[#182424] hover:bg-[#F7F5F0] cursor-pointer"
              aria-label="Período anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1.5 rounded-lg bg-[#F7F5F0] border border-[#E5E1D8] text-xs font-semibold text-[#182424] font-mono tabular-nums min-w-[180px] text-center">
              {periodHeading}
            </div>
            <button
              type="button"
              onClick={() => handleNavigate(1)}
              className="p-2 rounded-lg border border-[#E5E1D8] text-[#182424] hover:bg-[#F7F5F0] cursor-pointer"
              aria-label="Próximo período"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleNavigate(0)}
              className="px-3 py-1.5 rounded-lg border border-[#E5E1D8] text-xs font-medium text-[#144A47] hover:bg-[#F7F5F0] cursor-pointer whitespace-nowrap"
            >
              Hoje (23/11)
            </button>
            <input
              type="date"
              value={anchorDate}
              onChange={(e) => {
                if (e.target.value) {
                  setAnchorDate(e.target.value);
                  setSelectedDay(e.target.value);
                }
              }}
              aria-label="Ir para data"
              className="px-2.5 py-1.5 rounded-lg border border-[#E5E1D8] text-xs text-[#182424] font-mono tabular-nums bg-white"
            />
          </div>
        </div>

        {/* Layer Toggles & Filter Controls */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#556262] mr-1">
                <Filter className="w-3.5 h-3.5 text-[#144A47]" />
                Exibir na grade:
              </span>
              <button
                type="button"
                onClick={() => setShowEvents((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  showEvents
                    ? 'bg-[#EBB428]/15 border-[#EBB428]/60 text-[#735000]'
                    : 'bg-white border-[#E5E1D8] text-[#556262]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Eventos
              </button>
              <button
                type="button"
                onClick={() => setShowActivities((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  showActivities
                    ? 'bg-[#6F873D]/15 border-[#6F873D]/50 text-[#3F511A]'
                    : 'bg-white border-[#E5E1D8] text-[#556262]'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Atividades / Turmas
              </button>
              {canSeeHealth && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowMedical((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      showMedical
                        ? 'bg-[#0E5A75]/12 border-[#0E5A75]/45 text-[#0E5A75]'
                        : 'bg-white border-[#E5E1D8] text-[#556262]'
                    }`}
                  >
                    <Stethoscope className="w-3.5 h-3.5" />
                    Médico
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPsychological((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      showPsychological
                        ? 'bg-[#144A47]/12 border-[#144A47]/45 text-[#144A47]'
                        : 'bg-white border-[#E5E1D8] text-[#556262]'
                    }`}
                  >
                    <Brain className="w-3.5 h-3.5" />
                    Psicológico
                  </button>
                </>
              )}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#BD4B22] hover:bg-[#BD4B22]/8 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpar filtros
              </button>
            )}
          </div>

          {/* Multi-criteria Filter Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#556262] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar paciente, médico, turma, evento..."
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-[#E5E1D8] text-xs text-[#182424] bg-white focus:outline-none focus:border-[#144A47]"
              />
            </div>

            {canSeeHealth && (
              <>
                <div>
                  <select
                    value={patientFilter}
                    onChange={(e) => setPatientFilter(e.target.value)}
                    aria-label="Filtrar por paciente"
                    className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] text-xs text-[#182424] bg-white focus:outline-none focus:border-[#144A47]"
                  >
                    <option value="todos">Paciente: Todos</option>
                    {data?.patients.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        Paciente: {p.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={doctorFilter}
                    onChange={(e) => setDoctorFilter(e.target.value)}
                    aria-label="Filtrar por médico"
                    className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] text-xs text-[#182424] bg-white focus:outline-none focus:border-[#144A47]"
                  >
                    <option value="todos">Médico: Todos</option>
                    {doctorOptions.map((doc) => (
                      <option key={doc} value={doc}>
                        Médico: {doc}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={psychFilter}
                    onChange={(e) => setPsychFilter(e.target.value)}
                    aria-label="Filtrar por psicólogo"
                    className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] text-xs text-[#182424] bg-white focus:outline-none focus:border-[#144A47]"
                  >
                    <option value="todos">Psicólogo: Todos</option>
                    {psychOptions.map((psy) => (
                      <option key={psy} value={psy}>
                        Psicólogo: {psy}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div>
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                aria-label="Filtrar por atividade ou turma"
                className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] text-xs text-[#182424] bg-white focus:outline-none focus:border-[#144A47]"
              >
                <option value="todos">Atividades: Todas</option>
                {data && data.activityTypes.length > 0 && (
                  <optgroup label="Tipos de Atividade">
                    {data.activityTypes.map((at) => (
                      <option key={`type-${at.id}`} value={`type:${at.id}`}>
                        Tipo: {at.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {data && data.classes.length > 0 && (
                  <optgroup label="Turmas e Oficinas">
                    {data.classes.map((cls) => (
                      <option key={`class-${cls.id}`} value={`class:${cls.id}`}>
                        Turma: {cls.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div>
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                aria-label="Filtrar por evento"
                className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] text-xs text-[#182424] bg-white focus:outline-none focus:border-[#144A47]"
              >
                <option value="todos">Eventos: Todos</option>
                <option value="only_events">Somente Eventos Institucionais</option>
                {data?.events.map((ev) => (
                  <option key={ev.id} value={`event:${ev.id}`}>
                    {formatDateBR(ev.event_date)} · {ev.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={educatorFilter}
                onChange={(e) => setEducatorFilter(e.target.value)}
                aria-label="Filtrar por educador"
                className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] text-xs text-[#182424] bg-white focus:outline-none focus:border-[#144A47]"
              >
                <option value="todos">Educador / Instrutor: Todos</option>
                {educatorOptions.map((ed) => (
                  <option key={ed} value={ed}>
                    Educador: {ed}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                aria-label="Filtrar por projeto"
                className="w-full px-2.5 py-2 rounded-lg border border-[#E5E1D8] text-xs text-[#182424] bg-white focus:outline-none focus:border-[#144A47]"
              >
                <option value="todos">Projeto: Todos</option>
                {data?.projects.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                value={shiftFilter}
                onChange={(e) => setShiftFilter(e.target.value as 'todos' | ShiftType)}
                aria-label="Filtrar por turno"
                className="w-full px-2.5 py-2 rounded-lg border border-[#E5E1D8] text-xs text-[#182424] bg-white focus:outline-none focus:border-[#144A47]"
              >
                <option value="todos">Turno: Todos</option>
                <option value="Manhã">Manhã</option>
                <option value="Tarde">Tarde</option>
                <option value="Integral">Integral</option>
              </select>
            </div>

            {canSeeHealth && (
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filtrar por status da consulta"
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] text-xs text-[#182424] bg-white focus:outline-none focus:border-[#144A47]"
                >
                  <option value="todos">Status Consulta: Todos</option>
                  <option value="Agendada">Agendada</option>
                  <option value="Retorno Agendado">Retorno Agendado</option>
                  <option value="Realizada">Realizada</option>
                  <option value="Falta">Falta</option>
                  <option value="Cancelada">Cancelada</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Calendar / Schedule Content */}
      {loading ? (
        <div className="bg-white border border-[#E5E1D8] rounded-xl p-10 text-center text-sm text-[#556262]">
          Carregando agenda institucional...
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Calendar Area */}
          <div className={selectedItem || viewMode === 'mensal' ? 'xl:col-span-8' : 'xl:col-span-12'}>
            {viewMode === 'semanal' && (
              <div className="grid grid-cols-1 md:grid-cols-7 gap-2.5">
                {weekDates.map((dateISO, idx) => {
                  const dayItems = itemsByDate.get(dateISO) ?? [];
                  const isSelected = selectedDay === dateISO;
                  const isToday = dateISO === DEFAULT_ANCHOR_DATE;
                  const dayNum = dateISO.slice(8, 10);
                  const monthNum = dateISO.slice(5, 7);

                  return (
                    <div
                      key={dateISO}
                      className={`bg-white border rounded-xl flex flex-col min-h-[290px] ${
                        isSelected ? 'border-[#144A47]' : 'border-[#E5E1D8]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedDay(dateISO)}
                        className={`px-3 py-2.5 border-b text-left flex items-center justify-between cursor-pointer rounded-t-xl ${
                          isToday
                            ? 'bg-[#144A47] text-white border-[#144A47]'
                            : 'bg-[#F7F5F0]/70 text-[#182424] border-[#E5E1D8]'
                        }`}
                      >
                        <div>
                          <div className={`text-[11px] font-medium ${isToday ? 'text-white/80' : 'text-[#556262]'}`}>
                            {WEEKDAY_NAMES_SHORT[idx]}
                          </div>
                          <div className="font-mono tabular-nums text-sm font-bold">
                            {dayNum}/{monthNum}
                          </div>
                        </div>
                        <span
                          className={`font-mono tabular-nums text-[11px] px-1.5 py-0.5 rounded ${
                            isToday ? 'bg-white/15 text-white' : 'bg-white border border-[#E5E1D8] text-[#556262]'
                          }`}
                        >
                          {dayItems.length}
                        </span>
                      </button>

                      <div className="p-2 space-y-2 flex-1">
                        {dayItems.length === 0 ? (
                          <div className="text-[11px] text-[#556262]/65 text-center py-6">
                            Sem registros
                          </div>
                        ) : (
                          dayItems.map((item) => {
                            const meta = CATEGORY_META[item.category];
                            const activeItem = selectedItem?.uid === item.uid;
                            return (
                              <button
                                key={item.uid}
                                type="button"
                                onClick={() => {
                                  setSelectedDay(dateISO);
                                  setSelectedItem(item);
                                }}
                                className={`w-full text-left p-2 rounded-lg border transition-colors cursor-pointer ${
                                  meta.cardBg
                                } ${
                                  activeItem ? 'border-[#182424] ring-1 ring-[#182424]/20' : meta.cardBorder
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-mono tabular-nums text-[11px] font-semibold text-[#182424]">
                                    {item.time}
                                  </span>
                                  <span className={`text-[10px] font-semibold ${meta.accentText} truncate`}>
                                    {item.categoryLabel}
                                  </span>
                                </div>
                                <div className="text-xs font-semibold text-[#182424] mt-1 line-clamp-2 leading-snug">
                                  {item.title}
                                </div>
                                <div className="text-[11px] text-[#556262] mt-0.5 truncate">
                                  {item.professionalOrLeader}
                                </div>
                                {item.status && (
                                  <div className="text-[10px] text-[#556262] mt-1 truncate">
                                    {item.status}
                                  </div>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {viewMode === 'mensal' && (
              <div className="bg-white border border-[#E5E1D8] rounded-xl overflow-hidden">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 border-b border-[#E5E1D8] bg-[#F7F5F0]">
                  {WEEKDAY_NAMES_SHORT.map((day) => (
                    <div
                      key={day}
                      className="py-2.5 px-2 text-center text-[11px] font-semibold text-[#556262] border-r last:border-r-0 border-[#E5E1D8]"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Month Cells */}
                <div className="grid grid-cols-7">
                  {monthGridCells.map((cell) => {
                    const dayItems = itemsByDate.get(cell.date) ?? [];
                    const isSelected = selectedDay === cell.date;
                    const isToday = cell.date === DEFAULT_ANCHOR_DATE;
                    const dayNum = Number(cell.date.slice(8, 10));

                    return (
                      <div
                        key={cell.date}
                        onClick={() => setSelectedDay(cell.date)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedDay(cell.date);
                          }
                        }}
                        className={`min-h-[112px] p-1.5 border-b border-r border-[#E5E1D8] text-left cursor-pointer transition-colors ${
                          !cell.inMonth ? 'bg-[#F7F5F0]/55 text-[#556262]/60' : 'bg-white hover:bg-[#F7F5F0]/40'
                        } ${isSelected ? 'ring-2 ring-inset ring-[#144A47]' : ''}`}
                      >
                        <div className="flex items-center justify-between px-1 mb-1">
                          <span
                            className={`font-mono tabular-nums text-xs font-semibold w-6 h-6 inline-flex items-center justify-center rounded-md ${
                              isToday ? 'bg-[#144A47] text-white' : ''
                            }`}
                          >
                            {dayNum}
                          </span>
                          {dayItems.length > 0 && (
                            <span className="font-mono tabular-nums text-[10px] text-[#556262]">
                              {dayItems.length}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1">
                          {dayItems.slice(0, 3).map((item) => {
                            const meta = CATEGORY_META[item.category];
                            return (
                              <button
                                key={item.uid}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDay(cell.date);
                                  setSelectedItem(item);
                                }}
                                className={`w-full text-left px-1.5 py-0.5 rounded border text-[10px] truncate block cursor-pointer ${meta.cardBg} ${meta.cardBorder} text-[#182424]`}
                              >
                                <span className="font-mono tabular-nums font-semibold mr-1">{item.time}</span>
                                <span>{item.title}</span>
                              </button>
                            );
                          })}
                          {dayItems.length > 3 && (
                            <div className="text-[10px] font-medium text-[#144A47] px-1">
                              +{dayItems.length - 3} mais
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {viewMode === 'lista' && (
              <div className="bg-white border border-[#E5E1D8] rounded-xl overflow-hidden">
                {periodItems.length === 0 ? (
                  <div className="p-10 text-center space-y-2">
                    <CalendarDays className="w-8 h-8 text-[#556262]/50 mx-auto" />
                    <div className="text-sm font-medium text-[#182424]">
                      Nenhum compromisso encontrado para os filtros selecionados
                    </div>
                    <p className="text-xs text-[#556262]">
                      Ajuste os filtros ou navegue para outro período semanal/mensal.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F7F5F0] border-b border-[#E5E1D8] text-[11px] font-semibold text-[#556262]">
                          <th className="py-2.5 px-4">Data / Horário</th>
                          <th className="py-2.5 px-3">Categoria</th>
                          <th className="py-2.5 px-3">Compromisso / Paciente</th>
                          <th className="py-2.5 px-3">Responsável</th>
                          <th className="py-2.5 px-3">Turno</th>
                          <th className="py-2.5 px-4">Status / Local</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E1D8] text-xs">
                        {periodItems.map((item) => {
                          const meta = CATEGORY_META[item.category];
                          const dow = WEEKDAY_NAMES_FULL[parseDateUTC(item.date).getUTCDay()];
                          return (
                            <tr
                              key={item.uid}
                              onClick={() => {
                                setSelectedDay(item.date);
                                setSelectedItem(item);
                              }}
                              className={`cursor-pointer hover:bg-[#F7F5F0]/70 ${
                                selectedItem?.uid === item.uid ? 'bg-[#144A47]/6' : ''
                              }`}
                            >
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                <div className="font-mono tabular-nums font-semibold text-[#182424]">
                                  {formatDateBR(item.date)} · {item.time}
                                </div>
                                <div className="text-[11px] text-[#556262]">{dow}</div>
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1.5 font-medium ${meta.accentText}`}>
                                  <span className={`w-2 h-2 rounded-full ${meta.dotColor}`} />
                                  {item.categoryLabel}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-[#182424]">{item.title}</div>
                                <div className="text-[11px] text-[#556262] truncate max-w-[260px]">
                                  {item.specialtyOrActivity}
                                  {item.projectName ? ` · ${item.projectName}` : ''}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-[#182424]">{item.professionalOrLeader}</td>
                              <td className="py-2.5 px-3 text-[#556262] whitespace-nowrap">{item.shift}</td>
                              <td className="py-2.5 px-4 text-[#556262]">
                                {item.category === 'evento' ? item.location : item.status || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Day Detail & Item Inspector Panel */}
          {(selectedItem || viewMode === 'mensal') && (
            <aside className="xl:col-span-4 space-y-4">
              {/* Selected Item Detail Card */}
              {selectedItem && (
                <div className="bg-white border border-[#E5E1D8] rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#E5E1D8]">
                    <div>
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                          CATEGORY_META[selectedItem.category].accentText
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${CATEGORY_META[selectedItem.category].dotColor}`}
                        />
                        {selectedItem.categoryLabel} · {selectedItem.specialtyOrActivity}
                      </span>
                      <h2 className="font-display text-base font-bold text-[#182424] mt-1">
                        {selectedItem.title}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedItem(null)}
                      className="p-1 text-[#556262] hover:text-[#182424] cursor-pointer"
                      aria-label="Fechar detalhes"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2 text-xs text-[#182424]">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[#556262] shrink-0" />
                      <span className="font-mono tabular-nums font-medium">
                        {formatDateBR(selectedItem.date)} às {selectedItem.time}
                      </span>
                      <span className="text-[#556262]">· Turno {selectedItem.shift}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserIcon className="w-3.5 h-3.5 text-[#556262] shrink-0" />
                      <span>
                        Responsável: <strong>{selectedItem.professionalOrLeader}</strong>
                      </span>
                    </div>
                    {selectedItem.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-[#556262] shrink-0" />
                        <span>{selectedItem.location}</span>
                      </div>
                    )}
                    {selectedItem.projectName && (
                      <div className="text-[11px] text-[#556262]">
                        Projeto: <span className="font-medium text-[#182424]">{selectedItem.projectName}</span>
                      </div>
                    )}
                    {selectedItem.description && (
                      <div className="p-2.5 rounded-lg bg-[#F7F5F0] border border-[#E5E1D8] text-[11px] text-[#182424] leading-relaxed">
                        {selectedItem.description}
                      </div>
                    )}
                  </div>

                  {/* Quick Appointment Status Update for Health Roles */}
                  {canSeeHealth && selectedItem.appointmentId && (
                    <div className="pt-3 border-t border-[#E5E1D8] space-y-2">
                      <div className="text-[11px] font-semibold text-[#556262]">
                        Atualizar situação da consulta ({selectedItem.status})
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(['Agendada', 'Realizada', 'Falta', 'Cancelada'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            disabled={updatingStatusId === selectedItem.appointmentId || selectedItem.status === st}
                            onClick={() => handleUpdateAppointmentStatus(selectedItem.appointmentId!, st)}
                            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                              selectedItem.status === st
                                ? 'bg-[#144A47] text-white border-[#144A47]'
                                : 'bg-white border-[#E5E1D8] text-[#182424] hover:bg-[#F7F5F0]'
                            } disabled:opacity-60`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Selected Day Agenda Breakdown (always visible in Monthly mode or when a day is clicked) */}
              <div className="bg-white border border-[#E5E1D8] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-2.5">
                  <div>
                    <div className="text-[11px] font-medium text-[#556262]">
                      {WEEKDAY_NAMES_FULL[parseDateUTC(selectedDay).getUTCDay()]}
                    </div>
                    <div className="font-display font-bold text-sm text-[#182424] font-mono tabular-nums">
                      Agenda de {formatDateBR(selectedDay)}
                    </div>
                  </div>
                  <span className="font-mono tabular-nums text-xs font-semibold text-[#144A47]">
                    {selectedDayItems.length} itens
                  </span>
                </div>

                {selectedDayItems.length === 0 ? (
                  <div className="text-xs text-[#556262] py-4 text-center">
                    Nenhum compromisso filtrado para este dia.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {selectedDayItems.map((item) => {
                      const meta = CATEGORY_META[item.category];
                      return (
                        <button
                          key={item.uid}
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className={`w-full text-left p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            meta.cardBg
                          } ${
                            selectedItem?.uid === item.uid
                              ? 'border-[#182424]'
                              : meta.cardBorder
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono tabular-nums text-xs font-bold text-[#182424]">
                              {item.time}
                            </span>
                            <span className={`text-[10px] font-semibold ${meta.accentText}`}>
                              {item.categoryLabel}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-[#182424] mt-1">{item.title}</div>
                          <div className="text-[11px] text-[#556262] mt-0.5">{item.subtitle}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      )}

      {/* Create Institutional Event Modal */}
      {showEventModal && canCreateEvents && (
        <div className="fixed inset-0 z-50 bg-[#182424]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E1D8] rounded-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-3">
              <h2 className="font-display text-base font-bold text-[#182424]">
                Novo Evento na Agenda
              </h2>
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className="text-[#556262] hover:text-[#182424] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateEvent} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[#182424] mb-1">Título do Evento *</label>
                <input
                  type="text"
                  required
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  placeholder="Ex: Reunião Geral de Voluntários"
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#182424] mb-1">Data *</label>
                  <input
                    type="date"
                    required
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#182424] mb-1">Horário *</label>
                  <input
                    type="time"
                    required
                    value={newEventTime}
                    onChange={(e) => setNewEventTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] font-mono tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-[#182424] mb-1">Local *</label>
                <input
                  type="text"
                  required
                  value={newEventLocation}
                  onChange={(e) => setNewEventLocation(e.target.value)}
                  placeholder="Ex: Auditório Instituto SER"
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#182424] mb-1">Projeto Vinculado</label>
                <select
                  value={newEventProjectId}
                  onChange={(e) => setNewEventProjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] bg-white"
                >
                  <option value="">Institucional (Geral)</option>
                  {data?.projects.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#182424] mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  placeholder="Detalhes e público esperado..."
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-[#E5E1D8] text-[#182424] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEvent}
                  className="px-4 py-2 rounded-lg bg-[#144A47] text-white font-medium hover:bg-[#0F3936] cursor-pointer disabled:opacity-50"
                >
                  {savingEvent ? 'Salvando...' : 'Salvar Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Appointment Modal (Health Roles Only) */}
      {showApptModal && canSeeHealth && (
        <div className="fixed inset-0 z-50 bg-[#182424]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E1D8] rounded-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-3">
              <h2 className="font-display text-base font-bold text-[#182424]">
                Agendar Consulta Clínica
              </h2>
              <button
                type="button"
                onClick={() => setShowApptModal(false)}
                className="text-[#556262] hover:text-[#182424] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateAppointment} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[#182424] mb-1">Paciente *</label>
                <select
                  required
                  value={newApptPatientId}
                  onChange={(e) => {
                    setNewApptPatientId(e.target.value);
                    const pat = data?.patients.find((p) => String(p.id) === e.target.value);
                    if (pat) {
                      setNewApptProfessional(pat.responsible_professional);
                      setNewApptSpecialty(pat.specialty);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] bg-white"
                >
                  <option value="">Selecione o paciente</option>
                  {data?.patients.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.full_name} ({p.specialty})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#182424] mb-1">Especialidade *</label>
                  <select
                    required
                    value={newApptSpecialty}
                    onChange={(e) => setNewApptSpecialty(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] bg-white"
                  >
                    <option value="Psicologia">Psicologia</option>
                    <option value="Pediatria">Pediatria</option>
                    <option value="Clínica Geral">Clínica Geral</option>
                    <option value="Fonoaudiologia">Fonoaudiologia</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#182424] mb-1">Profissional *</label>
                  <input
                    type="text"
                    required
                    value={newApptProfessional}
                    onChange={(e) => setNewApptProfessional(e.target.value)}
                    placeholder="Dra. Beatriz Alencar"
                    className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#182424] mb-1">Data *</label>
                  <input
                    type="date"
                    required
                    value={newApptDate}
                    onChange={(e) => setNewApptDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#182424] mb-1">Horário *</label>
                  <input
                    type="time"
                    required
                    value={newApptTime}
                    onChange={(e) => setNewApptTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8] font-mono tabular-nums"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-[#182424] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newApptIsReturn}
                  onChange={(e) => setNewApptIsReturn(e.target.checked)}
                />
                Consulta de retorno
              </label>
              <div>
                <label className="block font-medium text-[#182424] mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={newApptNotes}
                  onChange={(e) => setNewApptNotes(e.target.value)}
                  placeholder="Observações clínicas ou preparação..."
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E1D8]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApptModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-[#E5E1D8] text-[#182424] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAppt}
                  className="px-4 py-2 rounded-lg bg-[#144A47] text-white font-medium hover:bg-[#0F3936] cursor-pointer disabled:opacity-50"
                >
                  {savingAppt ? 'Agendando...' : 'Agendar Consulta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
