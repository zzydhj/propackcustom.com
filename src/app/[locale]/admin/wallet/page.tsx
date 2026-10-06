import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/guards';
import { prisma } from '@/lib/prisma';
import { BalanceForm } from '@/components/admin/BalanceForm';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AdminWalletPage({ params }: { params: Promise<{ locale: string }> }) {
    return <Page params={params} />;
}

async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    await requireAdmin();
    const users = await prisma.user.findMany({ orderBy: { balance: 'desc' }, take: 200 });
    return <View rows={users.map((u) => ({ id: u.id, email: u.email, name: u.name, balance: Number(u.balance), currency: u.currency }))} total={users.length} />;
}

function View({ rows, total }: { rows: { id: string; email: string | null; name: string | null; balance: number; currency: string }[]; total: number }) {
    const t = useTranslations('Admin');
    return (
        <div>
            <h1 className="mb-2 text-2xl font-bold text-neutral-900">{t('wallet')}</h1>
            <p className="mb-6 text-sm text-neutral-500">{t('topupHint')}</p>
            {total === 0 ? (
                <EmptyState label={t('noCustomers')} />
            ) : (
                <div className="space-y-3">
                    {rows.map((u) => (
                        <div key={u.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-neutral-900">{u.name ?? u.email ?? u.id}</p>
                                    <p className="truncate text-sm text-neutral-500">{u.email ?? '—'}</p>
                                </div>
                                <p className="text-lg font-black text-neutral-900">{u.currency} {u.balance.toFixed(2)}</p>
                            </div>
                            <BalanceForm userId={u.id} currency={u.currency} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
