import {
  Body,
  Container,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Row,
  Column,
  Link,
} from "@react-email/components";
import type { EmailOrderItem } from "@/lib/email-items";
import { SITE_CONFIG } from "@/lib/site";
import {
  EmailFooter,
  EmailHeadStyles,
  EmailLogoHeader,
  EmailProductRows,
  brand,
} from "./shared";

interface ShippingAddress {
  name: string;
  address: string;
  zip: string;
  city: string;
}

interface OrderConfirmationEmailProps {
  orderNumber: string;
  customerName: string;
  items: EmailOrderItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  shippingAddress: ShippingAddress;
  logoUrl: string;
  siteUrl?: string;
}

export default function OrderConfirmationEmail({
  orderNumber,
  customerName,
  items,
  subtotal,
  shippingCost,
  total,
  shippingAddress,
  logoUrl,
  siteUrl = SITE_CONFIG.siteUrl,
}: OrderConfirmationEmailProps) {
  return (
    <Html>
      <EmailHeadStyles />
      <Preview>Ordrebekreftelse {orderNumber} – takk for handelen</Preview>
      <Body style={styles.body} className="ehx-body">
        <Container style={styles.container} className="ehx-container">
          <EmailLogoHeader logoUrl={logoUrl} />

          <Heading style={styles.h1} className="ehx-h1 ehx-pad ehx-text">
            Takk for bestillingen
          </Heading>

          <Text style={styles.text} className="ehx-pad ehx-text">
            Hei {customerName},
          </Text>
          <Text style={styles.text} className="ehx-pad ehx-text">
            Vi har mottatt betalingen for ordre <strong>{orderNumber}</strong>. Du får
            sporingsinformasjon når pakken er sendt.
          </Text>

          <Section style={styles.card} className="ehx-card">
            <Heading as="h2" style={styles.h2} className="ehx-h2">
              Dine produkter
            </Heading>
            <EmailProductRows items={items} />

            <Hr style={styles.hr} />

            <Row>
              <Column>
                <Text style={styles.lineLabel} className="ehx-line">
                  Delsum
                </Text>
              </Column>
              <Column align="right">
                <Text style={styles.lineValue} className="ehx-text">
                  {subtotal.toFixed(0)} kr
                </Text>
              </Column>
            </Row>
            <Row>
              <Column>
                <Text style={styles.lineLabel} className="ehx-line">
                  Frakt
                </Text>
              </Column>
              <Column align="right">
                <Text style={styles.lineValue} className="ehx-text">
                  {shippingCost === 0 ? "Gratis" : `${shippingCost.toFixed(0)} kr`}
                </Text>
              </Column>
            </Row>
            <Row>
              <Column>
                <Text style={styles.totalLabel} className="ehx-total">
                  Totalt inkl. MVA
                </Text>
              </Column>
              <Column align="right">
                <Text style={styles.totalValue}>{total.toFixed(0)} kr</Text>
              </Column>
            </Row>
          </Section>

          <Section style={styles.card} className="ehx-card">
            <Heading as="h2" style={styles.h2} className="ehx-h2">
              Leveringsadresse
            </Heading>
            <Text style={styles.address} className="ehx-text">
              {shippingAddress.name}
              <br />
              {shippingAddress.address}
              <br />
              {shippingAddress.zip} {shippingAddress.city}
            </Text>
          </Section>

          <Section style={styles.infoBox} className="ehx-info ehx-card">
            <Text style={styles.infoTitle} className="ehx-info-title">
              Levering
            </Text>
            <Text style={styles.infoText} className="ehx-info-text">
              {SITE_CONFIG.deliveryPromise}. Vi behandler ordren manuelt og sender
              sporingsnummer så snart pakken er på vei.
            </Text>
            <Text style={styles.infoText} className="ehx-info-text">
              <Link href={`${siteUrl}/vilkar`} style={styles.link}>
                Vilkår
              </Link>
              {" · "}
              <Link href={`${siteUrl}/retur`} style={styles.link}>
                Retur
              </Link>
            </Text>
          </Section>

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
  hr: {
    borderColor: brand.border,
    margin: "8px 0 14px",
  },
  lineLabel: {
    color: brand.muted,
    fontSize: "14px",
    margin: "4px 0",
  },
  lineValue: {
    color: brand.dark,
    fontSize: "14px",
    margin: "4px 0",
  },
  totalLabel: {
    color: brand.dark,
    fontSize: "16px",
    fontWeight: 700,
    margin: "12px 0 0",
  },
  totalValue: {
    color: brand.greenDark,
    fontSize: "18px",
    fontWeight: 700,
    margin: "12px 0 0",
  },
  address: {
    color: "#374151",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0",
  },
  infoBox: {
    margin: "8px 24px 0",
    padding: "16px 18px",
    backgroundColor: "#ecfdf5",
    borderRadius: "10px",
    border: "1px solid #a7f3d0",
  },
  infoTitle: {
    color: brand.greenDark,
    fontSize: "12px",
    fontWeight: 700,
    margin: "0 0 6px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  infoText: {
    color: "#065f46",
    fontSize: "14px",
    lineHeight: "20px",
    margin: "0 0 8px",
  },
  link: {
    color: brand.greenDark,
    textDecoration: "underline",
  },
};
