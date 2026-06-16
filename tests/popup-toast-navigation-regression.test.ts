import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });

describe("popup and toast navigation regression", () => {
  it("keeps toast viewport visible but non-blocking for app navigation", () => {
    const viewport = read("frontend/src/components/feedback/ToastViewport.tsx");

    expect(viewport).toContain("pointer-events-none fixed");
    expect(viewport).not.toContain("fixed inset-0");
    expect(viewport).not.toContain("z-[100]");
    expect(viewport).toContain("z-40");
    expect(viewport).toContain('className={cn("pointer-events-none rounded-xl border');
    expect(viewport).toContain('className="pointer-events-auto mt-3"');
    expect(viewport).toContain('className="pointer-events-auto -mr-2 -mt-2');
    expect(viewport).toContain("Dismiss notification");
  });

  it("auto-dismisses normal toasts and clears non-persistent toasts on route changes", () => {
    const provider = read("frontend/src/components/feedback/ToastProvider.tsx");
    const useToast = read("frontend/src/components/feedback/useToast.ts");

    expect(provider).toContain("window.setTimeout");
    expect(provider).toContain("dismissToast(toast.id)");
    expect(provider).toContain("useLocation");
    expect(provider).toContain("location.pathname");
    expect(provider).toContain("location.search");
    expect(provider).toContain('toast.persistent && toast.type !== "loading"');
    expect(useToast).toContain("success: 3000");
    expect(useToast).toContain("error: 6000");
  });

  it("cleans stale modal body locks after route changes", () => {
    const cleanup = read("frontend/src/components/feedback/OverlayRouteCleanup.tsx");
    const providers = read("frontend/src/app/providers.tsx");

    expect(providers).toContain("OverlayRouteCleanup");
    expect(providers).toContain("<OverlayRouteCleanup />");
    expect(cleanup).toContain("useLocation");
    expect(cleanup).toContain("location.pathname");
    expect(cleanup).toContain("location.search");
    expect(cleanup).toContain('document.body.style.pointerEvents = ""');
    expect(cleanup).toContain('document.body.style.overflow = ""');
    expect(cleanup).toContain('document.body.removeAttribute("data-scroll-locked")');
  });

  it("closes mobile sidebar on navigation even while toast viewport exists", () => {
    const mobile = read("frontend/src/components/layout/MobileSidebar.tsx");

    expect(mobile).toContain("const [open, setOpen] = useState(false)");
    expect(mobile).toContain("<Sheet open={open} onOpenChange={setOpen}>");
    expect(mobile).toContain("onNavigate={() => setOpen(false)}");
    expect(mobile).toContain("useEffect");
    expect(mobile).toContain("setOpen(false)");
    expect(mobile).toContain("location.pathname");
    expect(mobile).toContain("location.search");
  });

  it("does not use browser alert or confirm in frontend source", () => {
    const offenders = listSourceFiles(resolve(root, "frontend/src")).filter((file) => {
      const text = readFileSync(file, "utf8");
      return /\b(?:window\.)?alert\s*\(|\b(?:window\.)?confirm\s*\(/.test(text);
    });

    expect(offenders.map((file) => relative(root, file).replace(/\\/g, "/"))).toEqual([]);
  });
});
