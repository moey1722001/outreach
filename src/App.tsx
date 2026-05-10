import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Copy,
  Edit3,
  LogOut,
  Mail,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { discoverLeads, generateEmail, listLeads, saveLead, updateLeadStatus } from './lib/data';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { likelihoodClass, likelihoodLabel, scoreLead } from './lib/scoring';
import type { DraftEmail, Lead, LeadCategory, LeadFormInput, LeadStatus, OutreachTone, SearchBrief } from './lib/types';

type WorkspaceView = 'discover' | 'review' | 'draft';
type FocusFilter = 'all' | 'review' | 'draft' | 'follow_up';

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
  { value: 'won', label: 'Won' },
  { value: 'not_fit', label: 'Not fit' },
];

const focusOptions: { value: FocusFilter; label: string; hint: string }[] = [
  { value: 'all', label: 'All leads', hint: 'Everything saved' },
  { value: 'review', label: 'Needs review', hint: 'New and researching' },
  { value: 'draft', label: 'Ready to draft', hint: 'Qualified and drafted' },
  { value: 'follow_up', label: 'Follow up', hint: 'Contacted leads' },
];

const emptyLead: LeadFormInput = {
  organisation: '',
  category: 'NDIS support coordinator',
  website: '',
  location: '',
  contactName: '',
  contactRole: '',
  email: '',
  phone: '',
  status: 'new',
  fitSummary: '',
  needs: [],
  source: '',
  nextAction: '',
  notes: '',
  lastContactedAt: null,
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<WorkspaceView>('review');
  const [focus, setFocus] = useState<FocusFilter>('review');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<LeadFormInput>(emptyLead);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [needInput, setNeedInput] = useState('');
  const [brief, setBrief] = useState<SearchBrief>({
    location: 'Sydney',
    categories: ['NDIS support coordinator', 'Home Care Package provider', 'GP clinic'],
    notes: 'Prioritise organisations likely to refer clients who need in-home nursing and responsive escalation.',
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

  const metrics = useMemo(() => {
    const review = leads.filter((lead) => ['new', 'researching'].includes(lead.status)).length;
    const draftReady = leads.filter((lead) => ['qualified', 'drafted', 'reviewed'].includes(lead.status)).length;
    const followUp = leads.filter((lead) => ['contacted', 'follow_up'].includes(lead.status)).length;
    const avg = leads.length ? Math.round(leads.reduce((sum, lead) => sum + lead.likelihood, 0) / leads.length) : 0;
    return { review, draftReady, followUp, avg };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const normalised = query.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesQuery = !normalised || [
        lead.organisation,
        lead.category,
        lead.location,
        lead.contactName,
        lead.contactRole,
        lead.email,
        lead.notes,
      ].some((value) => value.toLowerCase().includes(normalised));

      if (!matchesQuery) return false;
      if (focus === 'review') return ['new', 'researching'].includes(lead.status);
      if (focus === 'draft') return ['qualified', 'drafted', 'reviewed'].includes(lead.status);
      if (focus === 'follow_up') return ['contacted', 'follow_up'].includes(lead.status);
      return true;
    });
  }, [focus, leads, query]);

  const selectedLead = leads.find((lead) => lead.id === selectedId) ?? filteredLeads[0] ?? null;

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
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy('');
    }
  }

  async function handleDiscover() {
    setBusy('Finding leads');
    setError('');
    try {
      const discoveries = await discoverLeads(brief);
      for (const lead of discoveries) {
        await saveLead({ ...lead, likelihood: lead.likelihood }, lead.id);
      }
      await refresh(discoveries[0]?.id);
      setView('review');
      setFocus('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lead discovery failed.');
    } finally {
      setBusy('');
    }
  }

  async function handleSaveLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('Saving lead');
    setError('');
    try {
      const next = await saveLead({ ...form, likelihood: scoreLead(form) }, editingId);
      await refresh(next.id);
      resetForm();
      setView('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save lead.');
    } finally {
      setBusy('');
    }
  }

  async function handleGenerateEmail() {
    if (!selectedLead) return;
    setBusy('Generating email');
    setError('');
    try {
      const nextDraft = await generateEmail(selectedLead, tone);
      setDraft(nextDraft);
      const updated = await updateLeadStatus(selectedLead, selectedLead.status === 'qualified' || selectedLead.status === 'new' ? 'drafted' : selectedLead.status);
      setLeads((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setView('draft');
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

  function editLead(lead: Lead) {
    setEditingId(lead.id);
    setForm({
      organisation: lead.organisation,
      category: lead.category,
      website: lead.website,
      location: lead.location,
      contactName: lead.contactName,
      contactRole: lead.contactRole,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      likelihood: lead.likelihood,
      fitSummary: lead.fitSummary,
      needs: lead.needs,
      source: lead.source,
      nextAction: lead.nextAction,
      notes: lead.notes,
      lastContactedAt: lead.lastContactedAt,
    });
    setNeedInput(lead.needs.join(', '));
    setShowLeadForm(true);
    setView('review');
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
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm">
                <Activity size={23} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Paracare Outreach</h1>
                <p className="text-sm text-slate-500">Find leads, review fit, draft emails, follow up.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill active={isSupabaseConfigured} />
              <span className="inline-flex h-10 items-center gap-2 rounded-md bg-sky-600 px-3 text-sm font-semibold text-white">
                <ShieldCheck size={17} />
                Internal
              </span>
              {session && (
                <button className="button-secondary" onClick={() => supabase?.auth.signOut()} aria-label="Sign out">
                  <LogOut size={17} />
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Needs review" value={metrics.review.toString()} />
            <Metric label="Ready to draft" value={metrics.draftReady.toString()} />
            <Metric label="Follow up" value={metrics.followUp.toString()} />
            <Metric label="Average fit" value={`${metrics.avg}%`} />
          </div>

          <div className="mt-5 grid gap-2 rounded-lg bg-slate-100 p-1 sm:grid-cols-3">
            <ViewButton active={view === 'discover'} icon={<Search size={17} />} label="1. Discover" onClick={() => setView('discover')} />
            <ViewButton active={view === 'review'} icon={<Target size={17} />} label="2. Review" onClick={() => setView('review')} />
            <ViewButton active={view === 'draft'} icon={<Mail size={17} />} label="3. Draft" onClick={() => setView('draft')} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[360px_1fr] lg:px-8">
        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Work queue</h2>
              <button className="button-secondary h-9 px-3" onClick={() => { resetForm(); setShowLeadForm(true); setView('review'); }}>
                <Plus size={16} />
                Add
              </button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={17} />
              <input className="input pl-9" placeholder="Search leads" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {focusOptions.map((option) => (
                <button key={option.value} className={`focus-chip ${focus === option.value ? 'focus-chip-active' : ''}`} onClick={() => setFocus(option.value)}>
                  <span>{option.label}</span>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {filteredLeads.map((lead) => (
              <button key={lead.id} onClick={() => setSelectedId(lead.id)} className={`lead-row ${selectedLead?.id === lead.id ? 'lead-row-active' : ''}`}>
                <div className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-semibold">{lead.organisation}</div>
                  <div className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
                    <MapPin size={13} />
                    {lead.location || lead.category}
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${likelihoodClass(lead.likelihood)}`}>{lead.likelihood}%</span>
              </button>
            ))}
            {filteredLeads.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
                No leads in this queue.
              </div>
            )}
          </div>
        </aside>

        <section className="space-y-5">
          {error && <Alert tone="danger" message={error} />}
          {busy && <Alert tone="info" message={`${busy}...`} />}

          {view === 'discover' && (
            <DiscoverPanel
              brief={brief}
              busy={Boolean(busy)}
              onBriefChange={setBrief}
              onToggleCategory={updateBriefCategory}
              onDiscover={handleDiscover}
            />
          )}

          {view === 'review' && (
            <>
              {showLeadForm ? (
                <LeadForm
                  form={form}
                  editing={Boolean(editingId)}
                  needInput={needInput}
                  busy={Boolean(busy)}
                  onSubmit={handleSaveLead}
                  onCancel={resetForm}
                  onNeedInputChange={(value) => {
                    setNeedInput(value);
                    setForm({ ...form, needs: value.split(',').map((item) => item.trim()).filter(Boolean) });
                  }}
                  onFormChange={setForm}
                />
              ) : (
                <LeadReviewPanel
                  lead={selectedLead}
                  onEdit={editLead}
                  onGenerate={handleGenerateEmail}
                  onStatusChange={handleStatusChange}
                  busy={Boolean(busy)}
                />
              )}
            </>
          )}

          {view === 'draft' && (
            <DraftPanel
              lead={selectedLead}
              draft={draft}
              tone={tone}
              busy={Boolean(busy)}
              onToneChange={setTone}
              onGenerate={handleGenerateEmail}
              onDraftChange={setDraft}
              onStatusChange={handleStatusChange}
            />
          )}
        </section>
      </main>
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
          Lead discovery
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Find likely referral partners</h2>
        <p className="text-sm leading-6 text-slate-600">Choose a location and target groups. New results go straight into the review queue.</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Field label="Location" value={brief.location} onChange={(value) => onBriefChange({ ...brief, location: value })} />
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
          Find leads
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}

function LeadReviewPanel({
  lead,
  busy,
  onEdit,
  onGenerate,
  onStatusChange,
}: {
  lead: Lead | null;
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
        <Info icon={<MapPin size={17} />} label="Location" value={lead.location || 'Not set'} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_280px]">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Positioning</h3>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm leading-6 text-slate-700">{lead.notes || 'Use this space to capture the likely client need, referral angle, and what should be checked before contacting.'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {lead.needs.length > 0 ? lead.needs.map((need) => (
                <span key={need} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{need}</span>
              )) : <span className="text-sm text-slate-500">No tags yet.</span>}
            </div>
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Next action</h3>
          <select className="input mb-3" value={lead.status} onChange={(event) => onStatusChange(lead, event.target.value as LeadStatus)}>
            {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">{lead.nextAction || nextActionForStatus(lead.status)}</p>
        </div>
      </div>
    </div>
  );
}

function LeadForm({
  form,
  editing,
  needInput,
  busy,
  onSubmit,
  onCancel,
  onFormChange,
  onNeedInputChange,
}: {
  form: LeadFormInput;
  editing: boolean;
  needInput: string;
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Organisation" value={form.organisation} onChange={(value) => onFormChange({ ...form, organisation: value })} required />
        <label className="block">
          <span className="label">Lead type</span>
          <select className="input" value={form.category} onChange={(event) => onFormChange({ ...form, category: event.target.value as LeadCategory })}>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <Field label="Location" value={form.location} onChange={(value) => onFormChange({ ...form, location: value })} />
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
  busy,
  onToneChange,
  onGenerate,
  onDraftChange,
  onStatusChange,
}: {
  lead: Lead | null;
  draft: DraftEmail | null;
  tone: OutreachTone;
  busy: boolean;
  onToneChange: (tone: OutreachTone) => void;
  onGenerate: () => void;
  onDraftChange: (draft: DraftEmail) => void;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
}) {
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

      {draft ? (
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="label">Subject</span>
            <input className="input" value={draft.subject} onChange={(event) => onDraftChange({ ...draft, subject: event.target.value })} />
          </label>
          <label className="block">
            <span className="label">Body</span>
            <textarea className="textarea min-h-96 font-mono text-sm" value={draft.body} onChange={(event) => onDraftChange({ ...draft, body: event.target.value })} />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="button-secondary" onClick={() => navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)}>
              <Copy size={17} />
              Copy
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

function ViewButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`view-button ${active ? 'view-button-active' : ''}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {active ? 'Supabase connected' : 'Local demo'}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
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
  if (status === 'won') return 'Capture what worked so future outreach can reuse it.';
  return 'Keep notes for why this lead is not a fit.';
}
