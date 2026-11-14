import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfig } from '../../config/app-config';
import { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../prisma/prisma.service';

export interface OutgoingEmail {
  to: string;
  subject: string;
  template: string;
  text: string;
  html?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Simulated mail service.
 * Every message is stored in the local outbox (EmailMessage table) so automation can read it
 * through the testing API. When SMTP_HOST is configured (e.g. Mailpit in docker compose),
 * messages are also delivered over SMTP. No external e-mail provider is ever required.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {
    if (config.mail.smtpHost) {
      this.transporter = createTransport({
        host: config.mail.smtpHost,
        port: config.mail.smtpPort,
        secure: false,
        ignoreTLS: true,
      });
    }
  }

  async send(email: OutgoingEmail, testRunId?: string | null): Promise<void> {
    await this.prisma.emailMessage.create({
      data: {
        to: email.to,
        subject: email.subject,
        template: email.template,
        text: email.text,
        html: email.html,
        metadata: (email.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        testRunId: testRunId ?? RequestContext.testRunId() ?? null,
      },
    });
    this.logger.log(`Email "${email.template}" stored in outbox for ${email.to}`);
    if (this.transporter) {
      this.transporter
        .sendMail({ from: this.config.mail.from, to: email.to, subject: email.subject, text: email.text, html: email.html })
        .catch((err: Error) => this.logger.warn(`SMTP delivery failed: ${err.message}`));
    }
  }
}
