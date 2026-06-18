import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";

const TARGET_CLASS = "setup-guide-target-active";

export const SetupGuideOverlay = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setupGuide = searchParams.get("setupGuide");
  const highlight = searchParams.get("highlight");
  const [targetFound, setTargetFound] = useState(false);

  useEffect(() => {
    if (!setupGuide || !highlight) return undefined;
    const selector = `[data-setup-target="${CSS.escape(highlight)}"]`;
    const target = document.querySelector(selector);
    if (!target) {
      setTargetFound(false);
      return undefined;
    }
    setTargetFound(true);
    target.classList.add(TARGET_CLASS);
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    return () => target.classList.remove(TARGET_CLASS);
  }, [highlight, setupGuide]);

  if (!setupGuide) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 w-[min(28rem,calc(100vw-2rem))]">
      <div className="pointer-events-auto rounded-lg border bg-white p-4 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setup guide</p>
        <h2 className="mt-1 text-sm font-semibold">Guided setup: {setupGuide.replace(/-/g, " ")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {targetFound
            ? "The relevant section is highlighted on this page. Configure it here, then return to the checklist."
            : "The setup target for this step could not be found on this page. Return to Setup Guide or use the page controls manually."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate("/setup-wizard")}>Back to Setup Guide</Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/setup-wizard")}>Mark or skip step</Button>
        </div>
      </div>
    </div>
  );
};
