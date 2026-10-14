export interface WhatsAppTemplateMessage {
  /** E.164-ish phone number (with country code) — digits are extracted, no + needed. */
  to: string;
  templateName: string;
  languageCode?: string; // default 'en_US'
  /** Positional {{1}}, {{2}}… body placeholders, in order. */
  bodyParams?: string[];
  /** Header image URL — only for templates whose HEADER component is IMAGE. */
  headerImageUrl?: string;
}

export interface WhatsAppSendResult {
  sent: boolean;
  id?: string;
  error?: string;
}

export interface WhatsAppProvider {
  sendTemplate(msg: WhatsAppTemplateMessage): Promise<WhatsAppSendResult>;
}
