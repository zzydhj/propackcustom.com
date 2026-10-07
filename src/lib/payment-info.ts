// ── 人工收款信息（T/T 银行转账）──────────────────────────
// 全部来自环境变量，不硬编码任何账户信息。未配置时页面上只显示「稍后邮件发送」，
// 避免出现占位符账户导致客户打错款。

export type BankDetails = {
    bankName: string;
    accountName: string;
    accountNumber: string;
    swift: string;
    bankAddress?: string;
    notes?: string;
};

export function bankDetails(): BankDetails | null {
    const bankName = process.env.TT_BANK_NAME;
    const accountName = process.env.TT_ACCOUNT_NAME;
    const accountNumber = process.env.TT_ACCOUNT_NUMBER;
    const swift = process.env.TT_SWIFT;
    if (!bankName || !accountName || !accountNumber || !swift) return null;
    return {
        bankName,
        accountName,
        accountNumber,
        swift,
        bankAddress: process.env.TT_BANK_ADDRESS || undefined,
        notes: process.env.TT_NOTES || undefined,
    };
}

// 客户咨询/发送凭证的邮箱
export function salesEmail(): string {
    return process.env.SALES_EMAIL || process.env.EMAIL_FROM || 'sales@propackcustom.com';
}
