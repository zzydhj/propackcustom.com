// 报价表单的「来意」。转化卡片带 ?intent=xxx 跳 /quote，服务端解析后预填备注并在顶部说明，
// 销售在后台一眼能看出这是「要设计帮助」而不是普通询价。
// token 只在这里定义一次，卡片与报价页共用，避免两边各写一份字符串对不上。

export const QUOTE_INTENTS = {
    'design-help': {
        banner: 'Free design help — tell us what you’re packaging and our studio will prep the artwork and dieline for you.',
        note: 'I’d like free design help.\nProduct / idea: \nArtwork I already have (logo, photo, file): \nNeeded by: ',
    },
} as const;

export type QuoteIntent = keyof typeof QUOTE_INTENTS;

export function quoteHref(intent: QuoteIntent): string {
    return `/quote?intent=${intent}`;
}

/** 只认白名单：其它值（包括用户手改 URL）一律视为没带 intent，不把任意文本灌进表单 */
export function parseQuoteIntent(raw: string | string[] | undefined): QuoteIntent | undefined {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return v && v in QUOTE_INTENTS ? (v as QuoteIntent) : undefined;
}
