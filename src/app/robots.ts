import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? 'https://propackcustom.com';

// robots.txt：放开营销/内容页，屏蔽后台、账户与 API
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/admin', '/account', '/api'],
            },
        ],
        sitemap: `${BASE}/sitemap.xml`,
    };
}
