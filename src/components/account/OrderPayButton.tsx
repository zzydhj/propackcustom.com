import { payOrderFromBalance } from '@/features/order/actions';

// 直接用 server action 作为 form action，无 JS 也能提交
export function OrderPayButton({ orderId }: { orderId: string }) {
    return (
        <form action={payOrderFromBalance} className="inline">
            <input type="hidden" name="id" value={orderId} />
            <button type="submit" className="rounded-md bg-[#ffec5a] px-3 py-1.5 text-xs font-bold text-neutral-900 hover:brightness-95">
                Pay from balance
            </button>
        </form>
    );
}
