import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
  Section,
  Hr,
  Row,
  Column,
} from '@react-email/components';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface ShippingAddress {
  name: string;
  address: string;
  zip: string;
  city: string;
}

interface OrderConfirmationEmailProps {
  orderNumber: string;
  customerName: string;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  shippingAddress: ShippingAddress;
}

export default function OrderConfirmationEmail({
  orderNumber,
  customerName,
  items,
  subtotal,
  shippingCost,
  total,
  shippingAddress,
}: OrderConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Din ordre {orderNumber} er bekreftet</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.h1}>Takk for din bestilling! 🎉</Heading>
          
          <Text style={styles.text}>Hei {customerName},</Text>
          
          <Text style={styles.text}>
            Vi har mottatt din ordre <strong>{orderNumber}</strong> og bekrefter at betalingen er mottatt.
          </Text>

          <Section style={styles.section}>
            <Heading as="h2" style={styles.h2}>Produkter</Heading>
            {items.map((item, index) => (
              <Row key={index} style={styles.productRow}>
                <Column>
                  <Text style={styles.productName}>
                    {item.quantity}x {item.name}
                  </Text>
                </Column>
                <Column align="right">
                  <Text style={styles.productPrice}>
                    {(item.price * item.quantity).toFixed(0)} kr
                  </Text>
                </Column>
              </Row>
            ))}
            
            <Hr style={styles.hr} />
            
            <Row>
              <Column><Text style={styles.text}>Subtotal:</Text></Column>
              <Column align="right">
                <Text style={styles.text}>{subtotal.toFixed(0)} kr</Text>
              </Column>
            </Row>
            
            <Row>
              <Column><Text style={styles.text}>Frakt:</Text></Column>
              <Column align="right">
                <Text style={styles.text}>
                  {shippingCost === 0 ? 'Gratis' : `${shippingCost} kr`}
                </Text>
              </Column>
            </Row>
            
            <Row>
              <Column>
                <Text style={styles.totalLabel}>Total:</Text>
              </Column>
              <Column align="right">
                <Text style={styles.totalAmount}>{total.toFixed(0)} kr</Text>
              </Column>
            </Row>
          </Section>

          <Section style={styles.section}>
            <Heading as="h2" style={styles.h2}>Leveringsadresse</Heading>
            <Text style={styles.text}>
              {shippingAddress.name}<br />
              {shippingAddress.address}<br />
              {shippingAddress.zip} {shippingAddress.city}
            </Text>
          </Section>

          <Hr style={styles.hr} />

          <Text style={styles.text}>
            Vi behandler din ordre nå og sender deg sporingsinformasjon så snart pakken er sendt.
          </Text>

          <Text style={styles.text}>
            Forventet leveringstid: 5-7 virkedager
          </Text>

          <Text style={styles.footer}>
            Med vennlig hilsen,<br />
            <strong>Electrohype</strong>
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
    marginBottom: '64px',
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
    margin: '24px 0 16px',
  },
  text: {
    color: '#4b5563',
    fontSize: '14px',
    lineHeight: '24px',
    margin: '16px 0',
    padding: '0 40px',
  },
  section: {
    padding: '0 40px',
    margin: '24px 0',
  },
  productRow: {
    marginBottom: '8px',
  },
  productName: {
    color: '#1f2937',
    fontSize: '14px',
    margin: '4px 0',
  },
  productPrice: {
    color: '#1f2937',
    fontSize: '14px',
    margin: '4px 0',
  },
  hr: {
    borderColor: '#e5e7eb',
    margin: '16px 0',
  },
  totalLabel: {
    color: '#1f2937',
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '8px 0',
  },
  totalAmount: {
    color: '#1f2937',
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '8px 0',
  },
  footer: {
    color: '#6b7280',
    fontSize: '14px',
    lineHeight: '24px',
    margin: '32px 0 0',
    padding: '0 40px',
  },
};

