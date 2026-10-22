/**
 * Envio de e-mails transacionais.
 *
 * Usa a API do Resend quando `RESEND_API_KEY` esta configurado. Sem credencial,
 * a mensagem e apenas registrada no log (util para desenvolvimento) e a
 * operacao nao falha.
 */

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? "Acervo Digital <no-reply@acervodigital.app>";

  if (!apiKey) {
    console.info(`[email] (sem provedor configurado) para=${message.to} assunto="${message.subject}"`);
    return { sent: false, reason: "Nenhum provedor de e-mail configurado (RESEND_API_KEY)." };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[email] Resend respondeu ${response.status}: ${detail.slice(0, 200)}`);
      return { sent: false, reason: `Resend respondeu ${response.status}.` };
    }
    return { sent: true };
  } catch (error) {
    console.error("[email] falha ao enviar:", error instanceof Error ? error.message : error);
    return { sent: false, reason: "Falha de rede ao enviar o e-mail." };
  }
}

export async function sendPasswordResetEmail(email: string, link?: string): Promise<void> {
  const target =
    link ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/reset-password`;
  await sendEmail({
    to: email,
    subject: "Recuperacao de acesso - Acervo Digital",
    text: `Para redefinir sua senha, acesse: ${target}`,
    html: `<p>Para redefinir sua senha no Acervo Digital, clique no link abaixo:</p><p><a href="${target}">${target}</a></p><p>Se voce nao solicitou, ignore este e-mail.</p>`,
  });
}
