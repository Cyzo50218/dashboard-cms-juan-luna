// backfillAll.js
import {getFirestore} from "firebase-admin/firestore";
import {algoliasearch} from 'algoliasearch';
import { defineSecret } from "firebase-functions/params";

export const ALGOLIA_APP_ID = defineSecret("ALGOLIA_APP_ID");
export const ALGOLIA_ADMIN_API_KEY = defineSecret("ALGOLIA_ADMIN_API_KEY");

/**
 * Recursively backfills all users, workspaces, projects, sections, and tasks
 * from Firestore into their respective Algolia indexes.
 *
 * This function reads nested collections under:
 * users/{userId}/myworkspace/{workspaceId}/projects/{projectId}/sections/{sectionId}/tasks
 * and indexes them into corresponding Algolia indices: users, projects, sections, and tasks.
 *
 * @param {string} appId - The Algolia Application ID from Firebase Secret Manager.
 * @param {string} adminKey - The Algolia Admin API Key from Firebase Secret Manager.
 * @return {Promise<void>} A promise that resolves when all documents have been indexed.
 */
export async function backfillAll() {
  const db = getFirestore("juanluna-cms-01");
  const client = algoliasearch(ALGOLIA_APP_ID.value(), ALGOLIA_ADMIN_API_KEY.value());
  const usersSnap = await db.collection("users").get();

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    console.log(`Algolia APP ID: '${ALGOLIA_APP_ID.value()}'`);
    console.log(`Algolia ADMIN API KEY: '${ALGOLIA_ADMIN_API_KEY.value()}'`);

    console.log(`Processing User ID: '${userId}'`);
    console.log(`Attempting to access path: 'users/${userId}/myworkspace'`);

    const workspacesSnap = await db.collection(`users/${userId}/myworkspace`).get();
    if (workspacesSnap.empty) {
      console.warn(`No workspace found for user ${userId}, skipping...`);
      continue;
    }

    for (const workspaceDoc of workspacesSnap.docs) {
      const workspaceId = workspaceDoc.id;
      const workspaceData = workspaceDoc.data();

      // === 🔁 Backfill Workspace Members
      if (Array.isArray(workspaceData.members)) {
        const userRecords = [];

        for (const memberUid of workspaceData.members) {
          try {
            const memberDoc = await db.collection("users").doc(memberUid).get();
            if (!memberDoc.exists) continue;

            const memberData = memberDoc.data();

            userRecords.push({
              objectID: memberUid,
              type: "people",
              uid: memberUid,
              name: memberData.name || "",
              email: memberData.email || "",
              avatar: memberData.avatar || "",
              joinedWorkspaces: [workspaceId],
              workspaceRef: workspaceDoc.ref.path,
            });
          } catch (err) {
            console.error(`Error indexing member ${memberUid}:`, err.message);
          }
        }

        if (userRecords.length) {
          await client.saveObjects({
            indexName: "users",
            objects: userRecords,
          });
        }
      }

      // === 🔁 Backfill Projects
      const projectsSnap = await db
        .collection(`users/${userId}/myworkspace/${workspaceId}/projects`)
        .get();

      for (const projectDoc of projectsSnap.docs) {
        const projectId = projectDoc.id;
        const projectData = projectDoc.data();

        const projectRecord = {
          objectID: projectId,
          projectId: projectData.projectId,
          type: "project",
          userId,
          projectRef: projectDoc.ref.path,
          workspaceId: projectData.workspaceId,
          name: projectData.title || "",
          color: projectData.color || "",
          workspaceRole: projectData.workspaceRole,
          createdAt: projectData.createdAt || new Date().toISOString(),
          updatedAt: projectData.updatedAt || new Date().toISOString(),
          memberUIDs: projectData.memberUIDs || [],
          membersUIDsWithRoles: projectData.members || [],
        };

        await client.saveObjects({
          indexName: "projects",
          objects: [projectRecord],
        });

        await projectDoc.ref.update({ isIndexed: true });

        // === 🔁 Backfill Sections
        const sectionsSnap = await db.collection(`${projectDoc.ref.path}/sections`).get();

        for (const sectionDoc of sectionsSnap.docs) {
          const sectionId = sectionDoc.id;
          const sectionData = sectionDoc.data();

          const sectionRecord = {
            objectID: sectionId,
            sectionId,
            projectId,
            type: "section",
            userId,
            workspaceId,
            name: sectionData.name || "",
            sectionRef: sectionDoc.ref.path,
            projectRef: projectDoc.ref.path,
            createdAt: sectionData.createdAt || new Date().toISOString(),
          };

          await client.saveObjects({
            indexName: "sections",
            objects: [sectionRecord],
          });

          await sectionDoc.ref.update({ isIndexed: true });

          // === 🔁 Backfill Tasks
          const tasksSnap = await db.collection(`${sectionDoc.ref.path}/tasks`).get();
          const taskRecords = [];

          for (const taskDoc of tasksSnap.docs) {
            const taskId = taskDoc.id;
            const taskData = taskDoc.data();


            taskRecords.push({
              objectID: taskId,
              taskId,
              sectionId,
              projectId,
              userId,
              type: "task",
              workspaceId,
              likedAmount: taskData.likedAmount,
              commentCount: taskData.commentCount,
              chatuuid: taskData.chatuuid || "",
              title: taskData.name || "",
              status: taskData.status || "",
              description: taskData.description || "",
              assignee: taskData.assignees || [],
              dueDate: taskData.dueDate || null,
              createdAt: taskData.createdAt || new Date().toISOString(),
              updatedAt: taskData.updatedAt || new Date().toISOString(),
              memberUIDs: projectData.memberUIDs || [],
              membersUIDsWithRoles: projectData.members || [],
              taskRef: taskDoc.ref.path,
              projectRef: projectDoc.ref.path,
            });

            await taskDoc.ref.update({ isIndexed: true });
          }

          if (taskRecords.length) {
            await client.saveObjects({
              indexName: "tasks",
              objects: taskRecords,
            });
          }
        }
      }
    }
  }
}

backfillAll().catch((err) => {
  console.error("Error during backfill:", err);
});
