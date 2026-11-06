import { useEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { Activity, ArrowRight, BadgeCheck, BookOpen, Check, ChevronLeft, ChevronRight, Circle as CircleHelp, Code as Code2, Copy, KeyRound, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, Menu, Plus, RefreshCw, Search, Shield, Shield as ShieldAlert, ShieldCheck, Sparkles, X, Zap } from 'lucide-react';
import {
  getGetAnalyticsSummaryQueryKey, getListActivityQueryKey, getListLicensesQueryKey,
  useCreateLicense, useGetAdminMe, useGetAnalyticsSummary, useListActivity, useListLicenses,
  useHealthCheck, useResetLicenseDevice, useRevokeLicense, useTrackCheckpoint, useVerifyLicenseKey,
} from '@workspace/api-client-react';
import type { ActivityEvent, AnalyticsSummary, License } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { luaExample } from '@/lib/luaExample';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#397e69', colorForeground: '#252c39', colorMutedForeground: '#737b85',
    colorDanger: '#b64138', colorBackground: '#fbfaf6', colorInput: '#fffefa',
    colorInputForeground: '#252c39', colorNeutral: '#252c39', fontFamily: 'DM Sans',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbfaf6] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#252c39] font-bold', headerSubtitle: 'text-[#737b85]',
    socialButtonsBlockButtonText: 'text-[#252c39]', formFieldLabel: 'text-[#252c39]',
    footerActionLink: 'text-[#397e69]', footerActionText: 'text-[#737b85]', dividerText: 'text-[#737b85]',
    identityPreviewEditButton: 'text-[#397e69]', formFieldSuccessText: 'text-[#397e69]', alertText: 'text-[#252c39]',
    logoBox: 'mb-2', logoImage: 'max-h-10', socialButtonsBlockButton: 'border-[#dedbd2]',
    formButtonPrimary: 'bg-[#397e69] hover:bg-[#2e6c59]', formFieldInput: 'border-[#dedbd2] bg-[#fffefa]',
    footerAction: 'border-t border-[#e3dfd6]', dividerLine: 'bg-[#dedbd2]', alert: 'border-[#dedbd2]',
    otpCodeFieldInput: 'border-[#dedbd2]', formFieldRow: 'gap-1', main: 'gap-4',
  },
};

function GlyphLogo({ inverse = false }: { inverse?: boolean }) {
  return <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${inverse ? 'bg-[#a8d5bf] text-[#172b2b]' : 'bg-[#dcebe3] text-[#31785f]'}`}><KeyRound size={18} strokeWidth={2.2} /></span>;
}

function Button({ children, onClick, variant = 'primary', disabled, type = 'button', className = '', testId }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; disabled?: boolean;
  type?: 'button' | 'submit'; className?: string; testId?: string;
}) {
  const styles = {
    primary: 'bg-[#2f755e] text-white hover:bg-[#255f4d] shadow-sm',
    secondary: 'border border-border bg-card text-foreground hover:bg-muted',
    quiet: 'text-muted-foreground hover:bg-muted hover:text-foreground',
    danger: 'border border-[#e6c6c1] bg-[#fff8f6] text-[#a33c35] hover:bg-[#fcebe8]',
  };
  return <button data-testid={testId} type={type} onClick={onClick} disabled={disabled} className={`focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}>{children}</button>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="grid gap-1.5 text-[12px] font-semibold text-foreground">{label}{children}{hint && <span className="font-normal text-muted-foreground">{hint}</span>}</label>;
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`focus-ring h-10 w-full rounded-lg border border-input bg-card px-3 text-[13px] font-normal text-foreground placeholder:text-muted-foreground/70 ${props.className ?? ''}`} />;
}

function Header({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div><div className="eyebrow mb-2">License Manager / Control plane</div><h1 className="font-display text-[30px] font-bold tracking-[-.045em] text-foreground sm:text-[34px]">{title}</h1><p className="mt-1.5 text-[13px] text-muted-foreground">{description}</p></div>
    {action}
  </div>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

function InlineError({ retry, message = 'Unable to load this data right now.' }: { retry: () => void; message?: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e9c9c5] bg-[#fff8f6] px-4 py-3 text-[13px] text-[#953b34]"><span>{message}</span><button onClick={retry} className="inline-flex items-center gap-1 font-semibold" data-testid="button-retry"><RefreshCw size={14} />Retry</button></div>;
}

function StatCard({ label, value, detail, icon: Icon, tint = 'mint' }: {
  label: string; value: string; detail: string; icon: typeof KeyRound; tint?: 'mint' | 'blue' | 'amber' | 'lavender';
}) {
  const colors = { mint: 'bg-[#e5f1eb] text-[#377a62]', blue: 'bg-[#e6eef4] text-[#47708c]', amber: 'bg-[#f8efe0] text-[#ad7736]', lavender: 'bg-[#eeeaf2] text-[#77628b]' };
  return <div className="surface min-w-0 p-5 transition-transform duration-200 hover:-translate-y-0.5">
    <div className="flex items-center justify-between"><span className="eyebrow">{label}</span><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${colors[tint]}`}><Icon size={17} /></span></div>
    <div className="mt-5 font-display text-[30px] font-bold tracking-[-.05em]">{value}</div><div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
  </div>;
}

function MiniTrend({ data }: { data: AnalyticsSummary['dailyTrend'] }) {
  if (!data.length) return <div className="flex h-[190px] items-center justify-center text-[12px] text-muted-foreground">No trend data available yet.</div>;
  const max = Math.max(1, ...data.map((d) => Math.max(d.pageViews, d.validations)));
  const points = (kind: 'pageViews' | 'validations') => data.map((d, i) => `${(i / Math.max(1, data.length - 1)) * 100},${156 - (d[kind] / max) * 128}`).join(' ');
  return <div className="relative h-[190px] pt-1">
    <div className="absolute inset-x-0 top-3 bottom-7 flex flex-col justify-between">{[0, 1, 2, 3].map((v) => <div key={v} className="border-t border-dashed border-border/80" />)}</div>
    <svg viewBox="0 0 100 160" preserveAspectRatio="none" className="relative h-[160px] w-full overflow-visible">
      <polyline points={points('pageViews')} fill="none" stroke="#7f9db4" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={points('validations')} fill="none" stroke="#3f896c" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <div className="flex justify-between text-[10px] text-muted-foreground"><span>{data[0]?.date}</span><span>{data[Math.floor(data.length / 2)]?.date}</span><span>{data[data.length - 1]?.date}</span></div>
  </div>;
}

function BarChart({ data }: { data: AnalyticsSummary['hourlyUsage'] }) {
  if (!data.length) return <div className="flex h-[166px] items-center justify-center text-[12px] text-muted-foreground">No hourly usage data available.</div>;
  const max = Math.max(1, ...data.map((d) => d.validations));
  return <div className="flex h-[166px] items-end gap-1.5 border-b border-border px-1 pt-3">
    {data.map((item) => <div key={item.hour} className="group flex h-full flex-1 flex-col justify-end">
      <div title={`${item.validations} validations`} className="min-h-[2px] rounded-t-[3px] bg-[#6ba587] transition-colors group-hover:bg-[#34795c]" style={{ height: `${Math.max(2, item.validations / max * 100)}%` }} />
    </div>)}
  </div>;
}

function ActivityList({ events, compact = false }: { events: ActivityEvent[]; compact?: boolean }) {
  if (!events.length) return <div className="py-10 text-center"><span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><Activity size={18} /></span><div className="text-[13px] font-semibold">No events recorded</div><p className="mt-1 text-[12px] text-muted-foreground">Client validations and key changes will appear here.</p></div>;
  return <div className="divide-y divide-border/75">
    {events.map((event) => <div key={event.id} data-testid={`activity-event-${event.id}`} className={`flex items-center gap-3 ${compact ? 'py-3' : 'py-4'}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${event.outcome.toLowerCase().includes('success') || event.outcome.toLowerCase() === 'active' ? 'bg-[#e5f1eb] text-[#377a62]' : event.eventType === 'security' ? 'bg-[#faeae7] text-[#ac453b]' : 'bg-[#eaf0f2] text-[#587684]'}`}>
        {event.eventType === 'security' ? <ShieldAlert size={16} /> : event.eventType === 'activation' ? <Zap size={16} /> : <Activity size={16} />}
      </span>
      <div className="min-w-0 flex-1"><div className="truncate text-[12px] font-semibold capitalize text-foreground">{event.eventType.replace('_', ' ')} <span className="font-normal text-muted-foreground">· {event.outcome}</span></div><div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{event.keyPreview ?? 'No key'}{event.environment ? `  /  ${event.environment}` : ''}</div></div>
      <time className="shrink-0 text-[10px] text-muted-foreground">{formatRelative(event.createdAt)}</time>
    </div>)}
  </div>;
}

function formatRelative(date: string) {
  const elapsed = Math.max(0, Date.now() - new Date(date).getTime());
  if (!Number.isFinite(elapsed)) return new Date(date).toLocaleDateString();
  if (elapsed < 60_000) return 'just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function DashboardPage() {
  const analytics = useGetAnalyticsSummary();
  const activity = useListActivity({ limit: 6 });
  const summary = analytics.data;
  return <div className="page-enter">
    <Header title="Overview" description="A live view of your license network and client traffic." action={<div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-[#4b9b75]" />Live data</div>} />
    {analytics.isError && <div className="mb-5"><InlineError retry={() => analytics.refetch()} /></div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {analytics.isLoading ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[142px] rounded-[14px]" />) : summary ? <>
        <StatCard label="Total keys" value={summary.totalTokens.toLocaleString()} detail="All issued licenses" icon={KeyRound} />
        <StatCard label="Active keys" value={summary.activeTokens.toLocaleString()} detail="Currently authorized" icon={ShieldCheck} tint="mint" />
        <StatCard label="Page views" value={summary.totalViews.toLocaleString()} detail="Checkpoint traffic" icon={Activity} tint="blue" />
        <StatCard label="Validations" value={summary.totalValidations.toLocaleString()} detail={`${summary.conversionRate.toFixed(1)}% view-to-validation`} icon={BadgeCheck} tint="amber" />
      </> : null}
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
      <section className="surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow">Traffic intelligence</div><h2 className="mt-1 font-display text-[18px] font-bold tracking-tight">Views & validations</h2></div><div className="flex items-center gap-4 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#7f9db4]" />Views</span><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#3f896c]" />Validations</span></div></div>
        {analytics.isLoading ? <Skeleton className="mt-6 h-[190px]" /> : summary ? <div className="mt-5"><MiniTrend data={summary.dailyTrend} /></div> : null}
      </section>
      <section className="surface p-5 sm:p-6">
        <div className="eyebrow">Usage rhythm</div><h2 className="mt-1 font-display text-[18px] font-bold tracking-tight">Validations by hour</h2>
        {analytics.isLoading ? <Skeleton className="mt-5 h-[166px]" /> : summary ? <><BarChart data={summary.hourlyUsage} /><div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div></> : null}
      </section>
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.45fr]">
      <section className="surface p-5 sm:p-6">
        <div className="eyebrow">Client mix</div><h2 className="mt-1 font-display text-[18px] font-bold tracking-tight">Environment breakdown</h2>
        {analytics.isLoading ? <div className="mt-5 space-y-4">{[1,2,3].map((x) => <Skeleton key={x} className="h-7" />)}</div> : summary && summary.environmentBreakdown.length ? <div className="mt-5 space-y-4">{summary.environmentBreakdown.map((entry, index) => {
          const total = summary.environmentBreakdown.reduce((acc, row) => acc + row.validations, 0);
          const palette = ['#3f896c', '#7895aa', '#c3934d', '#927ba4'];
          return <div key={entry.environment}><div className="mb-1.5 flex justify-between text-[12px]"><span className="capitalize">{entry.environment}</span><span className="mono text-muted-foreground">{entry.validations.toLocaleString()}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${total ? entry.validations / total * 100 : 0}%`, backgroundColor: palette[index % palette.length] }} /></div></div>;
        })}</div> : <p className="mt-6 text-[12px] text-muted-foreground">No environment data has been recorded.</p>}
      </section>
      <section className="surface p-5 sm:p-6">
        <div className="mb-1 flex items-center justify-between"><div><div className="eyebrow">Latest signals</div><h2 className="mt-1 font-display text-[18px] font-bold tracking-tight">Recent activity</h2></div><Link href="/activity" className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">All activity <ArrowRight size={13} /></Link></div>
        {activity.isLoading ? <div className="mt-4 space-y-2">{[1,2,3].map((x) => <Skeleton key={x} className="h-14" />)}</div> : activity.isError ? <InlineError retry={() => activity.refetch()} /> : <ActivityList events={activity.data?.items ?? []} compact />}
      </section>
    </div>
  </div>;
}

function LicensePage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const params = useMemo(() => ({ search: debouncedSearch || undefined, status: (status || undefined) as 'active' | 'expired' | 'revoked' | undefined, page, pageSize: 10 }), [debouncedSearch, status, page]);
  const query = useListLicenses(params);
  const create = useCreateLicense();
  const revoke = useRevokeLicense();
  const reset = useResetLicenseDevice();
  const qc = useQueryClient();
  useEffect(() => { const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getListLicensesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetAnalyticsSummaryQueryKey() });
    void qc.invalidateQueries({ queryKey: getListActivityQueryKey() });
  };
  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({ data: { hours: Number(data.get('hours')), note: String(data.get('note') ?? '').trim() || undefined } }, {
      onSuccess: (license) => { setCreatedKey(license.key); setCreateOpen(false); refresh(); },
    });
  };
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 10)));
  const doRevoke = (license: License) => {
    if (!window.confirm(`Revoke ${license.keyPreview}? This takes effect immediately.`)) return;
    revoke.mutate({ id: license.id }, { onSuccess: refresh });
  };
  const doReset = (license: License) => {
    if (!window.confirm(`Clear the device binding for ${license.keyPreview}?`)) return;
    reset.mutate({ id: license.id }, { onSuccess: refresh });
  };
  return <div className="page-enter">
    <Header title="Licenses" description="Issue, inspect, and manage authorized product keys." action={<Button onClick={() => setCreateOpen(true)} testId="button-create-license"><Plus size={16} />Create license</Button>} />
    <div className="surface overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="relative w-full sm:max-w-[340px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search licenses" data-testid="input-search-licenses" placeholder="Search key preview or note…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        <select aria-label="Filter status" data-testid="select-license-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="focus-ring h-10 rounded-lg border border-input bg-card px-3 text-[12px] text-foreground"><option value="">All statuses</option><option value="active">Active</option><option value="expired">Expired</option><option value="revoked">Revoked</option></select>
      </div>
      {query.isError && <div className="p-4"><InlineError retry={() => query.refetch()} /></div>}
      {(revoke.isError || reset.isError) && <div className="mx-4 mt-4 rounded-lg border border-[#e9c9c5] bg-[#fff8f6] px-3 py-2 text-[12px] text-[#953b34]">The requested license change was not completed. Refresh and retry.</div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left">
          <thead><tr className="bg-muted/45 text-[10px] uppercase tracking-[.1em] text-muted-foreground"><th className="px-5 py-3 font-semibold">Key & note</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Created</th><th className="px-4 py-3 font-semibold">Expires</th><th className="px-4 py-3 font-semibold">Validations</th><th className="px-4 py-3 font-semibold">Device</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-border/75">
            {query.isLoading ? Array.from({ length: 5 }, (_, i) => <tr key={i}><td colSpan={7} className="px-5 py-4"><Skeleton className="h-8" /></td></tr>) : (query.data?.items ?? []).map((license) => <tr key={license.id} data-testid={`row-license-${license.id}`} className="transition-colors hover:bg-muted/30">
              <td className="px-5 py-4"><div className="font-mono text-[12px] font-medium">{license.keyPreview}</div><div className="mt-1 max-w-[220px] truncate text-[11px] text-muted-foreground">{license.note || 'No note'}</div></td>
              <td className="px-4 py-4"><StatusBadge status={license.status} /></td>
              <td className="px-4 py-4 text-[11px] text-muted-foreground">{new Date(license.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-4 text-[11px] text-muted-foreground">{new Date(license.expiresAt).toLocaleDateString()}</td>
              <td className="px-4 py-4 font-mono text-[12px]">{license.totalValidations.toLocaleString()}</td>
              <td className="px-4 py-4 text-[11px]">{license.deviceBound ? <span className="text-[#34795c]">Bound</span> : <span className="text-muted-foreground">Unbound</span>}</td>
              <td className="px-4 py-4"><div className="flex items-center justify-end gap-1">
                <button aria-label={`Reset device binding for ${license.keyPreview}`} data-testid={`button-reset-${license.id}`} disabled={!license.deviceBound || reset.isPending} onClick={() => doReset(license)} className="focus-ring rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-35"><RefreshCw size={14} /></button>
                <button aria-label={`Revoke ${license.keyPreview}`} data-testid={`button-revoke-${license.id}`} disabled={license.status === 'revoked' || revoke.isPending} onClick={() => doRevoke(license)} className="focus-ring rounded-md p-2 text-muted-foreground hover:bg-[#f9e8e5] hover:text-[#a33c35] disabled:opacity-35"><ShieldAlert size={14} /></button>
              </div></td>
            </tr>)}
            {!query.isLoading && !query.isError && !query.data?.items.length && <tr><td colSpan={7} className="px-5 py-14 text-center"><span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#e5f1eb] text-[#377a62]"><KeyRound size={18} /></span><div className="text-[13px] font-semibold">No licenses found</div><p className="mt-1 text-[12px] text-muted-foreground">{search || status ? 'Try adjusting your search or status filter.' : 'Create your first license to authorize a client.'}</p></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5 text-[11px] text-muted-foreground">
        <span>{query.data ? `${query.data.total} ${query.data.total === 1 ? 'license' : 'licenses'} · page ${page} of ${totalPages}` : '—'}</span>
        <div className="flex items-center gap-1"><button data-testid="button-previous-page" aria-label="Previous page" disabled={page <= 1 || query.isLoading} onClick={() => setPage((p) => Math.max(1, p - 1))} className="focus-ring rounded-md p-2 hover:bg-muted disabled:opacity-30"><ChevronLeft size={15} /></button><button data-testid="button-next-page" aria-label="Next page" disabled={page >= totalPages || query.isLoading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="focus-ring rounded-md p-2 hover:bg-muted disabled:opacity-30"><ChevronRight size={15} /></button></div>
      </div>
    </div>
    {(createOpen || createdKey) && <Modal onClose={() => { setCreateOpen(false); setCreatedKey(null); }}>
      {createdKey ? <div className="p-6 sm:p-7"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e5f1eb] text-[#377a62]"><BadgeCheck size={23} /></div><div className="eyebrow">Key created</div><h2 className="mt-1 font-display text-[23px] font-bold tracking-tight">Copy it now</h2><p className="mt-2 text-[13px] leading-5 text-muted-foreground">This is the only time the full key will be shown. Store it somewhere secure before closing.</p><div className="mt-5 flex gap-2"><code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-muted/60 p-3 font-mono text-[12px]" data-testid="text-created-key">{createdKey}</code><Button variant="secondary" onClick={() => void navigator.clipboard.writeText(createdKey)} testId="button-copy-key"><Copy size={14} />Copy</Button></div><Button onClick={() => setCreatedKey(null)} className="mt-5 w-full">Done</Button></div>
        : <form onSubmit={submitCreate} className="p-6 sm:p-7"><div className="mb-4 flex items-center justify-between"><div><div className="eyebrow">New credential</div><h2 className="mt-1 font-display text-[23px] font-bold tracking-tight">Create license</h2></div><button type="button" onClick={() => setCreateOpen(false)} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Close dialog"><X size={17} /></button></div><div className="space-y-4"><Field label="Validity period" hint="Between 1 and 87,600 hours."><Input name="hours" data-testid="input-license-hours" type="number" min="1" max="87600" defaultValue="720" required /></Field><Field label="Internal note" hint="Optional. Up to 200 characters."><Input name="note" data-testid="input-license-note" maxLength={200} placeholder="Customer, plan, or release context" /></Field></div>{create.isError && <p className="mt-3 text-[12px] text-destructive">License could not be created. Please retry.</p>}<div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending} testId="button-submit-license">{create.isPending && <LoaderCircle size={15} className="animate-spin" />}Issue key</Button></div></form>}
    </Modal>}
  </div>;
}

function StatusBadge({ status }: { status: string }) {
  const style = status === 'active' ? 'bg-[#e6f2eb] text-[#34795c]' : status === 'revoked' ? 'bg-[#f8e9e6] text-[#a94339]' : 'bg-[#f6efdf] text-[#967139]';
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${style}`}><i className="h-1.5 w-1.5 rounded-full bg-current" />{status}</span>;
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-[60] flex items-center justify-center bg-[#17242c]/45 p-4 backdrop-blur-[3px]"><div role="dialog" aria-modal="true" className="surface w-full max-w-[460px] animate-in fade-in zoom-in-95 duration-150">{children}</div></div>;
}

function ActivityPage() {
  const events = useListActivity({ limit: 100 });
  return <div className="page-enter"><Header title="Activity" description="A chronological record of validations, activations, and key changes." action={<div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground"><Activity size={14} />Recent events</div>} />
    <section className="surface p-5 sm:p-6"><div className="mb-3 flex items-center justify-between"><div><div className="eyebrow">Event stream</div><h2 className="mt-1 font-display text-[18px] font-bold">Latest activity</h2></div>{events.data && <span className="font-mono text-[11px] text-muted-foreground">{events.data.total} total</span>}</div>
      {events.isLoading ? <div className="space-y-2 pt-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-[58px]" />)}</div> : events.isError ? <InlineError retry={() => events.refetch()} /> : <ActivityList events={events.data?.items ?? []} />}
    </section>
  </div>;
}

function ClientSetupPage() {
  const verify = useVerifyLicenseKey();
  const checkpoint = useTrackCheckpoint();
  const qc = useQueryClient();
  const refreshSignals = () => {
    void qc.invalidateQueries({ queryKey: getListLicensesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetAnalyticsSummaryQueryKey() });
    void qc.invalidateQueries({ queryKey: getListActivityQueryKey() });
  };
  const [result, setResult] = useState<import('@workspace/api-client-react').VerificationResult | null>(null);
  const [checkpointResult, setCheckpointResult] = useState<import('@workspace/api-client-react').CheckpointResult | null>(null);
  const submitVerify = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { key: String(form.get('key')), installId: String(form.get('installId')), clientVersion: String(form.get('clientVersion') ?? '') || undefined, environment: String(form.get('environment') ?? '') || undefined };
    setResult(null);
    verify.mutate({ data: payload }, { onSuccess: (data) => { setResult(data); refreshSignals(); } });
  };
  const submitCheckpoint = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setCheckpointResult(null);
    checkpoint.mutate({ data: { flowId: String(form.get('flowId') ?? '') || undefined, clientVersion: String(form.get('clientVersion') ?? '') || undefined, environment: String(form.get('environment') ?? '') || undefined } }, { onSuccess: (data) => { setCheckpointResult(data); refreshSignals(); } });
  };
  return <div className="page-enter">
    <Header title="Client setup" description="A secure verification pattern for authorized Lua clients." action={<span className="inline-flex items-center gap-2 rounded-full border border-[#c9ddcf] bg-[#edf5ef] px-3 py-1.5 text-[10px] font-bold text-[#377a62]"><LockKeyhole size={13} />Server-authoritative</span>} />
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <div className="space-y-5">
        <section className="surface p-5 sm:p-6"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e5f1eb] text-[#377a62]"><ShieldCheck size={19} /></span><div><div className="eyebrow">Recommended flow</div><h2 className="mt-1 font-display text-[19px] font-bold">Verify safely. Trust the server.</h2><p className="mt-2 max-w-[620px] text-[13px] leading-6 text-muted-foreground">Treat the client as untrusted. Keep private secrets and entitlement decisions on your server; call the verification endpoint from an authorized integration using the license key and a stable installation identifier.</p></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { n: '01', title: 'Collect', body: 'Read the supplied key and a persistent install ID.' },
              { n: '02', title: 'Verify', body: 'Send both to your trusted server over HTTPS.' },
              { n: '03', title: 'Enforce', body: 'Only grant access when success is true.' },
            ].map((step) => <div key={step.n} className="rounded-xl border border-border bg-muted/35 p-4"><span className="font-mono text-[10px] text-primary">{step.n} / STEP</span><div className="mt-2 text-[13px] font-bold">{step.title}</div><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{step.body}</p></div>)}
          </div>
        </section>
        <section className="surface overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4"><Code2 size={16} className="text-primary" /><div><div className="eyebrow">Implementation pattern</div><h2 className="mt-0.5 text-[14px] font-bold">Lua client → trusted service</h2></div></div>
          <div className="overflow-x-auto bg-[#202b35] p-5 text-[11px] leading-[1.9] text-[#dce8e5] sm:p-6"><pre className="whitespace-pre font-mono"><code>{luaExample}</code></pre></div>
          <div className="flex gap-2 border-t border-border bg-muted/30 px-5 py-3 text-[11px] leading-5 text-muted-foreground"><Shield size={14} className="mt-0.5 shrink-0 text-primary" />This example uses LuaSocket, LuaSec, and dkjson. Its random install ID is not a hardware fingerprint and can be copied; client-side checks can be modified.</div>
        </section>
      </div>
      <div className="space-y-5">
        <section className="surface p-5 sm:p-6"><div className="mb-4 flex items-start justify-between"><div><div className="eyebrow">Live endpoint</div><h2 className="mt-1 font-display text-[18px] font-bold">Verify a license</h2><p className="mt-1 text-[12px] text-muted-foreground">Submit a real authorized verification request.</p></div><span className="rounded-md bg-muted px-2 py-1 font-mono text-[10px]">POST /api/key/verify</span></div>
          <form onSubmit={submitVerify} className="space-y-3.5"><Field label="License key"><Input name="key" data-testid="input-verify-key" minLength={8} maxLength={256} required placeholder="Paste a full license key" /></Field><Field label="Install ID" hint="Generated and saved by your authorized client; at least 8 characters."><Input name="installId" data-testid="input-install-id" minLength={8} maxLength={128} required placeholder="e.g. 2f4a... install ID" /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Client version"><Input name="clientVersion" data-testid="input-client-version" maxLength={64} placeholder="1.0.0" /></Field><Field label="Environment"><Input name="environment" data-testid="input-verify-environment" maxLength={64} placeholder="production" /></Field></div>
            <Button type="submit" disabled={verify.isPending} className="w-full" testId="button-verify-license">{verify.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <ShieldCheck size={15} />}Run verification</Button>
          </form>
          {verify.isError && <p className="mt-3 rounded-lg border border-[#e9c9c5] bg-[#fff8f6] px-3 py-2 text-[12px] text-[#953b34]">The verification request failed. Check the values and submit again.</p>}
          {result && <div data-testid="verification-result" className={`mt-4 rounded-xl border p-4 ${result.success ? 'border-[#c8ddce] bg-[#edf5ef]' : 'border-[#e9c9c5] bg-[#fff8f6]'}`}><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[13px] font-bold">{result.success ? <Check size={16} className="text-[#34795c]" /> : <ShieldAlert size={16} className="text-[#a33c35]" />}{result.success ? 'Authorized' : 'Not authorized'}</div><span className="font-mono text-[10px] uppercase">{result.code}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div>Activated <b className="ml-1">{result.activated ? 'Yes' : 'No'}</b></div><div>Checks <b className="ml-1">{result.totalValidations.toLocaleString()}</b></div><div>Time left <b className="ml-1">{formatDuration(result.remainingSeconds)}</b></div><div>Expires <b className="ml-1">{result.expiresAt ? new Date(result.expiresAt).toLocaleDateString() : '—'}</b></div></div></div>}
        </section>
        <section className="surface p-5 sm:p-6"><div className="mb-4 flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e6eef4] text-[#47708c]"><Activity size={17} /></span><div><div className="eyebrow">Optional telemetry</div><h2 className="mt-1 font-display text-[17px] font-bold">Track a checkpoint</h2><p className="mt-1 text-[12px] text-muted-foreground">Test the external page-view checkpoint.</p></div></div>
          <form onSubmit={submitCheckpoint} className="space-y-3"><Field label="Flow ID"><Input name="flowId" data-testid="input-checkpoint-flow" maxLength={120} placeholder="setup-guide" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Client version"><Input name="clientVersion" data-testid="input-checkpoint-version" maxLength={64} placeholder="1.0.0" /></Field><Field label="Environment"><Input name="environment" data-testid="input-checkpoint-environment" maxLength={64} placeholder="production" /></Field></div><Button type="submit" variant="secondary" disabled={checkpoint.isPending} className="w-full" testId="button-track-checkpoint">{checkpoint.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowRight size={15} />}Send checkpoint</Button></form>
          {checkpoint.isError && <p className="mt-3 text-[12px] text-destructive">Checkpoint could not be recorded. Retry the request.</p>}
          {checkpointResult && <p data-testid="checkpoint-result" className="mt-3 flex items-center gap-2 rounded-lg bg-[#edf5ef] px-3 py-2 text-[12px] font-semibold text-[#34795c]"><Check size={15} />{checkpointResult.tracked ? 'Checkpoint tracked.' : 'Checkpoint was not tracked.'}</p>}
        </section>
        <div className="flex items-start gap-3 rounded-xl border border-[#e2d9c7] bg-[#f7f1e6] p-4 text-[11px] leading-5 text-[#756345]"><CircleHelp size={16} className="mt-0.5 shrink-0" /><p><b className="text-[#5c4a2d]">Keep policy on your server.</b> Verification responses are the source of truth; never accept local key parsing as authorization.</p></div>
      </div>
    </div>
  </div>;
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return 'Expired';
  const days = Math.floor(seconds / 86400), hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days}d ${hours}h` : `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function HomePage() {
  return <div className="grain min-h-[100dvh] overflow-hidden bg-[#f6f4ed] text-[#232b38]">
    <header className="relative z-10 mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 sm:px-8"><Link href="/" className="flex items-center gap-3"><GlyphLogo /><span className="font-display text-[15px] font-extrabold tracking-[-.04em]">KEY / CONTROL</span></Link><nav className="hidden items-center gap-7 text-[12px] font-semibold text-[#69717a] sm:flex"><a href="#capabilities" className="hover:text-[#2f755e]">Capabilities</a><a href="#workflow" className="hover:text-[#2f755e]">Workflow</a><Link href="/client-setup" className="hover:text-[#2f755e]">Client setup</Link></nav><div className="flex items-center gap-2"><Link href="/sign-in" className="rounded-lg px-3 py-2 text-[12px] font-semibold hover:bg-[#eae9e1]">Sign in</Link><Link href="/sign-up" className="rounded-lg bg-[#2f755e] px-4 py-2.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#255f4d]">Create account</Link></div></header>
    <main>
      <section className="relative mx-auto grid max-w-[1240px] items-center gap-12 px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-20 lg:grid-cols-[1.08fr_.92fr]">
        <div className="relative z-10 page-enter"><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#d9e4dc] bg-[#eef4ed] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#37745c]"><ShieldCheck size={13} />Publisher control center</div>
          <h1 className="font-display max-w-[680px] text-[52px] font-extrabold leading-[.99] tracking-[-.07em] sm:text-[72px]">Keys under<br /><span className="text-[#43846a]">your control.</span></h1>
          <p className="mt-6 max-w-[480px] text-[15px] leading-7 text-[#68717b]">Issue software licenses with confidence. Keep client verification secure, trace every check, and understand usage without losing sight of the details.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/sign-up" className="group inline-flex items-center gap-2 rounded-xl bg-[#2f755e] px-5 py-3.5 text-[13px] font-bold text-white shadow-md shadow-[#2f755e]/10 transition-all hover:-translate-y-0.5 hover:bg-[#255f4d]">Open your control center <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></Link><Link href="/client-setup" className="inline-flex items-center gap-2 rounded-xl border border-[#d9d7cd] bg-[#faf9f4] px-5 py-3.5 text-[13px] font-bold text-[#343e49] hover:bg-white"><BookOpen size={15} />Read integration guide</Link></div>
          <div className="mt-9 flex items-center gap-3 text-[11px] text-[#78817f]"><span className="flex -space-x-2"><span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#f6f4ed] bg-[#dcebe3] text-[#32745a]"><LockKeyhole size={12} /></span><span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#f6f4ed] bg-[#e9e5d8] text-[#8a7147]"><Activity size={12} /></span></span>Server-verified · auditable · ready for production</div>
        </div>
        <div className="relative mx-auto w-full max-w-[510px] page-enter [animation-delay:120ms]">
          <div className="absolute -right-7 -top-10 h-44 w-44 rounded-full bg-[#dcebe3] blur-3xl" /><div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-[#efe6d4] blur-3xl" />
          <div className="relative rounded-[24px] border border-[#d9d8cf] bg-[#fbfaf6] p-4 shadow-[0_28px_80px_-38px_rgba(40,53,54,.34)] sm:p-5">
            <div className="flex items-center justify-between border-b border-[#e7e3d9] pb-4"><div className="flex items-center gap-2.5"><GlyphLogo /><div><div className="text-[12px] font-bold">License Manager</div><div className="text-[10px] text-[#888f91]">Publisher control plane</div></div></div><span className="rounded-full border border-[#dfded5] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[.1em] text-[#66736f]">Lifecycle view</span></div>
            <div className="relative my-5 overflow-hidden rounded-2xl border border-[#e8e4db] bg-[#f7f6f0] px-4 py-6 sm:px-6">
              <div className="absolute left-[14%] right-[14%] top-1/2 h-px border-t border-dashed border-[#b7c9be]" />
              <div className="relative grid grid-cols-3 gap-2">
                {[{ icon: KeyRound, label: 'ISSUE', detail: 'Time-bound key' }, { icon: ShieldCheck, label: 'VERIFY', detail: 'Trusted service' }, { icon: Activity, label: 'OBSERVE', detail: 'Usage signals' }].map(({ icon: Icon, label, detail }, i) => <div key={label} className="flex flex-col items-center text-center"><span className={`z-[1] flex h-12 w-12 items-center justify-center rounded-2xl border border-[#d9e3db] ${i === 1 ? 'bg-[#dcebe3] text-[#31785f]' : 'bg-[#fbfaf6] text-[#6e8c7d]'}`}><Icon size={19} /></span><span className="mt-3 font-mono text-[9px] font-medium tracking-[.12em] text-[#438067]">{label}</span><span className="mt-1 text-[10px] text-[#7b8485]">{detail}</span></div>)}
              </div>
            </div>
            <div className="rounded-xl bg-[#25333b] px-4 py-4 text-white"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#a8d5bf] text-[#25333b]"><LockKeyhole size={15} /></span><div><div className="text-[11px] font-semibold">Your server makes the decision</div><div className="mt-1 text-[10px] leading-4 text-[#bdc9c4]">Keys are credentials. Entitlements stay under your control.</div></div></div></div>
          </div>
          <div className="absolute -left-5 top-[42%] hidden items-center gap-2 rounded-xl border border-[#dfded5] bg-[#fbfaf6] px-3 py-2.5 shadow-lg sm:flex"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e7f1e9] text-[#427d61]"><LockKeyhole size={14} /></span><div><div className="text-[9px] font-bold">Private by design</div><div className="text-[9px] text-[#858d8d]">No client-side secrets</div></div></div>
        </div>
      </section>
      <section id="capabilities" className="border-y border-[#e5e1d7] bg-[#efeee7]"><div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 sm:py-20"><div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]"><div><div className="eyebrow">Built for careful operators</div><h2 className="mt-3 max-w-[370px] font-display text-[34px] font-extrabold leading-[1.05] tracking-[-.06em] sm:text-[44px]">Control the details. See the whole system.</h2></div><div className="grid gap-3 sm:grid-cols-2">
        {[
          { icon: KeyRound, title: 'Issue with context', body: 'Create time-bound credentials and keep internal notes attached to each key.' },
          { icon: ShieldCheck, title: 'Validate with authority', body: 'Keep the verdict on your trusted service—not in a client that can be modified.' },
          { icon: Activity, title: 'Trace every decision', body: 'Review activation, validation, and security events in one clear event stream.' },
          { icon: Sparkles, title: 'Find usage patterns', body: 'Compare validation trends and environment mix with live reporting.' },
        ].map(({ icon: Icon, title, body }) => <article key={title} className="rounded-2xl border border-[#dddad0] bg-[#f8f7f1] p-5"><Icon size={18} className="text-[#468067]" /><h3 className="mt-4 text-[14px] font-bold">{title}</h3><p className="mt-2 text-[12px] leading-5 text-[#727b80]">{body}</p></article>)}
      </div></div></div></section>
      <section id="workflow" className="mx-auto grid max-w-[1240px] gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1fr_.8fr]"><div><div className="eyebrow">A safer licensing loop</div><h2 className="mt-3 max-w-[490px] font-display text-[36px] font-extrabold leading-[1.02] tracking-[-.065em] sm:text-[48px]">The key is only a credential. Your server makes the call.</h2><p className="mt-5 max-w-[490px] text-[13px] leading-6 text-[#737b80]">License Manager helps you operate the lifecycle while keeping the sensitive decision where it belongs: in an environment you control.</p><Link href="/client-setup" className="mt-6 inline-flex items-center gap-2 text-[12px] font-bold text-[#34795c] hover:underline">Explore the setup guide <ArrowRight size={14} /></Link></div><div className="space-y-3">
          {[
            { n: '01', title: 'Create & distribute', text: 'Issue a key with its own lifetime and operator context.' },
            { n: '02', title: 'Verify server-side', text: 'Your authorized service checks key and installation identity.' },
            { n: '03', title: 'Observe & respond', text: 'Use the event feed and usage overview to spot changes.' },
          ].map((item) => <div key={item.n} className="flex gap-4 rounded-xl border border-[#e3dfd5] bg-[#faf9f4] p-4"><span className="font-mono text-[11px] text-[#4a856b]">{item.n}</span><div><div className="text-[13px] font-bold">{item.title}</div><p className="mt-1 text-[11px] leading-5 text-[#798185]">{item.text}</p></div></div>)}
        </div></section>
      <footer className="border-t border-[#e3dfd5] bg-[#efeee7]"><div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-4 px-5 py-7 text-[11px] text-[#798185] sm:flex-row sm:items-center sm:px-8"><div className="flex items-center gap-2 text-[#35414a]"><GlyphLogo /><span className="font-bold">KEY / CONTROL</span></div><span>Precisely manage access to the software you publish.</span><Link href="/sign-in" className="font-semibold text-[#34795c] hover:underline">Publisher sign in <ArrowRight size={12} className="inline" /></Link></div></footer>
    </main>
  </div>;
}

function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><HomePage /></Show></>;
}

function AuthScreen({ type }: { type: 'sign-in' | 'sign-up' }) {
  return <div className="grain flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10"><div className="absolute left-6 top-6"><Link href="/" className="flex items-center gap-2"><GlyphLogo /><span className="font-display text-[13px] font-extrabold tracking-[-.04em]">KEY / CONTROL</span></Link></div>{type === 'sign-in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}</div>;
}

function SignInRoute() { return <AuthScreen type="sign-in" />; }
function SignUpRoute() { return <AuthScreen type="sign-up" />; }

function AuthGate({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}

function AdminAccessRequired({ userId }: { userId: string }) {
  return <div className="surface mx-auto mt-14 max-w-lg p-8 text-center">
    <ShieldAlert size={24} className="mx-auto text-[#a33c35]" />
    <h1 className="mt-4 font-display text-xl font-bold">Administrator access required</h1>
    <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
      Add this Clerk user ID to the <code>LICENSE_ADMIN_USER_IDS</code> environment variable to authorize this account.
    </p>
    <code className="mt-4 block break-all rounded-lg bg-muted px-3 py-2 text-left text-xs">{userId}</code>
  </div>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const admin = useGetAdminMe();
  const health = useHealthCheck();
  const healthStatus = health.data?.status?.toLowerCase();
  const apiHealthy = healthStatus === 'ok' || healthStatus === 'healthy' || healthStatus === 'up';
  const nav = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/licenses', label: 'Licenses', icon: KeyRound },
    { href: '/activity', label: 'Activity', icon: Activity },
    { href: '/client-setup', label: 'Client setup', icon: Code2 },
  ];
  return <div className="min-h-[100dvh] bg-background">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[76px] items-center gap-3 border-b border-sidebar-border px-5"><GlyphLogo inverse /><div><div className="font-display text-[14px] font-extrabold tracking-[-.04em]">KEY / CONTROL</div><div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[.13em] text-[#9ba8aa]">License operations</div></div><button className="ml-auto rounded-md p-1 text-sidebar-foreground lg:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={17} /></button></div>
      <div className="px-4 pt-7"><div className="eyebrow !text-[#89999d]">Workspace</div><nav className="mt-2 space-y-1">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileNav(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-semibold transition-colors ${location === href ? 'bg-sidebar-accent text-white' : 'text-[#b4c0c2] hover:bg-sidebar-accent/70 hover:text-white'}`}><Icon size={16} strokeWidth={1.8} />{label}{location === href && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#9ed0b5]" />}</Link>)}</nav></div>
      <div className="mt-auto p-4"><div className="mb-3 rounded-xl border border-sidebar-border bg-[#ffffff08] p-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#d9e9df] text-[10px] font-bold text-[#326c55]">{(user?.firstName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0] || 'A').toUpperCase()}</span><div className="min-w-0"><div className="truncate text-[11px] font-semibold">{user?.fullName || 'Publisher account'}</div><div className="truncate text-[9px] text-[#9ba8aa]">{admin.data?.isAdmin ? 'Administrator' : 'Checking access…'}</div></div></div></div><button onClick={() => void signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold text-[#b4c0c2] hover:bg-sidebar-accent hover:text-white"><LogOut size={14} />Sign out</button></div>
    </aside>
    {mobileNav && <button className="fixed inset-0 z-30 bg-[#162027]/40 lg:hidden" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <div className="lg:pl-[248px]">
      <header className="sticky top-0 z-20 flex h-[62px] items-center justify-between border-b border-border/80 bg-background/90 px-4 backdrop-blur-md sm:px-7">
        <button className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={18} /></button>
        <div className="hidden items-center gap-2 text-[11px] text-muted-foreground lg:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#4a9a72]" />Publisher workspace <span className="text-border">/</span> <span className="text-foreground">{nav.find((n) => n.href === location)?.label ?? 'License Manager'}</span></div>
        <div className="ml-auto flex items-center gap-3"><span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:inline-flex"><span className={`h-1.5 w-1.5 rounded-full ${apiHealthy ? 'bg-[#4a9a72]' : health.isError ? 'bg-[#bb5147]' : 'bg-[#c3934d]'}`} />{apiHealthy ? 'API operational' : health.isError ? 'API unavailable' : healthStatus ? `API ${health.data?.status}` : 'Checking API'}</span><Link href="/client-setup" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground"><CircleHelp size={13} />Implementation guide</Link></div>
      </header>
      <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-7 sm:py-8 xl:px-10">{admin.isLoading ? <div className="space-y-4"><Skeleton className="h-9 w-48" /><Skeleton className="h-40" /><Skeleton className="h-72" /></div> : admin.isError ? <InlineError retry={() => admin.refetch()} message="Administrator access could not be checked." /> : admin.data?.isAdmin ? children : <AdminAccessRequired userId={user?.id ?? "unavailable"} />}</main>
      <footer className="border-t border-border/70 px-7 py-4 text-[10px] text-muted-foreground"><div className="mx-auto flex max-w-[1480px] items-center justify-between"><span>License Manager</span><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#4a9a72]" />Secure session</span></div></footer>
    </div>
  </div>;
}

function ProtectedPage({ page }: { page: 'dashboard' | 'licenses' | 'activity' }) {
  const content = page === 'dashboard' ? <DashboardPage /> : page === 'licenses' ? <LicensePage /> : <ActivityPage />;
  return <AuthGate><Shell>{content}</Shell></AuthGate>;
}

function ClientSetupRoute() {
  return <>
    <Show when="signed-in"><Shell><ClientSetupPage /></Shell></Show>
    <Show when="signed-out">
      <div className="min-h-[100dvh] bg-background">
        <header className="flex h-[66px] items-center justify-between border-b border-border px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5"><GlyphLogo /><span className="font-display text-[13px] font-extrabold tracking-[-.04em]">KEY / CONTROL</span></Link>
          <div className="flex items-center gap-2"><Link href="/" className="rounded-lg px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted">Home</Link><Link href="/sign-in" className="rounded-lg bg-primary px-3.5 py-2 text-[11px] font-semibold text-primary-foreground">Publisher sign in</Link></div>
        </header>
        <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-7 sm:py-8 xl:px-10"><ClientSetupPage /></main>
      </div>
    </Show>
  </>;
}

function QueryCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const prevUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (prevUser.current !== undefined && prevUser.current !== id) client.clear();
      prevUser.current = id;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={HomeRedirect} />
    <Route path="/sign-in/*?" component={SignInRoute} />
    <Route path="/sign-up/*?" component={SignUpRoute} />
    <Route path="/dashboard"><ProtectedPage page="dashboard" /></Route>
    <Route path="/licenses"><ProtectedPage page="licenses" /></Route>
    <Route path="/activity"><ProtectedPage page="activity" /></Route>
    <Route path="/client-setup" component={ClientSetupRoute} />
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to manage your licenses' } }, signUp: { start: { title: 'Create your workspace', subtitle: 'Start managing software access' } } }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><QueryCacheInvalidator /><Router /></QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ClerkRoutes /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;


export default App