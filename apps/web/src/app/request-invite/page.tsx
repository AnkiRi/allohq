import type { Metadata } from "next";
import Link from "next/link";
import "../options/v2/v2.css";
import { RequestInviteForm } from "@/components/access/RequestInviteForm";

export const metadata: Metadata = {
  title: "Request an invite · joon",
  description: "joon is opening with a small number of design partners.",
};

/**
 * The public request-access page.
 *
 * Rendered inside the landing's own shell — `.opt-v2 .v3-landing`, the same
 * wrapper, palette and typography — because the landing stylesheet is scoped
 * entirely under that class. Without it the page falls back to the
 * authenticated app's theme and arrives looking like a different product.
 *
 * A page rather than a modal on the landing: this is a link worth sending
 * someone, and a seven-field form inside a dialog at phone width means a
 * scrolling modal with the keyboard over the inputs.
 *
 * Public by design and creates nothing: submitting writes one access-request
 * row. No identity, no workspace, no membership, no invitation, no store, no
 * model call.
 */

/**
 * The landing's own no-FOUC palette resolver, reused verbatim so a visitor who
 * chose a palette there does not get a different one here. Reads
 * `?pal=` first, then the landing's stored preference, then leaves the
 * server-rendered default alone.
 */
const PAL_INIT = `
(function(){
  try {
    var sc = document.currentScript;
    var el = (sc && sc.parentElement) || document.querySelector(".opt-v2");
    var ok = function(p){ return p==="drenched"||p==="light"; };
    var pal = null;
    var q = new URLSearchParams(location.search).get("pal");
    if (q !== null) { pal = ok(q) ? q : "drenched"; }
    else {
      var s = localStorage.getItem("allo-theme");
      if (ok(s)) pal = s;
    }
    if (!pal) return;
    if (el) el.setAttribute("data-pal", pal);
  } catch (e) {}
})();
`;

export default function RequestInvitePage() {
  return (
    <div className="opt-v2 v3-landing" data-pal="drenched" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: PAL_INIT }} />
      <div className="v2-shell">
        <header className="v2-nav">
          <div className="v2-wrap v2-nav__inner">
            <Link className="v2-brand" href="/">
              <span className="v2-blip" aria-hidden="true" />
              <span className="v2-brand__word">joon</span>
            </Link>
            <div className="v2-nav__right">
              <Link className="v2-btn v2-btn--ghost" href="/sign-in">
                Sign in
              </Link>
            </div>
          </div>
        </header>

        <main className="v2-wrap request-invite">
          <RequestInviteForm />
        </main>
      </div>
    </div>
  );
}
