import { jsonLdHtml, websiteJsonLd } from "@/lib/seo";

/**
 * What only the home page carries: the WebSite structured data Google reads
 * for the site name above a result. The page itself is a client component, so
 * this server layout adds it. "(home)" is a route group: the address is "/".
 */
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(websiteJsonLd()) }} />
      {children}
    </>
  );
}
