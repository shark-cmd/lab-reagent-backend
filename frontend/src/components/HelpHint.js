import { useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { HelpCircle, Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small info icon that reveals a hint on hover/tap. */
export const HelpHint = ({ text, className }) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.preventDefault()}
          className={cn("inline-flex text-slate-400 hover:text-[color:var(--ls-primary)] transition-colors align-middle", className)}
          aria-label="Help"
          tabIndex={-1}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-left leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

/** A dismissible "how this works" banner shown at the top of a page. */
export const InfoBanner = ({ id, title, children, testid }) => {
  const storeKey = `ls_tip_${id}`;
  const [open, setOpen] = useState(() => localStorage.getItem(storeKey) !== "dismissed");
  if (!open) return null;
  const dismiss = () => {
    localStorage.setItem(storeKey, "dismissed");
    setOpen(false);
  };
  return (
    <div
      className="relative rounded-xl border border-[#BBD7FF] bg-[#EAF2FF] px-4 py-3 text-sm text-[#0B5CAD]"
      data-testid={testid || "info-banner"}
    >
      <div className="flex items-start gap-2 pr-6">
        <Lightbulb className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          {title && <span className="font-semibold">{title} </span>}
          <span className="text-[#215a94]">{children}</span>
        </div>
      </div>
      <button
        onClick={dismiss}
        className="absolute top-2.5 right-2.5 text-[#0B5CAD]/60 hover:text-[#0B5CAD]"
        aria-label="Dismiss tip"
        data-testid="info-banner-dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default HelpHint;
