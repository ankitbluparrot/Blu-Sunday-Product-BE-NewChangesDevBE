// routes/notificationRoutes.js
const express = require("express");
const Notification = require("../models/Notification");
const authMiddleware = require("../middlewares/authMiddleware");
const { 
    getUserNotifications, 
    markNotificationAsRead, 
    markAllNotificationsAsRead 
} = require('../services/notificationService');

const router = express.Router();

// Get all notifications for the authenticated user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { unreadOnly } = req.query;
        
        const notifications = await getUserNotifications(
            userId, 
            unreadOnly === 'true',
            userRole
        ); 
        
        res.status(200).json({
            success: true,
            count: notifications.length,
            notifications
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching notifications',
            error: error.message
        });
    }
});

// Mark a notification as read
router.put('/:notificationId/read', authMiddleware, async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.id;
        
        // Verify the notification belongs to the user
        const notification = await getUserNotifications(userId);
        const userNotification = notification.find(n => n._id.toString() === notificationId);
        
        if (!userNotification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found or not authorized'
            });
        }
        
        const updatedNotification = await markNotificationAsRead(notificationId);
        
        res.status(200).json({
            success: true,
            message: 'Notification marked as read',
            notification: updatedNotification
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking notification as read',
            error: error.message
        });
    }
});

// Mark all notifications as read for the authenticated user
router.put('/read-all', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await markAllNotificationsAsRead(userId);
        
        res.status(200).json({
            success: true,
            message: 'All notifications marked as read',
            result
        });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking all notifications as read',
            error: error.message
        });
    }
});

module.exports = router;
