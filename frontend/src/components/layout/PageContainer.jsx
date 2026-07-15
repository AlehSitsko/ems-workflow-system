/**
 * Owns the page's horizontal rhythm so no page invents its own margins.
 *
 * width:
 *   "standard" — capped and centred: dashboards, forms, entity lists,
 *                workspaces, admin pages. Long measures stay readable.
 *   "wide"     — uses the full viewport: dense operational surfaces
 *                (Dispatch Board, Calendar, analytics) that are worse when
 *                artificially narrowed.
 *
 * The mode comes from routeMetadata, so it is declared once per route rather
 * than re-decided inside each page.
 */
export default function PageContainer({ width = "standard", children }) {
  return <div className={`page-container ${width}`}>{children}</div>;
}
