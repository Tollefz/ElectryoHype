import {
  Body,
  Button,
  Container,
  Heading,
  Hr,
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

interface AdminNewOrderEmailProps {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: EmailOrderItem[];
  total: number;
  shippingAddress: {
    name?: string;
    address?: string;
    zip?: string;
    city?: string;
  };
  orderUrl: string;
  logoUrl: string;
}

export default function AdminNewOrderEmail({
  orderNumber,
  customerName,
  customerEmail,
  customerPhone,
  items,
  total,
  shippingAddress,
  orderUrl,
  logoUrl,
}: AdminNewOrderEmailProps) {
  return (
    <Html>
      <EmailHeadStyles />
      <Preview>Ny betalt ordre {orderNumber}</Preview>
      <Body style={styles.body} className="ehx-body">
        <Container style={styles.container} className="ehx-container">
          <EmailLogoHeader logoUrl={logoUrl} />

          <Heading style={styles.h1} className="ehx-h1 ehx-pad ehx-text">
            Ny ordre
          </Heading>
          <Text style={styles.alert} className="ehx-info ehx-card">
            {orderNumber} er betalt og venter på behandling.
          </Text>

          <Section style={styles.card} className="ehx-card">
            <Heading as="h2" style={styles.h2} className="ehx-h2">
              Kunde
            </Heading>
            <Text style={styles.text} className="ehx-text">
              <strong>{customerName}</strong>
              <br />
              {customerEmail}
              <br />
              {customerPhone}
            </Text>
          </Section>

          <Section style={styles.card} className="ehx-card">
            <Heading as="h2" style={styles.h2} className="ehx-h2">
              Levering
            </Heading>
            <Text style={styles.text} className="ehx-text">
              {shippingAddress.name}
              <br />
              {shippingAddress.address}
              <br />
              {shippingAddress.zip} {shippingAddress.city}
            </Text>
          </Section>

          <Section style={styles.card} className="ehx-card">
            <Heading as="h2" style={styles.h2} className="ehx-h2">
              Produkter
            </Heading>
            <EmailProductRows items={items} />
            <Hr style={styles.hr} />
            <Text style={styles.total} className="ehx-total">
              Totalt: {total.toFixed(0)} kr
            </Text>
          </Section>

          <Section style={styles.buttonSection} className="ehx-pad">
            <Button style={styles.button} href={orderUrl}>
              Åpne ordre i admin
            </Button>
          </Section>

          <EmailFooter />
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
    fontSize: "24px",
    fontWeight: 700,
    margin: "8px 0 16px",
    padding: "0 32px",
  },
  h2: {
    color: brand.dark,
    fontSize: "13px",
    fontWeight: 700,
    margin: "0 0 12px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  text: {
    color: "#374151",
    fontSize: "14px",
    lineHeight: "22px",
    margin: "0",
  },
  alert: {
    backgroundColor: "#ecfdf5",
    border: "1px solid #a7f3d0",
    borderRadius: "10px",
    color: "#065f46",
    fontSize: "14px",
    fontWeight: 600,
    padding: "14px 16px",
    margin: "0 24px 18px",
  },
  card: {
    margin: "14px 24px",
    padding: "18px",
    backgroundColor: brand.card,
    borderRadius: "10px",
    border: `1px solid ${brand.border}`,
  },
  hr: {
    borderColor: brand.border,
    margin: "8px 0 12px",
  },
  total: {
    color: brand.dark,
    fontSize: "16px",
    fontWeight: 700,
    margin: "0",
  },
  buttonSection: {
    padding: "8px 24px 0",
  },
  button: {
    backgroundColor: brand.green,
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "none",
    textAlign: "center" as const,
    display: "block",
    padding: "14px 24px",
  },
};
