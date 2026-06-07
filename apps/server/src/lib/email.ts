import { Resend } from "resend"
import { config } from "../config.js"

let _resend: Resend | null = null
function getResend() {
  if (!config.email.resendApiKey) throw new Error("RESEND_API_KEY is not set")
  return (_resend ??= new Resend(config.email.resendApiKey))
}

export async function sendPasswordResetEmail(toEmail: string, rawToken: string) {
  const link = `${config.email.appUrl}/owner/reset-password?token=${rawToken}`

  await getResend().emails.send({
    from: config.email.fromEmail,
    to: toEmail,
    subject: "Reset your InBill password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px">
          <div style="width:28px;height:28px;background:#1a1a1a;border-radius:7px;display:flex;align-items:center;justify-content:center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M6 2h12a1 1 0 011 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1zm2 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z"/>
            </svg>
          </div>
          <span style="font-size:16px;font-weight:600;color:#1a1a1a">InBill</span>
        </div>
        <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a1a">Reset your password</h2>
        <p style="margin:0 0 24px;font-size:14px;color:#666;line-height:1.5">
          We received a request to reset the password for your InBill owner account.
          Click the button below to choose a new password. This link expires in 1 hour.
        </p>
        <a href="${link}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">
          Reset password
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#999;line-height:1.5">
          If you didn't request this, you can safely ignore this email.<br>
          This link will expire in 1 hour.
        </p>
      </div>
    `,
  })
}
