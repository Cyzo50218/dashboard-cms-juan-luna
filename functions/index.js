const functions = require("firebase-functions");
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(functions.config().sendgrid.key);

exports.sendEmailInvitation = functions.https.onCall(async (data, context) => {
  // --- Data from your Frontend ---
  const recipientEmail = data.email;
  const inviterName = data.inviterName || 'A colleague';
  const projectName = data.projectName || 'a new project';
  
  // --- Personalization Logic ---
  // Use the recipient's name if provided, otherwise create a name from their email
  // e.g., "jane.doe@example.com" becomes "Jane Doe"
  const providedRecipientName = data.recipientName;
  const nameFromEmail = recipientEmail.split('@')[0].replace(/[\.\_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const recipientName = providedRecipientName || nameFromEmail;

  // --- Invitation Details ---
  const invitationToken = "some-unique-token-you-generate"; 
  const invitationUrl = `https://your-site-name.vercel.app/register/invitation/${invitationToken}`;

  // --- SendGrid Message Object ---
  const msg = {
    to: recipientEmail,
    from: {
      name: 'Juan Luna Collections',
      email: 'collection@juanlunacollections.com' // Your verified SendGrid sender
    },
    subject: `${inviterName} has invited you to collaborate on ${projectName}`,
    
    // Paste the new "Clean & Focused" HTML template from above into this 'html' property
    html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
    <title>Invitation to Collaborate</title>
    </head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; border-collapse: collapse; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                    <tr>
                        <td align="center" style="padding: 40px 0;">
                            <img src="https://cms.juanlunacollections.com/logo.png" alt="Company Logo" width="150" style="display: block;" />
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                            <h1 style="margin: 0; color: #1f2937; font-size: 28px; font-weight: 700; text-align: center;">You're invited to collaborate</h1>
                            <p style="margin: 30px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                Hi ${recipientName},
                            </p>
                            <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                <strong>${inviterName}</strong> has invited you to join them on a project within the Juan Luna Collections CMS.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 0 40px 40px 40px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px;">
                                <tr>
                                    <td>
                                        <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">PROJECT</p>
                                        <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 20px; font-weight: 700;">${projectName}</p>
                                        <a href="${invitationUrl}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 14px 0; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500; display: block; width: 100%; text-align: center;">
                                            Accept Invitation
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin-bottom: 20px;">
                            <p style="margin: 0; text-align: center; font-size: 12px; color: #6b7280; line-height: 1.6;">
                                If you were not expecting this invitation, you can safely ignore this email.
                            </p>
                             <p style="margin: 10px 0 0 0; text-align: center; font-size: 12px; color: #9ca3af;">
                                Juan Luna Collections | Manila, Philippines
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
  };

  // --- Send Email ---
  try {
    await sgMail.send(msg);
    console.log(`Clean invitation sent to ${recipientEmail} for project ${projectName}`);
    return { success: true, message: 'Invitation sent successfully!' };
  } catch (error) {
    console.error('Error sending email:', error);
    if (error.response) {
      console.error(error.response.body);
    }
    throw new functions.https.HttpsError('internal', 'Failed to send email.');
  }
});