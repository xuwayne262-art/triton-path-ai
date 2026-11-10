import type { Metadata } from "next";
import Link from "next/link";
import LegalDocument, { LegalSection, type LegalHeading } from "@/components/plat/LegalDocument";
import { LEGAL_LINK } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "UCSDPlans is an independent student project, not a UC San Diego service. What its course data, grades, ratings, plans and housing posts can and cannot tell you.",
};

const H = {
  independent: { id: "independent", title: "Independent website" },
  academic: { id: "academic", title: "Academic information and planning" },
  housing: { id: "housing", title: "Housing and third-party services" },
  names: { id: "names", title: "Names, content, and corrections" },
} satisfies Record<string, LegalHeading>;

export default function DisclaimerPage() {
  return (
    <LegalDocument
      title="Disclaimer"
      headings={Object.values(H)}
      intro={
        <p>
          What UCSDPlans is, and what its information can and cannot be relied on for. The{" "}
          <Link href="/terms" className={LEGAL_LINK}>Terms of Use</Link> and{" "}
          <Link href="/privacy" className={LEGAL_LINK}>Privacy Policy</Link> cover the rest.
        </p>
      }
    >
      <LegalSection heading={H.independent}>
        <p>
          UCSDPlans is an independently operated student project. It has no institutional affiliation with,
          sponsorship from, endorsement by, or official relationship with the University of California San Diego, the
          University of California, or The Regents of the University of California. A creator’s or user’s attendance
          at the university does not make this an official university service. Signing in with a university email
          address does not imply university approval.
        </p>
      </LegalSection>

      <LegalSection heading={H.academic}>
        <p>
          UCSDPlans provides information and planning tools for general reference. It does not provide an official
          degree audit, academic advising determination, enrollment confirmation, or guarantee of course eligibility,
          availability, transfer-credit acceptance, graduation, or a particular grade.
        </p>
        <p>
          Schedules, instructors, rooms, exams, prerequisites, restrictions, fees, deadlines, and seat counts can
          change. General-education lists and suggested course matches may not account for your college, major,
          catalog year, transfer credit, petitions, or double-counting rules. Check the university’s current official
          records and consult the appropriate advisor before relying on a plan.
        </p>
        <p>
          Historical grades describe past classes. Professor ratings reflect their sources and may contain bias or
          limited samples. Neither predicts your results or the workload of a particular class. Automated or
          AI-generated suggestions can contain errors and should be checked independently.
        </p>
      </LegalSection>

      <LegalSection heading={H.housing}>
        <p>
          Housing posts are submitted by users. UCSDPlans does not guarantee a listing’s accuracy, availability,
          legality, ownership, safety, or the trustworthiness of the person posting it. University-email sign-in alone
          does not verify a person’s identity, current enrollment, or authority to rent a property. Independently
          verify the property and the other party before sending money or signing an agreement.
        </p>
        <p>
          External websites, datasets, and services have their own terms and privacy practices. Linking to or
          referring to them does not imply a partnership or endorsement.
        </p>
      </LegalSection>

      <LegalSection heading={H.names}>
        <p>
          University names and marks and other third-party names, marks, and content remain the property of their
          respective owners. References identify the subjects and sources discussed by UCSDPlans; they do not
          represent institutional authorization. This notice does not grant permission to reuse protected material.
        </p>
        <p>
          For an error, privacy concern, allegedly infringing material, or misleading listing, contact the operator
          through the <Link href="/about#contact" className={LEGAL_LINK}>contact details on the About page</Link>.
          Include the relevant URL and enough information to investigate without sending unnecessary personal
          information.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
