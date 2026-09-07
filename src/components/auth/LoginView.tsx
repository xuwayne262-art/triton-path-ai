"use client";

import { useFormStatus } from "react-dom";
import TridentMark from "@/components/plat/TridentMark";
import GoogleIcon from "./GoogleIcon";
import { signInWithGoogle } from "@/app/login/actions";

/**
 * The sign-in screen.
 *
 * Deliberately plain: one column, one action, everything on a single left
 * edge, and no card, shadow or illustration to compete with the button. The
 * only colour beyond navy on warm white is a short gold rule under the mark.
 */

const NAVY = "#182B49";

export interface LoginViewProps {
  /** Sanitised same-site path to land on after a successful sign-in. */
  next: string;
  /** Student-facing sentence, already chosen by the server. */
  error: string | null;
  configured: boolean;
  missingEnv: string[];
  callbackUrls: string[];
  /** Drives the setup notice: editing a local file is only useful locally. */
  isLocalHost: boolean;
}

/**
 * `useFormStatus` reads the pending state of the enclosing form, so the button
 * disables itself for the whole redirect to Google — a second click cannot
 * start a second sign-in.
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-lg px-5 text-[15px] font-semibold text-white transition-colors hover:bg-[#22395e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#182B49] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FCFBF9] disabled:cursor-not-allowed disabled:opacity-70"
      style={{ background: NAVY }}
    >
      {pending ? (
        <>
          <span
            className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden="true"
          />
          Signing you in…
        </>
      ) : (
        <>
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[3px] bg-white">
            <GoogleIcon />
          </span>
          Continue with Google
        </>
      )}
    </button>
  );
}

export default function LoginView({
  next,
  error,
  configured,
  missingEnv,
  callbackUrls,
  isLocalHost,
}: LoginViewProps) {
  return (
    <main
      className="flex min-h-dvh justify-center bg-[#FCFBF9] px-6 py-16 sm:px-8 md:items-center md:pb-[14vh]"
      style={{ color: NAVY }}
    >
      <div className="w-full max-w-[480px]">
        {/* Brand lockup — the same mark and wordmark the app header uses */}
        <div className="flex items-center gap-2.5">
          <TridentMark className="h-9 w-9" />
          <span className="text-[17px] font-bold tracking-tight">
            UCSD<span style={{ color: "#1B2C4F" }}>Plans</span>
          </span>
        </div>

        {/* The one flash of gold */}
        <div className="mt-5 h-[3px] w-12 rounded-full" style={{ background: "#FFCD00" }} />

        <h1 className="mt-7 text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[38px]">
          Welcome to UCSDPlans
        </h1>

        <p className="mt-4 text-[15px] leading-relaxed text-[#4A5670] sm:text-[16px]">
          Explore courses and plan your UCSD schedule.
        </p>

        {error && (
          <p
            role="alert"
            aria-live="polite"
            className="mt-7 rounded-lg border border-[#E4C9C9] bg-[#FDF6F6] px-4 py-3 text-[13px] leading-snug text-[#8C2B2B]"
          >
            {error}
          </p>
        )}

        {configured ? (
          <>
            <form action={signInWithGoogle}>
              <input type="hidden" name="next" value={next} />
              <SubmitButton />
            </form>

            <p className="mt-4 text-[13px] leading-relaxed text-[#6B7488]">
              Use your @ucsd.edu Google account to continue.
            </p>
          </>
        ) : (
          <SetupNotice
            missingEnv={missingEnv}
            callbackUrls={callbackUrls}
            isLocalHost={isLocalHost}
          />
        )}
      </div>
    </main>
  );
}

/**
 * Shown instead of the button when credentials are absent. Sign-in genuinely
 * cannot work yet, so offering a button that fails would be worse than saying
 * plainly what is missing.
 */
function SetupNotice({
  missingEnv,
  callbackUrls,
  isLocalHost,
}: {
  missingEnv: string[];
  callbackUrls: string[];
  isLocalHost: boolean;
}) {
  return (
    <div className="mt-8 rounded-lg border border-[#E8E2D4] bg-[#FFFDF6] px-5 py-4">
      <p className="text-[14px] font-semibold">Google sign-in is not configured yet</p>
      {isLocalHost ? (
        <p className="mt-2 text-[13px] leading-relaxed text-[#6B7488]">
          Add these to <code className="font-mono text-[12px]">.env.local</code> and restart the
          server:
        </p>
      ) : (
        // A deployed server never sees .env.local — it is gitignored and stays
        // on the developer's machine. Saying otherwise sends people to edit a
        // file that cannot possibly affect this page.
        <p className="mt-2 text-[13px] leading-relaxed text-[#6B7488]">
          This is a deployed server, so it does not read{" "}
          <code className="font-mono text-[12px]">.env.local</code>. Set these in the hosting
          project&rsquo;s environment variables, then <strong>redeploy</strong> — variables added
          after a deployment only apply to the next one:
        </p>
      )}
      <ul className="mt-2 space-y-1">
        {missingEnv.map((name) => (
          <li key={name} className="font-mono text-[12px] text-[#8C6D1F]">
            {name}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-relaxed text-[#6B7488]">
        Authorised redirect URI for the Google OAuth client:
      </p>
      <ul className="mt-1 space-y-1">
        {callbackUrls.map((url) => (
          <li key={url} className="break-all font-mono text-[12px] text-[#4A5670]">
            {url}
          </li>
        ))}
      </ul>
    </div>
  );
}
