import { Resend } from 'resend';
import { render } from '@react-email/render';
import { prisma } from './prisma';
import OrderConfirmationEmail from '@/emails/order-confirmation';
import AdminNewOrderEmail from '@/emails/admin-new-order';
import OrderShippedEmail from '@/emails/order-shipped';
import { normalizeOrderLineItems } from '@/lib/email-items';
import { SITE_CONFIG } from '@/lib/site';
import { resolveEmailLogoSrc } from '@/lib/email-branding';
import { getEmailLogoAttachment } from '@/lib/email-logo.server';

type ShippingAddressFields = {
  name?: string;
  address?: string;
  addressLine1?: string;
  zip?: string;
  zipCode?: string;
  city?: string;
};

function getResendApiKey(): string {
  return (process.env.RESEND_API_KEY || '').trim();
}

export function getEmailEnvStatus() {
  const key = getResendApiKey();
  return {
    apiKeyDetected: key.length > 0,
    emailFrom: process.env.EMAIL_FROM?.trim() || 'ElectroHypeX <noreply@vitamiro.com>',
    adminEmailSet: Boolean(process.env.ADMIN_EMAIL?.trim()),
    adminEmail: process.env.ADMIN_EMAIL?.trim() || null,
  };
}

/** Lazy client so a restarted process with a newly set key is picked up correctly. */
function getResendClient(): Resend | null {
  const key = getResendApiKey();
  if (!key) return null;
  return new Resend(key);
}

function logEmailAttempt(opts: {
  kind: string;
  orderId?: string;
  to?: string | null;
  from?: string;
  apiKeyDetected: boolean;
  resendId?: string | null;
  error?: string | null;
  finalStatus?: string;
}) {
  console.log('[email]', JSON.stringify({
    kind: opts.kind,
    orderId: opts.orderId,
    apiKeyDetected: opts.apiKeyDetected ? 'yes' : 'no',
    from: opts.from,
    to: opts.to,
    resendId: opts.resendId ?? null,
    error: opts.error ?? null,
    finalStatus: opts.finalStatus ?? null,
  }));
}

const MISSING_KEY_HINT =
  'RESEND_API_KEY mangler i .env — e-post ble ikke sendt. Legg til nøkkelen i prosjektets .env (ikke .env.example) og restart Next.js.';

/**
 * Send ordre-bekreftelse til kunde.
 * Sets customerEmailStatus to SENT only after a successful Resend response.
 */
export async function sendOrderConfirmation(orderId: string): Promise<{ success: boolean; error?: string }> {
  const env = getEmailEnvStatus();
  const from = env.emailFrom;

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
      logEmailAttempt({
        kind: 'order_confirmation',
        orderId,
        apiKeyDetected: env.apiKeyDetected,
        from,
        error: errorMsg,
        finalStatus: 'FAILED',
      });
      await prisma.order.update({
        where: { id: orderId },
        data: {
          customerEmailStatus: 'FAILED',
          customerEmailLastError: errorMsg.substring(0, 500),
        },
      }).catch(() => {});
      return { success: false, error: errorMsg };
    }

    const items = normalizeOrderLineItems({
      itemsJson: order.items,
      orderItems: order.orderItems,
      forCustomerEmail: true,
    });

    let shippingAddress: ShippingAddressFields = {};
    try {
      if (typeof order.shippingAddress === 'string') {
        shippingAddress = JSON.parse(order.shippingAddress) as ShippingAddressFields;
      } else if (order.shippingAddress) {
        shippingAddress = order.shippingAddress as ShippingAddressFields;
      }
    } catch {
      shippingAddress = {
        name: order.customer.name || '',
        address: '',
        zip: '',
        city: '',
      };
    }

    const logoAttachment = getEmailLogoAttachment();
    const emailData = {
      orderNumber: order.orderNumber,
      customerName: order.customer.name || 'Kunde',
      items,
      subtotal: Number(order.subtotal) || 0,
      shippingCost: Number(order.shippingCost) || 0,
      total: Number(order.total) || 0,
      shippingAddress: {
        name: shippingAddress.name || order.customer.name || '',
        address: shippingAddress.address || shippingAddress.addressLine1 || '',
        zip: shippingAddress.zip || shippingAddress.zipCode || '',
        city: shippingAddress.city || '',
      },
      logoUrl: resolveEmailLogoSrc(Boolean(logoAttachment)),
      siteUrl: SITE_CONFIG.siteUrl,
    };

    const recipient = order.customer.email;

    if (!recipient) {
      const errorMsg = 'Customer email not found';
      logEmailAttempt({
        kind: 'order_confirmation',
        orderId,
        apiKeyDetected: env.apiKeyDetected,
        from,
        to: null,
        error: errorMsg,
        finalStatus: 'FAILED',
      });
      await prisma.order.update({
        where: { id: orderId },
        data: {
          customerEmailStatus: 'FAILED',
          customerEmailLastError: errorMsg.substring(0, 500),
        },
      }).catch(() => {});
      return { success: false, error: errorMsg };
    }

    const { composeMessage, getStoreDefaultLocale } = await import(
      '@/lib/communication'
    );
    const shipCountry =
      typeof (shippingAddress as { country?: string }).country === 'string'
        ? (shippingAddress as { country?: string }).country
        : null;
    const composed = composeMessage({
      messageType: 'order_confirmation',
      customerLocale: (order.customer as { locale?: string | null }).locale,
      countryCode: shipCountry,
      storeDefaultLocale: getStoreDefaultLocale(),
      vars: {
        storeName: SITE_CONFIG.siteName,
        customerName: order.customer.name || 'there',
        orderNumber: order.orderNumber,
        totalFormatted: `${Math.round(Number(order.total) || 0)} NOK`,
      },
    });
    const subject = composed.message.subject;

    const resend = getResendClient();
    if (!resend) {
      const errorMsg = MISSING_KEY_HINT;
      logEmailAttempt({
        kind: 'order_confirmation',
        orderId,
        apiKeyDetected: false,
        from,
        to: recipient,
        error: errorMsg,
        finalStatus: 'FAILED',
      });
      await prisma.order.update({
        where: { id: orderId },
        data: {
          customerEmailStatus: 'FAILED',
          customerEmailLastError: errorMsg.substring(0, 500),
        },
      }).catch(() => {});
      return { success: false, error: errorMsg };
    }

    try {
      const html = await render(OrderConfirmationEmail(emailData));
      const { data, error } = await resend.emails.send({
        from,
        to: recipient,
        subject,
        html,
        attachments: logoAttachment
          ? [
              {
                filename: logoAttachment.filename,
                content: logoAttachment.content,
                contentId: logoAttachment.contentId,
                contentType: logoAttachment.contentType,
              },
            ]
          : undefined,
      });

      if (error) {
        const errorMsg = error.message || 'Unknown email error';
        logEmailAttempt({
          kind: 'order_confirmation',
          orderId,
          apiKeyDetected: true,
          from,
          to: recipient,
          resendId: null,
          error: errorMsg,
          finalStatus: 'FAILED',
        });
        await prisma.order.update({
          where: { id: orderId },
          data: {
            customerEmailStatus: 'FAILED',
            customerEmailLastError: errorMsg.substring(0, 500),
          },
        }).catch(() => {});
        return { success: false, error: errorMsg };
      }

      await prisma.order.update({
        where: { id: orderId },
        data: {
          customerEmailStatus: 'SENT',
          customerEmailSentAt: new Date(),
          customerEmailLastError: null,
        },
      }).catch(() => {});

      logEmailAttempt({
        kind: 'order_confirmation',
        orderId,
        apiKeyDetected: true,
        from,
        to: recipient,
        resendId: data.id,
        error: null,
        finalStatus: 'SENT',
      });
      return { success: true };
    } catch (error: unknown) {
      const errorMsg =
        error instanceof Error ? error.message : 'Unknown error sending email';
      logEmailAttempt({
        kind: 'order_confirmation',
        orderId,
        apiKeyDetected: true,
        from,
        to: recipient,
        error: errorMsg,
        finalStatus: 'FAILED',
      });
      await prisma.order.update({
        where: { id: orderId },
        data: {
          customerEmailStatus: 'FAILED',
          customerEmailLastError: errorMsg.substring(0, 500),
        },
      }).catch(() => {});
      return { success: false, error: errorMsg };
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logEmailAttempt({
      kind: 'order_confirmation',
      orderId,
      apiKeyDetected: env.apiKeyDetected,
      from,
      error: errorMsg,
      finalStatus: 'FAILED',
    });
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
 * Send ny ordre notifikasjon til admin.
 */
export async function sendAdminNotification(orderId: string): Promise<{ success: boolean; error?: string }> {
  const env = getEmailEnvStatus();
  const from = env.emailFrom;

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
        data: { adminEmailStatus: 'FAILED' },
      }).catch(() => {});
      return { success: false, error: errorMsg };
    }

    const items = normalizeOrderLineItems({
      itemsJson: order.items,
      orderItems: order.orderItems,
    });

    let shippingAddress: ShippingAddressFields = {};
    try {
      if (typeof order.shippingAddress === 'string') {
        shippingAddress = JSON.parse(order.shippingAddress) as ShippingAddressFields;
      } else if (order.shippingAddress) {
        shippingAddress = order.shippingAddress as ShippingAddressFields;
      }
    } catch {
      shippingAddress = {
        name: order.customer.name || '',
        address: '',
        zip: '',
        city: '',
      };
    }

    const baseUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXTAUTH_URL ||
      SITE_CONFIG.siteUrl
    ).replace(/\/$/, '');
    const orderUrl = `${baseUrl}/admin/orders/${order.id}`;

    const logoAttachment = getEmailLogoAttachment();
    const emailData = {
      orderNumber: order.orderNumber,
      customerName: order.customer.name || 'Kunde',
      customerEmail: order.customer.email || 'Ikke oppgitt',
      customerPhone: order.customer.phone || 'Ikke oppgitt',
      items,
      total: Number(order.total) || 0,
      shippingAddress: {
        name: shippingAddress.name || order.customer.name || '',
        address: shippingAddress.address || shippingAddress.addressLine1 || '',
        zip: shippingAddress.zip || shippingAddress.zipCode || '',
        city: shippingAddress.city || '',
      },
      orderUrl,
      logoUrl: resolveEmailLogoSrc(Boolean(logoAttachment)),
    };

    if (!env.adminEmail) {
      console.warn('⚠️ ADMIN_EMAIL ikke satt - hopper over admin-notifikasjon');
      logEmailAttempt({
        kind: 'admin_notification',
        orderId,
        apiKeyDetected: env.apiKeyDetected,
        from,
        error: 'ADMIN_EMAIL not set',
        finalStatus: 'FAILED',
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { adminEmailStatus: 'FAILED' },
      }).catch(() => {});
      return { success: false, error: 'ADMIN_EMAIL not set — add ADMIN_EMAIL to .env and restart Next.js' };
    }

    const resend = getResendClient();
    if (!resend) {
      const errorMsg = 'RESEND_API_KEY mangler i .env — admin-e-post ble ikke sendt. Restart Next.js etter å ha lagt til nøkkelen.';
      logEmailAttempt({
        kind: 'admin_notification',
        orderId,
        apiKeyDetected: false,
        from,
        to: env.adminEmail,
        error: errorMsg,
        finalStatus: 'FAILED',
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { adminEmailStatus: 'FAILED' },
      }).catch(() => {});
      return { success: false, error: errorMsg };
    }

    try {
      const html = await render(AdminNewOrderEmail(emailData));
      const { data, error } = await resend.emails.send({
        from,
        to: env.adminEmail,
        subject: `Ny ordre ${order.orderNumber} – ${order.total.toFixed(0)} kr`,
        html,
        attachments: logoAttachment
          ? [
              {
                filename: logoAttachment.filename,
                content: logoAttachment.content,
                contentId: logoAttachment.contentId,
                contentType: logoAttachment.contentType,
              },
            ]
          : undefined,
      });

      if (error) {
        const errorMsg = error.message || 'Unknown email error';
        logEmailAttempt({
          kind: 'admin_notification',
          orderId,
          apiKeyDetected: true,
          from,
          to: env.adminEmail,
          resendId: null,
          error: errorMsg,
          finalStatus: 'FAILED',
        });
        await prisma.order.update({
          where: { id: orderId },
          data: { adminEmailStatus: 'FAILED' },
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

      logEmailAttempt({
        kind: 'admin_notification',
        orderId,
        apiKeyDetected: true,
        from,
        to: env.adminEmail,
        resendId: data.id,
        error: null,
        finalStatus: 'SENT',
      });
      return { success: true };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logEmailAttempt({
        kind: 'admin_notification',
        orderId,
        apiKeyDetected: true,
        from,
        to: env.adminEmail,
        error: errorMsg,
        finalStatus: 'FAILED',
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { adminEmailStatus: 'FAILED' },
      }).catch(() => {});
      return { success: false, error: errorMsg };
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logEmailAttempt({
      kind: 'admin_notification',
      orderId,
      apiKeyDetected: env.apiKeyDetected,
      from,
      error: errorMsg,
      finalStatus: 'FAILED',
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { adminEmailStatus: 'FAILED' },
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
  const env = getEmailEnvStatus();
  const from = env.emailFrom;

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

    const logoAttachment = getEmailLogoAttachment();
    const emailData = {
      orderNumber: order.orderNumber,
      customerName: order.customer.name || 'Kunde',
      trackingNumber: trackingNumber || undefined,
      trackingUrl: trackingUrl || undefined,
      items: normalizeOrderLineItems({
        itemsJson: order.items,
        orderItems: order.orderItems,
        forCustomerEmail: true,
      }),
      isDropship: true,
      logoUrl: resolveEmailLogoSrc(Boolean(logoAttachment)),
      siteUrl: SITE_CONFIG.siteUrl,
    };

    const recipient = order.customer.email;
    const resend = getResendClient();
    if (!resend) {
      const errorMsg = 'RESEND_API_KEY mangler i .env — forsendelse-e-post ble ikke sendt.';
      logEmailAttempt({
        kind: 'shipping_notification',
        orderId,
        apiKeyDetected: false,
        from,
        to: recipient,
        error: errorMsg,
        finalStatus: 'FAILED',
      });
      return { success: false, error: errorMsg };
    }

    if (!recipient) {
      throw new Error('Customer email not found');
    }

    const { composeMessage, getStoreDefaultLocale } = await import(
      '@/lib/communication'
    );
    const composedShip = composeMessage({
      messageType: 'shipping',
      customerLocale: (order.customer as { locale?: string | null }).locale,
      storeDefaultLocale: getStoreDefaultLocale(),
      vars: {
        storeName: SITE_CONFIG.siteName,
        customerName: order.customer.name || 'there',
        orderNumber: order.orderNumber,
        trackingNumber: trackingNumber || null,
        trackingUrl: trackingUrl || null,
      },
    });

    const html = await render(OrderShippedEmail(emailData));
    const { data, error } = await resend.emails.send({
      from,
      to: recipient,
      subject: composedShip.message.subject,
      html,
      attachments: logoAttachment
        ? [
            {
              filename: logoAttachment.filename,
              content: logoAttachment.content,
              contentId: logoAttachment.contentId,
              contentType: logoAttachment.contentType,
            },
          ]
        : undefined,
    });

    if (error) {
      logEmailAttempt({
        kind: 'shipping_notification',
        orderId,
        apiKeyDetected: true,
        from,
        to: recipient,
        resendId: null,
        error: error.message || 'Unknown email error',
        finalStatus: 'FAILED',
      });
      throw error;
    }

    logEmailAttempt({
      kind: 'shipping_notification',
      orderId,
      apiKeyDetected: true,
      from,
      to: recipient,
      resendId: data.id,
      error: null,
      finalStatus: 'SENT',
    });
    return { success: true, data };
  } catch (error) {
    console.error('❌ Error sending shipping notification:', error);
    throw error;
  }
}
