const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Comment = require('../models/Comment');
const Task = require('../models/Task1');
const { logActivity } = require("../middlewares/auditLogMiddleware");
const cloudinary = require('../config/cloudinary');
const { sendNotification } = require('../services/notificationService');
const User = require('../models/User');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for memory storage (temporary storage before uploading to Cloudinary)
const upload = multer({ storage: multer.memoryStorage() });

// Add comment to task
router.post("/add/:taskId", authMiddleware, upload.array('attachments', 5), async (req, res) => {
    const taskId = req.params.taskId;
    const { content } = req.body;
    const files = req.files;

    try {
        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        // Upload files to Cloudinary
        const attachments = [];
        if (files && files.length > 0) {
            for (const file of files) {
                // Convert buffer to base64
                const b64 = Buffer.from(file.buffer).toString('base64');
                const dataURI = `data:${file.mimetype};base64,${b64}`;

                // Upload to Cloudinary
                const result = await cloudinary.uploader.upload(dataURI, {
                    folder: 'task-comments',
                    resource_type: 'auto'
                });

                attachments.push({
                    fileName: file.originalname,
                    fileUrl: result.secure_url,
                    fileType: file.mimetype,
                    fileSize: file.size,
                    publicId: result.public_id
                });
            }
        }

        // Create comment with or without content
        const newComment = new Comment({
            content: content || '', // Allow empty content if only files are uploaded
            user: req.user.id,
            task: taskId,
            attachments
        });

        await newComment.save();
        task.comments.push(newComment._id);
        await task.save();

        const user = await User.findById(req.user.id).select('name');

        await logActivity(req.user.id, "Added Comment ", newComment._id, "comment", `ID: ${user.name} added a comment on Task ID: ${task.taskId}`, req.user.parentId);

        // Populate the comment with user details
        const populatedComment = await Comment.findById(newComment._id)
            .populate('user', 'name email');

        // Send notification to the task assignee if the commenter is not the assignee
        if (task.assignee && task.assignee.toString() !== req.user.id) {
            await sendNotification(
                task.assignee,
                'New Comment on Your Task',
                `A new comment has been added to your task "${task.taskName}".`,
                'comment',
                newComment._id
            );
        }
        
        // Send notification to the task creator if the commenter is not the creator
        if (task.createdBy && task.createdBy.toString() !== req.user.id) {
            await sendNotification(
                task.createdBy,
                'New Comment on Your Task',
                `A new comment has been added to your task "${task.taskName}".`,
                'comment',
                newComment._id
            );
        }

        res.status(201).json({ 
            message: "Comment added successfully", 
            comment: populatedComment 
        });
    } catch (error) {
        console.error("Error adding comment:", error);
        res.status(500).json({ message: "Error adding comment", error: error.message });
    }
});

// Get all comments for a task
router.get("/task/:taskId", authMiddleware, async (req, res) => {
    try {
        const comments = await Comment.find({ task: req.params.taskId })
            .populate('user', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({
            message: "Comments fetched successfully",
            comments
        });
    } catch (error) {
        console.error("Error fetching comments:", error);
        res.status(500).json({ message: "Error fetching comments", error: error.message });
    }
});

// Update a comment
router.put("/update/:commentId", authMiddleware, async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.commentId);
        
        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        // Check if the user is the owner of the comment
        if (comment.user.toString() !== req.user.id) {
            return res.status(403).json({ message: "Not authorized to update this comment" });
        }

        const { content } = req.body;
        comment.content = content;
        await comment.save();

        await logActivity(req.user.id, "Updated Comment", comment._id, "comment", `Updated comment on Task: ${comment.task}`, req.user.parentId);

        const updatedComment = await Comment.findById(comment._id)
            .populate('user', 'name email');

        res.status(200).json({
            message: "Comment updated successfully",
            comment: updatedComment
        });
    } catch (error) {
        console.error("Error updating comment:", error);
        res.status(500).json({ message: "Error updating comment", error: error.message });
    }
});

// Delete a comment
router.delete("/delete/:commentId", authMiddleware, async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.commentId);
        
        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        // Check if the user is the owner of the comment
        if (comment.user.toString() !== req.user.id) {
            return res.status(403).json({ message: "Not authorized to delete this comment" });
        }

        // Delete files from Cloudinary
        if (comment.attachments && comment.attachments.length > 0) {
            for (const attachment of comment.attachments) {
                if (attachment.publicId) {
                    await cloudinary.uploader.destroy(attachment.publicId);
                }
            }
        }

        // Remove comment from task's comments array
        const task = await Task.findById(comment.task);
        if (task) {
            task.comments = task.comments.filter(c => c.toString() !== comment._id.toString());
            await task.save();
        }

        // Delete the comment
        await comment.deleteOne();

        await logActivity(req.user.id, "Deleted Comment", comment._id, "comment", `Deleted comment on Task: ${comment.task}`, req.user.parentId);

        res.status(200).json({
            message: "Comment deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting comment:", error);
        res.status(500).json({ message: "Error deleting comment", error: error.message });
    }
});

module.exports = router; 