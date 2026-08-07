import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const VARIANTS = {
  ok: "bg-[#EAF7F0] text-[#1F7A4D] border border-[#BFE6D0]",
  low: "bg-[#FFF4E6] text-[#B45309] border border-[#FFD7A8]",
  expiring90: "bg-[#E8F2FF] text-[#0B5CAD] border border-[#BBD7FF]",
  expiring60: "bg-[#FFF4E6] text-[#B45309] border border-[#FFD7A8]",
  expiring30: "bg-[#FFE9E7] text-[#B42318] border border-[#FFC2BC]",
  expired: "bg-[#FFE1DE] text-[#7A1B14] border border-[#FFC2BC]",
  neutral: "bg-[#EEF2F7] text-[#334155] border border-[#D7E2EC]",
};

export const StatusBadge = ({ variant = "neutral", children, className, ...rest }) => (
  <Badge
    variant="outline"
    className={cn("font-medium rounded-md px-2 py-0.5 text-[11px]", VARIANTS[variant] || VARIANTS.neutral, className)}
    {...rest}
  >
    {children}
  </Badge>
);

export const expiryVariant = (days) => {
  if (days === null || days === undefined) return "neutral";
  if (days < 0) return "expired";
  if (days <= 30) return "expiring30";
  if (days <= 60) return "expiring60";
  if (days <= 90) return "expiring90";
  return "ok";
};
