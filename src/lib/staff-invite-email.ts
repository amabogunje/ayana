type StaffInviteEmailInput = {
  to: string;
  inviteeName: string;
  venueName: string;
  inviteUrl: string;
};

function inviteEmailBody(input: StaffInviteEmailInput) {
  return [
    `Hi ${input.inviteeName},`,
    "",
    `${input.venueName} invited you to join their TableCapture operator workspace.`,
    "Use this secure link to create your password and access the venue account:",
    input.inviteUrl,
    "",
    "This link expires in 7 days.",
  ].join("\n");
}

function inviteEmailHtml(input: StaffInviteEmailInput) {
  return `
    <p>Hi ${input.inviteeName},</p>
    <p>${input.venueName} invited you to join their TableCapture operator workspace.</p>
    <p>
      <a href="${input.inviteUrl}" style="display:inline-block;padding:12px 16px;background:#6d58ff;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">
        Create your account
      </a>
    </p>
    <p>Or paste this link into your browser:<br><a href="${input.inviteUrl}">${input.inviteUrl}</a></p>
    <p>This link expires in 7 days.</p>
  `;
}

export async function sendStaffInviteEmail(input: StaffInviteEmailInput) {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME ?? "TableCapture";
  const subject = `Join ${input.venueName} on TableCapture`;
  const text = inviteEmailBody(input);
  const html = inviteEmailHtml(input);

  if (process.env.SENDGRID_API_KEY && fromEmail) {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: input.to, name: input.inviteeName }],
            subject,
          },
        ],
        from: {
          email: fromEmail,
          name: fromName,
        },
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Unable to send SendGrid invite email: ${message}`);
    }

    return;
  }

  console.info("[staff-invite-email]", {
    to: input.to,
    from: fromEmail ? `${fromName} <${fromEmail}>` : "not configured",
    subject,
    text,
  });
}
