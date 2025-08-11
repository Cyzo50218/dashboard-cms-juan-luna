const notifications = [
{
    id: 1,
    type: 'task_change',
    message: '<strong>John Doe</strong> updated the status of the task <strong>"Fix login bug"</strong> assigned to you.',
    time: '15 mins ago',
    read: false
},
{
    id: 2,
    type: 'task_comment',
    message: '<strong>Jane Smith</strong> commented on the task <strong>"Design new homepage"</strong> assigned to you: "Can we use a darker theme?"',
    time: '45 mins ago',
    read: false
},
{
    id: 3,
    type: 'project_add',
    message: 'You have been added to the project <strong>"New Marketing Campaign"</strong>.',
    time: '2 hours ago',
    read: true
},
{
    id: 4,
    type: 'general_activity',
    message: '<strong>Team Lead</strong> assigned a new task to you: <strong>"Review UI wireframes"</strong>.',
    time: '5 hours ago',
    read: true
},
{
    id: 5,
    type: 'task_change',
    message: '<strong>Mark Miller</strong> completed the task <strong>"Implement user authentication"</strong> assigned to you.',
    time: '1 day ago',
    read: true
}, ];

document.addEventListener('DOMContentLoaded', () => {
    const notificationList = document.getElementById('notification-list');
    
    const getIconText = (type) => {
        switch (type) {
            case 'task_change':
                return 'T'; // For task changes
            case 'task_comment':
                return 'C'; // For new comments
            case 'general_activity':
                return 'A'; // For general activity
            case 'project_add':
                return 'P'; // For being added to a project
            default:
                return '?';
        }
    };
    
    const createNotificationElement = (notification) => {
        const item = document.createElement('div');
        item.classList.add('notification-item');
        if (!notification.read) {
            item.classList.add('unread');
        }
        
        const icon = document.createElement('div');
        icon.classList.add('notification-icon');
        icon.textContent = getIconText(notification.type);
        
        const content = document.createElement('div');
        content.classList.add('notification-content');
        
        const text = document.createElement('p');
        text.classList.add('notification-text');
        text.innerHTML = notification.message;
        
        const time = document.createElement('span');
        time.classList.add('notification-time');
        time.textContent = notification.time;
        
        content.appendChild(text);
        content.appendChild(time);
        
        item.appendChild(icon);
        item.appendChild(content);
        
        return item;
    };
    
    notifications.forEach(notification => {
        const notificationElement = createNotificationElement(notification);
        notificationList.appendChild(notificationElement);
    });
});