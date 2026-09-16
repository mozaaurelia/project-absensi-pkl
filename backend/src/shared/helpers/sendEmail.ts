import nodemailer from "nodemailer";

const gmailUser = process.env.GMAIL_USER;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  if (!gmailUser || !gmailAppPassword) return null;
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string) {
  const tx = getTransporter();
  if (!tx) {
    console.warn(
      "[sendEmail] GMAIL_USER/GMAIL_APP_PASSWORD belum dikonfigurasi, email tidak dikirim. to:",
      to,
      "subject:",
      subject,
    );
    // Extract any action link from the HTML so the dev can copy it manually
    const linkMatch = html.match(/href="([^"]*(?:reset|onboard|invite)[^"]*)"/i);
    const devFallbackLink = linkMatch ? linkMatch[1] : null;
    if (devFallbackLink) {
      console.log("[sendEmail] DEV FALLBACK — salin link aksi manual:", devFallbackLink);
    }
    return { success: false, skipped: true, reason: "no_credentials", devFallbackLink };
  }

  const fromEmail = gmailUser!;
  const fromName = process.env.GMAIL_FROM_NAME || "SAMS";

  try {
    const info = await tx.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error("[sendEmail] Error:", err?.message || err);
    // Extract any action link from the HTML so the dev can copy it manually
    const linkMatch = html.match(/href="([^"]*(?:reset|onboard|invite)[^"]*)"/i);
    const devFallbackLink = linkMatch ? linkMatch[1] : null;
    if (devFallbackLink) {
      console.log("[sendEmail] DEV FALLBACK — salin link aksi manual:", devFallbackLink);
    }
    return { success: false, error: err?.message || String(err), devFallbackLink };
  }
}