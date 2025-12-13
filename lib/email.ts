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
 * Updates email status in database (SENT/FAILED)
 * Returns success status - does not throw on failure (for webhook safety)
 */
export async function sendOrderConfirmation(orderId: string): Promise<{ success: boolean; error?: string }> {
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
      const errorMsg = `Order ${orderId} not found or has no customer`;
      // Update status to FAILED
      await prisma.order.update({
        where: { id: orderId },
        data: {
          customerEmailStatus: 'FAILED',
          customerEmailLastError: errorMsg.substring(0, 500), // Truncate to safe length
        },
      }).catch(() => {}); // Ignore update errors
      return { success: false, error: errorMsg };
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

    if (!order.customer.email) {
      const errorMsg = 'Customer email not found';
      await prisma.order.update({
        where: { id: orderId },
        data: {
          customerEmailStatus: 'FAILED',
          customerEmailLastError: errorMsg.substring(0, 500),
        },
      }).catch(() => {});
      return { success: false, error: errorMsg };
    }

    if (isTestMode || !resend) {
      console.log('📧 [TEST MODE] Ordre-bekreftelse ville blitt sendt til:', order.customer.email);
      console.log('📧 E-post data:', JSON.stringify(emailData, null, 2));
      // In test mode, mark as sent
      await prisma.order.update({
        where: { id: orderId },
        data: {
          customerEmailStatus: 'SENT',
          customerEmailSentAt: new Date(),
        },
      }).catch(() => {});
      return { success: true };
    }

    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'ElectroHypeX <noreply@electrohypex.com>',
        to: order.customer.email,
        subject: `Ordrebekreftelse ${order.orderNumber}`,
        react: OrderConfirmationEmail(emailData),
      });

      if (error) {
        const errorMsg = error.message || 'Unknown email error';
        console.error('❌ Feil ved sending av ordre-bekreftelse:', errorMsg);
        // Update status to FAILED
        await prisma.order.update({
          where: { id: orderId },
          data: {
            customerEmailStatus: 'FAILED',
            customerEmailLastError: errorMsg.substring(0, 500),
          },
        }).catch(() => {});
        return { success: false, error: errorMsg };
      }

      // Update status to SENT
      await prisma.order.update({
        where: { id: orderId },
        data: {
          customerEmailStatus: 'SENT',
          customerEmailSentAt: new Date(),
          customerEmailLastError: null, // Clear any previous errors
        },
      }).catch(() => {});

      console.log('✅ Ordre-bekreftelse sendt til:', order.customer.email);
      return { success: true };
    } catch (error: any) {
      const errorMsg = error?.message || 'Unknown error sending email';
      console.error('❌ Error sending order confirmation:', errorMsg);
      // Update status to FAILED
      await prisma.order.update({
        where: { id: orderId },
        data: {
          customerEmailStatus: 'FAILED',
          customerEmailLastError: errorMsg.substring(0, 500),
        },
      }).catch(() => {});
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error';
    console.error('❌ Error in sendOrderConfirmation:', errorMsg);
    // Try to update status even if we can't find the order
    await prisma.order.update({
      where: { id: orderId },
      data: {
        customerEmailStatus: 'FAILED',
        customerEmailLastError: errorMsg.substring(0, 500),
      },
    }).catch(() => {});
    return { success: false, error: errorMsg };
  }
}

/**
 * Send ny ordre notifikasjon til admin
 * Updates adminEmailStatus in database
 * Returns success status - does not throw on failure
 */
export async function sendAdminNotification(orderId: string): Promise<{ success: boolean; error?: string }> {
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
      const errorMsg = `Order ${orderId} not found or has no customer`;
      await prisma.order.update({
        where: { id: orderId },
        data: {
          adminEmailStatus: 'FAILED',
        },
      }).catch(() => {});
      return { success: false, error: errorMsg };
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

    const baseUrl = process.env.NEXTAUTH_URL || 'https://www.electrohypex.com';
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

    if (!process.env.ADMIN_EMAIL) {
      console.warn('⚠️ ADMIN_EMAIL ikke satt - hopper over admin-notifikasjon');
      await prisma.order.update({
        where: { id: orderId },
        data: {
          adminEmailStatus: 'FAILED',
        },
      }).catch(() => {});
      return { success: false, error: 'ADMIN_EMAIL not set' };
    }

    if (isTestMode || !resend) {
      console.log('📧 [TEST MODE] Admin-notifikasjon ville blitt sendt til:', process.env.ADMIN_EMAIL);
      console.log('📧 E-post data:', JSON.stringify(emailData, null, 2));
      await prisma.order.update({
        where: { id: orderId },
        data: {
          adminEmailStatus: 'SENT',
          adminEmailSentAt: new Date(),
        },
      }).catch(() => {});
      return { success: true };
    }

    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'ElectroHypeX <noreply@electrohypex.com>',
        to: process.env.ADMIN_EMAIL,
        subject: `🎉 NY ORDRE: ${order.orderNumber} - ${order.total.toFixed(0)} kr`,
        react: AdminNewOrderEmail(emailData),
      });

      if (error) {
        const errorMsg = error.message || 'Unknown email error';
        console.error('❌ Feil ved sending av admin-notifikasjon:', errorMsg);
        await prisma.order.update({
          where: { id: orderId },
          data: {
            adminEmailStatus: 'FAILED',
          },
        }).catch(() => {});
        return { success: false, error: errorMsg };
      }

      await prisma.order.update({
        where: { id: orderId },
        data: {
          adminEmailStatus: 'SENT',
          adminEmailSentAt: new Date(),
        },
      }).catch(() => {});

      console.log('✅ Admin-notifikasjon sendt til:', process.env.ADMIN_EMAIL);
      return { success: true };
    } catch (error: any) {
      const errorMsg = error?.message || 'Unknown error';
      console.error('❌ Error sending admin notification:', errorMsg);
      await prisma.order.update({
        where: { id: orderId },
        data: {
          adminEmailStatus: 'FAILED',
        },
      }).catch(() => {});
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error';
    console.error('❌ Error in sendAdminNotification:', errorMsg);
    await prisma.order.update({
      where: { id: orderId },
      data: {
        adminEmailStatus: 'FAILED',
      },
    }).catch(() => {});
    return { success: false, error: errorMsg };
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
      from: process.env.EMAIL_FROM || 'ElectroHypeX <noreply@electrohypex.com>',
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

