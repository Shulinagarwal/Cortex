const RESEND_API_URL = "https://api.resend.com/emails";

// Switched from SMTP (nodemailer) to Resend's HTTP API (decision, 2026-08-25). Raw SMTP
// (port 587) never worked from Render: DNS resolution to smtp.gmail.com was a coin flip
// between an IPv4 and IPv6 address (nodemailer's own resolver picks at random - confirmed
// by reading its source), and even forcing a literal IPv4 address still hit a bare
// connection timeout - not a DNS problem at that point, but Render's network not routing
// outbound port 587 at all. Resend is a plain HTTPS POST on port 443, the same port every
// other outbound call in this app (Mongo Atlas, Qdrant, OpenRouter, Tavily) already uses
// successfully, so it doesn't depend on an egress path that turned out not to exist.
const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY);

const deliver = async ({ to, subject, text, html }) => {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n--- EMAIL (dev, not sent) ---\nTo: ${to}\nSubject: ${subject}\n${text}\n---\n`);
      return { sent: false, reason: "not_configured_dev_logged" };
    }
    console.error("Email not sent: RESEND_API_KEY is not configured.");
    return { sent: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || "Cortex <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend returned ${response.status}: ${body}`);
    }

    return { sent: true };
  } catch (error) {
    console.error("Email delivery failed:", error.message);
    return { sent: false, reason: "delivery_failed" };
  }
};

const sendOtpEmail = async ({ to, code, expiresInMinutes }) => {
  const subject = `${code} is your Cortex sign-in code`;

  const text = [
    `Your Cortex sign-in code is: ${code}`,
    ``,
    `It expires in ${expiresInMinutes} minutes and can only be used once.`,
    ``,
    `If you didn't try to sign in, you can ignore this email - nobody can get in without this code.`,
  ].join("\n");

  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 480px;">
      <p style="font-size: 15px; color: #111;">Your Cortex sign-in code is:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 20px 0; color: #111;">${code}</p>
      <p style="font-size: 14px; color: #555;">
        It expires in ${expiresInMinutes} minutes and can only be used once.
      </p>
      <p style="font-size: 13px; color: #888; margin-top: 24px;">
        If you didn't try to sign in, you can ignore this email &mdash; nobody can get in without this code.
      </p>
    </div>
  `;

  return deliver({ to, subject, text, html });
};

module.exports = { isEmailConfigured, deliver, sendOtpEmail };
