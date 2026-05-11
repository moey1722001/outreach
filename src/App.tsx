import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Copy,
  Edit3,
  FileText,
  LogOut,
  Mail,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  Users,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { discoverLeads, generateEmail, listLeads, markLatestEmailSent, saveLead, updateLeadStatus } from './lib/data';
import { findDuplicateMatches, hasPriorOutreach } from './lib/duplicates';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { likelihoodClass, likelihoodLabel, scoreLead } from './lib/scoring';
import type { DraftEmail, DuplicateMatch, Lead, LeadCategory, LeadFormInput, LeadStatus, ModelMode, OutreachTone, SearchBrief } from './lib/types';

type AppPage = 'finder' | 'leads' | 'drafts' | 'followups';

const categories: LeadCategory[] = [
  'NDIS support coordinator',
  'Home Care Package provider',
  'Retirement village',
  'Aged care provider',
  'GP clinic',
  'Allied health provider',
];

const statuses: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'researching', label: 'Researching' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'drafted', label: 'Drafted' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'replied', label: 'Replied' },
  { value: 'interested', label: 'Interested' },
  { value: 'meeting_booked', label: 'Meeting booked' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'won', label: 'Won' },
  { value: 'not_fit', label: 'Not fit' },
];

const emptyLead: LeadFormInput = {
  organisation: '',
  category: 'NDIS support coordinator',
  website: '',
  location: '',
  suburb: '',
  postcode: '',
  region: '',
  radiusKm: null,
  contactName: '',
  contactRole: '',
  email: '',
  phone: '',
  status: 'new',
  fitSummary: '',
  suitabilitySummary: '',
  businessNeeds: [],
  servicesOffered: [],
  concerns: [],
  outreachAngle: '',
  researchConfidence: 0,
  needs: [],
  source: '',
  nextAction: '',
  notes: '',
  lastContactedAt: null,
  contactedBy: '',
  followUpDate: '',
  outcome: '',
  contactHistory: [],
  emailHistory: [],
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState<AppPage>('finder');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<LeadFormInput>(emptyLead);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [needInput, setNeedInput] = useState('');
  const [brief, setBrief] = useState<SearchBrief>({
    location: 'Sydney',
    suburb: '',
    postcode: '',
    region: 'Sydney',
    radiusKm: 10,
    leadCount: 10,
    categories: ['NDIS support coordinator', 'Home Care Package provider', 'GP clinic'],
    notes: 'Prioritise organisations likely to refer clients who need in-home nursing and responsive escalation.',
    modelMode: 'save_tokens',
  });
  const [draft, setDraft] = useState<DraftEmail | null>(null);
  const [tone, setTone] = useState<OutreachTone>('warm');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured && !session) return;

    listLeads()
      .then((items) => {
        setLeads(items);
        setSelectedId(items[0]?.id ?? null);
      })
      .catch((err: Error) => setError(err.message));
  }, [session]);

  const filteredLeads = useMemo(() => {
    const normalised = query.trim().toLowerCase();
    return leads.filter((lead) => {
      return !normalised || [
        lead.organisation,
        lead.category,
        lead.location,
        lead.suburb,
        lead.postcode,
        lead.region,
        lead.contactName,
        lead.contactRole,
        lead.email,
        lead.phone,
        lead.website,
        lead.notes,
      ].some((value) => value.toLowerCase().includes(normalised));
    });
  }, [leads, query]);

  const selectedLead = leads.find((lead) => lead.id === selectedId) ?? filteredLeads[0] ?? null;
  const selectedDuplicates = selectedLead ? findDuplicateMatches(selectedLead, leads, selectedLead.id) : [];
  const formDuplicates = findDuplicateMatches(form, leads, editingId);

  async function refresh(nextSelectedId?: string) {
    const items = await listLeads();
    setLeads(items);
    setSelectedId(nextSelectedId ?? selectedId ?? items[0]?.id ?? null);
  }

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setBusy('Signing in');
    setError('');
    setAuthMessage('');
    try {
      if (password) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        const redirectTo = import.meta.env.VITE_OUTREACH_APP_URL || window.location.origin;
        const { error: signInError } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });
        if (signInError) throw signInError;
        setAuthMessage('Magic link sent. Check your email to continue.');
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function handleDiscover() {
    setBusy('Researching leads and drafting emails');
    setError('');
    try {
      const discoveries = await discoverLeads(brief);
      const savedLeads: Lead[] = [];
      const duplicatePool = [...leads];

      for (const lead of discoveries) {
        if (findDuplicateMatches(lead, duplicatePool, lead.id).length > 0) continue;
        const savedLead = await saveLead({ ...lead, status: 'drafted', likelihood: lead.likelihood }, lead.id);
        duplicatePool.push(savedLead);
        savedLeads.push(savedLead);
        await generateEmail(savedLead, tone, session?.user.email ?? 'Autonomous research', brief.modelMode);
      }

      await refresh(savedLeads[0]?.id);
      setPage('leads');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lead search failed. Check Supabase Edge Function secrets and try again.');
    } finally {
      setBusy('');
    }
  }

  async function handleSaveLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('Saving lead');
    setError('');
    try {
      if (formDuplicates.length > 0) {
        setError(`Duplicate blocked: this lead matches ${formDuplicates.map((match) => match.organisation).join(', ')} by ${formDuplicates.flatMap((match) => match.matchedOn).join(', ')}.`);
        return;
      }

      const next = await saveLead({ ...form, likelihood: scoreLead(form) }, editingId);
      await refresh(next.id);
      resetForm();
      setPage('leads');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save lead.');
    } finally {
      setBusy('');
    }
  }

  async function handleGenerateEmail() {
    if (!selectedLead) return;
    if ((hasPriorOutreach(selectedLead) || selectedDuplicates.some((match) => match.lastContactedAt)) && !window.confirm('This organisation or matching contact has previous outreach history. Generate another email anyway?')) {
      return;
    }

    setBusy('Generating email');
    setError('');
    try {
      const nextDraft = await generateEmail(selectedLead, tone, session?.user.email ?? 'Local user', brief.modelMode);
      setDraft(nextDraft);
      const updated = await updateLeadStatus(selectedLead, selectedLead.status === 'qualified' || selectedLead.status === 'new' ? 'drafted' : selectedLead.status);
      await refresh(updated.id);
      setPage('drafts');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email generation failed.');
    } finally {
      setBusy('');
    }
  }

  async function handleStatusChange(lead: Lead, status: LeadStatus) {
    const updated = await updateLeadStatus(lead, status);
    setLeads((items) => items.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function handleMarkEmailSent(lead: Lead, contactedBy: string) {
    if ((hasPriorOutreach(lead) || selectedDuplicates.some((match) => match.lastContactedAt)) && !window.confirm('This organisation or matching contact has previous outreach history. Mark another email as sent anyway?')) {
      return;
    }

    setBusy('Saving sent email');
    setError('');
    try {
      const updated = await markLatestEmailSent(lead, contactedBy || session?.user.email || 'Local user');
      await refresh(updated.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark email as sent.');
    } finally {
      setBusy('');
    }
  }

  function editLead(lead: Lead) {
    setEditingId(lead.id);
    setForm({
      organisation: lead.organisation,
      category: lead.category,
      website: lead.website,
      location: lead.location,
      suburb: lead.suburb,
      postcode: lead.postcode,
      region: lead.region,
      radiusKm: lead.radiusKm,
      contactName: lead.contactName,
      contactRole: lead.contactRole,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      likelihood: lead.likelihood,
      fitSummary: lead.fitSummary,
      suitabilitySummary: lead.suitabilitySummary,
      businessNeeds: lead.businessNeeds,
      servicesOffered: lead.servicesOffered,
      concerns: lead.concerns,
      outreachAngle: lead.outreachAngle,
      researchConfidence: lead.researchConfidence,
      needs: lead.needs,
      source: lead.source,
      nextAction: lead.nextAction,
      notes: lead.notes,
      lastContactedAt: lead.lastContactedAt,
      contactedBy: lead.contactedBy,
      followUpDate: lead.followUpDate,
      outcome: lead.outcome,
      contactHistory: lead.contactHistory,
      emailHistory: lead.emailHistory,
    });
    setNeedInput(lead.needs.join(', '));
    setShowLeadForm(true);
    setPage('leads');
  }

  function resetForm() {
    setEditingId(undefined);
    setForm(emptyLead);
    setNeedInput('');
    setShowLeadForm(false);
  }

  function updateBriefCategory(category: LeadCategory) {
    setBrief((current) => ({
      ...current,
      categories: current.categories.includes(category)
        ? current.categories.filter((item) => item !== category)
        : [...current.categories, category],
    }));
  }

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
      </div>
    );
  }

  if (isSupabaseConfigured && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <form onSubmit={handleSignIn} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-600 text-white">
              <Activity size={23} />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Paracare Outreach</h1>
              <p className="text-sm text-slate-500">Private internal access</p>
            </div>
          </div>
          <p className="mb-4 text-sm leading-6 text-slate-600">
            Sign in with an invited Outreach account. Leave password blank to receive a magic link.
          </p>
          {error && <Alert tone="danger" message={error} />}
          {authMessage && <Alert tone="info" message={authMessage} />}
          <div className="space-y-3">
            <Field label="Email" type="email" value={email} onChange={setEmail} required />
            <Field label="Password" type="password" value={password} onChange={setPassword} />
            <button className="button-primary w-full" disabled={Boolean(busy)}>
              <ShieldCheck size={18} />
              {password ? 'Sign in' : 'Send magic link'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 lg:flex">
      <Sidebar page={page} onPageChange={setPage} onSignOut={() => supabase?.auth.signOut()} showSignOut={Boolean(session)} />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{pageTitle(page)}</h1>
              <p className="hidden text-sm text-slate-500 sm:block">{pageDescription(page)}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill active={isSupabaseConfigured} />
              {session && (
                <button className="button-secondary lg:hidden" onClick={() => supabase?.auth.signOut()} aria-label="Sign out">
                  <LogOut size={17} />
                </button>
              )}
            </div>
          </div>
          <MobileNav page={page} onPageChange={setPage} />
        </header>

        <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
          {error && <Alert tone="danger" message={error} />}
          {busy && <Alert tone="info" message={`${busy}...`} />}

          {page === 'leads' && (
            <LeadsPage
              leads={filteredLeads}
              selectedLead={selectedLead}
              query={query}
              showLeadForm={showLeadForm}
              form={form}
              editing={Boolean(editingId)}
              needInput={needInput}
              busy={Boolean(busy)}
              duplicateMatches={formDuplicates}
              selectedDuplicates={selectedDuplicates}
              onQueryChange={setQuery}
              onSelectLead={setSelectedId}
              onAddLead={() => { resetForm(); setShowLeadForm(true); }}
              onSubmitLead={handleSaveLead}
              onCancelLead={resetForm}
              onFormChange={setForm}
              onNeedInputChange={(value) => {
                setNeedInput(value);
                setForm({ ...form, needs: value.split(',').map((item) => item.trim()).filter(Boolean) });
              }}
              onEdit={editLead}
              onGenerate={handleGenerateEmail}
              onStatusChange={handleStatusChange}
            />
          )}

          {page === 'finder' && (
            <DiscoverPanel
              brief={brief}
              busy={Boolean(busy)}
              onBriefChange={setBrief}
              onToggleCategory={updateBriefCategory}
              onDiscover={handleDiscover}
            />
          )}

          {page === 'drafts' && (
            <DraftPanel
              lead={selectedLead}
              draft={draft}
              tone={tone}
              busy={Boolean(busy)}
              onToneChange={setTone}
              onGenerate={handleGenerateEmail}
              onDraftChange={setDraft}
              onStatusChange={handleStatusChange}
              onMarkSent={handleMarkEmailSent}
              duplicateMatches={selectedDuplicates}
            />
          )}

          {page === 'followups' && (
            <FollowUpsPage leads={leads} onSelectLead={(id) => { setSelectedId(id); setPage('leads'); }} onStatusChange={handleStatusChange} />
          )}
        </main>
      </div>
    </div>
  );
}

function authErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';

  if (/invalid login credentials/i.test(message) || /user not found/i.test(message)) {
    return 'No Outreach account was found for those details. Add this email in the Outreach Supabase Auth users first, then try again.';
  }

  if (/signups not allowed/i.test(message)) {
    return 'This private app only allows invited users. Add this email in the Outreach Supabase Auth users first, then send a magic link.';
  }

  return message || 'Could not sign in.';
}

const navItems: { page: AppPage; label: string; icon: React.ReactNode }[] = [
  { page: 'finder', label: 'Search', icon: <Search size={18} /> },
  { page: 'leads', label: 'Review Leads', icon: <Users size={18} /> },
  { page: 'drafts', label: 'Draft Emails', icon: <FileText size={18} /> },
  { page: 'followups', label: 'Contact Log', icon: <CalendarClock size={18} /> },
];

function Sidebar({ page, onPageChange, onSignOut, showSignOut }: { page: AppPage; onPageChange: (page: AppPage) => void; onSignOut: () => void; showSignOut: boolean }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:min-h-screen lg:flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
          <Activity size={22} />
        </div>
        <div>
          <div className="text-base font-semibold">Paracare</div>
          <div className="text-xs font-medium text-slate-500">Outreach</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <button key={item.page} className={`sidebar-link ${page === item.page ? 'sidebar-link-active' : ''}`} onClick={() => onPageChange(item.page)}>
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      {showSignOut && (
        <div className="border-t border-slate-200 p-3">
          <button className="sidebar-link" onClick={onSignOut}>
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}

function MobileNav({ page, onPageChange }: { page: AppPage; onPageChange: (page: AppPage) => void }) {
  return (
    <nav className="flex gap-2 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
      {navItems.map((item) => (
        <button key={item.page} className={`mobile-nav-link ${page === item.page ? 'mobile-nav-link-active' : ''}`} onClick={() => onPageChange(item.page)}>
          {item.icon}
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function LeadsPage({
  leads,
  selectedLead,
  query,
  showLeadForm,
  form,
  editing,
  needInput,
  busy,
  duplicateMatches,
  selectedDuplicates,
  onQueryChange,
  onSelectLead,
  onAddLead,
  onSubmitLead,
  onCancelLead,
  onFormChange,
  onNeedInputChange,
  onEdit,
  onGenerate,
  onStatusChange,
}: {
  leads: Lead[];
  selectedLead: Lead | null;
  query: string;
  showLeadForm: boolean;
  form: LeadFormInput;
  editing: boolean;
  needInput: string;
  busy: boolean;
  duplicateMatches: DuplicateMatch[];
  selectedDuplicates: DuplicateMatch[];
  onQueryChange: (value: string) => void;
  onSelectLead: (id: string) => void;
  onAddLead: () => void;
  onSubmitLead: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancelLead: () => void;
  onFormChange: (form: LeadFormInput) => void;
  onNeedInputChange: (value: string) => void;
  onEdit: (lead: Lead) => void;
  onGenerate: () => void;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Lead cards</h2>
            <button className="button-secondary h-9 px-3" onClick={onAddLead}>
              <Plus size={16} />
              Add
            </button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={17} />
            <input className="input pl-9" placeholder="Search leads" value={query} onChange={(event) => onQueryChange(event.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          {leads.map((lead) => (
            <button key={lead.id} onClick={() => onSelectLead(lead.id)} className={`lead-row ${selectedLead?.id === lead.id ? 'lead-row-active' : ''}`}>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-semibold">{lead.organisation}</div>
                <div className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
                  <MapPin size={13} />
                  {lead.suburb || lead.location || lead.category}
                </div>
              </div>
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${likelihoodClass(lead.likelihood)}`}>{lead.likelihood}%</span>
            </button>
          ))}
          {leads.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">No leads in this queue.</div>}
        </div>
      </aside>

      {showLeadForm ? (
        <LeadForm
          form={form}
          editing={editing}
          needInput={needInput}
          busy={busy}
          duplicateMatches={duplicateMatches}
          onSubmit={onSubmitLead}
          onCancel={onCancelLead}
          onNeedInputChange={onNeedInputChange}
          onFormChange={onFormChange}
        />
      ) : (
        <LeadReviewPanel
          lead={selectedLead}
          duplicateMatches={selectedDuplicates}
          onEdit={onEdit}
          onGenerate={onGenerate}
          onStatusChange={onStatusChange}
          busy={busy}
        />
      )}
    </div>
  );
}

function DiscoverPanel({
  brief,
  busy,
  onBriefChange,
  onToggleCategory,
  onDiscover,
}: {
  brief: SearchBrief;
  busy: boolean;
  onBriefChange: (brief: SearchBrief) => void;
  onToggleCategory: (category: LeadCategory) => void;
  onDiscover: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-sky-700">
          <Sparkles size={18} />
          Area research autopilot
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Set the area, then let the app research</h2>
        <p className="text-sm leading-6 text-slate-600">The assistant searches the area, gathers candidate information, ranks suitability, generates draft emails, and saves only non-duplicate leads for human review.</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <Field label="Suburb" value={brief.suburb} onChange={(value) => onBriefChange({ ...brief, suburb: value, location: [value, brief.postcode, brief.region].filter(Boolean).join(' ') })} />
        <Field label="Postcode" value={brief.postcode} onChange={(value) => onBriefChange({ ...brief, postcode: value, location: [brief.suburb, value, brief.region].filter(Boolean).join(' ') })} />
        <Field label="Region" value={brief.region} onChange={(value) => onBriefChange({ ...brief, region: value, location: [brief.suburb, brief.postcode, value].filter(Boolean).join(' ') })} />
        <Field label="Radius km" type="number" value={brief.radiusKm?.toString() ?? ''} onChange={(value) => onBriefChange({ ...brief, radiusKm: value ? Number(value) : null })} />
        <label className="block">
          <span className="label">Lead count</span>
          <select className="input" value={brief.leadCount} onChange={(event) => onBriefChange({ ...brief, leadCount: Number(event.target.value) })}>
            {[5, 10, 15, 20].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="label">AI model mode</span>
            <p className="text-sm leading-6 text-slate-600">
              {brief.modelMode === 'save_tokens'
                ? 'Testing mode uses the cheapest model to reduce API costs.'
                : 'Launch mode uses the stronger outreach model for final research and drafts.'}
            </p>
          </div>
          <select
            className="input sm:max-w-56"
            value={brief.modelMode}
            onChange={(event) => onBriefChange({ ...brief, modelMode: event.target.value as ModelMode })}
          >
            <option value="save_tokens">Save tokens</option>
            <option value="launch_quality">Launch quality</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="block">
          <span className="label">Search instructions</span>
          <textarea className="textarea min-h-24" value={brief.notes} onChange={(event) => onBriefChange({ ...brief, notes: event.target.value })} />
        </label>
      </div>

      <div className="mt-5">
        <span className="label">Target lead types</span>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <button key={category} className={`select-tile ${brief.categories.includes(category) ? 'select-tile-active' : ''}`} onClick={() => onToggleCategory(category)}>
              <CheckCircle2 size={17} />
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button onClick={onDiscover} disabled={busy || brief.categories.length === 0} className="button-primary">
          Research and draft {brief.leadCount} leads
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}

function LeadReviewPanel({
  lead,
  duplicateMatches,
  busy,
  onEdit,
  onGenerate,
  onStatusChange,
}: {
  lead: Lead | null;
  duplicateMatches: DuplicateMatch[];
  busy: boolean;
  onEdit: (lead: Lead) => void;
  onGenerate: () => void;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
}) {
  if (!lead) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <Target className="mx-auto text-slate-400" size={32} />
        <h2 className="mt-3 text-lg font-semibold">Start with discovery or add a lead</h2>
        <p className="mt-2 text-sm text-slate-500">The review panel will show one clear next step once a lead exists.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <DuplicateWarning lead={lead} matches={duplicateMatches} />
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">{lead.category}</span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${likelihoodClass(lead.likelihood)}`}>
              {likelihoodLabel(lead.likelihood)} fit · {lead.likelihood}%
            </span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{lead.organisation}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{lead.fitSummary || 'Add a short summary of why this organisation is or is not worth contacting.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="button-secondary" onClick={() => onEdit(lead)}>
            <Edit3 size={17} />
            Edit
          </button>
          <button className="button-primary" onClick={onGenerate} disabled={busy}>
            <Sparkles size={17} />
            Draft email
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Info icon={<UserRound size={17} />} label="Person to reach" value={[lead.contactName, lead.contactRole].filter(Boolean).join(' · ') || 'Find the decision maker'} />
        <Info icon={<Mail size={17} />} label="Email" value={lead.email || 'Needs verification'} />
        <Info icon={<MapPin size={17} />} label="Area" value={[lead.suburb, lead.postcode, lead.region, lead.radiusKm ? `${lead.radiusKm}km` : ''].filter(Boolean).join(' · ') || lead.location || 'Not set'} />
      </div>

      <div className="mt-5 rounded-lg border border-sky-100 bg-sky-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-sky-900">Autonomous suitability brief</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">{lead.suitabilitySummary || lead.fitSummary || 'No autonomous suitability brief has been saved for this lead yet.'}</p>
          </div>
          <span className="shrink-0 rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700">
            Confidence {lead.researchConfidence || lead.likelihood}%
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Services found</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(lead.servicesOffered.length > 0 ? lead.servicesOffered : ['Services not verified']).map((service) => (
                <span key={service} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-sky-100">{service}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Likely business needs</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(lead.businessNeeds.length > 0 ? lead.businessNeeds : lead.needs).map((need) => (
                <span key={need} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-sky-100">{need}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Recommended outreach angle</div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{lead.outreachAngle || lead.nextAction || 'Review the fit before generating an email.'}</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Concerns</div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{lead.concerns.length > 0 ? lead.concerns.join(' ') : 'No major concerns recorded.'}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Review decision</h3>
        <div className="grid gap-3 md:grid-cols-[240px_1fr]">
          <select className="input" value={lead.status} onChange={(event) => onStatusChange(lead, event.target.value as LeadStatus)}>
            {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <p className="text-sm leading-6 text-slate-600">{lead.nextAction || nextActionForStatus(lead.status)}</p>
        </div>
      </div>
    </div>
  );
}

function LeadForm({
  form,
  editing,
  needInput,
  duplicateMatches,
  busy,
  onSubmit,
  onCancel,
  onFormChange,
  onNeedInputChange,
}: {
  form: LeadFormInput;
  editing: boolean;
  needInput: string;
  duplicateMatches: DuplicateMatch[];
  busy: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onFormChange: (form: LeadFormInput) => void;
  onNeedInputChange: (value: string) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 border-b border-slate-100 pb-4">
        <h2 className="text-2xl font-semibold tracking-tight">{editing ? 'Edit lead' : 'Add lead'}</h2>
        <p className="text-sm text-slate-600">Keep only what helps decide fit and write a better first email.</p>
      </div>
      {duplicateMatches.length > 0 && <DuplicateMatchList matches={duplicateMatches} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Organisation" value={form.organisation} onChange={(value) => onFormChange({ ...form, organisation: value })} required />
        <label className="block">
          <span className="label">Lead type</span>
          <select className="input" value={form.category} onChange={(event) => onFormChange({ ...form, category: event.target.value as LeadCategory })}>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <Field label="Location" value={form.location} onChange={(value) => onFormChange({ ...form, location: value })} />
        <Field label="Suburb" value={form.suburb} onChange={(value) => onFormChange({ ...form, suburb: value })} />
        <Field label="Postcode" value={form.postcode} onChange={(value) => onFormChange({ ...form, postcode: value })} />
        <Field label="Region" value={form.region} onChange={(value) => onFormChange({ ...form, region: value })} />
        <Field label="Radius km" type="number" value={form.radiusKm?.toString() ?? ''} onChange={(value) => onFormChange({ ...form, radiusKm: value ? Number(value) : null })} />
        <Field label="Website" value={form.website} onChange={(value) => onFormChange({ ...form, website: value })} />
        <Field label="Contact name" value={form.contactName} onChange={(value) => onFormChange({ ...form, contactName: value })} />
        <Field label="Role or position" value={form.contactRole} onChange={(value) => onFormChange({ ...form, contactRole: value })} />
        <Field label="Email" value={form.email} onChange={(value) => onFormChange({ ...form, email: value })} />
        <Field label="Phone" value={form.phone} onChange={(value) => onFormChange({ ...form, phone: value })} />
      </div>
      <label className="mt-3 block">
        <span className="label">Opportunity tags</span>
        <input className="input" value={needInput} placeholder="Complex care, referrals, family communication" onChange={(event) => onNeedInputChange(event.target.value)} />
      </label>
      <label className="mt-3 block">
        <span className="label">Fit summary</span>
        <textarea className="textarea" value={form.fitSummary} onChange={(event) => onFormChange({ ...form, fitSummary: event.target.value })} />
      </label>
      <label className="mt-3 block">
        <span className="label">Autonomous suitability brief</span>
        <textarea className="textarea" value={form.suitabilitySummary} onChange={(event) => onFormChange({ ...form, suitabilitySummary: event.target.value })} />
      </label>
      <label className="mt-3 block">
        <span className="label">Recommended outreach angle</span>
        <textarea className="textarea" value={form.outreachAngle} onChange={(event) => onFormChange({ ...form, outreachAngle: event.target.value })} />
      </label>
      <label className="mt-3 block">
        <span className="label">Positioning notes</span>
        <textarea className="textarea" value={form.notes} onChange={(event) => onFormChange({ ...form, notes: event.target.value })} />
      </label>
      <Field label="Next action" value={form.nextAction} onChange={(value) => onFormChange({ ...form, nextAction: value })} />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className="button-secondary" onClick={onCancel}>Cancel</button>
        <button className="button-primary" disabled={busy} type="submit">
          <CheckCircle2 size={17} />
          {editing ? 'Update lead' : 'Save lead'}
        </button>
      </div>
    </form>
  );
}

function DraftPanel({
  lead,
  draft,
  tone,
  duplicateMatches,
  busy,
  onToneChange,
  onGenerate,
  onDraftChange,
  onStatusChange,
  onMarkSent,
}: {
  lead: Lead | null;
  draft: DraftEmail | null;
  tone: OutreachTone;
  duplicateMatches: DuplicateMatch[];
  busy: boolean;
  onToneChange: (tone: OutreachTone) => void;
  onGenerate: () => void;
  onDraftChange: (draft: DraftEmail) => void;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onMarkSent: (lead: Lead, contactedBy: string) => void;
}) {
  const [contactedBy, setContactedBy] = useState('');
  const shownDraft = draft ?? lead?.emailHistory[0] ?? null;

  if (!lead) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <Mail className="mx-auto text-slate-400" size={32} />
        <h2 className="mt-3 text-lg font-semibold">Select a lead first</h2>
        <p className="mt-2 text-sm text-slate-500">Email drafting starts from the selected lead’s notes and positioning.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <DuplicateWarning lead={lead} matches={duplicateMatches} />
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-sky-700">Human review email</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{lead.organisation}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input max-w-36" value={tone} onChange={(event) => onToneChange(event.target.value as OutreachTone)}>
            <option value="warm">Warm</option>
            <option value="clinical">Clinical</option>
            <option value="concise">Concise</option>
          </select>
          <button className="button-primary" onClick={onGenerate} disabled={busy}>
            <Sparkles size={17} />
            Generate
          </button>
        </div>
      </div>

      {shownDraft ? (
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="label">Subject</span>
            <input className="input" value={shownDraft.subject} onChange={(event) => onDraftChange({ subject: event.target.value, body: shownDraft.body })} />
          </label>
          <label className="block">
            <span className="label">Body</span>
            <textarea className="textarea min-h-96 font-mono text-sm" value={shownDraft.body} onChange={(event) => onDraftChange({ subject: shownDraft.subject, body: event.target.value })} />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <input className="input max-w-56" placeholder="Who contacted them?" value={contactedBy} onChange={(event) => setContactedBy(event.target.value)} />
            <button className="button-secondary" onClick={() => navigator.clipboard.writeText(`Subject: ${shownDraft.subject}\n\n${shownDraft.body}`)}>
              <Copy size={17} />
              Copy
            </button>
            <button className="button-secondary" onClick={() => onMarkSent(lead, contactedBy)}>
              <Mail size={17} />
              Mark sent
            </button>
            <button className="button-primary" onClick={() => onStatusChange(lead, 'reviewed')}>
              <CheckCircle2 size={17} />
              Mark reviewed
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Mail className="mx-auto text-slate-400" size={32} />
          <p className="mt-3 text-sm text-slate-600">Generate a draft, edit it here, then copy it when it is ready to send.</p>
        </div>
      )}
    </div>
  );
}

function FollowUpsPage({ leads, onSelectLead, onStatusChange }: { leads: Lead[]; onSelectLead: (id: string) => void; onStatusChange: (lead: Lead, status: LeadStatus) => void }) {
  const contactedLeads = leads
    .filter((lead) => lead.lastContactedAt || lead.contactHistory.length > 0 || lead.followUpDate || ['contacted', 'follow_up', 'replied', 'interested', 'meeting_booked', 'not_interested'].includes(lead.status))
    .sort((a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999'));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-2xl font-semibold tracking-tight">Contact log</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Track sent emails, replies and follow-up status.</p>
      </div>
      <div className="mt-4 space-y-2">
        {contactedLeads.length > 0 ? contactedLeads.map((lead) => (
          <div key={lead.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm font-semibold">{lead.organisation}</div>
              <div className="mt-1 text-xs text-slate-500">
                {lead.lastContactedAt ? `Sent ${formatDate(lead.lastContactedAt)}` : 'Not marked sent'}
                {lead.email ? ` · ${lead.email}` : ''}
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-center">
              <select className="input" value={lead.status} onChange={(event) => onStatusChange(lead, event.target.value as LeadStatus)}>
                {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
              <p className="text-sm text-slate-600">{lead.outcome || lead.nextAction || 'Waiting for reply or follow-up.'}</p>
              <button className="button-secondary" onClick={() => onSelectLead(lead.id)}>Open</button>
            </div>
            {lead.followUpDate && <p className="mt-3 text-xs font-semibold text-sky-700">Follow up {formatDate(lead.followUpDate)}</p>}
          </div>
        )) : (
          <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">No sent emails or follow-ups yet.</p>
        )}
      </div>
    </div>
  );
}

function DuplicateWarning({ lead, matches }: { lead: Lead; matches: DuplicateMatch[] }) {
  if (!hasPriorOutreach(lead) && matches.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <div className="flex items-start gap-2 font-semibold">
        <AlertTriangle size={18} />
        Previous outreach or duplicate match found
      </div>
      {lead.lastContactedAt && <p className="mt-2">This lead was contacted on {formatDate(lead.lastContactedAt)}{lead.contactedBy ? ` by ${lead.contactedBy}` : ''}.</p>}
      {matches.length > 0 && <DuplicateMatchList matches={matches} compact />}
    </div>
  );
}

function DuplicateMatchList({ matches, compact = false }: { matches: DuplicateMatch[]; compact?: boolean }) {
  return (
    <div className={compact ? 'mt-2 space-y-1' : 'mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800'}>
      {!compact && (
        <div className="mb-2 flex items-start gap-2 font-semibold">
          <AlertTriangle size={18} />
          Duplicate prevention blocked this save
        </div>
      )}
      {matches.map((match) => (
        <p key={match.leadId}>
          Matches <strong>{match.organisation}</strong> by {match.matchedOn.join(', ')}
          {match.lastContactedAt ? ` · contacted ${formatDate(match.lastContactedAt)}` : ` · status ${match.status}`}
        </p>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function pageTitle(page: AppPage) {
  if (page === 'finder') return 'Search';
  if (page === 'leads') return 'Review Leads';
  if (page === 'drafts') return 'Draft Emails';
  return 'Contact Log';
}

function pageDescription(page: AppPage) {
  if (page === 'finder') return 'Set the area, lead types and number of leads.';
  if (page === 'leads') return 'Review one lead card at a time before outreach.';
  if (page === 'drafts') return 'Review and edit draft emails before sending.';
  return 'Track sent emails, replies and follow-ups.';
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {active ? 'Supabase connected' : 'Local demo'}
    </span>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">{icon}{label}</div>
      <div className="mt-2 break-words text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Alert({ tone, message }: { tone: 'danger' | 'info'; message: string }) {
  const classes = tone === 'danger'
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-sky-200 bg-sky-50 text-sky-700';

  return <div className={`mb-4 rounded-lg border p-4 text-sm font-medium ${classes}`}>{message}</div>;
}

function nextActionForStatus(status: LeadStatus): string {
  if (status === 'new') return 'Review the organisation, find the right contact, then qualify or archive.';
  if (status === 'researching') return 'Verify the decision maker, email address and referral relevance.';
  if (status === 'qualified') return 'Generate a draft email for human review.';
  if (status === 'drafted') return 'Review the draft and personalise anything that feels generic.';
  if (status === 'reviewed') return 'Send the email outside the app, then mark as contacted.';
  if (status === 'contacted') return 'Set a follow-up reminder after a few business days.';
  if (status === 'follow_up') return 'Follow up with a short, useful note.';
  if (status === 'replied') return 'Review the reply and decide whether they are interested, need follow-up, or are not a fit.';
  if (status === 'interested') return 'Qualify the opportunity and suggest a meeting time.';
  if (status === 'meeting_booked') return 'Prepare notes for the meeting and capture the referral opportunity.';
  if (status === 'not_interested') return 'Stop outreach unless they ask to be contacted later.';
  if (status === 'won') return 'Capture what worked so future outreach can reuse it.';
  return 'Keep notes for why this lead is not a fit.';
}
