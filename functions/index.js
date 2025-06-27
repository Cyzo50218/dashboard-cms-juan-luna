const functions = require("firebase-functions");
const sgMail = require("@sendgrid/mail");

// Initialize SendGrid with the API key you set in the environment
sgMail.setApiKey(functions.config().sendgrid.key);

/**
 * An HTTPS Callable function to send an email invitation.
 * This is designed to be called directly from your web or mobile app.
 */
exports.sendEmailInvitation = functions.https.onCall(async (data, context) => {
  // (Optional) You can add a check to make sure the user is logged in
  // if (!context.auth) {
  //   throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to send invitations.');
  // }

  // Get the email address and inviter's name from the data passed to the function
  const recipientEmail = data.email;
  const inviterName = data.inviterName || 'A friend'; // Use a default name if none is provided

  const msg = {
    to: recipientEmail,
    from: {
      name: 'Juan Luna CMS',
      email: 'noreply-juanluna@yourdomain.com' 
    },
    subject: `You've been invited by ${inviterName} to Juan Luna CMS!`,
    html: `
      <p>Hello,</p>
      <p>${inviterName} has invited you to join our platform.</p>
      <p>Click the link below to get started!</p>
      <a href="https://your-app-url.com/signup">Accept Invitation</a>
      <p>Thanks,</p>
      <p>The Team at Juan Luna CMS</p>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`Invitation successfully sent to ${recipientEmail}`);
    return { success: true, message: 'Invitation sent successfully!' };
  } catch (error) {
    // Log the detailed error to the Firebase console for debugging
    console.error('There was an error sending the email:', error);
    if (error.response) {
      console.error(error.response.body);
    }
    // Throw an error so the client knows the call failed
    throw new functions.https.HttpsError('internal', 'Failed to send the email invitation.');
  }
});