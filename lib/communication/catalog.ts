/**
 * Template catalog — human-authored strings per locale.
 * No AI translation. AI may later improve copy via separate approval flow.
 */

import type { LocaleCode } from "./language-profile";
import type { MessageType } from "./types";

export type TemplateStrings = {
  subject: string;
  text: string;
  /** Optional simple HTML body; channels may ignore */
  html?: string;
};

/** locale → strings */
export type LocaleTemplateMap = Partial<Record<LocaleCode, TemplateStrings>> & {
  /** Required fallback chain root */
  "en-US": TemplateStrings;
};

export const MESSAGE_TEMPLATES: Record<MessageType, LocaleTemplateMap> = {
  order_confirmation: {
    "en-US": {
      subject: "Order confirmation {{orderNumber}} — {{storeName}}",
      text: `Hi {{customerName}},

Thank you for your order {{orderNumber}}.

Total: {{totalFormatted}}
We will notify you when your package ships.

— {{storeName}}`,
    },
    "nb-NO": {
      subject: "Ordrebekreftelse {{orderNumber}} — {{storeName}}",
      text: `Hei {{customerName}},

Takk for bestillingen din ({{orderNumber}}).

Totalt: {{totalFormatted}}
Vi gir beskjed når pakken er sendt.

— {{storeName}}`,
    },
    "de-DE": {
      subject: "Bestellbestätigung {{orderNumber}} — {{storeName}}",
      text: `Hallo {{customerName}},

vielen Dank für Ihre Bestellung {{orderNumber}}.

Summe: {{totalFormatted}}
Wir benachrichtigen Sie, sobald das Paket versendet wurde.

— {{storeName}}`,
    },
  },

  shipping: {
    "en-US": {
      subject: "Your package is on the way — {{orderNumber}}",
      text: `Hi {{customerName}},

Your order {{orderNumber}} has shipped.
{{#trackingNumber}}Tracking: {{trackingNumber}}
{{/trackingNumber}}{{#trackingUrl}}Track here: {{trackingUrl}}
{{/trackingUrl}}
— {{storeName}}`,
    },
    "nb-NO": {
      subject: "Pakken er sendt — {{orderNumber}}",
      text: `Hei {{customerName}},

Ordren din {{orderNumber}} er sendt.
{{#trackingNumber}}Sporing: {{trackingNumber}}
{{/trackingNumber}}{{#trackingUrl}}Følg sendingen: {{trackingUrl}}
{{/trackingUrl}}
— {{storeName}}`,
    },
    "de-DE": {
      subject: "Ihr Paket ist unterwegs — {{orderNumber}}",
      text: `Hallo {{customerName}},

Ihre Bestellung {{orderNumber}} wurde versendet.
{{#trackingNumber}}Sendungsnummer: {{trackingNumber}}
{{/trackingNumber}}{{#trackingUrl}}Sendung verfolgen: {{trackingUrl}}
{{/trackingUrl}}
— {{storeName}}`,
    },
  },

  delay: {
    "en-US": {
      subject: "Update on your order {{orderNumber}}",
      text: `Hi {{customerName}},

Your order {{orderNumber}} is taking longer than expected.
{{#detail}}{{detail}}
{{/detail}}We are following up and will update you again soon.

— {{storeName}}`,
    },
    "nb-NO": {
      subject: "Oppdatering om ordren din {{orderNumber}}",
      text: `Hei {{customerName}},

Ordren din {{orderNumber}} tar lengre tid enn forventet.
{{#detail}}{{detail}}
{{/detail}}Vi følger opp og gir deg beskjed.

— {{storeName}}`,
    },
    "de-DE": {
      subject: "Update zu Ihrer Bestellung {{orderNumber}}",
      text: `Hallo {{customerName}},

Ihre Bestellung {{orderNumber}} dauert länger als erwartet.
{{#detail}}{{detail}}
{{/detail}}Wir kümmern uns darum und melden uns bald.

— {{storeName}}`,
    },
  },

  delivered: {
    "en-US": {
      subject: "Delivered — {{orderNumber}}",
      text: `Hi {{customerName}},

Your order {{orderNumber}} has been delivered. We hope you enjoy it.

— {{storeName}}`,
    },
    "nb-NO": {
      subject: "Levert — {{orderNumber}}",
      text: `Hei {{customerName}},

Ordren din {{orderNumber}} er levert. Vi håper du blir fornøyd.

— {{storeName}}`,
    },
    "de-DE": {
      subject: "Zugestellt — {{orderNumber}}",
      text: `Hallo {{customerName}},

Ihre Bestellung {{orderNumber}} wurde zugestellt. Wir hoffen, Sie sind zufrieden.

— {{storeName}}`,
    },
  },

  reminder: {
    "en-US": {
      subject: "Reminder from {{storeName}}",
      text: `Hi {{customerName}},

{{#detail}}{{detail}}
{{/detail}}This is a friendly reminder from {{storeName}}.

— {{storeName}}`,
    },
    "nb-NO": {
      subject: "Påminnelse fra {{storeName}}",
      text: `Hei {{customerName}},

{{#detail}}{{detail}}
{{/detail}}Dette er en vennlig påminnelse fra {{storeName}}.

— {{storeName}}`,
    },
    "de-DE": {
      subject: "Erinnerung von {{storeName}}",
      text: `Hallo {{customerName}},

{{#detail}}{{detail}}
{{/detail}}Dies ist eine freundliche Erinnerung von {{storeName}}.

— {{storeName}}`,
    },
  },

  payment_approved: {
    "en-US": {
      subject: "Payment received — {{orderNumber}}",
      text: `Hi {{customerName}},

We have received payment for order {{orderNumber}}. We are preparing your shipment.

— {{storeName}}`,
    },
    "nb-NO": {
      subject: "Betaling mottatt — {{orderNumber}}",
      text: `Hei {{customerName}},

Vi har mottatt betaling for ordre {{orderNumber}}. Vi klargjør sendingen.

— {{storeName}}`,
    },
    "de-DE": {
      subject: "Zahlung erhalten — {{orderNumber}}",
      text: `Hallo {{customerName}},

wir haben die Zahlung für Bestellung {{orderNumber}} erhalten. Wir bereiten den Versand vor.

— {{storeName}}`,
    },
  },

  problem: {
    "en-US": {
      subject: "Action needed — order {{orderNumber}}",
      text: `Hi {{customerName}},

There is an update regarding order {{orderNumber}}.
{{#detail}}{{detail}}
{{/detail}}Reply to this email if you need help.

— {{storeName}}`,
    },
    "nb-NO": {
      subject: "Oppfølging — ordre {{orderNumber}}",
      text: `Hei {{customerName}},

Det er en oppdatering om ordren din {{orderNumber}}.
{{#detail}}{{detail}}
{{/detail}}Svar på denne e-posten hvis du trenger hjelp.

— {{storeName}}`,
    },
    "de-DE": {
      subject: "Hinweis zu Bestellung {{orderNumber}}",
      text: `Hallo {{customerName}},

es gibt eine Aktualisierung zu Ihrer Bestellung {{orderNumber}}.
{{#detail}}{{detail}}
{{/detail}}Antworten Sie auf diese E-Mail, wenn Sie Hilfe brauchen.

— {{storeName}}`,
    },
  },
};
