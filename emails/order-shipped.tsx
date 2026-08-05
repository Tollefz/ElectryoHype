import {
  Body,
  Button,
  Container,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { EmailOrderItem } from "@/lib/email-items";
import {
  EmailFooter,
  EmailHeadStyles,
  EmailLogoHeader,
  EmailProductRows,
  brand,
} from "./shared";

interface OrderShippedEmailProps {
  orderNumber: string;
  customerName: string;
  trackingNumber?: string;
  trackingUrl?: string;
  items?: EmailOrderItem[];
  isDropship?: boolean;
  logoUrl: string;
  siteUrl?: string;
}

export default function OrderShippedEmail({
  orderNumber,
  customerName,
  trackingNumber,
  trackingUrl,
  items = [],
  isDropship = true,
  logoUrl,
  siteUrl,
}: OrderShippedEmailProps) {
  return (
    <Html>
      <EmailHeadStyles />
      <Preview>Ordre {orderNumber} er sendt</Preview>
      <Body style={styles.body} className="ehx-body">
        <Container style={styles.container} className="ehx-container">
          <EmailLogoHeader logoUrl={logoUrl} />

          <Heading style={styles.h1} className="ehx-h1 ehx-pad ehx-text">
            Pakken er på vei
          </Heading>

          <Text style={styles.text} className="ehx-pad ehx-text">
            Hei {customerName},
          </Text>
          <Text style={styles.text} className="ehx-pad ehx-text">
            Ordre <strong>{orderNumber}</strong> er sendt
            {isDropship ? " fra vår leverandør" : ""}. Forventet levering er vanligvis
            2–5 virkedager.
          </Text>

          {items.length > 0 && (
            <Section style={styles.card} className="ehx-card">
              <Heading as="h2" style={styles.h2} className="ehx-h2">
                Innhold
              </Heading>
              <EmailProductRows items={items} />
            </Section>
          )}

          {(trackingNumber || trackingUrl) && (
            <Section style={styles.tracking} className="ehx-info ehx-card">
              {trackingNumber && (
                <>
                  <Text style={styles.trackingLabel} className="ehx-info-title">
                    Sporingsnummer
                  </Text>
                  <Text style={styles.trackingNumber} className="ehx-text">
                    {trackingNumber}
                  </Text>
                </>
              )}
              {trackingUrl && (
                <Section style={{ marginTop: "16px" }}>
                  <Button style={styles.button} href={trackingUrl}>
                    Spor pakken
                  </Button>
                </Section>
              )}
            </Section>
          )}

          <EmailFooter siteUrl={siteUrl} />
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: brand.body,
    fontFamily: brand.font,
    margin: "0",
    padding: "24px 0",
  },
  container: {
    backgroundColor: brand.white,
    margin: "0 auto",
    padding: "0 0 36px",
    maxWidth: "600px",
    borderRadius: "12px",
    border: `1px solid ${brand.border}`,
  },
  h1: {
    color: brand.dark,
    fontSize: "26px",
    fontWeight: 700,
    margin: "8px 0 16px",
    padding: "0 32px",
    letterSpacing: "-0.02em",
    lineHeight: "32px",
  },
  h2: {
    color: brand.dark,
    fontSize: "13px",
    fontWeight: 700,
    margin: "0 0 14px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  text: {
    color: "#374151",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 12px",
    padding: "0 32px",
  },
  card: {
    margin: "18px 24px",
    padding: "18px",
    backgroundColor: brand.card,
    borderRadius: "10px",
    border: `1px solid ${brand.border}`,
  },
  tracking: {
    backgroundColor: "#ecfdf5",
    borderRadius: "10px",
    border: "1px solid #a7f3d0",
    padding: "22px",
    margin: "8px 24px 0",
    textAlign: "center" as const,
  },
  trackingLabel: {
    color: brand.muted,
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    margin: "0 0 8px",
  },
  trackingNumber: {
    color: brand.dark,
    fontSize: "18px",
    fontWeight: 700,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    margin: "0",
  },
  button: {
    backgroundColor: brand.green,
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "none",
    textAlign: "center" as const,
    display: "inline-block",
    padding: "12px 24px",
  },
};
