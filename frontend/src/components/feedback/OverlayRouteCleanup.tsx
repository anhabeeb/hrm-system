import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const clearStaleBodyLocks = () => {
  document.body.style.pointerEvents = "";
  document.body.style.overflow = "";
  document.documentElement.style.pointerEvents = "";
  document.documentElement.style.overflow = "";
  document.body.removeAttribute("data-scroll-locked");
};

export const OverlayRouteCleanup = () => {
  const location = useLocation();

  useEffect(() => {
    const timer = window.setTimeout(clearStaleBodyLocks, 0);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search]);

  return null;
};
