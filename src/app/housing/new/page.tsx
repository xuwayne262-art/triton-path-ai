import { auth } from "@/auth";
import PlatShell from "@/components/plat/PlatShell";
import ListingForm from "@/components/housing/ListingForm";

/**
 * `/housing/new`, and `/housing/new?edit=<id>` for a listing already posted.
 *
 * A server component only so the form can show the student which address
 * "show my email" would publish; the address itself is attached by the API
 * from the session, not from anything this page sends.
 */

export const dynamic = "force-dynamic";

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const edit = typeof params.edit === "string" && /^[A-Za-z0-9_-]{6,24}$/.test(params.edit) ? params.edit : null;
  return (
    <PlatShell>
      <ListingForm email={session?.user?.email ?? ""} editId={edit} />
    </PlatShell>
  );
}
