import type { Metadata } from "next";
import Link from "next/link";
import LegalDocument, { LegalSection, type LegalHeading } from "@/components/plat/LegalDocument";
import { LEGAL_LINK } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "The rules for using UCSDPlans: accounts, academic decisions, what you post, housing listings, third-party rights, and the limits of the service.",
};

const H = {
  service: { id: "service", title: "1. Service and operator" },
  accounts: { id: "accounts", title: "2. Accounts and acceptable use" },
  academic: { id: "academic", title: "3. Academic decisions" },
  content: { id: "content", title: "4. Your content" },
  housing: { id: "housing", title: "5. Housing listings" },
  rights: { id: "rights", title: "6. Third-party rights and reports" },
  liability: { id: "liability", title: "7. Service availability and liability" },
  changes: { id: "changes", title: "8. Restrictions, changes, and contact" },
} satisfies Record<string, LegalHeading>;

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Use"
      headings={Object.values(H)}
      intro={
        <p>
          The rules for using UCSDPlans. How your information is handled is in the{" "}
          <Link href="/privacy" className={LEGAL_LINK}>Privacy Policy</Link>.
        </p>
      }
    >
      <LegalSection heading={H.service}>
        <p>
          These Terms govern use of UCSDPlans, operated by the independent maintainer identified on our{" "}
          <Link href="/about#contact" className={LEGAL_LINK}>About page</Link>. UCSDPlans offers course information,
          planning tools, academic-history features, and student housing listings. It is not an official university
          service. Please read these Terms and the Privacy Policy before using account features.
        </p>
      </LegalSection>

      <LegalSection heading={H.accounts}>
        <p>
          Use your own account and provide accurate information when required. You are responsible for activity you
          authorize through your account. Do not impersonate another person, share access to private records,
          circumvent access restrictions, upload malicious code, interfere with the service, or use it to harass,
          defraud, discriminate unlawfully, or violate another person’s rights.
        </p>
        <p>
          Do not upload another person’s academic records, confidential information, or images without appropriate
          permission. Do not harvest user contact details or use housing information for unsolicited marketing.
          Automated access must respect applicable law, access restrictions, and published usage limits.
        </p>
      </LegalSection>

      <LegalSection heading={H.academic}>
        <p>
          Information and recommendations are for general reference and may contain errors or become outdated. You
          remain responsible for confirming enrollment, deadlines, degree requirements, and eligibility with official
          university sources. Using a planner does not enroll you in a course or reserve a seat. The{" "}
          <Link href="/disclaimer" className={LEGAL_LINK}>Disclaimer</Link> explains additional limitations of grade
          data, ratings, and automated recommendations.
        </p>
      </LegalSection>

      <LegalSection heading={H.content}>
        <p>
          You retain any rights you hold in content you submit. You must have the right to provide that content and
          must not submit unlawful, deceptive, defamatory, infringing, or privacy-invasive material.
        </p>
        <p>
          For content you choose to publish, such as a housing listing, you grant UCSDPlans a nonexclusive,
          royalty-free license to host, store, reproduce, format, and display it to the audience identified in the
          posting interface, solely to operate that feature. This permission lasts while the content is posted and for
          the limited processing needed to complete removal and lawful retention described in the{" "}
          <Link href="/privacy#retention" className={LEGAL_LINK}>Privacy Policy</Link>. It does not authorize sale of
          your content or unrelated advertising use.
        </p>
        <p>
          Private plans, personal instructor ratings, and academic records are not public posts. Their processing and
          disclosure are governed by the Privacy Policy, not by the public-content license above.
        </p>
      </LegalSection>

      <LegalSection heading={H.housing}>
        <p>
          Post only accurate listings that you have authority to offer. Do not post scams, unlawful discriminatory
          preferences, misleading prices, or photos that infringe another person’s rights. Users are responsible for
          their own communications and agreements. UCSDPlans provides a listing service and is not a party to a lease
          or rental transaction. We may restrict or remove listings that violate these Terms or create a credible risk
          of harm.
        </p>
      </LegalSection>

      <LegalSection heading={H.rights}>
        <p>
          Third-party material remains subject to its owners’ rights and applicable licenses. Availability on
          UCSDPlans does not grant unrestricted permission to copy or redistribute it. Contact us through{" "}
          <Link href="/about#contact" className={LEGAL_LINK}>About</Link> to report a rights violation, identifying
          the material, its location, your claim, and a way to reach you. We may remove or restrict disputed material
          while investigating and may take action against repeat abuse.
        </p>
      </LegalSection>

      <LegalSection heading={H.liability}>
        <p>
          To the extent permitted by applicable law, UCSDPlans is provided on an “as is” and “as available” basis
          without warranties of accuracy, completeness, uninterrupted availability, merchantability, fitness for a
          particular purpose, or noninfringement. No statement here guarantees that a disclaimer or limitation will be
          enforceable in every situation.
        </p>
        <p>
          To the extent permitted by law, the operator is not liable for indirect, incidental, special, or
          consequential losses arising from use of or inability to use the service, including reliance on inaccurate
          planning information or third-party listings. These Terms do not exclude liability for fraud, willful
          misconduct, gross negligence, or any liability or consumer right that applicable law does not allow to be
          excluded or limited.
        </p>
      </LegalSection>

      <LegalSection heading={H.changes}>
        <p>
          We may restrict access reasonably necessary to address abuse, security threats, legal requirements, or
          material violations of these Terms. We may modify or discontinue features. Data retention and available
          deletion options are described in the <Link href="/privacy#choices" className={LEGAL_LINK}>Privacy Policy</Link>.
        </p>
        <p>
          Updates will appear here with a revised effective date. For material changes, we will provide additional
          notice appropriate to the change and obtain agreement where required. Changes will not retroactively
          authorize new uses of previously collected personal information without a valid legal basis and any
          required notice or consent.
        </p>
        <p>
          Questions about these Terms may be sent through the contact details on{" "}
          <Link href="/about#contact" className={LEGAL_LINK}>About</Link>. Nothing in these Terms removes rights that
          cannot lawfully be waived.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
