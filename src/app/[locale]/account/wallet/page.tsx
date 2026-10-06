import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/guards';
import { prisma } from '@/lib/prisma';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AccountWalletPage({ params }: { params: Promise<{ locale: string }> }) {
    return <Wallet params={params} />;
}

async function Wallet({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const session = await requireUser();
    const userId = session.user.id;
    const [user, txns] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true, currency: true } }),
        prisma.walletTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return (
        <View
            balance={Number(user.balance)}
            currency={user.currency}
            txns={txns.map((tx) => ({ id: tx.id, type: tx.type, amount: Number(tx.amount), balanceAfter: Number(tx.balanceAfter), currency: tx.currency, note: tx.note, createdAt: tx.createdAt.toISOString() }))}
        />
    );
}

function View({ balance, currency, txns }: {
    balance: number;
    currency: string;
    txns: { id: string; type: string; amount: number; balanceAfter: number; currency: string; note: string | null; createdAt: string }[];
}) {
    const t = useTranslations('Account');
    return (
        <div>
            <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t('wallet')}</h1>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-900 p-6 text-white">
                <p className="text-sm text-neutral-400">{t('balance')}</p>
                <p className="mt-2 text-4xl font-black text-[#ffec5a]">{currency} {balance.toFixed(2)}</p>
            </div>

            <h2 className="mb-3 mt-8 text-lg font-bold text-neutral-900">{t('activity')}</h2>
            {txns.length === 0 ? (
                <EmptyState label={t('noTransactions')} />
            ) : (
                <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 text-left text-neutral-500">
                            <tr>
                                <th className="px-4 py-3 font-medium">{t('colType')}</th>
                                <th className="px-4 py-3 font-medium">{t('colAmount')}</th>
                                <th className="px-4 py-3 font-medium">{t('colBalance')}</th>
                                <th className="px-4 py-3 font-medium">{t('colNote')}</th>
                                <th className="px-4 py-3 font-medium">{t('colDate')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {txns.map((tx) => (
                                <tr key={tx.id}>
                                    <td className="px-4 py-3 font-medium text-neutral-900">{t(`type${tx.type}` as never)}</td>
                                    <td className={`px-4 py-3 font-semibold ${tx.amount >= 0 ? 'text-green-600' : 'text-[#ff4d4f]'}`}>
                                        {tx.amount >= 0 ? '+' : '−'}{tx.currency} {Math.abs(tx.amount).toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600">{tx.currency} {tx.balanceAfter.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-neutral-500">{tx.note ?? '—'}</td>
                                    <td className="px-4 py-3 text-neutral-500">{new Date(tx.createdAt).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
