const express = require('express');
const router = express.Router();
const TodayTask = require('../models/todayTask');
const authMiddleware = require("../middlewares/authMiddleware");

// Helper function to check if user is admin
const isAdmin = (user) => user.role === 'admin';

// Helper function to check if user is manager or OPIC
const isManagerOrOPIC = (user) => ['manager', 'opic'].includes(user.role);

// Create today's task - Only admin can create
router.post('/', authMiddleware, async (req, res) => {
    try {
        if (!isAdmin(req.user)) {
            return res.status(403).json({
                success: false,
                error: 'Only administrators can create tasks'
            });
        }

        const todayTask = await TodayTask.create({
            ...req.body,
            assignedTo: req.body.assignedTo || req.user.id
        });

        res.status(201).json({
            success: true,
            data: todayTask
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Get all today's tasks
router.get('/', authMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const query = {
            date: {
                $gte: today,
                $lt: tomorrow
            }
        };

        // If user is not admin, only show their tasks
        if (!isAdmin(req.user)) {
            query.assignedTo = req.user.id;
        }

        const todayTasks = await TodayTask.find(query)
            .populate('assignedTo', 'name email role');

        res.status(200).json({
            success: true,
            count: todayTasks.length,
            data: todayTasks
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Get single today's task
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const todayTask = await TodayTask.findById(req.params.id)
            .populate('assignedTo', 'name email role');

        if (!todayTask) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }

        // Check if user is authorized to view this task
        if (!isAdmin(req.user) && todayTask.assignedTo._id.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to access this task'
            });
        }

        res.status(200).json({
            success: true,
            data: todayTask
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Update today's task - Admin, Manager, and OPIC can update
router.put('/update/:id', authMiddleware, async (req, res) => {
    try {
        let todayTask = await TodayTask.findById(req.params.id);

        if (!todayTask) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }

        // Check if user is authorized to update this task
        if (!isAdmin(req.user) && !isManagerOrOPIC(req.user)) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to update tasks'
            });
        }

        // If user is not admin, they can only update their own tasks
        if (!isAdmin(req.user) && todayTask.assignedTo.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to update this task'
            });
        }

        // If user is not admin, they can only update status
        if (!isAdmin(req.user)) {
            const allowedUpdates = ['status'];
            const updates = Object.keys(req.body);
            const isValidOperation = updates.every(update => allowedUpdates.includes(update));
            
            if (!isValidOperation) {
                return res.status(400).json({
                    success: false,
                    error: 'You can only update the status of the task'
                });
            }
        }

        todayTask = await TodayTask.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        ).populate('assignedTo', 'name email role');

        res.status(200).json({
            success: true,
            data: todayTask
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Delete today's task - Only admin can delete
router.delete('/delete/:id', authMiddleware, async (req, res) => {
    try {
        if (!isAdmin(req.user)) {
            return res.status(403).json({
                success: false,
                error: 'Only administrators can delete tasks'
            });
        }

        const todayTask = await TodayTask.findById(req.params.id);

        if (!todayTask) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }

        await todayTask.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router; 