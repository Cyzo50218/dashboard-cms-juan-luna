/* eslint-disable no-undef, no-unused-vars */
import { onCall } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import * as algoliasearch from 'algoliasearch';
import sgMail from "@sendgrid/mail";
import { backfillAll } from "./backfillAllAlgolia.js";
import logger from "firebase-functions/logger";
import axios from "axios";
import corsLib from "cors";

const cors = corsLib({ origin: true });

// Init Firebase Admin SDK
initializeApp();

export const sendgridApiKey = defineSecret("SENDGRID_API_KEY_EMAIL_INVITATION");
export const ALGOLIA_APP_ID = defineSecret("ALGOLIA_APP_ID");
export const ALGOLIA_ADMIN_API_KEY = defineSecret("ALGOLIA_ADMIN_API_KEY");
export const USPS_CONSUMER_KEY = defineSecret("USPS_CONSUMER_KEY");
export const USPS_CONSUMER_SECRET = defineSecret("USPS_CONSUMER_SECRET");
export const USPS_TOKEN_URL = defineSecret("USPS_TOKEN_URL");
export const USPS_TRACKING_URL = defineSecret("USPS_TRACKING_URL");

const getAccessToken = async () => {
  const consumerKey = USPS_CONSUMER_KEY;
  const consumerSecret = USPS_CONSUMER_SECRET;
  const tokenUrl = USPS_TOKEN_URL;

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", consumerKey);
  params.append("client_secret", consumerSecret);

  try {
    const res = await axios.post(tokenUrl, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return res.data.access_token;
  } catch (err) {
    logger.error("Failed to get USPS access token:", err.response?.data || err.message);
    throw new Error("USPS auth failed.");
  }
};

export const sendEmailInvitation = onCall(
  {
    region: "us-central1",
    secrets: [sendgridApiKey],
  },
  async (request) => {
    // Auth check
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to send invitations."
      );
    }

    const data = request.data;
    if (!data.email || !data.projectName || !data.invitationUrl) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required email, projectName, or invitationUrl"
      );
    }

    const recipientEmail = data.email;
    const projectName = data.projectName;
    const invitationUrl = data.invitationUrl;

    const inviterName = request.auth.token.name || request.auth.token.email;
    const inviterEmail = request.auth.token.email;
    const recipientName = data.recipientName || recipientEmail.split("@")[0];

    sgMail.setApiKey(process.env.SENDGRID_API_KEY_EMAIL_INVITATION);

  // --- SendGrid Message Object ---
  const msg = {
    to: recipientEmail,
    from: {
      name: 'Juan Luna Collections',
      email: 'collection@juanlunacollections.com' 
    },
    subject: `${inviterName} has invited you to collaborate on ${projectName}`,
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
      return { success: true, message: "Invitation sent!" };
    } catch (error) {
      console.error("SendGrid error:", error);
      throw new functions.https.HttpsError("internal", "Failed to send email");
    }
  });

export const sendEmailWorkspaceInvitation = onCall(
  {
    region: "us-central1",
    secrets: [sendgridApiKey],
  },
  async (request) => {
    // Auth check
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to send invitations."
      );
    }

    const data = request.data;
    if (!data.email || !data.projectName || !data.invitationUrl) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required email, projectName, or invitationUrl"
      );
    }

    const recipientEmail = data.email;
    const projectName = data.projectName;
    const invitationUrl = data.invitationUrl;

    const inviterName = request.auth.token.name || request.auth.token.email;
    const inviterEmail = request.auth.token.email;
    const recipientName = data.recipientName || recipientEmail.split("@")[0];

    sgMail.setApiKey(process.env.SENDGRID_API_KEY_EMAIL_INVITATION);

  // --- SendGrid Message Object ---
  const msg = {
    to: recipientEmail,
    from: {
      name: 'Juan Luna Collections',
      email: 'collection@juanlunacollections.com' 
    },
    subject: `${inviterName} has invited you to collaborate on ${projectName}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <title>You're invited to collaborate</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="padding: 40px 20px 20px 20px;">
                <img src="https://cms.juanlunacollections.com/logo.png" alt="Company Logo" width="45" style="display: block;" />
            </td>
        </tr>
        <tr>
            <td align="center" style="padding: 0 20px;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <tr>
                        <td align="center" style="padding: 40px 40px 0 40px;">
                           <img src="${data.avatarUrl}" alt="Inviter Profile" width="64" height="64" style="display: block; border-radius: 50%;">
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 20px 40px 10px 40px;">
                            <p style="margin: 0; color: #6b7280; font-size: 16px; line-height: 1.6;">
                                <strong>${inviterName}</strong> invited you to join
                            </p>
                            <h1 style="margin: 5px 0 0 0; color: #1f2937; font-size: 28px; font-weight: 700;">
                                ${projectName}
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 20px 40px;">
                            <a href="${invitationUrl}" target="_blank" style="background-color: #6d28d9; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block;">
                                Join Team
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td align="left" style="padding: 20px 40px 40px 40px; border-top: 1px solid #f3f4f6;">
                             <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.7;">
                                Hi ${recipientName},
                            </p>
                            <p style="margin: 16px 0 0 0; color: #374151; font-size: 15px; line-height: 1.7;">
                                You've been invited to collaborate in the <strong>Juan Luna Collections</strong> workspace. Join the team to start contributing!
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td align="center" style="padding: 30px 20px;">
                <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                    If you were not expecting this invitation, you can ignore this email.
                </p>
                <p style="margin: 10px 0 0 0; font-size: 12px; color: #9ca3af;">
                    Juan Luna Collections | Manila, Philippines
                </p>
            </td>
        </tr>
    </table>
</body>
</html>`
  };

  // --- Send Email ---
  try {
      await sgMail.send(msg);
      return { success: true, message: "Invitation sent!" };
    } catch (error) {
      console.error("SendGrid error:", error);
      throw new functions.https.HttpsError("internal", "Failed to send email");
    }
  });  

export const runAlgoliaBackfill = onCall(
  {
    secrets: [ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY],
    region: "us-central1",
    timeoutSeconds: 540, // 9 minutes max
  },
  async (req) => {
    try {
      await backfillAll(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);

      return { success: true, message: "Backfill completed." };
    } catch (err) {
      throw new Error("Backfill failed: " + err.message);
    }
  }
);  

/*
export const getUSPSTracking = onRequest(
  {
    secrets: [USPS_CONSUMER_KEY, USPS_CONSUMER_SECRET, USPS_TOKEN_URL, USPS_TRACKING_URL],
  },
  async (req, res) => {
    cors(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }

      const { trackingNumber } = req.body.data || {};
      logger.info("Received body:", req.body);
      if (!trackingNumber) {
        return res.status(400).send({ error: "Tracking number is required." });
      }

      try {
        const accessToken = await getAccessToken();
        const trackingUrl = process.env.USPS_TRACKING_URL;

        const trackingRes = await axios.post(
          trackingUrl,
          { trackingNumbers: [trackingNumber] },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        logger.log(`Tracking successful for ${trackingNumber}`);
        return res.status(200).json(trackingRes.data);
      } catch (err) {
        logger.error(`Tracking failed for ${trackingNumber}:`, err.response?.data || err.message);
        const code = err.response?.status || 500;
        const msg =
          err.response?.data?.errors?.[0]?.message || "USPS tracking request failed.";
        return res.status(code).json({ error: msg });
      }
    });
  }
);
*/

export const getUSPSTracking = onRequest(
  {
    secrets: [USPS_CONSUMER_KEY], 
  },
  async (req, res) => {
    cors(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }

      const { trackingNumber } = req.body.data || {};
      logger.info("Received body:", req.body);

      if (!trackingNumber) {
        return res.status(400).send({ error: "Tracking number is required." });
      }

      const userId = process.env.USPS_CONSUMER_KEY;
      logger.info("USPS_CONSUMER_KEY is", process.env.USPS_CONSUMER_KEY);

      const xml = `<TrackRequest USERID="${userId}"><TrackID ID="${trackingNumber}"></TrackID></TrackRequest>`;
      const url = `https://secure.shippingapis.com/ShippingAPI.dll?API=TrackV2&XML=${encodeURIComponent(xml)}`;
      logger.info("Final USPS URL:", url);
      logger.info(`Tracking number: ${trackingNumber}`);
      try {
        const uspsRes = await axios.get(url);

        logger.log(`Tracking successful for ${trackingNumber}`);
        res.status(200).send(uspsRes.data); // Returns raw XML

        // Optional: parse XML to JSON using xml2js if needed
      } catch (err) {
        logger.error(`Tracking failed for ${trackingNumber}:`, err.message);
        return res.status(500).json({ error: "USPS tracking request failed." });
      }
    });
  }
);
