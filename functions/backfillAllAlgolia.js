// backfillAll.js
import {getFirestore} from "firebase-admin/firestore";
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
const {default: algoliasearch} = require('algoliasearch'); 

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
export async function backfillAll(appId, adminKey) {
  const db = getFirestore();
  const algoliaClient = algoliasearch(appId, adminKey);

  const indexProjects = algoliaClient.initIndex("projects");
  const indexSections = algoliaClient.initIndex("sections");
  const indexTasks = algoliaClient.initIndex("tasks");
  const indexUsers = algoliaClient.initIndex("users");
  const usersSnap = await db.collection("users").get();

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const workspacesSnap = await db.collection(`users/${userId}/myworkspace`).get();

    for (const workspaceDoc of workspacesSnap.docs) {
      const workspaceId = workspaceDoc.id;
      const workspaceData = workspaceDoc.data();

      // === 🔁 Backfill Workspace Members
      if (Array.isArray(workspaceData.members)) {
        for (const memberUid of workspaceData.members) {
          try {
            const memberDoc = await db.collection("users").doc(memberUid).get();
            if (!memberDoc.exists) continue;

            const memberData = memberDoc.data();

            const record = {
              objectID: memberUid,
              uid: memberUid,
              name: memberData.name || "",
              email: memberData.email || "",
              avatar: memberData.avatar || "",
              joinedWorkspaces: [workspaceId],
            };

            await indexUsers.saveObject(record);
          } catch (err) {
            console.error(
                `Error indexing member ${memberUid}:`,
                err.message,
            );
          }
        }
      }

      // === 🔁 Backfill Projects
      const projectsSnap = await db
          .collection(`users/${userId}/myworkspace/${workspaceId}/projects`)
          .get();

      for (const projectDoc of projectsSnap.docs) {
        const projectId = projectDoc.id;
        const projectData = projectDoc.data();

        if (projectData.isIndexed) {
          console.log(
              `Project ${projectId} already indexed, skipping.`,
          );
          continue;
        } else {
          const record = {
            objectID: projectId,
            projectId,
            userId,
            workspaceId,
            name: projectData.name || "",
            description: projectData.description || "",
            status: projectData.status || "active",
            tags: projectData.tags || [],
            createdAt: projectData.createdAt || new Date().toISOString(),
            updatedAt: projectData.updatedAt || new Date().toISOString(),
            members: projectData.members || [],
          };

          await indexProjects.saveObject(record);
          await projectDoc.ref.update({isIndexed: true});
        }

        // === 🔁 Backfill Sections
        const sectionsSnap = await db
            .collection(`${projectDoc.ref.path}/sections`)
            .get();

        for (const sectionDoc of sectionsSnap.docs) {
          const sectionId = sectionDoc.id;
          const sectionData = sectionDoc.data();

          if (sectionData.isIndexed) {
            console.log(`Section ${sectionId} already indexed, skipping.`);
            continue;
          } else {
            const record = {
              objectID: sectionId,
              sectionId,
              projectId,
              userId,
              workspaceId,
              name: sectionData.name || "",
              createdAt: sectionData.createdAt || new Date().toISOString(),
            };

            await indexSections.saveObject(record);
            await sectionDoc.ref.update({isIndexed: true});
          }

          // === 🔁 Backfill Tasks
          const tasksSnap = await db
              .collection(`${sectionDoc.ref.path}/tasks`)
              .get();

          for (const taskDoc of tasksSnap.docs) {
            const taskId = taskDoc.id;
            const taskData = taskDoc.data();

            if (taskData.isIndexed) {
              console.log(`Task ${taskId} already indexed, skipping.`);
              continue;
            } else {
              const record = {
                objectID: taskId,
                taskId,
                sectionId,
                projectId,
                userId,
                workspaceId,
                title: taskData.title || "",
                description: taskData.description || "",
                assignee: taskData.assignee || "",
                dueDate: taskData.dueDate || null,
                createdAt: taskData.createdAt || new Date().toISOString(),
                updatedAt: taskData.updatedAt || new Date().toISOString(),
                members: taskData.members || [],
              };

              await indexTasks.saveObject(record);
              await taskDoc.ref.update({isIndexed: true});
            }
          }
        }
      }
    }
  }
}

backfillAll().catch((err) => {
  console.error("Error during backfill:", err.message);
});
