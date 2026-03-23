const nodemailer = require("nodemailer");

/**
 * Formats a number into a readable string (e.g. 1200000 → "1.2M")
 */
function formatViews(count) {
  if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + "M";
  if (count >= 1_000) return (count / 1_000).toFixed(1) + "K";
  return count.toString();
}

/**
 * Formats an ISO date string into a readable date (e.g. "Mar 22, 2025")
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Generates a single video card row for the HTML email.
 */
function generateVideoCard(video, rank) {
  return `
  <tr>
    <td style="padding: 20px 0; border-bottom: 1px solid #2a2a40;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <!-- Rank Badge -->
          <td style="width: 48px; vertical-align: top; padding-right: 16px;">
            <div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; font-size: 18px; font-weight: 800; width: 40px; height: 40px; border-radius: 50%; text-align: center; line-height: 40px;">
              ${rank}
            </div>
          </td>
          <!-- Thumbnail -->
          <td style="width: 160px; vertical-align: top; padding-right: 16px;">
            <a href="${video.url}" target="_blank">
              <img src="${video.thumbnail}" alt="thumbnail" width="160" height="90"
                style="border-radius: 8px; display: block; object-fit: cover;" />
            </a>
          </td>
          <!-- Info -->
          <td style="vertical-align: top;">
            <a href="${video.url}" target="_blank"
              style="color: #a78bfa; font-size: 15px; font-weight: 700; text-decoration: none; line-height: 1.4; display: block; margin-bottom: 8px;">
              ${video.title}
            </a>
            <p style="margin: 0 0 6px 0; color: #94a3b8; font-size: 13px;">
              📺 <strong style="color: #cbd5e1;">${video.channelName}</strong>
            </p>
            <p style="margin: 0 0 4px 0; color: #94a3b8; font-size: 13px;">
              👁️ <strong style="color: #34d399;">${formatViews(video.viewCount)} views</strong>
            </p>
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">
              📅 Published: ${formatDate(video.publishedAt)}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * Builds the complete HTML email from the top videos list.
 */
function buildEmailHTML(videos) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const videoRows = videos
    .map((video, i) => generateVideoCard(video, i + 1))
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>YouTube AI Monitor — Daily Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f0f1a; font-family: 'Segoe UI', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0f0f1a">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table width="640" cellpadding="0" cellspacing="0" border="0"
          style="background: #16162a; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%); padding: 36px 40px; text-align: center;">
              <div style="font-size: 36px; margin-bottom: 8px;">🤖</div>
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">
                YouTube AI Monitor
              </h1>
              <p style="margin: 8px 0 0 0; color: #a78bfa; font-size: 14px; font-weight: 500;">
                Daily Report — ${today}
              </p>
            </td>
          </tr>

          <!-- Subheading -->
          <tr>
            <td style="padding: 24px 40px 8px 40px;">
              <p style="margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.6;">
                Here are the <strong style="color: #e2e8f0;">Top 10 AI Videos</strong> from the last 48 hours,
                ranked by view count across topics like AI agents, automation, app & game development.
              </p>
            </td>
          </tr>

          <!-- Video List -->
          <tr>
            <td style="padding: 16px 40px 0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${videoRows}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px; text-align: center; border-top: 1px solid #2a2a40; margin-top: 16px;">
              <p style="margin: 0; color: #4b5563; font-size: 12px;">
                🤖 Generated automatically by <strong style="color: #6d28d9;">YouTube AI Monitor</strong> •
                Runs daily at 6:00 AM IST
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sends the daily AI report email using Gmail SMTP.
 */
async function sendEmail(videos) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  const html = buildEmailHTML(videos);

  const info = await transporter.sendMail({
    from: `"YouTube AI Monitor 🤖" <${process.env.GMAIL_USER}>`,
    to: process.env.TO_EMAIL,
    subject: `🔥 Top 10 AI Videos Today — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    html,
  });

  console.log(`📧 Email sent successfully! Message ID: ${info.messageId}`);
}

module.exports = { sendEmail };
