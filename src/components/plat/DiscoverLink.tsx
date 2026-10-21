import Link from "next/link";

/**
 * The way into Plan with AI from Home and Courses, where the AI search link
 * used to be. It is always shown: Plan with AI works without the model —
 * its buttons, guided flows and the commands it reads itself never need one
 * — so it is never a link to "not available yet". It opens in the Planner,
 * behind the same sign-in as the rest of a student's plan.
 */
export default function DiscoverLink({ className = "" }: { className?: string }) {
  return (
    <Link href="/planner/ai" className={className}>
      Describe the quarter you want · Plan with AI
    </Link>
  );
}
