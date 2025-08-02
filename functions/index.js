/* eslint-disable no-undef, no-unused-vars */
import { onCall } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentDeleted, onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import * as algoliasearch from 'algoliasearch';
import sgMail from "@sendgrid/mail";
import { backfillAll } from "./backfillAllAlgolia.mjs";
import logger from "firebase-functions/logger";
import { getStorage } from "firebase-admin/storage";
import axios from "axios";
import corsLib from "cors";

const cors = corsLib({ origin: true });


admin.initializeApp();

const db = admin.firestore(admin.app(), "juanluna-cms-01");

export const sendgridApiKey = defineSecret("SENDGRID_API_KEY_EMAIL_INVITATION");
export const ALGOLIA_APP_ID = defineSecret("ALGOLIA_APP_ID");
export const ALGOLIA_ADMIN_API_KEY = defineSecret("ALGOLIA_ADMIN_API_KEY");
export const USPS_CONSUMER_KEY = defineSecret("USPS_CONSUMER_KEY");
export const USPS_CONSUMER_SECRET = defineSecret("USPS_CONSUMER_SECRET");
export const USPS_TOKEN_URL = defineSecret("USPS_TOKEN_URL");
export const USPS_TRACKING_URL = defineSecret("USPS_TRACKING_URL");

export const acceptWorkspaceInvitation = onCall(async (request) => {
  const { uid, email, displayName } = request.auth?.token || {};
  const { invId } = request.data;

  logger.info("🔔 acceptWorkspaceInvitation triggered", { uid, email, invId });

  if (!invId) {
    logger.warn("❌ Missing invitation ID in request data", { uid, email });
    throw new functions.https.HttpsError("invalid-argument", "Invitation ID is required.");
  }

  const invitationRef = db.doc(`InvitedWorkspaces/${invId}`);
  const userRef = db.doc(`users/${uid}`);

  try {
    // Step 1: Read invitation
    logger.info("📥 Reading invitation document", { path: invitationRef.path });
    const invitationSnap = await invitationRef.get();

    if (!invitationSnap.exists) {
      logger.warn("❌ Invitation not found", { invId });
      throw new functions.https.HttpsError("not-found", "Invitation not found.");
    }

    const invitationData = invitationSnap.data();
    logger.info("✅ Invitation data retrieved", { invitationData });

    if (invitationData.status === 'accepted') {
      logger.warn("⚠️ Invitation already accepted", { invId });
      throw new functions.https.HttpsError("already-exists", "Invitation already accepted.");
    }

    if ((invitationData.invitedEmail || "").toLowerCase() !== (email || "").toLowerCase()) {
      logger.warn("🚫 Email mismatch for invitation", {
        invitedEmail: invitationData.invitedEmail,
        requesterEmail: email,
      });
      throw new functions.https.HttpsError("permission-denied", "This invitation is not for your email.");
    }

    const { workspaceId, workspaceRefPath } = invitationData;
    if (!workspaceId || !workspaceRefPath) {
      logger.error("❌ Corrupted invitation: missing workspaceId or workspaceRefPath", { invitationData });
      throw new functions.https.HttpsError("invalid-argument", "Corrupted invitation data.");
    }

    // Step 2: Read workspace document
    const workspaceRef = db.doc(workspaceRefPath);
    logger.info("📥 Reading workspace document", { path: workspaceRef.path });
    const workspaceSnap = await workspaceRef.get();

    if (!workspaceSnap.exists) {
      logger.warn("❌ Workspace not found", { workspaceRefPath });
      throw new functions.https.HttpsError("not-found", "Workspace does not exist.");
    }

    // Step 3: Prepare batch
    logger.info("🛠️ Preparing batch write", {
      userRef: userRef.path,
      workspaceRef: workspaceRef.path,
      invitationRef: invitationRef.path
    });

    const batch = db.batch();
    batch.update(userRef, { selectedWorkspace: workspaceId });
    batch.update(workspaceRef, { members: admin.firestore.FieldValue.arrayUnion(uid) });
    batch.update(invitationRef, {
      status: "accepted",
      acceptedAt: FieldValue.serverTimestamp(),
      acceptedBy: {
        uid: String(uid || "unknown"),
        name: typeof displayName === "string" ? displayName : "",
        email: typeof email === "string" ? email : ""
      }
    });

    // Step 4: Commit
    logger.info("📤 Committing batch write...");
    await batch.commit();
    logger.info("✅ Invitation accepted successfully", { uid, workspaceId });

    return { success: true, workspaceId };

  } catch (error) {
    logger.error("🔥 Error during invitation acceptance", {
      error: error.message,
      stack: error.stack,
      uid,
      invId
    });
    throw new functions.https.HttpsError("internal", error.message || "Unknown error");
  }
});

export const downloadProxy = onRequest(async (req, res) => {
  const path = req.query.path;

  console.log("[downloadProxy] Incoming request for path:", path);

  if (!path) {
    console.error("[downloadProxy] Missing 'path' parameter");
    return res.status(400).send("Missing file path");
  }

  try {
    const bucket = getStorage().bucket();
    const file = bucket.file(path);

    // Short-lived signed URL (15 minutes)
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 15 * 60 * 1000,
    });

    console.log("[downloadProxy] Generated signed URL:", signedUrl);

    // Prevent browser from caching the proxy URL
    res.set("Cache-Control", "private, no-cache, no-store, must-revalidate");

    // Redirect to the signed URL
    return res.redirect(signedUrl);

  } catch (err) {
    console.error("[downloadProxy] Error generating signed URL:", err);
    return res.status(500).send("Failed to generate signed URL");
  }
});


async function backfillTaskCounts() {
  console.log("🚀 Starting global task count backfill for all users...");

  const usersSnap = await db.collection("users").get();

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    console.log(`👤 Processing user: ${userId}`);

    const workspacesSnap = await db.collection(`users/${userId}/myworkspace`).get();
    if (workspacesSnap.empty) {
      console.warn(`⚠️ No workspaces found for user ${userId}, skipping...`);
      continue;
    }

    for (const workspaceDoc of workspacesSnap.docs) {
      const workspaceId = workspaceDoc.id;

      if (!workspaceDoc.exists) {
        console.warn(`⚠️ Workspace doc missing at users/${userId}/myworkspace/${workspaceId}, skipping...`);
        continue;
      }

      console.log(`🏢 Processing workspace: ${workspaceId}`);

      const projectsSnap = await db
        .collection(`users/${userId}/myworkspace/${workspaceId}/projects`)
        .get();

      if (projectsSnap.empty) {
        console.log(`📭 No projects in workspace ${workspaceId}, skipping...`);
        continue;
      }

      for (const projectDoc of projectsSnap.docs) {
        const projectId = projectDoc.id;
        const projectPath = projectDoc.ref.path;
        console.log(`📂 Processing project: ${projectId}`);

        let totalTaskCount = 0;

        try {
          const sectionsSnap = await projectDoc.ref.collection("sections").get();

          for (const sectionDoc of sectionsSnap.docs) {
            const sectionId = sectionDoc.id;
            const tasksSnap = await sectionDoc.ref.collection("tasks").get(); // or .count().get() on Blaze
            const taskCount = tasksSnap.size;

            console.log(`🗂️ Section ${sectionId} → ${taskCount} tasks`);
            totalTaskCount += taskCount;
          }

          await projectDoc.ref.update({ taskCount: totalTaskCount });

          console.log(`✅ Updated ${projectPath} → taskCount: ${totalTaskCount}`);
        } catch (error) {
          console.error(`❌ Failed to update ${projectPath}:`, error.message);
        }
      }
    }
  }

  console.log("🎉 Global project task count backfill completed!");
}

export const runBackfill = onCall(async (request) => {
  await backfillTaskCounts();
  return { status: "Backfill done" };
});

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

export const sendShareExistingProjectInvitation = onCall(
  {
    region: "us-central1",
    secrets: [sendgridApiKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }

    const data = request.data;
    if (
      !data.email ||
      !data.projectName ||
      !data.invitationUrl ||
      !data.members ||
      data.totalTasks === undefined
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required data. Required: email, projectName, invitationUrl, members, totalTasks."
      );
    }
    const recipientEmail = data.email;
    const projectName = data.projectName;
    const invitationUrl = data.invitationUrl;
    const totalTasks = data.totalTasks;
    const inviterProfileUrl = data.inviterProfileUrl;
    const inviterName = request.auth.token.name || request.auth.token.email;
    const members = data.members || [];
    const membersToDisplay = members.slice(0, 2);
    const remainingMembersCount = Math.max(0, members.length - 2);

    let membersHtml = membersToDisplay.map((member, index) =>
      `<td style="padding: 0; margin: 0; border: 2px solid #ffffff; border-radius: 50%; margin-left: ${index > 0 ? '-10px' : '0'};">
          <img src="${member.avatarUrl || 'https://www.gravatar.com/avatar/?d=mp'}" alt="Member" width="32" height="32" style="border-radius: 50%; display: block;">
      </td>`
    ).join('');

    if (remainingMembersCount > 0) {
      membersHtml += `<td style="padding: 0; margin: 0; margin-left: -10px;">
        <div style="width: 36px; height: 36px; border-radius: 50%; background-color: #f0f0f0; text-align: center; line-height: 36px; font-size: 12px; color: #555; border: 2px solid #ffffff;">+${remainingMembersCount}</div>
      </td>`;
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY_EMAIL_INVITATION);

    // --- SendGrid Message Object ---
    const msg = {
      to: recipientEmail,
      from: {
        name: 'Juan Luna Collections',
        email: 'collection@juanlunacollections.com'
      },
      subject: `${inviterName} shared "${projectName}" with you on Juan Luna CMS`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Invitation</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: 'Inter', sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; border-collapse: collapse; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                    <tr>
                        <td align="center" style="padding: 40px 0 20px 0;">
                            <img src="https://cms.juanlunacollections.com/logo.png" alt="Company Logo" width="150" style="display: block;" />
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                             <a href="${inviterProfileUrl}" target="_blank" style="text-decoration: none; display: block; text-align: center;">
                                <img src="${data.avatarUrl || 'https://www.gravatar.com/avatar/?d=mp'}" alt="Inviter Profile" width="60" height="60" style="display: inline-block; border-radius: 50%;">
                            </a>
                            <p style="margin: 15px 0 0 0; color: #374151; font-size: 16px; line-height: 1.6; text-align: center;">
                                <strong>${inviterName}</strong> has shared a project with you.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 0 40px 40px 40px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px;">
                                <tr>
                                    <td>
                                        <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">PROJECT</p>
                                        <p style="margin: 0 0 15px 0; color: #1f2937; font-size: 22px; font-weight: 700;">${projectName}</p>
                                        
                                        <p style="margin: 0 0 20px 0; color: #374151; font-size: 14px; font-weight: 500;">
                                            <span style="display: inline-block; width: 8px; height: 8px; background-color: #22c55e; border-radius: 50%; margin-right: 8px; vertical-align: middle;"></span>
                                            ${totalTasks} Active Tasks
                                        </p>

                                        <br>
                                        
                                        <a href="${invitationUrl}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 14px 0; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500; display: block; width: 100%; text-align: center; clear: both;">
                                            View Project
                                        </a>

                                        <br>

                                        <br>

                                        <table border="0" cellpadding="0" cellspacing="0" align="left" style="margin-bottom: 25px;">
                                            <tr>
                                                ${membersHtml}
                                            </tr>
                                        </table>

                                        <br>

                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin-bottom: 30px;">
                            <h2 style="margin: 0 0 15px 0; color: #1f2937; font-size: 24px; font-weight: 700; text-align: center;">A Better Way to Manage Projects</h2>
                            <p style="margin: 0; text-align: center; font-size: 16px; color: #374151; line-height: 1.6;">
                                Stop switching between apps. Juan Luna CMS brings your products, suppliers, tasks, and team collaboration into one unified workspace.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 10px 40px 30px 40px;">
                            <p style="margin: 20px 0 0 0; text-align: center; font-size: 12px; color: #9ca3af;">
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
  }
);

export const sendEmailWorkspaceInvitation = onCall(
  {
    region: "us-central1",
    secrets: [sendgridApiKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to send invitations."
      );
    }
    const data = request.data;
    if (!data.email || !data.workspaceName || !data.invitationUrl) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required email, workspaceName, or invitationUrl"
      );
    }
    const recipientEmail = data.email;
    const workspaceName = data.workspaceName;
    const invitationUrl = data.invitationUrl;
    const inviterName = request.auth.token.name || request.auth.token.email;
    const recipientName = data.recipientName || recipientEmail.split("@")[0];

    sgMail.setApiKey(process.env.SENDGRID_API_KEY_EMAIL_INVITATION);

    const msg = {
      to: recipientEmail,
      from: {
        name: 'Juan Luna Collections',
        email: 'collection@juanlunacollections.com'
      },
      subject: `${inviterName} has invited you to join their workspace on Juan Luna CMS`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <title>You're Invited to Join a Workspace</title>
    <style>
        @media screen and (max-width: 600px) {
            .content-card {
                width: 100% !important;
                max-width: 100% !important;
            }
            .feature-column {
                display: block !important;
                width: 100% !important;
                padding: 20px 0 !important;
            }
            .feature-table tr {
                display: contents;
            }
            .features-headline {
                font-size: 30px !important;
            }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: 'Inter', sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="padding: 40px 20px 20px 20px;">
                <img src="https://cms.juanlunacollections.com/logo.png" alt="Juan Luna CMS Logo" width="200" style="display: block;" />
            </td>
        </tr>
        <tr>
            <td align="center" style="padding: 0 20px;">
                <table class="content-card" align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 6px 24px rgba(0,0,0,0.07);">
                    <tr>
                        <td align="center" style="padding: 40px 40px 10px 40px;">
                            <img src="${data.avatarUrl || 'https://www.gravatar.com/avatar/?d=mp'}" alt="Inviter Profile" width="64" height="64" style="display: block; border-radius: 50%;">
                            <h1 style="margin: 20px 0 0 0; color: #1a1a1a; font-size: 28px; font-weight: 700;">
                                You're invited to join ${workspaceName}
                            </h1>
                            <p style="margin: 8px 0 0 0; color: #666666; font-size: 16px; line-height: 1.6;">
                                by <strong>${inviterName}</strong>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 20px 40px;">
                            <a href="${invitationUrl}" target="_blank" style="background-color: #6d28d9; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block;">
                                Accept Invitation
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 20px 40px 40px 40px; border-top: 1px solid #e5e5e5;">
                            <h2 class="features-headline" style="margin: 0 0 25px 0; color: #333; font-size: 18px; font-weight: 600;">A powerful tool to streamline your work</h2>
                            <table class="feature-table" border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td class="feature-column" align="center" style="padding: 10px; vertical-align: top;">
                                        <p style="margin: 10px 0 0 0; font-size: 20px; font-weight: 600; color: #333;">Unified Product Hub</p>
                                        <p style="margin: 5px 0 0 0; font-size: 13px; color: #777; line-height: 1.5;">Track products, inventory, and supplier information all in one place.</p>
                                    </td>
                                    <td class="feature-column" align="center" style="padding: 10px; vertical-align: top;">
                                        <p style="margin: 10px 0 0 0; font-size: 20px; font-weight: 600; color: #333;">Contact Management</p>
                                        <p style="margin: 5px 0 0 0; font-size: 13px; color: #777; line-height: 1.5;">Organize your clients, collaborators, and team contacts effortlessly.</p>
                                    </td>
                                    <td class="feature-column" align="center" style="padding: 10px; vertical-align: top;">
                                        <p style="margin: 10px 0 0 0; font-size: 20px; font-weight: 600; color: #333;">Task Collaboration</p>
                                        <p style="margin: 5px 0 0 0; font-size: 13px; color: #777; line-height: 1.5;">Assign tasks and monitor progress to keep your team perfectly aligned.</p>
                                    </td>
                                </tr>
                            </table>
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
    try {
      await sgMail.send(msg);
      return { success: true, message: "Invitation sent!" };
    } catch (error) {
      console.error("SendGrid error:", error);
      throw new functions.https.HttpsError("internal", "Failed to send email");
    }
  }
);

export const runAlgoliaBackfill = onCall(
  {
    secrets: [ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY],
    region: "us-central1",
    timeoutSeconds: 540, // 9 minutes max
  },
  async (req) => {
    try {
      await backfillAll();

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

const getAccessToken = async () => {
  const consumerKey = process.env.USPS_CONSUMER_KEY;
  const consumerSecret = process.env.USPS_CONSUMER_SECRET;
  const tokenUrl = "https://apis.usps.com/oauth2/v3/token";

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", consumerKey);
  params.append("client_secret", consumerSecret);
  params.append("Scope", "tracking");

  logger.info("🔐 Requesting USPS OAuth Token...");
  logger.info("🔗 Token URL:", tokenUrl);
  logger.info("📤 OAuth Params:", {
    grant_type: "client_credentials",
    client_id: consumerKey,
    scope: "tracking"
  });

  try {
    const res = await axios.post(tokenUrl, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    logger.info("✅ Received access token from USPS.");
    logger.info("🔑 Token Scope:", res.data.scope || "(none)");
    logger.info("🔑 Expires In:", res.data.expires_in + " seconds");
    return res.data.access_token;
  } catch (err) {
    logger.error("❌ Failed to get USPS access token:", err.response?.data || err.message);
    throw new Error("USPS auth failed.");
  }
};

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
      if (!trackingNumber) {
        return res.status(400).send({ error: "Tracking number is required." });
      }

      logger.info(`📦 Incoming USPS tracking request for: ${trackingNumber}`);

      try {
        const token = await getAccessToken();
        const url = `https://apis.usps.com/tracking/v3/tracking/${trackingNumber}`;

        logger.info("🚀 Requesting USPS tracking data...");
        logger.info("📍 API URL:", url);
        logger.info("🔐 Bearer Token (first 50 chars):", token.substring(0, 50) + "...");

        const response = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        logger.info(`✅ USPS tracking success for ${trackingNumber}`);
        return res.status(200).json(response.data);
      } catch (error) {
        logger.error(`❌ USPS tracking failed for ${trackingNumber}:`, error.response?.data || error.message);
        return res.status(500).json({ error: "Tracking API request failed." });
      }
    });
  }
);


