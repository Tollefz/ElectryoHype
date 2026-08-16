"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { trackEcommerce } from "@/lib/analytics/ecommerce";

type HomeSectionPromoLinkProps = {
  href: string;
  label: string;
  promotionId?: string;
  promotionName: string;
  creativeName: string;
  className?: string;
};

/** Tiny client island for promotion select tracking. */
export function HomeSectionPromoLink({
  href,
  label,
  promotionId,
  promotionName,
  creativeName,
  className,
}: HomeSectionPromoLinkProps) {
  const onPromoSelect = () => {
    if (!promotionId) return;
    trackEcommerce("select_promotion", {
      promotion_id: promotionId,
      promotion_name: promotionName,
      creative_name: creativeName,
      creative_slot: "home_section",
    });
  };

  return (
    <Link href={href} onClick={onPromoSelect} className={className}>
      {label} <ChevronRight size={16} />
    </Link>
  );
}
