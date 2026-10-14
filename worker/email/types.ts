/** The provider-agnostic email contract. */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Template identifier, recorded in outbound_emails for reporting. */
  template?: string;
}

export interface EmailSendResult {
  providerMessageId: string | null;
}

export interface EmailAdapter {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
