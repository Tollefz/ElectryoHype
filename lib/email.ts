import { Resend } from 'resend';
import { prisma } from './prisma';
import OrderConfirmationEmail from '@/emails/order-confirmation';
import AdminNewOrderEmail from '@/emails/admin-new-order';
import OrderShippedEmail from '@/emails/order-shipped';

// Test mode hvis ingen API key
const isTestMode = !process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.trim() === '';

// Opprett Resend instance kun hvis vi har en API key
const resend = isTestMode ? null : new Resend(process.env.RESEND_API_KEY);

/**
 * Send ordre-bekreftelse til kunde
 */
export async function sendOrderConfirmation(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        customer: true,
        orderItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order || !order.customer) {
      throw new Error(`Order ${orderId} not found or has no customer`);
    }

    // Parse items og shipping address
    let items: any[] = [];
    try {
      if (typeof order.items === "string") {
        const parsed = JSON.parse(order.items);
        items = Array.isArray(parsed) ? parsed : [];
      } else if (order.items && Array.isArray(order.items)) {
        items = order.items;
      }
    } catch {
      // Hvis parsing feiler, bruk orderItems hvis de finnes
      if (order.orderItems && order.orderItems.length > 0) {
        items = (order.orderItems as any[]).map((item: any) => ({
          name: item.product?.name || item.name || 'Ukjent produkt',
          quantity: item.quantity || 1,
          price: item.price || 0,
        }));
      }
    }

    let shippingAddress: any = {};
    try {
      if (typeof order.shippingAddress === "string") {
        shippingAddress = JSON.parse(order.shippingAddress);
      } else if (order.shippingAddress) {
        shippingAddress = order.shippingAddress;
      }
    } catch {
      shippingAddress = {
        name: order.customer.name || '',
        address: '',
        zip: '',
        city: '',
      };
    }

    const emailData = {
      orderNumber: order.orderNumber,
      customerName: order.customer.name || 'Kunde',
      items: items.map((item: any) => ({
        name: item.name || 'Ukjent produkt',
        quantity: item.quantity || 1,
        price: Number(item.price) || 0,
      })),
      subtotal: Number(order.subtotal) || 0,
      shippingCost: Number(order.shippingCost) || 0,
      total: Number(order.total) || 0,
      shippingAddress: {
        name: shippingAddress.name || order.customer.name || '',
        address: shippingAddress.address || shippingAddress.addressLine1 || '',
        zip: shippingAddress.zip || shippingAddress.zipCode || '',
        city: shippingAddress.city || '',
      },
    };

    if (isTestMode || !resend) {
      console.log('📧 [TEST MODE] Ordre-bekreftelse ville blitt sendt til:', order.customer.email);
      console.log('📧 E-post data:', JSON.stringify(emailData, null, 2));
      return { success: true, mode: 'test' };
    }

    if (!order.customer.email) {
      throw new Error('Customer email not found');
    }

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Electrohype <noreply@dinbutikk.no>',
      to: order.customer.email,
      subject: `Ordrebekreftelse ${order.orderNumber}`,
      react: OrderConfirmationEmail(emailData),
    });

    if (error) {
      console.error('❌ Feil ved sending av ordre-bekreftelse:', error);
      throw error;
    }

    console.log('✅ Ordre-bekreftelse sendt til:', order.customer.email);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Error sending order confirmation:', error);
    throw error;
  }
}

/**
 * Send ny ordre notifikasjon til admin
 */
export async function sendAdminNotification(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        customer: true,
        orderItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order || !order.customer) {
      throw new Error(`Order ${orderId} not found or has no customer`);
    }

    // Parse items og shipping address
    let items: any[] = [];
    try {
      if (typeof order.items === "string") {
        const parsed = JSON.parse(order.items);
        items = Array.isArray(parsed) ? parsed : [];
      } else if (order.items && Array.isArray(order.items)) {
        items = order.items;
      }
    } catch {
      // Hvis parsing feiler, bruk orderItems hvis de finnes
      if (order.orderItems && (order.orderItems as any[]).length > 0) {
        items = (order.orderItems as any[]).map((item: any) => ({
          name: item.product?.name || item.name || 'Ukjent produkt',
          quantity: item.quantity || 1,
          price: item.price || 0,
        }));
      }
    }

    let shippingAddress: any = {};
    try {
      if (typeof order.shippingAddress === "string") {
        shippingAddress = JSON.parse(order.shippingAddress);
      } else if (order.shippingAddress) {
        shippingAddress = order.shippingAddress;
      }
    } catch {
      shippingAddress = {
        name: order.customer.name || '',
        address: '',
        zip: '',
        city: '',
      };
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const orderUrl = `${baseUrl}/admin/orders/${order.id}`;

    const emailData = {
      orderNumber: order.orderNumber,
      customerName: order.customer.name || 'Ukjent',
      customerEmail: order.customer.email || 'Ikke oppgitt',
      customerPhone: order.customer.phone || 'Ikke oppgitt',
      items: items.map((item: any) => ({
        name: item.name || 'Ukjent produkt',
        quantity: item.quantity || 1,
        price: Number(item.price) || 0,
      })),
      total: Number(order.total) || 0,
      shippingAddress: {
        name: shippingAddress.name || order.customer.name || '',
        address: shippingAddress.address || shippingAddress.addressLine1 || '',
        zip: shippingAddress.zip || shippingAddress.zipCode || '',
        city: shippingAddress.city || '',
      },
      orderUrl,
    };

    if (isTestMode || !resend) {
      console.log('📧 [TEST MODE] Admin-notifikasjon ville blitt sendt til:', process.env.ADMIN_EMAIL);
      console.log('📧 E-post data:', JSON.stringify(emailData, null, 2));
      return { success: true, mode: 'test' };
    }

    if (!process.env.ADMIN_EMAIL) {
      console.warn('⚠️ ADMIN_EMAIL ikke satt - hopper over admin-notifikasjon');
      return { success: false, reason: 'ADMIN_EMAIL not set' };
    }

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'System <system@dinbutikk.no>',
      to: process.env.ADMIN_EMAIL,
      subject: `🎉 NY ORDRE: ${order.orderNumber} - ${order.total.toFixed(0)} kr`,
      react: AdminNewOrderEmail(emailData),
    });

    if (error) {
      console.error('❌ Feil ved sending av admin-notifikasjon:', error);
      throw error;
    }

    console.log('✅ Admin-notifikasjon sendt til:', process.env.ADMIN_EMAIL);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Error sending admin notification:', error);
    throw error;
  }
}

/**
 * Send forsendelse-notifikasjon til kunde
 */
export async function sendShippingNotification(
  orderId: string,
  trackingNumber?: string,
  trackingUrl?: string
) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        customer: true,
        orderItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order || !order.customer) {
      throw new Error(`Order ${orderId} not found or has no customer`);
    }

    const emailData = {
      orderNumber: order.orderNumber,
      customerName: order.customer.name || 'Kunde',
      trackingNumber: trackingNumber || 'Ikke tilgjengelig',
      trackingUrl: trackingUrl || '',
      items: order.orderItems.map((item: any) => ({
        name: item.product?.name || item.variantName || 'Produkt',
        quantity: item.quantity || 1,
      })),
      isDropship: true,
    };

    if (isTestMode || !resend) {
      console.log('📧 [TEST MODE] Forsendelse-notifikasjon ville blitt sendt til:', order.customer.email);
      console.log('📧 E-post data:', JSON.stringify(emailData, null, 2));
      return { success: true, mode: 'test' };
    }

    if (!order.customer.email) {
      throw new Error('Customer email not found');
    }

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Electrohype <noreply@dinbutikk.no>',
      to: order.customer.email,
      subject: `Din pakke er sendt! 📦 - ${order.orderNumber}`,
      react: OrderShippedEmail(emailData),
    });

    if (error) {
      console.error('❌ Feil ved sending av forsendelse-notifikasjon:', error);
      throw error;
    }

    console.log('✅ Forsendelse-notifikasjon sendt til:', order.customer.email);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Error sending shipping notification:', error);
    throw error;
  }
}

