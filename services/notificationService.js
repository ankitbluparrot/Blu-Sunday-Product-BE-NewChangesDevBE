const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Send a notification to a single user
 * @param {string} recipientId - The ID of the user to notify
 * @param {string} title - The title of the notification
 * @param {string} message - The message content
 * @param {string} type - The type of notification (project, task, subtask, comment)
 * @param {string} referenceId - The ID of the referenced item
 * @returns {Promise<Object>} - The created notification
 */
const sendNotification = async (recipientId, title, message, type, referenceId) => {
    try {
        const notification = new Notification({
            recipient: recipientId,
            title,
            message,
            type,
            referenceId
        });
        
        await notification.save();
        return notification;
    } catch (error) {
        console.error('Error sending notification:', error);
        throw error;
    }
};

/**
 * Send notifications to multiple users
 * @param {Array<string>} recipientIds - Array of user IDs to notify
 * @param {string} title - The title of the notification
 * @param {string} message - The message content
 * @param {string} type - The type of notification (project, task, subtask, comment)
 * @param {string} referenceId - The ID of the referenced item
 * @returns {Promise<Array>} - Array of created notifications
 */
const sendNotificationsToUsers = async (recipientIds, title, message, type, referenceId) => {
    try {
        const notifications = [];
        
        for (const recipientId of recipientIds) {
            const notification = await sendNotification(
                recipientId,
                title,
                message,
                type,
                referenceId
            );
            notifications.push(notification);
        }
        
        return notifications;
    } catch (error) {
        console.error('Error sending notifications to users:', error);
        throw error;
    }
};

/**
 * Send notifications to all team members
 * @param {string} teamId - The ID of the team
 * @param {string} title - The title of the notification
 * @param {string} message - The message content
 * @param {string} type - The type of notification (project, task, subtask, comment)
 * @param {string} referenceId - The ID of the referenced item
 * @returns {Promise<Array>} - Array of created notifications
 */
const sendNotificationsToTeam = async (teamId, title, message, type, referenceId) => {
    try {
        // Find all users in the team
        const teamMembers = await User.find({ team: teamId });
        
        if (!teamMembers.length) {
            console.log(`No team members found for team ${teamId}`);
            return [];
        }
        
        const recipientIds = teamMembers.map(member => member._id);
        return await sendNotificationsToUsers(recipientIds, title, message, type, referenceId);
    } catch (error) {
        console.error('Error sending notifications to team:', error);
        throw error;
    }
};

/**
 * Get all notifications for a user
 * @param {string} userId - The ID of the user
 * @param {boolean} unreadOnly - Whether to return only unread notifications
 * @param {string} userRole - The role of the user
 * @returns {Promise<Array>} - Array of notifications
 */
const getUserNotifications = async (userId, unreadOnly = false, userRole = null) => {
    try {
        let query = {};
        
        // If user is admin, they can see all notifications
        if (userRole === "admin") {
            // No need to filter by recipient for admin
        } else {
            // For non-admin users, only show their own notifications
            query.recipient = userId;
        }
        
        if (unreadOnly) {
            query.read = false;
        }
        
        return await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(10)  // Increased limit to 10 notifications
            .populate('recipient', 'name email');
    } catch (error) {
        console.error('Error getting user notifications:', error);
        throw error;
    }
};

/**
 * Mark a notification as read
 * @param {string} notificationId - The ID of the notification
 * @returns {Promise<Object>} - The updated notification
 */
const markNotificationAsRead = async (notificationId) => {
    try {
        return await Notification.findByIdAndUpdate(
            notificationId,
            { read: true },
            { new: true }
        );
    } catch (error) {
        console.error('Error marking notification as read:', error);
        throw error;
    }
};

/**
 * Mark all notifications for a user as read
 * @param {string} userId - The ID of the user
 * @returns {Promise<Object>} - The update result
 */
const markAllNotificationsAsRead = async (userId) => {
    try {
        return await Notification.updateMany(
            { recipient: userId, read: false },
            { read: true }
        );
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        throw error;
    }
};

/**
 * Get the manager of a team member and send notification
 * @param {string} userId - The ID of the team member
 * @param {string} title - The title of the notification
 * @param {string} message - The message content
 * @param {string} type - The type of notification
 * @param {string} referenceId - The ID of the referenced item
 * @returns {Promise<void>}
 */
const sendNotificationToManager = async (userId, title, message, type, referenceId) => {
    try {
        // Find the user to get their manager
        const user = await User.findById(userId);
        if (!user || !user.managerId) {
            console.log(`No manager found for user ${userId}`);
            return;
        }

        // Send notification to the manager
        await sendNotification(
            user.managerId,
            title,
            message,
            type,
            referenceId
        );
    } catch (error) {
        console.error('Error sending notification to manager:', error);
        throw error;
    }
};

module.exports = {
    sendNotification,
    sendNotificationsToUsers,
    sendNotificationsToTeam,
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    sendNotificationToManager
}; 