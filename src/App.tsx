import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  CheckCircle2,
  ClipboardList,
  Copy,
  Edit3,
  FileText,
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
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<LeadCategory | 'all'>('all');
  const [form, setForm] = useState<LeadFormInput>(emptyLead);
  const [editingId, setEditingId] = useState<string | undefined>();
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
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || lead.category === categoryFilter;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [categoryFilter, leads, query, statusFilter]);

  const selectedLead = leads.find((lead) => lead.id === selectedId) ?? filteredLeads[0] ?? null;

  const metrics = useMemo(() => {
    const contacted = leads.filter((lead) => ['contacted', 'follow_up', 'won'].includes(lead.status)).length;
    const highFit = leads.filter((lead) => lead.likelihood >= 80).length;
    const draftReady = leads.filter((lead) => ['drafted', 'reviewed'].includes(lead.status)).length;
    const avg = leads.length ? Math.round(leads.reduce((sum, lead) => sum + lead.likelihood, 0) / leads.length) : 0;
    return { contacted, highFit, draftReady, avg };
  }, [leads]);

  async function refresh() {
    const items = await listLeads();
    setLeads(items);
    setSelectedId((current) => current ?? items[0]?.id ?? null);
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

  async function handleSaveLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('Saving lead');
    setError('');
    try {
      const next = await saveLead({ ...form, likelihood: scoreLead(form) }, editingId);
      await refresh();
      setSelectedId(next.id);
      setForm(emptyLead);
      setEditingId(undefined);
      setNeedInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save lead.');
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
      await refresh();
      setSelectedId(discoveries[0]?.id ?? selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lead discovery failed.');
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
      const updated = await updateLeadStatus(selectedLead, selectedLead.status === 'new' ? 'drafted' : selectedLead.status);
      setLeads((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email generation failed.');
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
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
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
          {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
          {authMessage && <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm font-medium text-sky-700">{authMessage}</div>}
          <div className="space-y-3">
            <label className="block">
              <span className="label">Email</span>
              <input className="input" type="email" value={email} required onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
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
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm">
                <Activity size={23} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Paracare Outreach</h1>
                <p className="text-sm text-slate-500">Private AI outreach CRM for healthcare and community partnerships</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill active={isSupabaseConfigured} />
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700">
                <ShieldCheck size={18} />
                Internal only
              </button>
              {session && (
                <button className="button-secondary" onClick={() => supabase?.auth.signOut()}>
                  Sign out
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric icon={<Target size={18} />} label="Average fit" value={`${metrics.avg}%`} />
            <Metric icon={<CheckCircle2 size={18} />} label="High-fit leads" value={metrics.highFit.toString()} />
            <Metric icon={<FileText size={18} />} label="Drafts ready" value={metrics.draftReady.toString()} />
            <Metric icon={<Mail size={18} />} label="Contacted" value={metrics.contacted.toString()} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[380px_1fr] lg:px-8">
        <section className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Find leads</h2>
              <Sparkles className="text-sky-600" size={20} />
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="label">Location</span>
                <input className="input" value={brief.location} onChange={(event) => setBrief({ ...brief, location: event.target.value })} />
              </label>
              <div>
                <span className="label">Lead types</span>
                <div className="grid gap-2">
                  {categories.map((category) => (
                    <label key={category} className="checkbox-row">
                      <input type="checkbox" checked={brief.categories.includes(category)} onChange={() => updateBriefCategory(category)} />
                      <span>{category}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="label">Research notes</span>
                <textarea className="textarea min-h-24" value={brief.notes} onChange={(event) => setBrief({ ...brief, notes: event.target.value })} />
              </label>
              <button onClick={handleDiscover} disabled={Boolean(busy) || brief.categories.length === 0} className="button-primary w-full">
                <Search size={18} />
                Find candidate leads
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Pipeline</h2>
              <span className="text-xs font-medium text-slate-500">{filteredLeads.length} shown</span>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={17} />
                <input className="input pl-9" placeholder="Search organisations, roles, notes" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LeadStatus | 'all')}>
                  <option value="all">All statuses</option>
                  {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
                <select className="input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as LeadCategory | 'all')}>
                  <option value="all">All types</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {filteredLeads.map((lead) => (
                <button key={lead.id} onClick={() => setSelectedId(lead.id)} className={`lead-row ${selectedLead?.id === lead.id ? 'lead-row-active' : ''}`}>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-semibold">{lead.organisation}</div>
                    <div className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
                      <MapPin size={13} />
                      {lead.location || 'Location unknown'}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${likelihoodClass(lead.likelihood)}`}>{lead.likelihood}%</span>
                </button>
              ))}
              {filteredLeads.length === 0 && <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">No leads match those filters.</p>}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
          {busy && <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm font-medium text-sky-700">{busy}...</div>}

          {selectedLead ? (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">{selectedLead.category}</span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${likelihoodClass(selectedLead.likelihood)}`}>
                      {likelihoodLabel(selectedLead.likelihood)} fit · {selectedLead.likelihood}%
                    </span>
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">{selectedLead.organisation}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{selectedLead.fitSummary || 'Add a fit summary after researching this lead.'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="button-secondary" onClick={() => editLead(selectedLead)}>
                    <Edit3 size={17} />
                    Edit
                  </button>
                  <button className="button-primary" onClick={handleGenerateEmail} disabled={Boolean(busy)}>
                    <Sparkles size={17} />
                    Draft email
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <Info icon={<UserRound size={17} />} label="Contact" value={[selectedLead.contactName, selectedLead.contactRole].filter(Boolean).join(' · ') || 'Find decision maker'} />
                <Info icon={<Mail size={17} />} label="Email" value={selectedLead.email || 'Not verified'} />
                <Info icon={<Building2 size={17} />} label="Source" value={selectedLead.source || selectedLead.website || 'Manual research'} />
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">Outreach position</h3>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm leading-6 text-slate-700">{selectedLead.notes || 'Capture what this organisation likely cares about, who to approach, and what evidence should be checked before sending.'}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedLead.needs.map((need) => <span key={need} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{need}</span>)}
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">Next step</h3>
                  <select
                    className="input mb-3"
                    value={selectedLead.status}
                    onChange={async (event) => {
                      const updated = await updateLeadStatus(selectedLead, event.target.value as LeadStatus);
                      setLeads((items) => items.map((item) => (item.id === updated.id ? updated : item)));
                    }}
                  >
                    {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                  <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">{selectedLead.nextAction || 'Decide whether to research, draft, review, or contact.'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
              <ClipboardList className="mx-auto text-slate-400" size={32} />
              <h2 className="mt-3 text-lg font-semibold">No lead selected</h2>
              <p className="mt-2 text-sm text-slate-500">Find or add a lead to start building the outreach pipeline.</p>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <form onSubmit={handleSaveLead} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">{editingId ? 'Edit lead' : 'Add lead'}</h2>
                <Plus className="text-sky-600" size={20} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Organisation" value={form.organisation} onChange={(value) => setForm({ ...form, organisation: value })} required />
                <label className="block">
                  <span className="label">Type</span>
                  <select className="input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as LeadCategory })}>
                    {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <Field label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
                <Field label="Website" value={form.website} onChange={(value) => setForm({ ...form, website: value })} />
                <Field label="Contact name" value={form.contactName} onChange={(value) => setForm({ ...form, contactName: value })} />
                <Field label="Role or position" value={form.contactRole} onChange={(value) => setForm({ ...form, contactRole: value })} />
                <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
                <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
              </div>
              <label className="mt-3 block">
                <span className="label">Needs and opportunity tags</span>
                <input
                  className="input"
                  value={needInput}
                  placeholder="Complex care, referrals, family communication"
                  onChange={(event) => {
                    setNeedInput(event.target.value);
                    setForm({ ...form, needs: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) });
                  }}
                />
              </label>
              <label className="mt-3 block">
                <span className="label">Fit summary</span>
                <textarea className="textarea" value={form.fitSummary} onChange={(event) => setForm({ ...form, fitSummary: event.target.value })} />
              </label>
              <label className="mt-3 block">
                <span className="label">Notes</span>
                <textarea className="textarea" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </label>
              <label className="mt-3 block">
                <span className="label">Next action</span>
                <input className="input" value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })} />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="button-primary" disabled={Boolean(busy)} type="submit">
                  <CheckCircle2 size={17} />
                  {editingId ? 'Update lead' : 'Save lead'}
                </button>
                {editingId && (
                  <button type="button" className="button-secondary" onClick={() => { setEditingId(undefined); setForm(emptyLead); setNeedInput(''); }}>
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Human review email</h2>
                <select className="input max-w-36" value={tone} onChange={(event) => setTone(event.target.value as OutreachTone)}>
                  <option value="warm">Warm</option>
                  <option value="clinical">Clinical</option>
                  <option value="concise">Concise</option>
                </select>
              </div>
              {draft ? (
                <div className="space-y-3">
                  <label className="block">
                    <span className="label">Subject</span>
                    <input className="input" value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label">Body</span>
                    <textarea className="textarea min-h-80 font-mono text-sm" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
                  </label>
                  <button className="button-secondary" onClick={() => navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)}>
                    <Copy size={17} />
                    Copy draft
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <Mail className="mx-auto text-slate-400" size={30} />
                  <p className="mt-3 text-sm text-slate-600">Select a lead and generate a personalised draft for review before sending.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {active ? 'Supabase connected' : 'Local demo mode'}
    </span>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">{icon}{label}</div>
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

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" value={value} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
