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
  Hr,
} from '@react-email/components';

interface AdminNewOrderEmailProps {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: any[];
  total: number;
  shippingAddress: any;
  orderUrl: string;
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
}: AdminNewOrderEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Ny ordre mottatt: {orderNumber}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.h1}>🎉 NY ORDRE MOTTATT!</Heading>
          
          <Text style={styles.alert}>
            Ordre {orderNumber} er betalt og venter på behandling.
          </Text>

          <Section style={styles.section}>
            <Heading as="h2" style={styles.h2}>Kundeinformasjon</Heading>
            <Text style={styles.text}>
              <strong>Navn:</strong> {customerName}<br />
              <strong>E-post:</strong> {customerEmail}<br />
              <strong>Telefon:</strong> {customerPhone}
            </Text>
          </Section>

          <Section style={styles.section}>
            <Heading as="h2" style={styles.h2}>Leveringsadresse</Heading>
            <Text style={styles.text}>
              {shippingAddress.name}<br />
              {shippingAddress.address}<br />
              {shippingAddress.zip} {shippingAddress.city}
            </Text>
          </Section>

          <Section style={styles.section}>
            <Heading as="h2" style={styles.h2}>Produkter</Heading>
            {items.map((item: any, index: number) => (
              <Text key={index} style={styles.productText}>
                • {item.quantity}x {item.name} - {item.price} kr
              </Text>
            ))}
            <Hr style={styles.hr} />
            <Text style={styles.totalText}>
              <strong>Total: {total.toFixed(0)} kr</strong>
            </Text>
          </Section>

          <Section style={styles.buttonSection}>
            <Button style={styles.button} href={orderUrl}>
              Se ordre i admin panel
            </Button>
          </Section>

          <Text style={styles.footer}>
            Logg inn i admin panelet for å behandle ordren og bestille fra leverandør.
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
  h2: {
    color: '#1f2937',
    fontSize: '18px',
    fontWeight: '600',
    margin: '20px 0 12px',
  },
  text: {
    color: '#4b5563',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '8px 0',
  },
  alert: {
    backgroundColor: '#fef3c7',
    border: '1px solid #fbbf24',
    borderRadius: '8px',
    color: '#92400e',
    fontSize: '14px',
    fontWeight: '600',
    padding: '16px',
    margin: '0 40px 24px',
  },
  section: {
    padding: '0 40px',
    margin: '24px 0',
  },
  productText: {
    color: '#1f2937',
    fontSize: '14px',
    margin: '4px 0',
  },
  hr: {
    borderColor: '#e5e7eb',
    margin: '16px 0',
  },
  totalText: {
    color: '#1f2937',
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '8px 0',
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
    fontSize: '12px',
    lineHeight: '20px',
    margin: '24px 0 0',
    padding: '0 40px',
  },
};

