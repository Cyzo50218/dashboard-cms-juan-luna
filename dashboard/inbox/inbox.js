// inbox.js
dayjs.extend(dayjs_plugin_relativeTime);

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

let notifications = [];
let currentSort = 'timestamp_desc';
const sortLabels = {
    'timestamp_desc': 'Newest First',
    'timestamp_asc': 'Oldest First',
    'unread_first': 'Unread First',
    'read_oldest': 'Read Oldest',
    'unread_oldest': 'Unread Oldest'
};

/*
const defaultNotifications = [
    {
        id: 1,
        type: 'task_change',
        message: '<strong>John Doe</strong> updated the status of the task <strong>"Fix login bug"</strong> assigned to you.',
        timestamp: new Date('2025-08-11T09:05:00Z'),
        read: false,
        profileUrl: 'https://images.unsplash.com/photo-1507003211169-ea01314647a7?q=80&w=150&h=150&fit=crop',
        pinned: false
    },
    {
        id: 2,
        type: 'task_comment',
        message: '<strong>Jane Smith</strong> commented on the task <strong>"Design new homepage"</strong> assigned to you: "Can we use a darker theme?"',
        timestamp: new Date('2025-08-11T08:35:00Z'),
        read: false,
        profileUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=150&h=150&fit=crop',
        pinned: true,
        pinnedNote: 'Urgent: Follow up on design feedback.',
        pinnedColor: '#f9a825'
    },
    {
        id: 3,
        type: 'project_add',
        message: 'You have been added to the project <strong>"New Marketing Campaign"</strong>.',
        timestamp: new Date('2025-08-10T20:20:00Z'),
        read: true,
        profileUrl: 'https://images.unsplash.com/photo-1579783902677-7d5267425895?q=80&w=150&h=150&fit=crop',
        pinned: false
    },
    {
        id: 4,
        type: 'general_activity',
        message: '<strong>Team Lead</strong> assigned a new task to you: <strong>"Review UI wireframes"</strong>.',
        timestamp: new Date('2025-08-09T18:00:00Z'),
        read: true,
        profileUrl: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=150&h=150&fit=crop',
        pinned: false
    },
    {
        id: 5,
        type: 'task_change',
        message: '<strong>Mark Miller</strong> completed the task <strong>"Implement user authentication"</strong> assigned to you.',
        timestamp: new Date('2025-08-04T12:00:00Z'),
        read: true,
        profileUrl: 'https://images.unsplash.com/photo-1539571696357-433580550c55?q=80&w=150&h=150&fit=crop',
        pinned: false
    },
    {
        id: 6,
        type: 'general_activity',
        message: '<strong>Lisa Ray</strong> mentioned you in a comment on task <strong>"Review marketing plan"</strong>.',
        timestamp: new Date('2025-07-28T10:00:00Z'),
        read: false,
        profileUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=150&h=150&fit=crop',
        pinned: false
    },
    {
        id: 7,
        type: 'task_overdue',
        message: 'The task <strong>"Submit quarterly report"</strong> assigned to you is overdue.',
        timestamp: new Date('2025-08-08T08:00:00Z'),
        read: false,
        profileUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&h=150&fit=crop',
        pinned: false
    },
    {
        id: 8,
        type: 'task_overdue_project',
        message: 'The task <strong>"Prepare marketing budget"</strong> in the project <strong>"Q4 Marketing Plan"</strong> is overdue.',
        timestamp: new Date('2025-08-07T17:30:00Z'),
        read: false,
        profileUrl: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=150&h=150&fit=crop',
        pinned: false
    },
    {
        id: 9,
        type: 'workspace_invite',
        message: '<strong>Alex Johnson</strong> invited you to join the workspace <strong>"Product Development Team"</strong>.',
        timestamp: new Date('2025-08-06T09:15:00Z'),
        read: false,
        profileUrl: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=150&h=150&fit=crop',
        pinned: false
    }
];*/

const getIconText = (type) => {
    switch (type) {
        case 'task_change': return 'T';
        case 'task_comment': return 'C';
        case 'general_activity': return 'A';
        case 'project_add': return 'P';
        case 'task_overdue': return 'O';
        case 'task_overdue_project': return 'O';
        case 'workspace_invite': return 'I';
        default: return '?';
    }
};

const isImageUrl = (url) => {
    return (url && url.match(/\.(jpeg|jpg|gif|png|webp|svg)$/) != null);
};

const getGroupTitle = (date) => {
    const now = dayjs();
    const notificationDate = dayjs(date);

    if (notificationDate.isSame(now, 'day')) return 'Today';
    if (notificationDate.isSame(now.subtract(1, 'day'), 'day')) return 'Yesterday';
    if (notificationDate.isSame(now, 'week')) return 'This Week';
    if (notificationDate.isSame(now, 'month')) return 'This Month';
    return 'Older';
};

const createNotificationElement = (notification) => {
    const item = document.createElement('div');
    item.classList.add('notification-item');
    item.dataset.id = notification.id;
    if (notification.pinned) item.classList.add('pinned');
    if (!notification.read) item.classList.add('unread');

    const iconContainer = document.createElement('div');
    iconContainer.classList.add('notification-icon');

    if (isImageUrl(notification.profileUrl)) {
        const profileImg = document.createElement('img');
        profileImg.src = notification.profileUrl;
        profileImg.alt = 'Profile picture';
        iconContainer.appendChild(profileImg);
    } else {
        iconContainer.textContent = getIconText(notification.type);
    }

    const content = document.createElement('div');
    content.classList.add('notification-content');

    const text = document.createElement('p');
    text.classList.add('notification-text');
    text.innerHTML = notification.message;

    const time = document.createElement('span');
    time.classList.add('notification-time');
    time.textContent = dayjs(notification.timestamp.toDate()).fromNow();

    content.appendChild(text);
    content.appendChild(time);
    item.appendChild(iconContainer);
    item.appendChild(content);

    if (notification.pinned && notification.pinnedNote) {
        const pinnedNote = document.createElement('div');
        pinnedNote.classList.add('pinned-note');
        pinnedNote.textContent = notification.pinnedNote;
        content.appendChild(pinnedNote);
    }

    if (notification.pinned) {
        item.style.borderLeftColor = notification.pinnedColor || '#fbc02d';
    }

    const actions = document.createElement('div');
    actions.classList.add('notification-actions');

    // Conditionally add the delete button
    if (!notification.pinned) {
        const deleteBtn = document.createElement('button');
        deleteBtn.classList.add('delete-btn', 'material-icons');
        deleteBtn.textContent = 'delete';
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            await deleteNotification(notification.id);
        };
        actions.appendChild(deleteBtn);
    }

    const pinToggleBtn = document.createElement('button');
    pinToggleBtn.classList.add('pin-toggle-btn', 'material-icons');
    pinToggleBtn.textContent = 'push_pin';
    pinToggleBtn.onclick = async (e) => {
        e.stopPropagation();
        await togglePinStatus(notification.id);
    };
    actions.appendChild(pinToggleBtn);

    if (notification.pinned) {
        const customizeBtn = document.createElement('button');
        customizeBtn.classList.add('customize-btn', 'material-icons');
        customizeBtn.textContent = 'edit';
        customizeBtn.onclick = (e) => {
            e.stopPropagation();
            openCustomizationModal(notification.id);
        };
        actions.appendChild(customizeBtn);
    }

    const toggleButton = document.createElement('button');
    toggleButton.classList.add('read-toggle', 'material-icons');
    toggleButton.textContent = notification.read ? 'drafts' : 'mark_email_unread';
    toggleButton.onclick = async (e) => {
        e.stopPropagation();
        await toggleReadStatus(notification.id);
    };
    actions.appendChild(toggleButton);

    item.appendChild(actions);

    return item;
};

const deleteNotification = async (id) => {
    const user = auth.currentUser;
    if (!user) return;

    const notificationDocRef = doc(db, `users/${user.uid}/notifications-store/notifications`);
    const updatedNotifications = notifications.filter(n => n.id !== id);
    await setDoc(notificationDocRef, { items: updatedNotifications });
};

const toggleReadStatus = async (id) => {
    const user = auth.currentUser;
    if (!user) return;

    const notificationIndex = notifications.findIndex(n => n.id === id);
    if (notificationIndex !== -1) {
        const notificationDocRef = doc(db, `users/${user.uid}/notifications-store/notifications`);
        const updatedNotifications = [...notifications];
        updatedNotifications[notificationIndex].read = !updatedNotifications[notificationIndex].read;
        await setDoc(notificationDocRef, { items: updatedNotifications });
    }
};

const togglePinStatus = async (id) => {
    const user = auth.currentUser;
    if (!user) return;

    const notificationIndex = notifications.findIndex(n => n.id === id);
    if (notificationIndex !== -1) {
        const notificationDocRef = doc(db, `users/${user.uid}/notifications-store/notifications`);
        const updatedNotifications = [...notifications];
        updatedNotifications[notificationIndex].pinned = !updatedNotifications[notificationIndex].pinned;
        await setDoc(notificationDocRef, { items: updatedNotifications });
    }
};

const markAllAsRead = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const notificationDocRef = doc(db, `users/${user.uid}/notifications-store/notifications`);
    const updatedNotifications = notifications.map(n => ({ ...n, read: true }));
    await setDoc(notificationDocRef, { items: updatedNotifications });
};

const markGroupAsRead = async (groupTitle) => {
    const user = auth.currentUser;
    if (!user) return;

    const notificationDocRef = doc(db, `users/${user.uid}/notifications-store/notifications`);
    const updatedNotifications = notifications.map(n => {
        if (getGroupTitle(n.timestamp.toDate()) === groupTitle) {
            return { ...n, read: true };
        }
        return n;
    });
    await setDoc(notificationDocRef, { items: updatedNotifications });
};

let customizationTargetId = null;

const openCustomizationModal = (id) => {
    const modal = document.getElementById('customization-modal');
    const colorPicker = document.getElementById('color-picker');
    const noteEditor = document.getElementById('note-editor');
    const notification = notifications.find(n => n.id === id);
    if (!notification) return;

    customizationTargetId = id;
    colorPicker.value = notification.pinnedColor || '#fbc02d';
    noteEditor.value = notification.pinnedNote || '';
    modal.classList.add('open');
};

const closeCustomizationModal = () => {
    const modal = document.getElementById('customization-modal');
    modal.classList.remove('open');
    customizationTargetId = null;
};

const saveCustomization = async () => {
    if (!customizationTargetId) return;

    const user = auth.currentUser;
    if (!user) return;

    const newColor = document.getElementById('color-picker').value;
    const newNote = document.getElementById('note-editor').value.trim();
    const notificationDocRef = doc(db, `users/${user.uid}/notifications-store/notifications`);
    const notificationIndex = notifications.findIndex(n => n.id === customizationTargetId);

    if (notificationIndex !== -1) {
        const updatedNotifications = [...notifications];
        updatedNotifications[notificationIndex].pinnedColor = newColor;
        updatedNotifications[notificationIndex].pinnedNote = newNote;
        await setDoc(notificationDocRef, { items: updatedNotifications });
    }

    closeCustomizationModal();
};

const sortNotifications = (notificationsToSort) => {
    const sorted = [...notificationsToSort];
    switch (currentSort) {
        case 'timestamp_asc':
            sorted.sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate());
            break;
        case 'unread_first':
            sorted.sort((a, b) => {
                if (a.read === b.read) return b.timestamp.toDate() - a.timestamp.toDate();
                return a.read ? 1 : -1;
            });
            break;
        case 'read_oldest':
            sorted.sort((a, b) => {
                if (a.read === b.read) return a.timestamp.toDate() - b.timestamp.toDate();
                return a.read ? -1 : 1;
            });
            break;
        case 'unread_oldest':
            sorted.sort((a, b) => {
                if (a.read === b.read) return a.timestamp.toDate() - b.timestamp.toDate();
                return a.read ? 1 : -1;
            });
            break;
        case 'timestamp_desc':
        default:
            sorted.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
            break;
    }
    return sorted;
};

const updateSortUI = () => {
    const sortLabel = document.getElementById('sort-label');
    const sortOptions = document.getElementById('sort-options');
    if (sortLabel && sortOptions) {
        sortLabel.textContent = sortLabels[currentSort];
        sortOptions.querySelectorAll('a').forEach(link => {
            link.classList.remove('active');
            if (link.dataset.sort === currentSort) {
                link.classList.add('active');
            }
        });
    }
};

// New function to update header counts
const updateHeaderCounts = (totalCount, unreadCount) => {
    const totalCountSpan = document.getElementById('total-count');
    const totalUnreadCountSpan = document.getElementById('total-unread-count');
    if (totalCountSpan) totalCountSpan.textContent = totalCount;
    if (totalUnreadCountSpan) totalUnreadCountSpan.textContent = unreadCount;
};

const renderNotifications = (notificationsData) => {
    const pinnedNotificationsList = document.getElementById('pinned-notifications');
    const notificationList = document.getElementById('notification-list');
    pinnedNotificationsList.innerHTML = '';
    notificationList.innerHTML = '';

    notifications = notificationsData;

    // Calculate all counts first
    const totalCount = notifications.length;
    const totalUnreadCount = notifications.filter(n => !n.read).length;
    updateHeaderCounts(totalCount, totalUnreadCount);

    const pinnedNotifications = notifications.filter(n => n.pinned);

    // Render the pinned header and list
    if (pinnedNotifications.length > 0) {
        pinnedNotificationsList.style.display = 'block';
        const pinnedHeaderContainer = document.createElement('div');
        pinnedHeaderContainer.classList.add('pinned-header-container');
        const pinnedHeader = document.createElement('div');
        pinnedHeader.classList.add('pinned-header-title');
        pinnedHeader.innerHTML = `Pinned <span class="pinned-count">(${pinnedNotifications.length})</span> <span class="material-icons arrow-icon">keyboard_arrow_down</span>`;
        pinnedHeaderContainer.appendChild(pinnedHeader);
        pinnedHeader.onclick = () => pinnedNotificationsList.classList.toggle('closed');
        pinnedNotificationsList.appendChild(pinnedHeaderContainer);
        const pinnedListWrapper = document.createElement('div');
        pinnedListWrapper.classList.add('pinned-list-wrapper');
        pinnedNotifications.forEach(notification => {
            const notificationElement = createNotificationElement(notification);
            pinnedListWrapper.appendChild(notificationElement);
        });
        pinnedNotificationsList.appendChild(pinnedListWrapper);
    } else {
        pinnedNotificationsList.style.display = 'none';
    }

    // Sort ALL notifications together for the main list
    const allNotificationsSorted = sortNotifications(notifications);

    const groupTitles = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
    for (const group of groupTitles) {
        const notificationsInGroup = allNotificationsSorted.filter(n => getGroupTitle(n.timestamp.toDate()) === group);
        const unreadInGroup = notificationsInGroup.filter(n => !n.read).length;

        // Skip rendering an empty group
        if (notificationsInGroup.length === 0) continue;

        const groupContainer = document.createElement('div');
        groupContainer.classList.add('notification-group');
        groupContainer.dataset.groupTitle = group;
        const groupHeader = document.createElement('div');
        groupHeader.classList.add('group-header');
        groupHeader.onclick = (e) => {
            if (e.target.closest('.mark-group-read-btn')) return;
            groupContainer.classList.toggle('closed');
        };
        const groupTitleBtn = document.createElement('div');
        groupTitleBtn.classList.add('group-title-btn');
        let groupTitleHtml = `${group} <span class="group-count">(${notificationsInGroup.length})</span>`;
        if (unreadInGroup > 0) {
            groupTitleHtml += `<span class="group-unread-count">(${unreadInGroup})</span>`;
        }
        groupTitleHtml += ` <span class="material-icons arrow-icon">keyboard_arrow_down</span>`;
        groupTitleBtn.innerHTML = groupTitleHtml;
        const markGroupReadBtn = document.createElement('button');
        markGroupReadBtn.classList.add('mark-group-read-btn');
        markGroupReadBtn.textContent = 'Mark all as read';
        markGroupReadBtn.onclick = async (e) => {
            e.stopPropagation();
            await markGroupAsRead(group);
        };
        groupHeader.appendChild(groupTitleBtn);
        groupHeader.appendChild(markGroupReadBtn);
        groupContainer.appendChild(groupHeader);
        const groupList = document.createElement('div');
        groupList.classList.add('group-list');
        groupContainer.appendChild(groupList);
        if (notificationsInGroup.length > 0) {
            notificationsInGroup.forEach(notification => {
                const notificationElement = createNotificationElement(notification);
                groupList.appendChild(notificationElement);
            });
        } else {
            const emptyMessage = document.createElement('div');
            emptyMessage.classList.add('empty-message');
            emptyMessage.textContent = `No notifications for ${group}.`;
            groupList.appendChild(emptyMessage);
        }
        notificationList.appendChild(groupContainer);
    }
    updateSortUI();
};

export function init() {
    document.getElementById('mark-all-read').onclick = markAllAsRead;
    document.getElementById('customization-modal').querySelector('.close-modal').onclick = closeCustomizationModal;
    document.getElementById('save-note').onclick = saveCustomization;
    const sortOptions = document.getElementById('sort-options');
    sortOptions.onclick = (e) => {
        e.preventDefault();
        const sortType = e.target.dataset.sort;
        if (sortType) {
            currentSort = sortType;
            renderNotifications(notifications);
        }
    };
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userNotificationsRef = doc(db, `users/${user.uid}/notifications-store/notifications`);
            onSnapshot(userNotificationsRef, async (docSnap) => {
                if (docSnap.exists() && docSnap.data().items.length > 0) {
                    const fetchedNotifications = docSnap.data().items;
                    renderNotifications(fetchedNotifications);
                } else {
                    console.log("No notifications found, restoring default data...");
                    await setDoc(userNotificationsRef, { items: defaultNotifications });
                }
            });
        } else {
            renderNotifications([]);
        }
    });
}

export function cleanup() {
    const notificationList = document.getElementById('notification-list');
    notificationList.innerHTML = '';
    const pinnedList = document.getElementById('pinned-notifications');
    pinnedList.innerHTML = '';
}