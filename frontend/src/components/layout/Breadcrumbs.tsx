import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const titleize = (segment: string) =>
  segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const Breadcrumbs = () => {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link to="/dashboard" className="inline-flex items-center gap-1 hover:text-foreground">
        <Home className="h-3.5 w-3.5" />
        Dashboard
      </Link>
      {segments[0] && segments[0] !== "dashboard" ? (
        <>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{titleize(segments[0])}</span>
        </>
      ) : null}
    </nav>
  );
};
