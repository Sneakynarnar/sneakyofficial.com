import { useEffect } from "react";

/**
 * Sends the browser to another site.
 *
 * Splatdle now lives on its own domain, so the old in-app route has to hand
 * over rather than render. Fresh loads are caught by a 301 on the server; this
 * covers navigation from inside the app, where the server never sees the URL.
 */
export default function ExternalRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
      <p>
        Taking you to{" "}
        <a href={to} className="text-orange-400 hover:text-orange-300 underline">
          {to.replace(/^https?:\/\//, "")}
        </a>
        …
      </p>
    </div>
  );
}
