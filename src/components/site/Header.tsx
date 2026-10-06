import { auth } from '@/lib/auth';
import { NAV_CATALOG } from '@/lib/megaMenu';
import { SiteNav } from './SiteNav';

// 外层 async：读取会话；Mega Menu 目录用静态配置（src/lib/megaMenu.ts）
export async function Header() {
  const session = await auth();
  return <SiteNav groups={NAV_CATALOG} signedIn={!!session?.user} />;
}
