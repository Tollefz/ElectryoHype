import {
  Column,
  Head,
  Img,
  Link,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties } from "react";
import type { EmailOrderItem } from "@/lib/email-items";
import { SITE_CONFIG } from "@/lib/site";
import { EMAIL_LOGO_CID } from "@/lib/email-branding";

export const brand = {
  green: "#00C853",
  greenDark: "#00A844",
  dark: "#111827",
  muted: "#4b5563",
  body: "#f3f4f6",
  white: "#ffffff",
  border: "#e5e7eb",
  card: "#fafafa",
  font: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
};

/** Dark-mode safe Head styles for Gmail/Apple Mail (Outlook ignores most of this). */
export function EmailHeadStyles() {
  return (
    <Head>
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
      <style>{`
        :root { color-scheme: light dark; supported-color-schemes: light dark; }
        @media only screen and (max-width: 620px) {
          .ehx-container { width: 100% !important; border-radius: 0 !important; }
          .ehx-pad { padding-left: 20px !important; padding-right: 20px !important; }
          .ehx-card { margin-left: 16px !important; margin-right: 16px !important; padding: 16px !important; }
          .ehx-h1 { font-size: 22px !important; line-height: 28px !important; }
          .ehx-product-price { display: block !important; text-align: left !important; padding-top: 6px !important; }
        }
        @media (prefers-color-scheme: dark) {
          .ehx-body { background-color: #0f172a !important; }
          .ehx-container { background-color: #111827 !important; border-color: #334155 !important; }
          .ehx-card { background-color: #1f2937 !important; border-color: #334155 !important; }
          .ehx-text, .ehx-h1, .ehx-h2, .ehx-name, .ehx-price, .ehx-total { color: #f3f4f6 !important; }
          .ehx-muted, .ehx-meta, .ehx-line { color: #9ca3af !important; }
          .ehx-info { background-color: #064e3b !important; border-color: #059669 !important; }
          .ehx-info-text, .ehx-info-title { color: #d1fae5 !important; }
          .ehx-wordmark { color: #f3f4f6 !important; }
          .ehx-wordmark-accent { color: #34d399 !important; }
        }
      `}</style>
    </Head>
  );
}

export function EmailLogoHeader({
  logoUrl = `cid:${EMAIL_LOGO_CID}`,
}: {
  logoUrl?: string;
}) {
  return (
    <Section style={headerStyles.wrap} className="ehx-pad">
      <Img
        src={logoUrl}
        alt="ElectroHypeX – norsk nettbutikk for elektronikk"
        width="200"
        height="133"
        style={headerStyles.logo}
      />
      <Text style={headerStyles.tagline} className="ehx-muted">
        Norsk nettbutikk for elektronikk
      </Text>
    </Section>
  );
}

export function EmailProductRows({ items }: { items: EmailOrderItem[] }) {
  if (!items.length) {
    return (
      <Text style={productStyles.meta} className="ehx-meta">
        Ingen produkter listet.
      </Text>
    );
  }

  return (
    <>
      {items.map((item, index) => {
        const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 1);
        const alt = item.name || "Produktbilde";
        const isLast = index === items.length - 1;

        return (
          <Row key={index} style={{ ...productStyles.row, ...(isLast ? { borderBottom: "none", marginBottom: 0, paddingBottom: 0 } : {}) }}>
            <Column style={{ width: "64px", verticalAlign: "top" }}>
              {item.image ? (
                <Img
                  src={item.image}
                  alt={alt}
                  width="56"
                  height="56"
                  style={productStyles.thumb}
                />
              ) : (
                <Section style={productStyles.thumbPlaceholder}>
                  <Text style={productStyles.placeholderText}>EHX</Text>
                </Section>
              )}
            </Column>
            <Column style={{ verticalAlign: "top", paddingLeft: "12px", paddingRight: "8px" }}>
              <Text style={productStyles.name} className="ehx-name">
                {item.productUrl ? (
                  <Link href={item.productUrl} style={productStyles.link}>
                    {item.name}
                  </Link>
                ) : (
                  item.name
                )}
              </Text>
              <Text style={productStyles.meta} className="ehx-meta">
                Antall: {item.quantity}
                {item.variantName ? ` · ${item.variantName}` : ""}
              </Text>
            </Column>
            <Column
              align="right"
              style={{ verticalAlign: "top", width: "88px" }}
              className="ehx-product-price"
            >
              <Text style={productStyles.price} className="ehx-price">
                {lineTotal.toFixed(0)} kr
              </Text>
            </Column>
          </Row>
        );
      })}
    </>
  );
}

export function EmailFooter({
  supportEmail = SITE_CONFIG.supportEmail,
  siteUrl = SITE_CONFIG.siteUrl,
}: {
  supportEmail?: string;
  siteUrl?: string;
}) {
  const org = SITE_CONFIG.orgNumber?.trim();
  const website = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <Section style={footerStyles.wrap} className="ehx-pad">
      <Text style={footerStyles.text} className="ehx-muted">
        Spørsmål om ordren? Kontakt oss på{" "}
        <Link href={`mailto:${supportEmail}`} style={footerStyles.link}>
          {supportEmail}
        </Link>
        {SITE_CONFIG.supportPhoneDisplay
          ? ` eller ${SITE_CONFIG.supportPhoneDisplay}`
          : ""}
        .
      </Text>
      <Text style={footerStyles.signoff} className="ehx-muted">
        Med vennlig hilsen
        <br />
        <strong style={{ color: brand.dark }} className="ehx-text">
          {`${SITE_CONFIG.siteName} AS`}
        </strong>
      </Text>
      <Text style={footerStyles.legal} className="ehx-muted">
        <Link href={siteUrl} style={footerStyles.link}>
          {website}
        </Link>
        {org ? ` · Org.nr. ${org}` : ""}
        {SITE_CONFIG.companyAddress ? ` · ${SITE_CONFIG.companyAddress}` : ""}
      </Text>
    </Section>
  );
}

const headerStyles: Record<string, CSSProperties> = {
  wrap: {
    padding: "28px 32px 8px",
    textAlign: "center",
  },
  logo: {
    margin: "0 auto 4px",
    display: "block",
    maxWidth: "200px",
    height: "auto",
    border: "0",
    outline: "none",
  },
  tagline: {
    color: brand.muted,
    fontSize: "12px",
    margin: "2px 0 0",
    lineHeight: "18px",
  },
};

const productStyles: Record<string, CSSProperties> = {
  row: {
    marginBottom: "14px",
    borderBottom: `1px solid ${brand.border}`,
    paddingBottom: "14px",
  },
  thumb: {
    borderRadius: "8px",
    objectFit: "cover",
    border: `1px solid ${brand.border}`,
    display: "block",
    backgroundColor: brand.white,
  },
  thumbPlaceholder: {
    width: "56px",
    height: "56px",
    borderRadius: "8px",
    backgroundColor: "#ecfdf5",
    border: `1px solid #a7f3d0`,
    textAlign: "center",
  },
  placeholderText: {
    color: brand.greenDark,
    fontSize: "11px",
    fontWeight: 700,
    margin: "18px 0 0",
    lineHeight: "16px",
    textAlign: "center",
  },
  name: {
    color: brand.dark,
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: "22px",
    margin: "0 0 4px",
  },
  link: {
    color: brand.dark,
    textDecoration: "underline",
    textDecorationColor: "#bbf7d0",
  },
  meta: {
    color: brand.muted,
    fontSize: "13px",
    lineHeight: "18px",
    margin: "0",
  },
  price: {
    color: brand.dark,
    fontSize: "15px",
    fontWeight: 600,
    margin: "0",
    whiteSpace: "nowrap",
  },
};

const footerStyles: Record<string, CSSProperties> = {
  wrap: {
    padding: "8px 32px 0",
  },
  text: {
    color: brand.muted,
    fontSize: "13px",
    lineHeight: "20px",
    margin: "28px 0 8px",
  },
  link: {
    color: brand.greenDark,
    textDecoration: "underline",
  },
  signoff: {
    color: brand.muted,
    fontSize: "14px",
    lineHeight: "22px",
    margin: "16px 0 0",
  },
  legal: {
    color: "#9ca3af",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "12px 0 0",
  },
};
