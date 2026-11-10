import type { Metadata } from "next";
import Link from "next/link";
import LegalDocument, { LegalSection, LegalSubheading, type LegalHeading } from "@/components/plat/LegalDocument";
import { CONTACT_EMAIL, INSTAGRAM_HANDLE } from "@/lib/contact";
import { LEGAL_LINK } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What UCSDPlans collects when you sign in, save a plan, import an Academic History or post housing, who receives it, how long it is kept, and how to delete it.",
};

/*
 * Every statement here was checked against the code that does it (Nov 2026):
 * sign-in in src/auth.ts, the stores in src/lib/{plan,history,housing}/store.ts
 * and supabase/*.sql, Plan with AI in src/lib/planAi/privacy.ts and
 * src/app/api/plan-ai, browser storage keys across src/. Change the code,
 * change this page.
 */

const H = {
  who: { id: "who", title: "Who we are" },
  collect: { id: "collect", title: "What we collect" },
  use: { id: "use", title: "How we use it" },
  sharing: { id: "sharing", title: "Who can see it, and who receives it" },
  ai: { id: "ai", title: "Plan with AI" },
  cookies: { id: "cookies", title: "Cookies and browser storage" },
  retention: { id: "retention", title: "How long we keep it" },
  choices: { id: "choices", title: "Your choices and requests" },
  security: { id: "security", title: "Security" },
  location: { id: "location", title: "Where it is processed" },
  children: { id: "children", title: "Children" },
  changes: { id: "changes", title: "Changes to this policy" },
  contact: { id: "contact", title: "Contact" },
} satisfies Record<string, LegalHeading>;

const mail = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("UCSDPlans privacy")}`;

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} className={LEGAL_LINK}>{children}</a>;
}

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      headings={Object.values(H)}
      intro={
        <>
          <p>
            This policy explains what UCSDPlans collects, why, who receives it, how long we keep it, and how to delete
            it. Questions or requests: <a href={mail} className={LEGAL_LINK}>{CONTACT_EMAIL}</a>.
          </p>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">In short</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6">
              <li>You can browse courses without an account. There are no analytics, advertising or tracking cookies.</li>
              <li>What you save is filed under a scrambled code made from your email, not under the email itself.</li>
              <li>Your plan and Academic History are shown only to you. Housing posts are shown to signed-in @ucsd.edu students.</li>
              <li>We don’t sell your information, and there are no ads.</li>
              <li>You can delete your Academic History and housing posts yourself, and ask us to delete everything else.</li>
            </ul>
          </div>
        </>
      }
    >
      <LegalSection heading={H.who}>
        <p>
          UCSDPlans is an independent website run by the student maintainer named on our{" "}
          <Link href="/about#contact" className={LEGAL_LINK}>About page</Link>. It is not part of UC San Diego, so the
          university’s own privacy policies and student-records rules don’t cover what you save here.
        </p>
      </LegalSection>

      <LegalSection heading={H.collect}>
        <LegalSubheading id="sign-in">Your Google sign-in</LegalSubheading>
        <p>
          You sign in on Google’s own page, so UCSDPlans never receives your password. Google tells us your email
          address, whether Google has verified it, your name, your profile picture link and your Google account ID. Our
          server accepts only verified @ucsd.edu addresses and checks this at every sign-in. We don’t keep a list of
          accounts: your email, name and picture link are kept only in an encrypted sign-in cookie in your browser.
        </p>

        <LegalSubheading id="plan">Your plan</LegalSubheading>
        <p>
          When you use the Planner, we save your major, minor and college, the courses and sections you pick for each
          quarter, your 4-year plan, the courses you star, the instructor ratings you give, and the recent changes made
          with Plan with AI so they can be undone. A copy also stays in your browser so the Planner opens quickly.
          Courses you star or rate before signing in stay in that browser, and join your saved plan the first time you
          sign in there.
        </p>

        <LegalSubheading id="academic-history">Your Academic History</LegalSubheading>
        <p>
          If you import one, your browser reads the text you paste and keeps only the courses. The pasted text never
          leaves your browser, and the name, student ID and other personal details in it are not saved. For each
          quarter we save the course codes and titles, units, grading options, grades and grade points, and whether each
          course is completed or in progress, plus any transfer credit you add, the plan year you choose and when you
          saved. A copy from the older TritonLink layout can also include the college, major and minor printed on it.
        </p>

        <LegalSubheading id="housing">Your housing posts</LegalSubheading>
        <p>
          If you post a place, we save what you enter: rent and utilities, the address and its map location, dates,
          room and bathroom details, amenities, the title and description, photos and their labels, and the contact
          details you choose to show (your @ucsd.edu email, a phone number or another way to reach you). We also save
          your first name and last initial from your Google account, when you posted and last confirmed the listing,
          and scrambled codes for students who report it or say they’re interested. Your browser shrinks each photo and
          removes its location data before uploading it.
        </p>

        <LegalSubheading id="messages">Messages you send us</LegalSubheading>
        <p>If you email or message us, we receive your message and contact details and use them to reply.</p>

        <LegalSubheading id="technical">Technical information</LegalSubheading>
        <p>
          When you visit, our host receives what any website receives: your IP address, browser type, the page you
          asked for and the time. Our own server logs record errors and timings, not what you save. We don’t use
          analytics or advertising tools, and we don’t build profiles of visitors.
        </p>
      </LegalSection>

      <LegalSection heading={H.use}>
        <ul>
          <li>
            To run the features you use: keep you signed in, save your plan and sync it between your devices, place
            your Academic History in your 4-year plan and check suggested courses against it, show housing posts to
            students, and draw walking routes between your classes.
          </li>
          <li>To keep the site working and safe: fix errors, stop abuse, and enforce daily limits on Plan with AI.</li>
          <li>To reply when you contact us.</li>
        </ul>
        <p>We don’t use your information for advertising, and we don’t sell it.</p>
      </LegalSection>

      <LegalSection heading={H.sharing}>
        <p>
          <span className="font-semibold">Other students.</span> Your plan, starred courses, ratings and Academic
          History are shown only to you: our server returns them only to the account that saved them. Your ratings never
          change the RateMyProfessors numbers anyone sees. A housing post, with the contact details you chose and your
          first name and last initial, is visible to anyone signed in with a @ucsd.edu account. It is not public, and its
          photos are kept in private storage that only signed-in students can load. People who can see a post can still
          copy it, so share only what you’re comfortable showing other UCSD students.
        </p>
        <p>
          <span className="font-semibold">The operator.</span> The person who runs UCSDPlans can open the database and
          hosting accounts, to keep the site running and to handle your requests.
        </p>
        <p>
          <span className="font-semibold">Service providers.</span> These companies process information for us:
        </p>
        <ul>
          <li>
            Vercel hosts the site. It receives every request, including your IP address, runs our server code in
            Washington, D.C., and delivers pages from its network around the world.{" "}
            <External href="https://vercel.com/legal/privacy-policy">Vercel’s privacy policy</External>.
          </li>
          <li>
            Supabase stores saved plans, Academic Histories, housing posts and photos, and Plan with AI usage counts, in
            a data center in Northern California run by Amazon Web Services.{" "}
            <External href="https://supabase.com/privacy">Supabase’s privacy policy</External>.
          </li>
          <li>
            Google runs sign-in and, for Plan with AI, the Gemini model (see below).{" "}
            <External href="https://policies.google.com/privacy">Google’s privacy policy</External>.
          </li>
          <li>
            The U.S. Census Bureau’s public geocoder receives an address you type in Housing, without your name or email,
            so our server can place it on the map.
          </li>
          <li>
            UC San Diego’s Class Planner receives the section numbers of a schedule, without your name or email, when
            our server asks it for walking routes between classes.
          </li>
          <li>
            OpenFreeMap serves the map pictures. Your browser loads them directly, so OpenFreeMap receives your IP address
            and the area shown. It says it sets no cookies.{" "}
            <External href="https://openfreemap.org/privacy/">OpenFreeMap’s privacy policy</External>.
          </li>
        </ul>
        <p>
          We may also disclose information when the law requires it, or when reasonably necessary to investigate abuse,
          protect people or the service, or establish or defend legal claims.
        </p>
        <p>
          We do not sell personal information or share it for cross-context behavioral advertising, and there are no ads
          on UCSDPlans.
        </p>
      </LegalSection>

      <LegalSection heading={H.ai}>
        <p>Plan with AI turns a request you type into changes to your plan. It is optional; the Planner works without it.</p>
        <p>
          Before a request is sent anywhere, your browser and our server check it. A request that looks like it contains
          an email address, phone number, student ID, grade, GPA, name, link or pasted record is not sent at all, and
          you’re told why. A request that passes, up to 400 characters, goes to Google’s Gemini model along with UC San
          Diego’s public course list and two settings about what is on screen. Your plan, Academic History, name and
          email are never sent. Words like “my plan” are filled in by UCSDPlans after the model replies.
        </p>
        <p>
          We use Gemini’s free tier. Under{" "}
          <External href="https://ai.google.dev/gemini-api/terms">Google’s terms for it</External>, Google may keep what
          it receives, use it to improve its products, and have people review it. So don’t type anything private into
          Plan with AI.
        </p>
        <p>
          To enforce daily limits, we count your requests under a scrambled code made from your email and keep those
          counts for up to 35 days, along with site-wide daily totals that contain nothing about you.
        </p>
      </LegalSection>

      <LegalSection heading={H.cookies}>
        <p>
          <span className="font-semibold">Cookies.</span> UCSDPlans sets only the cookies its sign-in needs:
        </p>
        <ul>
          <li>
            a sign-in cookie, encrypted and unreadable to scripts on the page, that keeps you signed in for up to 7 days
            after you last use the site;
          </li>
          <li>
            a security token that protects sign-in from forged requests, and a note of the page to return to after
            signing in. These are set on every visit and end with your browser session;
          </li>
          <li>short checks during Google sign-in that expire after 15 minutes.</li>
        </ul>
        <p>There are no analytics, advertising or social media cookies.</p>
        <p>
          <span className="font-semibold">Browser storage.</span> Your browser keeps a copy of your plan, starred courses
          and ratings, and settings such as the theme, the quarter you chose, recently viewed courses, your housing view
          and the addresses you checked. Plan with AI keeps a pause timer and a request carried over from another page in
          the tab’s session storage. These stay on your device. Clearing them in your browser’s settings removes the
          local copies but not what is saved with your account.
        </p>
        <p>
          <span className="font-semibold">Tracking signals.</span> UCSDPlans doesn’t track you across websites, and no
          third party collects information about your activity across sites through it, so a Do Not Track signal
          changes nothing here. Because we don’t sell or share personal information, Global Privacy Control has nothing
          to opt you out of. If that ever changed, we would update this policy first and honor the signal where the law
          requires.
        </p>
      </LegalSection>

      <LegalSection heading={H.retention}>
        <ul>
          <li>Sign-in cookie: up to 7 days after you last use the site. Signing out deletes it.</li>
          <li>
            Your plan: until you delete it. Removing your courses, stars and ratings empties the saved plan; to remove
            the saved record itself, email us.
          </li>
          <li>
            Your Academic History: until you delete it on the Academic History page, which removes it from our database
            right away. Your planned courses stay.
          </li>
          <li>
            Housing posts: until you delete them, and deleting a post deletes its photos. A post you haven’t confirmed
            for 30 days is hidden from other students but kept until you delete it. A photo you upload but never post
            can stay in storage; email us to remove it.
          </li>
          <li>Plan with AI counts: up to 35 days.</li>
          <li>
            Server logs: our host keeps the logs of our server code for one day. Our providers keep their own
            operational logs under their policies.
          </li>
          <li>Backups: deleted information can remain in our providers’ backups for a short time before it is overwritten.</li>
        </ul>
        <p>
          Signing out, or removing UCSDPlans from your Google account’s connected apps, stops sign-in but doesn’t delete
          what you saved.
        </p>
      </LegalSection>

      <LegalSection heading={H.choices}>
        <p>
          You can use the course explorer without an account. Signing in, importing an Academic History and posting
          housing are all optional.
        </p>
        <ul>
          <li>
            See and correct: your plan in the Planner, your Academic History on its page, and your housing posts on
            Housing, where you can edit or delete each one.
          </li>
          <li>
            Get a copy, or delete everything: email <a href={mail} className={LEGAL_LINK}>{CONTACT_EMAIL}</a> from your
            @ucsd.edu address. We reply to that address to confirm the request is yours, then send you what we hold or
            delete your plan, Academic History, housing posts and photos, and Plan with AI counts. We aim to finish within
            30 days.
          </li>
        </ul>
        <p>Depending on where you live, you may have other rights over your information. Email us to use them.</p>
      </LegalSection>

      <LegalSection heading={H.security}>
        <p>
          Every connection uses HTTPS. Your sign-in cookie is encrypted and can’t be read by scripts on the page. Only
          our server can reach the database, with a key browsers never see, and saved records are filed under scrambled
          codes instead of email addresses. Housing photos sit in private storage. No website is perfectly secure, so
          please tell us if you find a problem.
        </p>
      </LegalSection>

      <LegalSection heading={H.location}>
        <p>
          Our server code runs in Washington, D.C., and saved information is stored in Northern California. Pages are
          delivered through Vercel’s network around the world, and Google handles sign-in and Gemini requests in its
          own data centers.
        </p>
      </LegalSection>

      <LegalSection heading={H.children}>
        <p>
          UCSDPlans is for university students and others exploring UC San Diego courses. It isn’t directed to children
          under 13, and a @ucsd.edu address isn’t proof of age. If you believe a child under 13 has given us personal
          information, email us and we’ll delete it.
        </p>
      </LegalSection>

      <LegalSection heading={H.changes}>
        <p>
          When this policy changes, we’ll post the new version here with a new effective date. For a significant
          change, we’ll also post a notice on the <Link href="/announcements" className={LEGAL_LINK}>Announcements</Link>{" "}
          page, and ask for your consent where the law requires before using information you already gave us in a new
          way.
        </p>
      </LegalSection>

      <LegalSection heading={H.contact}>
        <p>
          Email <a href={mail} className={LEGAL_LINK}>{CONTACT_EMAIL}</a>, or message @{INSTAGRAM_HANDLE} on Instagram
          (see <Link href="/about#contact" className={LEGAL_LINK}>About</Link>). For a request about your data, email
          works best, because we can confirm it’s you.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
