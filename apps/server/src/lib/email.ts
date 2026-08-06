import { Resend } from "resend"
import { config } from "../config.js"

let _resend: Resend | null = null
function getResend() {
  if (!config.email.resendApiKey) throw new Error("RESEND_API_KEY is not set")
  return (_resend ??= new Resend(config.email.resendApiKey))
}

// Hosted PNG logo — email clients strip inline SVG and block data: URIs, so the
// mark must be a real image at a stable public URL. Paired with the "InBill"
// wordmark below so branding still shows when a client blocks remote images.
const LOGO_URL = "https://tresiphi.com/icons/apple-touch-icon.png"

export async function sendVerificationEmail(toEmail: string, rawToken: string) {
  const link = `${config.email.appUrl}/owner/verify-email?token=${rawToken}`

  await getResend().emails.send({
    from: config.email.fromEmail,
    to: toEmail,
    subject: "Verify your InBill email",
    text: [
      "Verify your InBill email",
      "",
      "Confirm this is your email address to finish setting up your InBill owner account.",
      "Open this link to verify (expires in 24 hours):",
      "",
      link,
      "",
      "If you didn't create an InBill account, you can safely ignore this email.",
      "",
      "— InBill, a Tresiphi product",
    ].join("\n"),
    html: `
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Verify your InBill email — this link expires in 24 hours.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #ece7dd;border-radius:16px;overflow:hidden">
        <tr><td style="height:4px;background:#e0972e;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:30px 32px 0">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle">
              <img src="${LOGO_URL}" width="38" height="38" alt="InBill" style="display:block;border:0;border-radius:9px" />
            </td>
            <td style="vertical-align:middle;padding-left:11px;font-size:17px;font-weight:700;color:#1a1a1a;letter-spacing:-0.01em">InBill</td>
          </tr></table>
          <h1 style="margin:26px 0 10px;font-size:22px;font-weight:700;color:#1a1a1a">Verify your email</h1>
          <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#5c574e">
            Confirm this is your email address to finish setting up your InBill owner account — you'll need to verify before you can add an outlet. This link expires in <strong style="color:#1a1a1a">24 hours</strong>.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:10px;background:#1a1a1a">
              <a href="${link}" style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Verify email</a>
            </td>
          </tr></table>
          <p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#8a8578">
            Or paste this link into your browser:<br>
            <a href="${link}" style="color:#b06f16;word-break:break-all">${link}</a>
          </p>
        </td></tr>
        <tr><td style="padding:26px 32px 30px">
          <div style="border-top:1px solid #f0ebe2;padding-top:18px">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#a8a29a">
              If you didn't create an InBill account, you can safely ignore this email.
            </p>
          </div>
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px"><tr>
        <td style="padding:18px 8px 0;text-align:center;font-size:11px;color:#b3ada3">InBill — a Tresiphi product</td>
      </tr></table>
    </td></tr>
  </table>
    `,
  })
}

export async function sendPasswordResetEmail(toEmail: string, rawToken: string) {
  const link = `${config.email.appUrl}/owner/reset-password?token=${rawToken}`

  await getResend().emails.send({
    from: config.email.fromEmail,
    to: toEmail,
    subject: "Reset your InBill password",
    text: [
      "Reset your InBill password",
      "",
      "We received a request to reset the password for your InBill owner account.",
      "Open this link to choose a new password (expires in 1 hour):",
      "",
      link,
      "",
      "If you didn't request this, you can safely ignore this email — your password won't change.",
      "",
      "— InBill, a Tresiphi product",
    ].join("\n"),
    html: `
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Reset your InBill password — this link expires in 1 hour.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #ece7dd;border-radius:16px;overflow:hidden">
        <tr><td style="height:4px;background:#e0972e;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:30px 32px 0">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle">
              <img src="${LOGO_URL}" width="38" height="38" alt="InBill" style="display:block;border:0;border-radius:9px" />
            </td>
            <td style="vertical-align:middle;padding-left:11px;font-size:17px;font-weight:700;color:#1a1a1a;letter-spacing:-0.01em">InBill</td>
          </tr></table>
          <h1 style="margin:26px 0 10px;font-size:22px;font-weight:700;color:#1a1a1a">Reset your password</h1>
          <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#5c574e">
            We received a request to reset the password for your InBill owner account. Click the button below to choose a new password. This link expires in <strong style="color:#1a1a1a">1 hour</strong>.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:10px;background:#1a1a1a">
              <a href="${link}" style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Reset password</a>
            </td>
          </tr></table>
          <p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#8a8578">
            Or paste this link into your browser:<br>
            <a href="${link}" style="color:#b06f16;word-break:break-all">${link}</a>
          </p>
        </td></tr>
        <tr><td style="padding:26px 32px 30px">
          <div style="border-top:1px solid #f0ebe2;padding-top:18px">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#a8a29a">
              If you didn't request this, you can safely ignore this email — your password won't change.
            </p>
          </div>
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px"><tr>
        <td style="padding:18px 8px 0;text-align:center;font-size:11px;color:#b3ada3">InBill — a Tresiphi product</td>
      </tr></table>
    </td></tr>
  </table>
    `,
  })
}
