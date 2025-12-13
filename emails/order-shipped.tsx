import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
  Section,
  Button,
} from '@react-email/components';

interface OrderShippedEmailProps {
  orderNumber: string;
  customerName: string;
  trackingNumber?: string;
  trackingUrl?: string;
  items?: Array<{ name: string; quantity: number }>;
  isDropship?: boolean;
}

export default function OrderShippedEmail({
  orderNumber,
  customerName,
  trackingNumber,
  trackingUrl,
  items = [],
  isDropship = true,
}: OrderShippedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Din pakke er sendt! 📦</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.h1}>Din pakke er sendt! 📦</Heading>
          
          <Text style={styles.text}>Hei {customerName},</Text>
          
          <Text style={styles.text}>
            Gode nyheter! Din ordre <strong>{orderNumber}</strong> er nå sendt og er på vei til deg.
          </Text>

          {items.length > 0 && (
            <Section style={styles.itemsSection}>
              <Text style={styles.trackingLabel}>Produkter:</Text>
              {items.map((item, idx) => (
                <Text key={idx} style={styles.itemLine}>
                  • {item.name} × {item.quantity}
                </Text>
              ))}
            </Section>
          )}

          {(trackingNumber || trackingUrl) && (
            <Section style={styles.trackingSection}>
              {trackingNumber && (
                <>
                  <Text style={styles.trackingLabel}>Sporingsnummer:</Text>
                  <Text style={styles.trackingNumber}>{trackingNumber}</Text>
                </>
              )}

              {trackingUrl && (
                <Section style={styles.buttonSection}>
                  <Button style={styles.button} href={trackingUrl}>
                    Spor pakken din
                  </Button>
                </Section>
              )}
            </Section>
          )}

          <Text style={styles.text}>
            Forventet leveringstid: 2-5 virkedager.
            {isDropship
              ? " Varene sendes direkte fra vår leverandør (dropshipping)."
              : ""}
          </Text>

          <Text style={styles.footer}>
            Med vennlig hilsen,<br />
            <strong>ElectroHypeX</strong>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
  },
  container: {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '20px 0 48px',
    maxWidth: '600px',
  },
  h1: {
    color: '#1f2937',
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '40px 0',
    padding: '0 40px',
  },
  text: {
    color: '#4b5563',
    fontSize: '14px',
    lineHeight: '24px',
    margin: '16px 0',
    padding: '0 40px',
  },
  trackingSection: {
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    padding: '24px',
    margin: '24px 40px',
    textAlign: 'center' as const,
  },
  itemsSection: {
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    padding: '16px 24px',
    margin: '16px 40px',
  },
  trackingLabel: {
    color: '#6b7280',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    margin: '0 0 8px',
  },
  itemLine: {
    color: '#1f2937',
    fontSize: '14px',
    margin: '4px 0',
  },
  trackingNumber: {
    color: '#1f2937',
    fontSize: '18px',
    fontWeight: 'bold',
    fontFamily: 'monospace',
    margin: '0',
  },
  buttonSection: {
    padding: '0 40px',
    margin: '32px 0',
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'block',
    padding: '12px 24px',
  },
  footer: {
    color: '#6b7280',
    fontSize: '14px',
    lineHeight: '24px',
    margin: '32px 0 0',
    padding: '0 40px',
  },
};

