// Mega Menu 目录：左侧主分类 → 右侧子分类分组 → 产品项
// 结构参考印刷/包装行业常见品类，英文站。href 统一指向 /products（后续可换成带筛选的链接）。

export type NavItem = { label: string; href: string; image?: string };
export type NavSubgroup = { label: string; items: NavItem[] };
export type NavGroup = { id: string; label: string; subgroups: NavSubgroup[] };

const P = '/products';
const items = (...labels: string[]): NavItem[] => labels.map((label) => ({ label, href: P }));

export const NAV_CATALOG: NavGroup[] = [
    {
        id: 'business-cards',
        label: 'Business Cards',
        subgroups: [
            { label: 'Standard', items: items('Matte', 'Glossy', 'Silk', 'Kraft', 'Textured', 'Linen', 'Rounded Corner') },
            { label: 'Premium', items: items('Foil Stamped', 'Spot UV', 'Embossed', 'Debossed', 'Edge Painting', 'Letterpress', 'Die-cut', 'Layered') },
            { label: 'Specialty', items: items('Plastic PVC', 'Metal', 'Wooden', 'NFC Smart', 'Folded', 'Square', 'Minimalist') },
        ],
    },
    {
        id: 'cards-tags',
        label: 'Cards & Tags',
        subgroups: [
            { label: 'Hang Tags', items: items('String Hang Tag', 'Swing Tag', 'Folded Tag', 'Adhesive Tag', 'Kraft Tag', 'Eco Tag') },
            { label: 'Cards', items: items('Thank You Cards', 'Loyalty Cards', 'Gift Cards', 'Membership Cards', 'Price Tags', 'Wristbands') },
        ],
    },
    {
        id: 'stickers-labels',
        label: 'Stickers & Labels',
        subgroups: [
            { label: 'Labels', items: items('Roll Labels', 'Sheet Labels', 'Product Labels', 'Barcode Labels', 'Transparent Labels', 'Waterproof Labels') },
            { label: 'Stickers', items: items('Die-cut', 'Kiss-cut', 'Vinyl Stickers', 'Holographic', 'Bumper Stickers', 'Clear Stickers', 'Custom Shape') },
        ],
    },
    {
        id: 'boxes',
        label: 'Boxes & Packaging',
        subgroups: [
            { label: 'Mailing', items: items('Mailer Box', 'Shipping Box', 'Subscribe Box', 'Cube Box', 'Pillow Box', 'Tuck-end Box') },
            { label: 'Rigid & Gift', items: items('Rigid Box', 'Drawer Box', 'Lid & Base', 'Magnetic Closure', 'Window Box', 'Cake Box', 'Wine Box') },
        ],
    },
    {
        id: 'bags',
        label: 'Bags & Pouches',
        subgroups: [
            { label: 'Paper Bags', items: items('Shopping Bag', 'Gift Bag', 'Luxury Bag', 'Ribbon Handle', 'Kraft Bag', 'Twist Handle') },
            { label: 'Flexible', items: items('Poly Mailer', 'Stand-up Pouch', 'Ziplock Bag', 'Mylar Bag', 'Cotton Tote', 'Non-woven Bag') },
        ],
    },
    {
        id: 'flyers-leaflets',
        label: 'Flyers & Leaflets',
        subgroups: [
            { label: 'Prints', items: items('Flyers', 'Leaflets', 'Handbills', ' Inserts', 'Coupons', 'Vouchers', 'Posters') },
            { label: 'Formats', items: items('A5', 'A4', 'DL', 'Square', 'Mini', 'Large Format') },
        ],
    },
    {
        id: 'brochures-books',
        label: 'Brochures & Books',
        subgroups: [
            { label: 'Booklets', items: items('Bi-fold', 'Tri-fold', 'Saddle-stitch', 'Stapled', 'Perfect Bound') },
            { label: 'Books', items: items('Catalogs', 'Magazines', 'Lookbooks', 'Manuals', 'Notepads', 'Journals') },
        ],
    },
    {
        id: 'banners-signs',
        label: 'Banners & Signs',
        subgroups: [
            { label: 'Banners', items: items('Vinyl Banner', 'Fabric Banner', 'Mesh Banner', 'Feather Flag', 'Teardrop Flag', 'Roll-up Banner') },
            { label: 'Displays', items: items('Backdrop', 'A-Frame Sign', 'Yard Sign', 'Table Tent', 'Foam Board', 'Acrylic Sign') },
        ],
    },
    {
        id: 'marketing-novelty',
        label: 'Marketing & Novelty',
        subgroups: [
            { label: 'Promotional', items: items('Keychains', 'Magnets', 'Coasters', 'Enamel Pins', 'Lanyards', 'Badges', 'Bottle Openers') },
            { label: 'Seasonal', items: items('Holiday Cards', 'Ornaments', 'Gift Wrap', 'Party Supplies', 'Calendars') },
        ],
    },
    {
        id: 'office-stationery',
        label: 'Office & Stationery',
        subgroups: [
            { label: 'Supplies', items: items('Envelopes', 'Letterhead', 'Compliment Slips', 'Folders', 'Notepads', 'Sticky Notes', 'Rubber Stamps') },
        ],
    },
    {
        id: 'samples',
        label: 'Ready-made & Samples',
        subgroups: [
            { label: 'Samples', items: items('Sample Kit', 'Material Swatches', 'Stock Boxes', 'Stock Bags', 'Mockup Service') },
        ],
    },
];
