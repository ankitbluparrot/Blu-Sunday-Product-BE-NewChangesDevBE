const express = require("express");
const mongoose = require("mongoose");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const Task = require('../models/Task1');
const Project = require('../models/Project');
const Subtask = require('../models/SubTask');
const Comment = require('../models/Comment');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { logActivity } = require("../middlewares/auditLogMiddleware");
const { sendNotification, sendNotificationsToTeam, sendNotificationToManager } = require('../services/notificationService');
const User = require('../models/User');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});

const upload = multer({ storage: storage });

// create task
router.post("/create/:projectId", authMiddleware, permissionMiddleware('create_task'), upload.array('attachments', 5), async (req, res) => {
    const { taskName, assignee, assigner, teamStatus, progress, startDate, dueDate, subtasks, comment } = req.body;
    const files = req.files;

        
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    // Generate task ID in format [Project ID]-XX

const today = new Date();
const yy = String(today.getFullYear()).slice(-2);
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
const datePart = `${yy}${mm}${dd}`;
const prefix = `TK${datePart}`;

    const latestTask = await Task.findOne({
        taskId: new RegExp(`^${prefix}-\\d{4}$`)
}).sort({ taskId: -1 });

    let sequenceNumber = '0001';
    if (latestTask) {
        const lastSequence = parseInt(latestTask.taskId.split('-')[1]);
        sequenceNumber = String(lastSequence + 1).padStart(4, '0');
    }

    const taskId = `${prefix}-${sequenceNumber}`;
 
    const newTask = new Task({
        taskName,
        taskId,
        assignee,
        assigner: req.user.id,
        teamStatus,
        progress,
        startDate,
        dueDate,
        subtasks,
        comments: [] // Initialize empty comments array
    });   

    console.log('newTask', newTask);

    try {
        await newTask.save();
        project.tasks.push(newTask._id); 
        
        // Update project status based on tasks
        if (project.tasks.length > 0) {
            project.status = "In Progress";
        }
        
        await project.save();

        // Create comment if provided
        if (comment) {
            const attachments = files ? files.map(file => ({
                fileName: file.originalname,
                fileUrl: file.path,
                fileType: file.mimetype,
                fileSize: file.size
            })) : [];

            const newComment = new Comment({
                content: comment,
                user: req.user.id,
                task: newTask._id,
                attachments
            });

            await newComment.save();
            newTask.comments.push(newComment._id); // Use push instead of assignment
            await newTask.save();
        }

        await logActivity(req.user.id, "Created Task", newTask._id, "task", `Task ID: ${newTask.taskName}`, req.user.parentId);

        // Populate the task with all related data
        const populatedTask = await Task.findById(newTask._id)
            .populate('assignee', 'name email location')
            .populate({
                path: 'subtasks',
                populate: {
                    path: 'assignee',
                    select: 'name email location'
                },
                select: 'name assignee status submission'
            })
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'name email'
                }
            });

        // Send notification to the assignee
        if (assignee) {
            await sendNotification(
                assignee,
                'New Task Assigned',
                `New task has been assigned: "${taskName}" in project "${project.projectName}".`,
                'task',
                newTask._id
            );
        }
        
        // Send notification to the team
        if (teamStatus) {
            await sendNotificationsToTeam(
                teamStatus,
                'New Task Created',
                `A new task "${taskName}" has been created in project "${project.projectName}".`,
                'task',
                newTask._id
            );
        }

        res.status(201).json({ 
            message: "Task created successfully", 
            task: populatedTask 
        });
    } catch (error) {
        console.log("Error creating task", error);
        res.status(500).json({ message: "Error creating task", error });
    }
});

// get tasks and subtasks
router.get("/view/:projectId", authMiddleware, async (req, res) => {
    const projectId = req.params.projectId;
    
    try {
        const project = await Project.findById(projectId)
            .populate({
                path: "tasks",
                populate: [
                    {
                        path: "assignee",
                        select: "name email ",
                    },
                    {
                        path: "assigner",
                        select: "name email ",
                    },
                    
                    {
                        path: "subtasks",
                        populate: {
                            path: "assignee",
                            select: "name email ",
                        },
                        select: "name assignee status submission startDate dueDate"
                    },
                    {  
                        path: "comments",
                        populate: {
                            path: "user",
                            select: "name email"
                        }
                    }
                ],
            });

        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }

        res.status(200).json({ 
            message: "Tasks and subtasks fetched successfully", 
            project
        });
    } catch (error) {
        console.error("Error fetching tasks and subtasks:", error);
        res.status(500).json({ message: "Error fetching tasks and subtasks", error });
    }
});

// Get all tasks and subtasks for a user
router.get("/user-tasks", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        let projects;
        if (userRole === "admin") {
            // Admin can see all projects and their tasks
            projects = await Project.find()
                .populate({
                    path: 'tasks',
                    populate: [
                        {
                            path: 'assignee',
                            select: 'name email location'
                        },
                        {
                            path: 'assigner',
                            select: 'name email location'
                        },
                        {
                            path: 'subtasks',
                            populate: {
                                path: 'assignee',
                                select: 'name email location'
                            },
                            select: 'name assignee status submission'
                        },
                        // {
                        //     path: 'comments',
                        //     populate: {
                        //         path: 'user',
                        //         select: 'name email'
                        //     }
                        // }
                    ]
                });
        } else if (userRole === "manager") {
            // Manager should see their own tasks and tasks they've assigned to OPICs
            const userTasks = await Task.find({
                $or: [
                    { assignee: userId },
                    { assigner: userId }
                ]
            }).select('_id');
            
            const userTaskIds = userTasks.map(task => task._id);
            
            // Find all projects that contain these tasks
            projects = await Project.find({
                tasks: { $in: userTaskIds }
            }).populate({
                path: 'tasks',
                match: {
                    $or: [
                        { assignee: userId },
                        { assigner: userId }
                    ]
                },
                populate: [
                    {
                        path: 'assignee',
                        select: 'name email location'
                    },
                    {
                        path: 'assigner',
                        select: 'name email location'
                    },
                    {
                        path: 'subtasks',
                        populate: {
                            path: 'assignee',
                            select: 'name email location'
                        },
                        select: 'name assignee status submission'
                    },
                    {
                        path: 'comments',
                        populate: {
                            path: 'user',
                            select: 'name email'
                        }
                    }
                ]
            });
        } else if (userRole === "opic") {
            // OPIC users can see projects that have tasks assigned to them
            // First find all tasks assigned to this user
            const userTasks = await Task.find({
                $or: [
                    { assignee: userId },
                    { assigner: userId }
                ]
            }).select('_id');
            
            const userTaskIds = userTasks.map(task => task._id);
            
            // Then find all projects that contain these tasks
            projects = await Project.find({
                tasks: { $in: userTaskIds }
            }).populate({
                path: 'tasks',
                match: {
                    $or: [
                        { assignee: userId },
                        { assigner: userId }
                    ]
                },
                populate: [
                    {
                        path: 'assignee',
                        select: 'name email location'
                    },
                    {
                        path: 'assigner',
                        select: 'name email location'
                    },
                    {
                        path: 'subtasks',
                        populate: {
                            path: 'assignee',
                            select: 'name email location'
                        },
                        select: 'name assignee status submission'
                    },
                    {
                        path: 'comments',
                        populate: {
                            path: 'user',
                            select: 'name email'
                        }
                    }
                ]
            });
        }

        // Extract all tasks from projects and add project information
        const tasksWithProjects = [];
        
        for (const project of projects) {
            if (project.tasks && project.tasks.length > 0) {
                for (const task of project.tasks) {
                    // For OPIC users, only include tasks assigned to them
                    if (userRole === "opic") {
                        if (task.assignee && task.assignee._id.toString() === userId) {
                            tasksWithProjects.push({
                                ...task.toObject(),
                                project: {
                                    id: project._id,
                                    name: project.projectName,
                                    projectId: project.projectId,
                                    status: project.status
                                }
                            });
                        }
                    } else {
                        // For admin and manager, include all tasks
                        tasksWithProjects.push({
                            ...task.toObject(),
                            project: {
                                id: project._id,
                                name: project.projectName,
                                projectId: project.projectId,
                                status: project.status
                            }
                        });
                    }
                }
            }
        }

        // Get current date and calculate date ranges
        const today = new Date();
        today.setHours(0, 0, 0, 0);  
        
        // Calculate end of current week (Sunday)
        const endOfWeek = new Date(today);
        const currentDay = today.getDay(); // 0 is Sunday, 6 is Saturday
        const daysUntilSunday = 7 - currentDay;
        endOfWeek.setDate(today.getDate() + daysUntilSunday);
        endOfWeek.setHours(23, 59, 59, 999); // Set to end of Sunday

        // Group tasks by status
        const groupedTasks = {
            all: tasksWithProjects,
            inProgress: tasksWithProjects.filter(task => (task.teamStatus === "In Progress" || task.teamStatus === "Not Started")),
            completed: tasksWithProjects.filter(task => task.teamStatus === "Completed"),
            active: tasksWithProjects.filter(task => task.teamStatus === "Active"),
            dueToday: tasksWithProjects.filter(task => {
                const taskDueDate = new Date(task.dueDate);
                taskDueDate.setHours(0, 0, 0, 0);
                return taskDueDate.getTime() === today.getTime() && task.teamStatus !== "Completed";
            }),
            dueInWeek: tasksWithProjects.filter(task => {
                const taskDueDate = new Date(task.dueDate);
                taskDueDate.setHours(0, 0, 0, 0);
                return taskDueDate > today && 
                       taskDueDate <= endOfWeek && 
                       task.teamStatus !== "Completed";
            }),
            overdue: tasksWithProjects.filter(task => {
                const taskDueDate = new Date(task.dueDate);
                taskDueDate.setHours(0, 0, 0, 0);
                return taskDueDate < today && task.teamStatus !== "Completed";
            })
        };

        console.log('user tasks');

        res.status(200).json({
            message: "Tasks fetched successfully",
            tasks: groupedTasks,
            totalTasks: tasksWithProjects.length,
            stats: {
                inProgress: groupedTasks.inProgress.length,
                completed: groupedTasks.completed.length,
                active: groupedTasks.active.length,
                dueToday: groupedTasks.dueToday.length,
                dueInWeek: groupedTasks.dueInWeek.length,
                overdue: groupedTasks.overdue.length
            }
        });
    } catch (error) {
        console.error("Error fetching user tasks:", error);
        res.status(500).json({ message: "Error fetching tasks", error: error.message });
    }
});
   
// add subtask
router.post("/add/subtask/:taskId", authMiddleware, permissionMiddleware('create_subtask'), async (req, res) => {
    try {
        const { taskId } = req.params;
        const { name, assignee, submission, status, startDate, dueDate } = req.body;

        console.log('startDate and endDate', startDate, dueDate)

        // Find the task
        const task = await Task.findById(taskId).populate('subtasks', 'name assignee status submission');
        
        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found"
            });
        }

        // Create the subtask
        const subtask = new Subtask({
            name,
            assignee,
            assigner: req.user.id,
            task: taskId,
            status,     
            createdBy: req.user.id,
            submission,
            startDate,
            dueDate
        });
        
        await subtask.save();
        
        // Add the subtask to the task
        task.subtasks.push(subtask._id);
        
        // Calculate the task progress
        // Get all subtasks with their status
        const subtasks = await Subtask.find({ _id: { $in: task.subtasks } });
        
        const totalSubtasks = subtasks.length;
        const completedSubtasks = subtasks.filter(st => st.status === "Completed").length;
        const inProgressSubtasks = subtasks.filter(st => st.status === "In Progress").length;

        console.log('completed subtask', completedSubtasks);
        console.log('in progress subtask', inProgressSubtasks);
        
        const progress = Math.round((completedSubtasks/totalSubtasks)*100);

        // Update task progress and status
        task.progress = progress;
        
        if (completedSubtasks === totalSubtasks) {
            // If all subtasks are completed, mark the task as completed
            task.teamStatus = "Completed";
            task.progress = 100; // Ensure progress is 100%
        } else if (progress > 0) {
            task.teamStatus = "In Progress";
        } else {
            task.teamStatus = "Not Started";
        }
        
        await task.save();

        // Find and update the parent project
        const project = await Project.findOne({ tasks: task._id });
        if (project) {
            // Get all tasks for this project
            const projectTasks = await Task.find({ _id: { $in: project.tasks } });
            
            if (projectTasks.length > 0) {
                // Calculate project progress based on task progress
                const totalProgress = projectTasks.reduce((sum, task) => sum + task.progress, 0);
                const projectProgress = Math.round(totalProgress / projectTasks.length);
                
                // Update project status based on all tasks
                const allTasksCompleted = projectTasks.every(task => task.teamStatus === "Completed");
                const anyTaskInProgress = projectTasks.some(task => task.teamStatus === "In Progress");
                
                if (allTasksCompleted) {
                    project.status = "Completed";
                } else if (anyTaskInProgress) {
                    project.status = "In Progress";
                } else {
                    project.status = "In Progress";
                }
                
                await project.save();
            }
        }
        
        // Send notification to the assignee
        if (assignee) {
            await sendNotification(
                assignee,
                'New Subtask Assigned',
                `Subtask "${name}" has been assigned for task "${task.taskName}".`,
                'subtask',
                subtask._id
            );
        }
        
        // Log the activity
        await logActivity(req.user.id, "Created Subtask", subtask._id, "subtask", `Subtask ID: Subtask: ${name} form Task: ${task.taskName}`, req.user.parentId);
        
        res.status(201).json({
            success: true,
            message: "Subtask added successfully",
            subtask,
            task
        });
    } catch (error) {
        console.error("Error adding subtask:", error);
        res.status(500).json({
            success: false,
            message: "Error adding subtask",
            error: error.message
        });
    }
});

// Update task by ID
router.put("/update/:taskId", authMiddleware, permissionMiddleware('edit_task'), async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const { assignee, teamStatus, progress, startDate, dueDate, taskName, assigner } = req.body;

        console.log("request from body", req.body);

        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        // Check if task is already completed
        if (task.teamStatus === "Completed") {
            return res.status(400).json({ 
                message: "Cannot modify a completed task" 
            });
        }

        // Store old values for comparison
        const oldValues = {
            taskName: task.taskName,
            assignee: task.assignee,
            teamStatus: task.teamStatus,
            progress: task.progress,
            startDate: task.startDate,
            dueDate: task.dueDate
        };

        // Check if the assignee has changed
        const assigneeChanged = assignee && task.assignee && assignee.toString() !== task.assignee.toString();

        // If assignee is being changed, update all subtasks to the new assignee
        if (assigneeChanged || assignee) {
            // Update all subtasks to have the same assignee as the main task
            await Subtask.updateMany(
                { _id: { $in: task.subtasks } },
                { $set: { assignee: assignee } }
            );
        }

        // Check if the status has changed to Completed
        const statusChanged = teamStatus && task.teamStatus !== teamStatus;
        const isCompleted = teamStatus === "Completed";

        // Update only the fields that are provided in the request
        if (assignee) task.assignee = assignee;
        if (taskName) task.taskName = taskName;
        if (assigner) task.assigner = req.user.id;
        if (teamStatus) task.teamStatus = teamStatus;
        if (progress) task.progress = progress;
        if (startDate) task.startDate = startDate;
        if (dueDate) task.dueDate = dueDate;

        // If task is being marked as completed
        if (isCompleted && statusChanged) {
            // Set completion date to current date
            task.completionDate = new Date();
            
            // Update all subtasks to completed
            if (task.subtasks && task.subtasks.length > 0) {
                await Subtask.updateMany(
                    { _id: { $in: task.subtasks } },
                    { $set: { status: "Completed" } }
                );
            }
            // Set task progress to 100%
            task.progress = 100;
        }

        await task.save();

        // Find the parent project and update its progress and status
        const project = await Project.findOne({ tasks: taskId });
        if (project) {
            // Get all tasks for this project
            const projectTasks = await Task.find({ _id: { $in: project.tasks } });
            
            if (projectTasks.length > 0) {
                // Calculate project progress based on task progress
                const totalProgress = projectTasks.reduce((sum, task) => sum + task.progress, 0);
                const projectProgress = Math.round(totalProgress / projectTasks.length);
                
                // Update project status based on all tasks
                const allTasksCompleted = projectTasks.every(task => task.teamStatus === "Completed");
                const anyTaskInProgress = projectTasks.some(task => task.teamStatus === "In Progress");
                
                if (allTasksCompleted) {
                    project.status = "Completed";
                } else if (anyTaskInProgress) {
                    project.status = "In Progress";
                } else {
                    project.status = "In Progress";
                }
                
                await project.save();
            }
        }

        // Find the admin user
        const admin = await User.findOne({ role: "admin" });
        
        // Send notification to admin
        if (admin) {
            let changes = [];
            if (taskName && taskName !== oldValues.taskName) {
                changes.push(`Task name changed from "${oldValues.taskName}" to "${taskName}"`);
            }
            if (assigneeChanged) {
                changes.push(`Task assigned to new user`);
            }
            if (teamStatus && teamStatus !== oldValues.teamStatus) {
                changes.push(`Task status changed to ${teamStatus}`);
            }
            if (progress && progress !== oldValues.progress) {
                changes.push(`Task progress updated to ${progress}%`);
            }
            if (startDate && startDate !== oldValues.startDate) {
                changes.push(`Task start date updated`);
            }
            if (dueDate && dueDate !== oldValues.dueDate) {
                changes.push(`Task due date updated`);
            }

            if (changes.length > 0) {
                await sendNotification(
                    admin._id,
                    'Task Updated',
                    `Task "${taskName || task.taskName}" has been updated: ${changes.join(", ")}`,
                    'task',
                    task._id
                );
            }
        }

        // Send notification to task assignee if they exist and have changed
        if (task.assignee && assigneeChanged) {
            await sendNotification(
                task.assignee,
                'Task Assigned',
                `Task "${taskName || task.taskName}" has been assigned.`,
                'task',
                task._id
            );
        }

        // Send notification to manager if task is completed
        if (isCompleted && statusChanged && task.assignee) {
            await sendNotificationToManager(
                task.assignee,
                'Task Completed',
                `The task "${task.taskName}" has been completed.`,
                'task',
                task._id
            );
        }

        // Populate the updated task with assignee details
        const updatedTask = await Task.findById(taskId)
            .populate('assignee', 'name email location')
            .populate('assigner', 'name email')
            .populate({
                path: 'subtasks',
                populate: {
                    path: 'assignee',
                    select: 'name email location'
                },
                select: 'name assignee status submission'
            });

        await logActivity(req.user.id, "Updated Task", updatedTask._id, "task", `Task ID: ${updatedTask.taskName}`, req.user.parentId);

        res.status(200).json({ 
            message: "Task updated successfully", 
            task: updatedTask 
        });
    } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).json({ message: "Error updating task", error: error.message });
    }
});

// Delete task and its subtasks by ID
router.delete("/delete/:taskId", authMiddleware, permissionMiddleware('delete_task'), async (req, res) => {
    try {
        
       console.log("enter in delete task");
    const taskId = req.params.taskId;

        // Find the task first
        const task = await Task.findById(taskId);
        
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        // Find the project that contains this task
        const project = await Project.findOne({ tasks: taskId });
        if (project) {
            // Remove the task from the project's tasks array
            project.tasks = project.tasks.filter(t => t.toString() !== taskId);
            
            // Update project status based on remaining tasks
            if (project.tasks.length === 0) {
                project.status = "In Progress";
            } else {
                // Get remaining tasks
                const remainingTasks = await Task.find({ _id: { $in: project.tasks } });
                const allTasksCompleted = remainingTasks.every(task => task.teamStatus === "Completed");
                const anyTaskInProgress = remainingTasks.some(task => task.teamStatus === "In Progress");
                
                if (allTasksCompleted) {
                    project.status = "Completed";
                } else if (anyTaskInProgress) {
                    project.status = "In Progress";
                } else {
                    project.status = "In Progress";
                }
            }
            
            await project.save();
        }

        // Delete all subtasks associated with this task
        if (task.subtasks && task.subtasks.length > 0) {
            await Subtask.deleteMany({ _id: { $in: task.subtasks } });
        }

    
        // Send notification to task assignee if they exist
        if (task.assignee) {
            await sendNotification(
                task.assignee,
                'Task Deleted',
                `Task "${task.taskName}" has been deleted from project "${project.projectName}".`,
                'task',
                taskId
            );
        }
 
        // Delete the task itself
        await Task.findByIdAndDelete(taskId);

        await logActivity(req.user.id, "Deleted Task", taskId, "task", `Task ID: ${task.taskName}`, req.user.parentId);

        res.status(200).json({ 
            message: "Task and associated subtasks deleted successfully" 
        });
    } catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).json({ message: "Error deleting task", error: error.message });
    }
});

// Delete subtask and remove its reference from parent task
router.delete("/delete/subtask/:subtaskId", authMiddleware, permissionMiddleware('delete_subtask'), async (req, res) => {
    const subtaskId = req.params.subtaskId;

    try {
        // Find the subtask first
        const subtask = await Subtask.findById(subtaskId);
        
        if (!subtask) {
            return res.status(404).json({ message: "Subtask not found" });
        }

        // Find the parent task that contains this subtask
        const task = await Task.findOne({ subtasks: subtaskId })
            .populate({
                path: 'subtasks',
                populate: {
                    path: 'assignee',
                    select: 'name email location'
                },
                select: 'name assignee status submission'
            });
        
        console.log('Found task before deletion:', task ? {
            taskId: task._id,
            taskName: task.taskName,
            subtasksCount: task.subtasks.length,
            progress: task.progress,
            status: task.teamStatus
        } : 'Task not found');
        
        if (task) {
            // Store the status of the subtask being deleted
            const deletedSubtaskStatus = subtask.status;
            console.log('Deleting subtask with status:', deletedSubtaskStatus);
            
            // Log the subtask IDs before filtering
            console.log('Subtask IDs before filtering:', task.subtasks.map(s => s._id.toString()));
            console.log('Subtask ID to remove:', subtaskId);
            
            // Remove the subtask from the task's subtasks array
            task.subtasks = task.subtasks.filter(s => s._id.toString() !== subtaskId);
            
            // Log the subtask IDs after filtering
            console.log('Subtask IDs after filtering:', task.subtasks.map(s => s._id.toString()));
            
            console.log('Task after removing subtask:', {
                taskId: task._id,
                taskName: task.taskName,
                subtasksCount: task.subtasks.length,
                progress: task.progress,
                status: task.teamStatus
            });

            console.log('task.subtask: ', task.subtasks);
            
            // Calculate new task progress based on remaining subtasks
            const totalSubtasks = task.subtasks.length;
            console.log('total subtask: ', totalSubtasks);
            if (totalSubtasks > 0) {
                // Get all subtasks with their status
                const subtasks = await Subtask.find({ _id: { $in: task.subtasks.map(s => s._id) } });
                
                const completedSubtasks = subtasks.filter(st => st.status === "Completed").length;
                const inProgressSubtasks = subtasks.filter(st => st.status === "In Progress").length;

                console.log('Subtask status counts:', {
                    totalSubtasks,
                    completedSubtasks,
                    inProgressSubtasks
                });
                
                // Calculate progress: (completedSubtasks / totalSubtasks) * 100
                const progress = Math.round((completedSubtasks/totalSubtasks)*100);
                
                console.log('Calculated progress:', progress);
                
                // Update task progress
                task.progress = progress;
                
                // Update task status based on progress and subtask statuses
                if (completedSubtasks === totalSubtasks) {
                    // If all remaining subtasks are completed, mark the task as completed
                    task.teamStatus = "Completed";
                    task.progress = 100; // Ensure progress is 100%
                    console.log('All subtasks completed, setting task to Completed with 100% progress');
                } else if (completedSubtasks > 0 || inProgressSubtasks > 0) {
                    task.teamStatus = "In Progress";
                    console.log('Some subtasks in progress, setting task to In Progress');
                } else {
                    task.teamStatus = "Not Started";
                    console.log('No subtasks in progress, setting task to Not Started');
                }
                   
                // Special case: If we're deleting an "In Progress" subtask and all remaining subtasks are completed,
                // we need to ensure the task is marked as completed with 100% progress
                if (deletedSubtaskStatus === "In Progress" && completedSubtasks === totalSubtasks) {
                    task.teamStatus = "Completed";
                    task.progress = 100;
                    console.log('Special case: Deleting In Progress subtask with all remaining subtasks completed');
                }
            } else {
                // If no subtasks remain, set progress to 0 and status to "Not Started"
                task.progress = 0;
                task.teamStatus = "Not Started";
                console.log('No subtasks remain, setting task to Not Started with 0% progress');
            }

            // Save the task with updated progress and status
            await task.save();
            
            console.log('Task after update:', {
                taskId: task._id,
                taskName: task.taskName,
                subtasksCount: task.subtasks.length,
                progress: task.progress,
                status: task.teamStatus
            });

            // Find and update the parent project
            const project = await Project.findOne({ tasks: task._id });
            if (project) {
                // Get all tasks for this project
                const projectTasks = await Task.find({ _id: { $in: project.tasks } });
                
                if (projectTasks.length > 0) {
                    // Calculate project progress based on task progress
                    const totalProgress = projectTasks.reduce((sum, task) => sum + task.progress, 0);
                    const projectProgress = Math.round(totalProgress / projectTasks.length);
                    
                    // Update project status based on all tasks
                    const allTasksCompleted = projectTasks.every(task => task.teamStatus === "Completed");
                    const anyTaskInProgress = projectTasks.some(task => task.teamStatus === "In Progress");
                    
                    if (allTasksCompleted) {
                        project.status = "Completed";
                    } else if (anyTaskInProgress) {
                        project.status = "In Progress";
                    } else {
                        project.status = "In Progress";
                    }
                    
                    // Log the status update for debugging
                    console.log('Project status update from subtask deletion:', {
                        projectId: project._id,
                        oldStatus: project.status,
                        newStatus: project.status,
                        allTasksCompleted,
                        anyTaskInProgress,
                        totalTasks: projectTasks.length,
                        completedTasks: projectTasks.filter(t => t.teamStatus === "Completed").length,
                        inProgressTasks: projectTasks.filter(t => t.teamStatus === "In Progress").length
                    });
                    
                    await project.save();
                }
            }
        }

        // Send notification to task assignee if they exist
        if (task.assignee) {
            await sendNotification(
                task.assignee,
                'Subtask Deleted',
                `Subtask "${subtask.name}" has been deleted from task "${task.taskName}".`, 
                'subtask',
                subtaskId
            );
        }
        

        // Delete the subtask
        await Subtask.findByIdAndDelete(subtaskId);

        await logActivity(req.user.id, "Deleted Subtask", subtaskId, "subtask", `Subtask ID: ${subtask.name}`, req.user.parentId);

        res.status(200).json({ 
            message: "Subtask deleted successfully",
            task
        });
    } catch (error) {
        console.error("Error deleting subtask:", error);
        res.status(500).json({ message: "Error deleting subtask", error: error.message });
    }
});

// Update subtask by ID
router.put("/update/subtask/:subtaskId", authMiddleware, permissionMiddleware('edit_subtask') ,async (req, res) => {
    try {
        const { subtaskId } = req.params;
        const { name, description, dueDate, assignee, status, submission, startDate } = req.body;

        console.log('enter in subtask');
        
        // Find the subtask
        const subtask = await Subtask.findById(subtaskId);
        
        if (!subtask) {
            return res.status(404).json({
                success: false,
                message: "Subtask not found"
            });
        }

        // Find the parent task
        const task = await Task.findOne({ subtasks: subtaskId });
        
        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Parent task not found"
            });
        }

        // Check if parent task is completed
        if (task.teamStatus === "Completed") {
            return res.status(400).json({
                success: false,
                message: "Cannot modify subtasks of a completed task"
            });
        }
        
        // Check if the assignee has changed
        const assigneeChanged = assignee && subtask.assignee && assignee.toString() !== subtask.assignee.toString();
        
        // Check if the status has changed
        const statusChanged = status && subtask.status !== status;
        const isCompleted = status === "Completed";
        
        // Update the subtask
        subtask.name = name || subtask.name;
        subtask.description = description || subtask.description;
        subtask.startDate = startDate || subtask.startDate;
        subtask.dueDate = dueDate || subtask.dueDate;
        subtask.assignee = assignee || subtask.assignee;
        subtask.status = status || subtask.status;
        subtask.submission = submission || subtask.submission;
        subtask.assigner = req.user.id;

        await subtask.save();

        // Send notification if the assignee has changed
        if (assigneeChanged && assignee) {
            await sendNotification(
                assignee,
                'Subtask Assigned',
                `Subtask "${name || subtask.name}" has been assigned.`,
                'subtask',
                subtask._id
            );
        }
        
        // Send notification if the status has changed to Completed
        if (statusChanged && isCompleted) {
            if (task.assignee && task.assignee.toString() !== req.user.id) {
                await sendNotification(
                    task.assignee,
                    'Subtask Completed',
                    `Subtask "${name || subtask.name}" for task "${task.taskName}" has been completed.`,
                    'subtask',
                    subtask._id
                );

                // Send notification to manager
                await sendNotificationToManager(
                    task.assignee,
                    'Subtask Completed',
                    `Subtask "${name || subtask.name}" for task "${task.taskName}" has been completed.`,
                    'subtask',
                    subtask._id
                );
            }
        }
        
        // Update the parent task progress
        const subtasks = await Subtask.find({ _id: { $in: task.subtasks } });
        
        const totalSubtasks = subtasks.length;
        const completedSubtasks = subtasks.filter(st => st.status === "Completed").length;
        const inProgressSubtasks = subtasks.filter(st => st.status === "In Progress").length;
        
        const progress = Math.round((completedSubtasks/totalSubtasks)*100);

        console.log('completed subtask', completedSubtasks);
        console.log('in progress subtask', inProgressSubtasks);

        // Update task progress and status
        task.progress = progress;
        
        if (completedSubtasks === totalSubtasks) {
            // If all subtasks are completed, mark the task as completed
            task.teamStatus = "Completed";
            task.progress = 100; // Ensure progress is 100%
            task.completionDate = new Date(); // Set completion date
        } else if (progress > 0) {
            task.teamStatus = "In Progress";
        } else {
            task.teamStatus = "Not Started";
        }
        
        await task.save();
        
        // Find and update the parent project
        const project = await Project.findOne({ tasks: task._id });
        if (project) {
            // Get all tasks for this project
            const projectTasks = await Task.find({ _id: { $in: project.tasks } });
            
            if (projectTasks.length > 0) {
                // Calculate project progress based on task progress
                const totalProgress = projectTasks.reduce((sum, task) => sum + task.progress, 0);
                const projectProgress = Math.round(totalProgress / projectTasks.length);
                
                // Update project status based on all tasks
                const allTasksCompleted = projectTasks.every(task => task.teamStatus === "Completed");
                const anyTaskInProgress = projectTasks.some(task => task.teamStatus === "In Progress");
                
                if (allTasksCompleted) {
                    project.status = "Completed";
                } else if (anyTaskInProgress) {
                    project.status = "In Progress";
                } else {
                    project.status = "In Progress";
                }
                
                // Log the status update for debugging
                console.log('Project status update from subtask update:', {
                    projectId: project._id,
                    oldStatus: project.status,
                    newStatus: project.status,
                    allTasksCompleted,
                    anyTaskInProgress,
                    totalTasks: projectTasks.length,
                    completedTasks: projectTasks.filter(t => t.teamStatus === "Completed").length,
                    inProgressTasks: projectTasks.filter(t => t.teamStatus === "In Progress").length
                });
                
                await project.save();
            }
        }
        
        // Log the activity
        await logActivity(req.user.id, "Updated Subtask", subtask._id, "subtask", `Subtask ID: ${subtask.name} form Task: ${task ? task.taskName : 'Unknown Task'}`, req.user.parentId);

        res.status(200).json({ 
            success: true,
            message: "Subtask updated successfully",
            subtask
        });
    } catch (error) {
        console.error("Error updating subtask:", error);
        res.status(500).json({
            success: false,
            message: "Error updating subtask",
            error: error.message
        });
    }
});

// Add comment to task
router.post("/add/comment/:taskId", authMiddleware, upload.array('attachments', 5), async (req, res) => {
    const taskId = req.params.taskId;
    const { content } = req.body;
    const files = req.files;

    try {
        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        const attachments = files ? files.map(file => ({
            fileName: file.originalname,
            fileUrl: file.path,
            fileType: file.mimetype,
            fileSize: file.size
        })) : [];

        const newComment = new Comment({
            content,
            user: req.user.id,
            task: taskId,
            attachments
        });

        await newComment.save();
        task.comments.push(newComment._id);
        await task.save();

        await logActivity(req.user.id, "Added Comment", newComment._id, "comment", `Comment on Task: ${task.taskId}`, req.user.parentId);

        // Populate the comment with user details
        const populatedComment = await Comment.findById(newComment._id)
            .populate('user', 'name email');

        res.status(201).json({ 
            message: "Comment added successfully", 
            comment: populatedComment 
        });
    } catch (error) {
        console.error("Error adding comment:", error);
        res.status(500).json({ message: "Error adding comment", error: error.message });
    }
});

// Get all due tasks
router.get("/due-tasks", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        
        // Get current date and set time to start of day
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Get date for one week from now
        const oneWeekFromNow = new Date(today);
        oneWeekFromNow.setDate(today.getDate() + 7);
        
        // Build query based on user role
        let query = {};
        
        if (userRole === "admin") {
            // Admin can see all tasks
            query = {
                dueDate: { $exists: true, $ne: null }
            };
        } else if (userRole === "manager") {
            // Manager can see tasks they created or are assigned to
            query = {
                dueDate: { $exists: true, $ne: null },
                $or: [
                    { assignee: userId },
                    { 'subtasks.assignee': userId },
                    { assigner: userId }
                ]
            };
        } else if (userRole === "opic") {
            // OPIC users can see tasks assigned to them or their subtasks
            query = {
                dueDate: { $exists: true, $ne: null },
                $or: [
                    { assignee: userId },
                    { assigner: userId }
                ]
            };
        }
        
        // Find all tasks with due dates
        const tasks = await Task.find(query)
            .populate('assignee', 'name email location')
            .populate('assigner', 'name email')
            .populate({
                path: 'subtasks',
                populate: {
                    path: 'assignee',
                    select: 'name email location'
                },
                select: 'name assignee status submission'
            })
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'name email'
                }
            });
        
        // Get project details for each task
        const tasksWithProjects = await Promise.all(tasks.map(async (task) => {
            const project = await Project.findOne({ tasks: task._id })
                .select('projectName projectId status');
            
            return {
                ...task.toObject(),
                project: project || null
            };
        }));
        
        // Categorize tasks by due status
        const dueTasks = {
            dueToday: tasksWithProjects.filter(task => {
                const taskDueDate = new Date(task.dueDate);
                taskDueDate.setHours(0, 0, 0, 0);
                return taskDueDate.getTime() === today.getTime() && task.teamStatus !== "Completed";
            }),
            dueInWeek: tasksWithProjects.filter(task => {
                const taskDueDate = new Date(task.dueDate);
                taskDueDate.setHours(0, 0, 0, 0);
                return taskDueDate > today && 
                       taskDueDate <= oneWeekFromNow && 
                       task.teamStatus !== "Completed";
            }),
            overdue: tasksWithProjects.filter(task => {
                const taskDueDate = new Date(task.dueDate);
                taskDueDate.setHours(0, 0, 0, 0);
                return taskDueDate < today && task.teamStatus !== "Completed";
            }),
            allDueTasks: tasksWithProjects.filter(task => {
                return task.teamStatus !== "Completed";
            })
        };
        
        // Limit results to 10 for admin users
        if (userRole === "admin") {
            dueTasks.dueToday = dueTasks.dueToday.slice(0, 10);
            dueTasks.dueInWeek = dueTasks.dueInWeek.slice(0, 10);
            dueTasks.overdue = dueTasks.overdue.slice(0, 10);
            dueTasks.allDueTasks = dueTasks.allDueTasks.slice(0, 10);
        }
        
        res.status(200).json({
            success: true,
            message: "Due tasks fetched successfully",
            dueTasks,
            stats: {
                dueToday: dueTasks.dueToday.length,
                dueInWeek: dueTasks.dueInWeek.length,
                overdue: dueTasks.overdue.length,
                total: dueTasks.allDueTasks.length
            }
        });
    } catch (error) {
        console.error("Error fetching due tasks:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching due tasks",
            error: error.message
        });
    }
});

// Get task workload by user
router.get("/workload", authMiddleware, async (req, res) => {
    try {
        // Get current date and set time to start of day
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Get dates for the next 7 days
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            dates.push(date);
        }

        // Get all users based on role
        let users = [];
        if (req.user.role === "admin") {
            // Admin can see all users
            users = await User.find({ role: { $in: ["opic", "manager"] } })
                .select('_id name email role team')
                .sort({ name: 1 }); // Sort users by name
        } else if (req.user.role === "manager") {
            // Manager can see their team members
            users = await User.find({ 
                managerId: req.user.id,
                role: "opic"
            })
            .select('_id name email role team')
            .sort({ name: 1 }); // Sort users by name
        } else if (req.user.role === "opic") {
            // OPIC can only see their own data
            users = [req.user];
        }

        // Initialize result object
        const result = {};
        
        // For each user, calculate workload for each day
        for (const user of users) {
            // Get all non-completed tasks for this user
            const userTasks = await Task.find({
                assignee: user._id,
                teamStatus: { $ne: "Completed" }
            }).lean();
            
            // Initialize workload data for this user
            const workloadData = [];
            
            // For each date, count active tasks for that day
            for (let i = 0; i < dates.length; i++) {
                const currentDate = dates[i];
                
                // Count tasks that are active on this date
                const tasksActiveOnDate = userTasks.filter(task => {
                    const taskStartDate = new Date(task.startDate);
                    const taskDueDate = new Date(task.dueDate);
                    
                    // Set hours to 0 for date comparison
                    taskStartDate.setHours(0, 0, 0, 0);
                    taskDueDate.setHours(0, 0, 0, 0);
                    currentDate.setHours(0, 0, 0, 0);
                    
                    // Task is active if current date is between start date and due date (inclusive)
                    return currentDate >= taskStartDate && currentDate <= taskDueDate;
                }).length;
                
                // Format day label
                let dayLabel;
                if (i === 0) {
                    dayLabel = "Today";
                } else if (i === 1) {
                    dayLabel = "Tomorrow";
                } else {
                    // Format as "DD MMM"
                    const day = currentDate.getDate();
                    const month = currentDate.toLocaleString('default', { month: 'short' });
                    dayLabel = `${day} ${month}`;
                }
                
                // Add to workload data
                workloadData.push({
                    day: dayLabel,
                    tasks: tasksActiveOnDate,
                    active: tasksActiveOnDate > 0,
                    highlight: tasksActiveOnDate > 5 // Highlight if more than 5 tasks
                });
            }
            
            // Add to result with user details
            result[user.name] = {
                workload: workloadData,
                userDetails: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    team: user.team
                }
            };
        }
        
        // Calculate the 'all' field - sum of tasks across all users for each day
        const allWorkloadData = [];
        for (let i = 0; i < dates.length; i++) {
            const currentDate = dates[i];
            
            // Format day label
            let dayLabel;
            if (i === 0) {
                dayLabel = "Today";
            } else if (i === 1) {
                dayLabel = "Tomorrow";
            } else {
                // Format as "DD MMM"
                const day = currentDate.getDate();
                const month = currentDate.toLocaleString('default', { month: 'short' });
                dayLabel = `${day} ${month}`;
            }
            
            // Sum tasks from all users for this day
            let totalTasks = 0;
            for (const userName in result) {
                if (result[userName].workload && result[userName].workload[i]) {
                    totalTasks += result[userName].workload[i].tasks;
                }
            }
            
            // Add to all workload data
            allWorkloadData.push({
                day: dayLabel,
                tasks: totalTasks,
                active: totalTasks > 0,
                highlight: totalTasks > 15 // Highlight if more than 15 tasks
            });
        }
        
        // Add the 'all' field to the result
        result.All = {
            workload: allWorkloadData,
            userDetails: {
                name: "All Users",
                role: "aggregate"
            }
        };

        // Convert result object to array and sort by name
        const sortedResult = Object.entries(result)
            .sort(([nameA], [nameB]) => {
                // Keep 'all' at the end
                if (nameA === 'All') return 1;
                if (nameB === 'All') return -1;
                return nameA.localeCompare(nameB);
            })
            .reduce((acc, [name, data]) => {
                acc[name] = data;
                return acc;
            }, {});
        
        res.status(200).json({
            success: true,
            message: "Task workload fetched successfully",
            workload: sortedResult
        });
    } catch (error) {
        console.log("Error fetching task workload:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching task workload",
            error: error.message
        });
    }
});

// Get OPIC workload for managers
router.get("/opic-workload", authMiddleware, async (req, res) => {
    try {
        // Check if user is manager
        if (req.user.role !== "manager") {
            return res.status(403).json({ message: "Access denied. Manager only." });
        }

        const managerId = req.user.id;
        
        // Get current date and set time to start of day
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Get dates for the next 7 days
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            dates.push(date);
        }
        
        // Find all OPICs assigned to this manager
        const opics = await User.find({ 
            managerId: managerId,
            role: "opic"
        }).select('_id name');
        
        if (!opics || opics.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No OPICs found for this manager",
                workload: {}
            });
        }
        
        // Get all tasks assigned to these OPICs
        const opicIds = opics.map(opic => opic._id);
        const tasks = await Task.find({
            assignee: { $in: opicIds }
        }).lean();
        
        // Initialize result object
        const result = {};
        
        // For each OPIC, calculate workload for each day
        for (const opic of opics) {
            // Filter tasks for this OPIC
            const opicTasks = tasks.filter(task => 
                task.assignee.toString() === opic._id.toString()
            );
            
            // Initialize workload data for this OPIC
            const workloadData = [];
            
            // For each date, count tasks active on that day
            for (let i = 0; i < dates.length; i++) {
                const date = dates[i];
                const dateStr = date.toISOString().split('T')[0];
                
                // Count tasks active on this date
                const tasksActiveOnDate = opicTasks.filter(task => {
                    // Convert task dates to Date objects if they're strings
                    const taskCreatedAt = task.createdAt instanceof Date ? 
                        task.createdAt : new Date(task.createdAt);
                    
                    const taskDueDate = task.dueDate instanceof Date ? 
                        task.dueDate : new Date(task.dueDate);
                    
                    // Set hours to 0 for date comparison
                    const taskCreatedDate = new Date(taskCreatedAt);
                    taskCreatedDate.setHours(0, 0, 0, 0);
                    
                    const taskDueDateOnly = new Date(taskDueDate);
                    taskDueDateOnly.setHours(0, 0, 0, 0);
                    
                    // Task is active if:
                    // 1. It was created on or before this date AND
                    // 2. It's due on or after this date
                    return taskCreatedDate <= date && taskDueDateOnly >= date;
                }).length;
                
                // Format day label
                let dayLabel;
                if (i === 0) {
                    dayLabel = "Today";
                } else if (i === 1) {
                    dayLabel = "Tomorrow";
                } else {
                    // Format as "DD MMM"
                    const day = date.getDate();
                    const month = date.toLocaleString('default', { month: 'short' });
                    dayLabel = `${day} ${month}`;
                }
                
                // Add to workload data
                workloadData.push({
                    day: dayLabel,
                    tasks: tasksActiveOnDate,
                    active: tasksActiveOnDate > 0,
                    highlight: tasksActiveOnDate > 15 // Highlight if more than 15 tasks
                });
            }
            
            // Add to result
            result[opic.name] = workloadData;
        }
        
        res.status(200).json({
            success: true,
            message: "OPIC workload fetched successfully",
            workload: result
        });
    } catch (error) {
        console.log("Error fetching OPIC workload:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching OPIC workload",
            error: error.message
        });
    }
});

// Get task performance data
router.get("/performance", authMiddleware, async (req, res) => {
    try {
        // Get current date and set time to start of day
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Define all teams
        const allTeams = ["Sales", "Full Stack", "Data Science and AI", "Back-end Team (BD)"];
        
        // Initialize result object for all periods
        const result = {
            week: {},
            month: {},
            year: {}
        };
        
        // Determine which teams to include based on user role
        let teamsToInclude = [];
        
        if (req.user.role === "admin") {
            // Admin can see all teams
            teamsToInclude = [...allTeams];
        } else if (req.user.role === "manager") {
            // Manager can only see their team
            const manager = await User.findById(req.user.id);
            if (manager && manager.team) {
                teamsToInclude = [manager.team];
            }
        } else if (req.user.role === "opic") {
            // OPIC can only see their own performance
            const opic = await User.findById(req.user.id);
            if (opic && opic.team) {
                teamsToInclude = [opic.team];
            }
        }
        
        // Process each period
        const periods = [
            { name: 'week', days: 7 },
            { name: 'month', days: 30 },
            { name: 'year', months: 12 }
        ];
        
        for (const period of periods) {
            // Calculate date ranges based on period
            let startDate, endDate, dates = [];
            
            if (period.name === 'year') {
                // For year view: Get last 12 months excluding current month
                endDate = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of previous month
                startDate = new Date(endDate);
                startDate.setMonth(startDate.getMonth() - 11); // Go back 11 more months
                
                // Generate monthly data points for year view
                for (let date = new Date(startDate); date <= endDate; date.setMonth(date.getMonth() + 1)) {
                    dates.push(new Date(date));
                }
            } else if (period.name === 'week') {
                // For week view: Get last 7 days excluding current day
                endDate = new Date(today);
                endDate.setDate(today.getDate() - 1); // Yesterday
                startDate = new Date(endDate);
                startDate.setDate(endDate.getDate() - 6); // 7 days before yesterday
                
                // Generate daily data points for week view
                for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
                    dates.push(new Date(date));
                }
            } else {
                // For month view: Get last 30 days excluding current day
                endDate = new Date(today);
                endDate.setDate(today.getDate() - 1); // Yesterday
                startDate = new Date(endDate);
                startDate.setDate(endDate.getDate() - 29); // 30 days before yesterday
                
                // Generate daily data points for month view
                for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
                    dates.push(new Date(date));
                }
            }
            
            // For each team to include, calculate performance data
            for (const teamName of teamsToInclude) {
                // Find all users in this team
                let teamUserIds = [];
                
                if (req.user.role === "admin") {
                    // Admin sees all OPICs in the team
                    const teamUsers = await User.find({ 
                        team: teamName,
                        role: "opic"
                    }).select('_id');
                    teamUserIds = teamUsers.map(user => user._id);
                } else if (req.user.role === "manager") {
                    // Manager sees only their OPICs
                    const teamUsers = await User.find({ 
                        team: teamName,
                        role: "opic",
                        managerId: req.user.id
                    }).select('_id');
                    teamUserIds = teamUsers.map(user => user._id);
                } else if (req.user.role === "opic") {
                    // OPIC sees only their own data
                    teamUserIds = [req.user.id];
                }
                
                // Get all tasks for these users
                const teamTasks = await Task.find({
                    assignee: { $in: teamUserIds }
                }).lean();
                
                // Initialize performance data for this team
                const teamPerformanceData = [];
                
                // For each date, calculate target and achieved tasks
                for (let i = 0; i < dates.length; i++) {
                    const date = dates[i];
                    
                    // Format date label based on period
                    let dateLabel;
                    if (period.name === 'year') {
                        // For year view, show month and year
                        dateLabel = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                    } else {
                        // For week and month views, show day and month
                        dateLabel = date.toLocaleString('default', { day: 'numeric', month: 'short' });
                    }
                    
                    // Count total tasks for this date (target)
                    const targetTasks = teamTasks.filter(task => {
                        const taskDueDate = task.dueDate instanceof Date ? 
                            task.dueDate : new Date(task.dueDate);
                        
                        if (period.name === 'year') {
                            // For year view, compare month and year
                            return taskDueDate.getMonth() === date.getMonth() && 
                                   taskDueDate.getFullYear() === date.getFullYear();
                        } else {
                            // For week and month views, compare full date
                            const taskDueDateOnly = new Date(taskDueDate);
                            taskDueDateOnly.setHours(0, 0, 0, 0);
                            return taskDueDateOnly.getTime() === date.getTime();
                        }
                    }).length;
                    
                    // Count completed tasks for this date (achieved)
                    const achievedTasks = teamTasks.filter(task => {
                        if (task.teamStatus !== "Completed") return false;
                        
                        const taskDueDate = task.dueDate instanceof Date ? 
                            task.dueDate : new Date(task.dueDate);
                        
                        if (period.name === 'year') {
                            // For year view, compare month and year
                            return taskDueDate.getMonth() === date.getMonth() && 
                                   taskDueDate.getFullYear() === date.getFullYear();
                        } else {
                            // For week and month views, compare full date
                            const taskDueDateOnly = new Date(taskDueDate);
                            taskDueDateOnly.setHours(0, 0, 0, 0);
                            return taskDueDateOnly.getTime() === date.getTime();
                        }
                    }).length;
                    
                    // Add to team performance data
                    teamPerformanceData.push({
                        date: dateLabel,
                        target: targetTasks,
                        achieved: achievedTasks,
                        highlight: achievedTasks < targetTasks * 0.7 // Highlight if achieved is less than 70% of target
                    });
                }
                
                // Add to result for this period
                result[period.name][teamName] = teamPerformanceData;
            }
            
            // Calculate the 'all' field for this period
            const allPerformanceData = [];
            for (let i = 0; i < dates.length; i++) {
                const date = dates[i];
                
                // Format date label based on period
                let dateLabel;
                if (period.name === 'year') {
                    dateLabel = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                } else {
                    dateLabel = date.toLocaleString('default', { day: 'numeric', month: 'short' });
                }
                
                // Sum targets and achievements from included teams
                let totalTarget = 0;
                let totalAchieved = 0;
                
                for (const teamName of teamsToInclude) {
                    if (result[period.name][teamName] && result[period.name][teamName][i]) {
                        totalTarget += result[period.name][teamName][i].target;
                        totalAchieved += result[period.name][teamName][i].achieved;
                    }
                }
                
                // Add to all performance data
                allPerformanceData.push({
                    date: dateLabel,
                    target: totalTarget,
                    achieved: totalAchieved,
                    highlight: totalAchieved < totalTarget * 0.7 // Highlight if achieved is less than 70% of target
                });
            }
            
            // Add the 'all' field to the result for this period
            result[period.name].all = allPerformanceData;
        }
        
        res.status(200).json({
            success: true,
            message: "Team performance data fetched successfully",
            performance: result
        });
    } catch (error) {
        console.log("Error fetching team performance data:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching team performance data",
            error: error.message
        });
    }
});

router.post("/:taskId/dependencies", authMiddleware, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { personId, description } = req.body;
     console.log("Adding dependency:", { taskId, personId, description });
    // ✅ Validation
    if (!personId || !description) {
      return res.status(400).json({ message: "Person and description are required." });
    }

    // ✅ Find main task
    const mainTask = await Task.findById(taskId).populate("assigner", "name email");
    if (!mainTask) {
      return res.status(404).json({ message: "Task not found." });
    }

    // ✅ Prevent adding dependency if task is already completed
    if (mainTask.teamStatus === "Completed") {
      return res.status(400).json({
        message: "Cannot add dependency to a completed task.",
      });
    }

    // ✅ Check if dependency already exists for same person & description
    const exists = mainTask.dependencies.some(
      (d) =>
        d.personId.toString() === personId.toString() &&
        d.description.trim().toLowerCase() === description.trim().toLowerCase()
    );

    if (exists) {
      return res.status(400).json({ message: "This dependency already exists for this person." });
    }

    // ✅ Push new dependency (default status = Pending)
    mainTask.dependencies.push({
      personId,
      description,
      status: "Pending",
    });

    await mainTask.save();

    // ✅ Fetch person details for email
    const assignedUser = await User.findById(personId).select("name email");

    // ✅ Prepare email content
    const emailSubject = "📌 New Dependency Assigned";
    const emailBody =
      `Hi ${assignedUser?.name || "User"},\n\n` +
      `You have been assigned a new dependency for task "${mainTask.taskName}".\n\n` +
      `Dependency Details:\n` +
      `- Description: ${description}\n` +
      `- Status: Pending\n` +
      `- Task: ${mainTask.taskName}\n` +
      `- Assigned By: ${mainTask.assigner?.name || "Manager"}\n` +
      `Please check your Dependency list for more details.\n\n` +
      `Regards,\nSGC Team`;

    try {
      // ✅ Send email to assigned person
      if (assignedUser?.email) {
        await sendTaskEmail(assignedUser.email, emailSubject, emailBody);
      }

      // ✅ Send copy to testing email also
    } catch (emailErr) {
      console.error("📨 Error sending dependency email:", emailErr.message);
    }

    return res.status(200).json({
      message: "Dependency added successfully, email sent to assigned person.",
      task: mainTask,
    });
  } catch (error) {
    console.error("Error adding dependency:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});


router.put("/:taskId/dependencies/status", authMiddleware, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { depId, status, userId } = req.body;

    // ✅ Validation
    if (!depId || !status || !userId) {
      return res.status(400).json({
        message: "Dependency ID, status, and user ID are required.",
      });
    }

    if (!["Pending", "In Progress", "Completed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value." });
    }

    // ✅ Find task
    const task = await Task.findById(taskId).populate("assigner", "name email");
    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    // ✅ Find dependency
    const dependency = task.dependencies.id(depId);
    if (!dependency) {
      return res.status(404).json({ message: "Dependency not found." });
    }

    // ✅ Ensure only assigned person can update their dependency
    if (dependency.personId.toString() !== userId.toString()) {
      return res.status(403).json({
        message: "You are not authorized to update this dependency status.",
      });
    }

    // ✅ Update status
    dependency.status = status;
    await task.save();

    // ✅ Fetch assigned user details
    const assignedUser = dependency.personId;

    // ✅ Prepare email body
    const emailSubject = "🔔 Dependency Status Updated";
    const emailBody =
      `Hi ${task.assigner?.name || "User"},\n\n` +
      `The dependency for task "${task.taskName}" has been updated.\n\n` +
      `Dependency Details:\n` +
      `- Description: ${dependency.description || "No description"}\n` +
      `- Updated Status: ${status}\n` +
      `- Updated By: ${assignedUser?.name || "User"}\n\n` +
      `Regards,\nSGC Team`;

    try {
      // ✅ Send email to assigner
      if (task.assigner?.email) {
        await sendTaskEmail(task.assigner.email, emailSubject, emailBody);
      }

      // ✅ Send copy to testing email
    } catch (mailErr) {
      console.error("📨 Error sending dependency status email:", mailErr.message);
    }

    return res.status(200).json({
      message: "Dependency status updated successfully",
      task,
    });
  } catch (error) {
    console.error("Error updating dependency status:", error);
    return res.status(500).json({
      message: "Failed to update dependency status",
      error: error.message,
    });
  }
});



router.get("/dependencies/:personId",authMiddleware,async (req, res) => {
  try {
    const { personId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(personId)) {
      return res.status(400).json({ message: "Invalid person ID" });
    }

    // ✅ Find all tasks that have at least one dependency for this person
    const tasks = await Task.find({ "dependencies.personId": personId })
      .select("taskName taskId dependencies teamStatus dueDate assigner")
      .populate("dependencies.personId", "name email") // populate user details
      .lean();

    if (!tasks || tasks.length === 0) {
      return res.status(404).json({ message: "No tasks found for this person." });
    }
     console.log("tasks", tasks);
    // ✅ Filter dependencies to return only those matching the personId
    const filteredTasks = tasks.map((task) => ({
      _id: task._id,
      taskId: task.taskId,
      taskName: task.taskName,
      teamStatus: task.teamStatus,
      dueDate: task.dueDate,
      assigner: task.assigner,
      dependencies: task.dependencies.filter(
        (dep) => dep.personId._id.toString() === personId
      ),
    }));

    return res.status(200).json({
      message: "Tasks fetched successfully",
      tasks: filteredTasks,
    });
  } catch (error) {
    console.error("Error fetching tasks by personId:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get subtasks with 'In Review' status
router.get("/review-subtasks", authMiddleware, async (req, res) => {
    try {
        // Check if user is admin or manager
        console.log('enter in review subtask');
        if (req.user.role !== "admin" && req.user.role !== "manager") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Only admin and manager can view subtasks in review."
            });
        }

        let query = { status: "In Review" };

        // If user is manager, only show subtasks they assigned
        if (req.user.role === "manager") {
            query.assigner = req.user.id;
        }

        console.log('query', query);

        // Find subtasks with populated fields
        const subtasks = await Subtask.find(query)
            .populate('assignee', 'name email role')
            .populate('assigner', 'name email role')
            .populate({
                path: 'task',
                select: 'taskName taskId',
                populate: {
                    path: 'project',
                    select: 'projectId projectName'
                }
            });

        console.log('subtasks', subtasks);

        // Format the response
        const formattedSubtasks = subtasks.map(subtask => ({
            subtaskId: subtask._id,
            name: subtask.name,
            status: subtask.status,
            submission: subtask.submission,
            startDate: subtask.startDate,
            dueDate: subtask.dueDate,
            assignee: {
                id: subtask.assignee._id,
                name: subtask.assignee.name,
                email: subtask.assignee.email,
                role: subtask.assignee.role
            },
            assigner: {
                id: subtask.assigner._id,
                name: subtask.assigner.name,
                email: subtask.assigner.email,
                role: subtask.assigner.role
            },
            task: {
                id: subtask.task._id,
                name: subtask.task.taskName,
                taskId: subtask.task.taskId,
                project: {
                    id: subtask.task.project._id,
                    name: subtask.task.project.projectName,
                    projectId: subtask.task.project.projectId
                }
            }
        }));

        res.status(200).json({
            success: true,
            message: "Subtasks in review fetched successfully",
            data: {
                totalSubtasks: formattedSubtasks.length,
                subtasks: formattedSubtasks
            }
        });

    } catch (error) {
        console.error("Error fetching subtasks in review:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching subtasks in review",
            error: error.message
        });
    }
});

module.exports = router;