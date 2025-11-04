const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const Project = require("../models/Project");
const Task = require('../models/Task1');
const router = express.Router();  
const Subtask = require('../models/SubTask');
const ProjectTemplate = require('../models/ProjectTemplate');
const { logActivity } = require("../middlewares/auditLogMiddleware");
const { sendNotification, sendNotificationsToTeam, sendNotificationsToUsers } = require('../services/notificationService');
const User = require('../models/User');

// router.post("/create", authMiddleware, permissionMiddleware(["create_project"]), (req, res) => {
//     res.json({ message: "Project created successfully" });
// });

router.post("/create", authMiddleware, permissionMiddleware('create_project'), async (req, res) => {
    const { projectName, projectType, projectDescription, startDate, endDate, status, projectOwner, assignedUsers, team, expectedDuration } = req.body; 

    console.log("projectOwner", projectOwner); 
    console.log("assignedUsers", assignedUsers);

    try {
        // Generate project ID in format YYMMDD-XX
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = String(today.getFullYear()).slice(-2);
        
        // Find the latest project ID for today
        const latestProject = await Project.findOne({
            projectId: new RegExp(`^PJ${year}${month}${day}-`)
        }).sort({ projectId: -1 });

        let sequenceNumber = '0001';
        if (latestProject) {
            const lastSequence = parseInt(latestProject.projectId.split('-')[1]);
            sequenceNumber = String(lastSequence + 1).padStart(4, '0');
        }
 
        const projectId = `PJ${year}${month}${day}-${sequenceNumber}`;

        // Check if a template exists for this project type
        const template = await ProjectTemplate.findOne({ projectName: projectType});
        
        // Create the project
        const newProject = new Project({
            projectId,
            projectName,
            projectType,
            startDate,
            endDate,    
            projectDescription,
            owner: req.user.id, 
            projectOwner: projectOwner,
            assignedUsers: assignedUsers || [],
            status: "In Progress",
            team,
            expectedDuration,
        });
    
        // await newProject.save();

        // If template exists, create all tasks and subtasks from template
        if (template) {
            const parsedStartDate = new Date(startDate);
            let taskSequence = 1; // Initialize task sequence counter

            for (const taskTemplate of template.tasks) {
                // Generate task ID in format TKYYMMDD-XXXX
                const today = new Date();
                const yy = String(today.getFullYear()).slice(-2);
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                const datePart = `${yy}${mm}${dd}`;
                const prefix = `TK${datePart}`;

                // Find the latest task ID for today
                const latestTask = await Task.findOne({
                    taskId: new RegExp(`^${prefix}-\\d{4}$`)
                }).sort({ taskId: -1 });

                let sequenceNumber = '0001';
                if (latestTask) {
                    const lastSequence = parseInt(latestTask.taskId.split('-')[1]);
                    sequenceNumber = String(lastSequence + 1).padStart(4, '0');
                }

                const taskId = `${prefix}-${sequenceNumber}`;

                // Create task
                const newTask = new Task({
                    taskName: taskTemplate.taskName,
                    taskId: taskId,
                    assigner: req.user.id,
                    teamStatus: "Not Started",
                    progress: 0,
                    subtasks: []
                });  

                await newTask.save();
                
                // Create subtasks from template
                if (taskTemplate.subtasks && taskTemplate.subtasks.length > 0) {
                    for (const subtaskTemplate of taskTemplate.subtasks) {
                        const newSubtask = new Subtask({
                            name: subtaskTemplate.name,
                            task: newTask._id,
                            status: "Not Started",
                            createdBy: req.user.id,
                        });

                        await newSubtask.save();
                        newTask.subtasks.push(newSubtask._id);
                    }
                    // Save task after adding all subtasks
                    await newTask.save();
                }

                // Add task to project
                newProject.tasks.push(newTask._id);
            }

            await newProject.save();
        }

        await logActivity(req.user.id, "Created Project", newProject._id, "project", `Project ID: ${projectName}`, req.user.parentId);

        res.status(201).json({ 
            message: "Project created successfully", 
            project: newProject,
            usedTemplate: template ? true : false
        });
    } catch (error) {

        console.log("Error creating project", error);
        res.status(500).json({ message: "Error creating project", error });
    }
});

// Get projects based on user's role and assigned users
router.get("/view", authMiddleware, async (req, res) => {
    try {
        let projects;
        const user = await User.findById(req.user.id);

        if (req.user.role === "admin") {
            // Admin can see all projects
            projects = await Project.find()
                .populate('owner', 'name email')
                .populate('projectOwner', 'name email')
                .populate('assignedUsers', 'name email')
                .populate('teamMembers', 'name email');
        } else {
            // Regular users can only see projects they are assigned to or own
            projects = await Project.find({
                $or: [
                    { projectOwner: req.user.id },
                    { assignedUsers: req.user.id }
                ]
            })
            .populate('owner', 'name email')
            .populate('projectOwner', 'name email')
            .populate('assignedUsers', 'name email')
            .populate('teamMembers', 'name email');
        }

        res.status(200).json(projects);
    } catch (error) {
        res.status(500).json({ message: "Error fetching projects", error });
    }
});
   

// Route to update a project
// permissionMiddleware(["edit_project"])
router.put("/update/:projectId", authMiddleware, permissionMiddleware('edit_project'), async (req, res) => {
    try {
        const { projectId } = req.params;
        const { projectName, projectDescription, startDate, endDate, team, expectedDuration, projectType, status, projectOwner, assignedUsers } = req.body;
        
        // Find the project
        const project = await Project.findById(projectId);
        
        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found"
            });
        }

        // Check if project is completed
        if (project.status === "Completed") {
            return res.status(400).json({
                success: false,
                message: "Cannot modify a completed project"
            });
        }
        
        // Store old values for audit log
        const oldValues = {
            projectName: project.projectName,
            projectDescription: project.projectDescription,
            startDate: project.startDate,
            endDate: project.endDate,
            team: project.team,
            expectedDuration: project.expectedDuration,
            projectType: project.projectType,
            status: project.status,
            projectOwner: project.projectOwner,
            assignedUsers: project.assignedUsers
        };
        
        // Update the project
        project.projectName = projectName || project.projectName;
        project.projectDescription = projectDescription || project.projectDescription;
        project.startDate = startDate || project.startDate;
        project.endDate = endDate || project.endDate;
        project.team = team || project.team;
        project.expectedDuration = expectedDuration || project.expectedDuration;
        project.projectType = projectType || project.projectType;
        project.projectOwner = projectOwner || project.projectOwner;
        if (assignedUsers) {
            project.assignedUsers = assignedUsers;
        }
        
        // Handle status change
        if (status && status !== project.status) {
            if (status === "Completed") {
                // Check if all tasks are completed
                const tasks = await Task.find({ _id: { $in: project.tasks } });
                const allTasksCompleted = tasks.every(task => task.teamStatus === "Completed");
                
                if (!allTasksCompleted) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot mark project as completed until all tasks are completed"
                    });
                }
                
                project.status = status;
                project.completionDate = new Date();
            } else {
                project.status = status;
            }
        }
        
        await project.save();

        console.log('updated projects', project);
        
        // Create audit log entry for project update
        const changes = [];
        if (projectName && projectName !== oldValues.projectName) {
            changes.push(`Project name changed from "${oldValues.projectName}" to "${projectName}"`);
        }
        if (projectDescription && projectDescription !== oldValues.projectDescription) {
            changes.push(`Description updated`);
        }
        if (expectedDuration && expectedDuration !== oldValues.expectedDuration) {
            changes.push(`Expected Duration updated`);
        }
        if (status && status !== oldValues.status) {
            changes.push(`Status changed to ${status}`);
        }
        if (projectOwner && projectOwner.toString() !== oldValues.projectOwner?.toString()) {
            changes.push(`Project owner changed`);
        }
        if (assignedUsers && JSON.stringify(assignedUsers) !== JSON.stringify(oldValues.assignedUsers)) {
            changes.push(`Assigned users updated`);
        }
        else {
            changes.push(`Project updated`);
        }

        // Log the activity with all changes
        if (changes.length > 0) {
            await logActivity(
                req.user.id,
                "Updated Project",
                project._id,
                "project",
                `Changes made Project ID: ${changes.join(", ")}`,
                req.user.parentId
            );
        }

        // Send notifications if assigned users have changed
        if (assignedUsers && JSON.stringify(assignedUsers) !== JSON.stringify(oldValues.assignedUsers)) {
            // Notify newly assigned users
            const newAssignedUsers = assignedUsers.filter(userId => 
                !oldValues.assignedUsers.includes(userId)
            );
            
            if (newAssignedUsers.length > 0) {
                await sendNotificationsToUsers(
                    newAssignedUsers,
                    'Project Assignment',
                    `You have been assigned to the project "${project.projectName}"`,
                    'project',
                    project._id
                );
            }
        }

        // Send notification if project is completed
        if (status === "Completed" && status !== oldValues.status) {
            await sendNotificationsToUsers(
                project.assignedUsers,
                'Project Completed',
                `The project "${project.projectName}" has been completed.`,
                'project',
                project._id
            );
        }
        
        res.status(200).json({
            success: true,
            message: "Project updated successfully",
            project
        });
    } catch (error) {
        console.error("Error updating project:", error);
        res.status(500).json({
            success: false,
            message: "Error updating project",
            error: error.message
        });
    }
});

router.delete("/delete/:id", authMiddleware, permissionMiddleware('delete_project'), async (req, res) => {
    try {

        const { id } = req.params;
        
        const project = await Project.findById(id);
        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }

        // Step 2: Delete all comments related to the project's tasks
        const tasks = await Task.find({ _id: { $in: project.tasks } });
        console.log("Tasks related to the project:", tasks);

        if (tasks.length > 0) {
            tasks.forEach(async (task) => {
                const subtasks = task.subtasks;  // Extract subtask IDs directly from task.subtasks
                console.log(`Subtasks for task ${task._id}:`, subtasks);

                // Step 5: Delete subtasks by their IDs
                await Subtask.deleteMany({ _id: { $in: subtasks } });
                console.log(`Subtasks with IDs ${subtasks} deleted successfully`);
            });
        }

        
        await Task.deleteMany({ _id: { $in: project.tasks } });

        await Project.findByIdAndDelete(id);

        await logActivity(req.user.id, "Deleted Project", id, "project", `Project ID: ${project.projectName}`, req.user.parentId);

        res.status(200).json({ message: "Project and all related tasks, subtasks, and comments deleted successfully" });
    } catch (error) {
        console.error("Error deleting project:", error);
        res.status(500).json({ message: "Error deleting project and its related tasks, subtasks, and comments", error });
    }
});

// Get project statistics
router.get("/stats", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        let query = {};

        // Set query based on user role
        if (req.user.role === "admin") {
            // Admin can see all projects
            query = {};
        } else {
            query = {
                $or: [
                    { projectOwner: req.user.id },
                    { assignedUsers: req.user.id }
                ]
            };
        } 

        // Get current date and set time to start of day
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Calculate start of current week (Saturday)
        const startOfWeek = new Date(today);
        const currentDay = today.getDay(); // 0 is Sunday, 6 is Saturday
        const daysToSubtract = (currentDay + 1) % 7; // Days to go back to reach last Saturday
        startOfWeek.setDate(today.getDate() - daysToSubtract);

        // Calculate end of current week (Sunday)
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // Add 6 days to reach Sunday
        endOfWeek.setHours(23, 59, 59, 999); // Set to end of Sunday

        // Get all projects based on query
        const projects = await Project.find(query);

        // Calculate statistics
        const stats = {
            totalProjects: projects.length,
            completedProjects: projects.filter(project => project.status === "Completed").length,
            dueToday: projects.filter(project => {
                const projectEndDate = new Date(project.endDate);
                projectEndDate.setHours(0, 0, 0, 0);
                return projectEndDate.getTime() === today.getTime() && project.status !== "Completed";
            }).length,
            dueThisWeek: projects.filter(project => {
                const projectEndDate = new Date(project.endDate);
                projectEndDate.setHours(0, 0, 0, 0);
                return projectEndDate >= startOfWeek && 
                       projectEndDate <= endOfWeek && 
                       project.status !== "Completed";
            }).length, 
            overdue: projects.filter(project => {
                const projectEndDate = new Date(project.endDate);
                projectEndDate.setHours(0, 0, 0, 0);
                return projectEndDate < today && project.status !== "Completed";
            }).length,
            statusBreakdown: {
                pending: projects.filter(project => project.status === "Pending").length,
                inProgress: projects.filter(project => project.status === "In Progress").length,
                completed: projects.filter(project => project.status === "Completed").length
            }
        };

        res.status(200).json({
            message: "Project statistics fetched successfully",
            stats
        });
    } catch (error) {
        console.error("Error fetching project statistics:", error);
        res.status(500).json({ message: "Error fetching project statistics", error: error.message });
    }
});

// Get overall performance data for all projects
router.get("/overall-performance", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        let query = {};

        // Set query based on user role
        if (req.user.role === "admin") {
            query = {};
        } else if (req.user.role === "manager") {
            query = {
                $or: [
                    { projectOwner: req.user.id },
                    { assignedUsers: req.user.id }
                ]
            };
        } else if (req.user.role === "opic") {
            query = {
                $or: [
                    { projectOwner: req.user.id },
                    { assignedUsers: req.user.id }
                ]
            };
        }

        // Get all projects with their tasks and subtasks
        const projects = await Project.find(query)
            .populate({
                path: 'tasks',
                populate: {
                    path: 'subtasks',
                    select: 'status updatedAt name'  // Include updatedAt for completion date
                }
            });

        // Get the date range (last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        // Initialize the performance data array
        const performanceData = [];

        // Loop through each day in the range
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            const currentDate = new Date(date);
            currentDate.setHours(23, 59, 59, 999); // End of the day
            
            let targetTasks = 0;
            let achievedTasks = 0;
            let totalSubtasks = 0;
            let completedSubtasks = 0;

            // Calculate targets and achievements for each project
            projects.forEach(project => {
                const projectStartDate = new Date(project.startDate);
                const projectEndDate = new Date(project.endDate);
                
                // Skip if the project hasn't started yet
                if (currentDate < projectStartDate) {
                    return;
                }

                // Calculate target subtasks for this date
                project.tasks.forEach(task => {
                    if (!task.subtasks || !task.subtasks.length) return;

                    const taskSubtasks = task.subtasks.length;
                    totalSubtasks += taskSubtasks;

                    // Calculate how many subtasks should be completed by this date
                    const taskStartDate = projectStartDate; // You might want to add a startDate field to tasks
                    const taskEndDate = new Date(task.dueDate) || projectEndDate;
                    const totalTaskDays = (taskEndDate - taskStartDate) / (1000 * 60 * 60 * 24);
                    const daysElapsed = (currentDate - taskStartDate) / (1000 * 60 * 60 * 24);
                    
                    // Calculate target subtasks for this task by this date
                    if (totalTaskDays > 0) {
                        const expectedSubtasksCompleted = Math.round((daysElapsed / totalTaskDays) * taskSubtasks);
                        targetTasks += expectedSubtasksCompleted;
                    }

                    // Count actually completed subtasks by this date
                    const completedByDate = task.subtasks.filter(subtask => 
                        subtask.status === "Completed" && 
                        new Date(subtask.updatedAt) <= currentDate
                    ).length;

                    completedSubtasks += completedByDate;
                    achievedTasks += completedByDate;
                });
            });

            // Format the date as "DD MMM"
            const formattedDate = currentDate.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short'
            });

            // Add the data point
            performanceData.push({
                date: formattedDate,
                target: parseFloat((targetTasks).toFixed(1)),
                achieved: parseFloat((achievedTasks).toFixed(1)),
                highlight: currentDate.toDateString() === new Date().toDateString(), // Highlight today's date
                totalSubtasks,
                completedSubtasks
            });
        }

        res.status(200).json({
            message: "Overall project performance data fetched successfully",
            performanceData
        });
    } catch (error) {
        console.error("Error fetching overall project performance:", error);
        res.status(500).json({ message: "Error fetching overall project performance", error: error.message });
    }
});

// Get count of projects assigned to a user
router.get("/assigned-count/:userId", authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        // Check if the requesting user has permission to view this data
        if (req.user.role !== "admin" && req.user.id !== userId) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to view this data"
            });
        }

        // Count projects where the user is in assignedTo array
        const assignedProjectsCount = await Project.countDocuments({
            assignedTo: userId
        });

        // Get projects with their status
        const assignedProjects = await Project.find({
            assignedTo: userId
        }).select('status');

        // Calculate status breakdown
        const statusBreakdown = {
            total: assignedProjectsCount,
            pending: assignedProjects.filter(p => p.status === "Pending").length,
            inProgress: assignedProjects.filter(p => p.status === "In Progress").length,
            completed: assignedProjects.filter(p => p.status === "Completed").length
        };

        res.status(200).json({
            success: true,
            message: "Project count fetched successfully",
            data: {
                assignedProjectsCount,
                statusBreakdown
            }
        });
    } catch (error) {
        console.error("Error fetching assigned projects count:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching assigned projects count",
            error: error.message
        });
    }
});

// Get user performance metrics
router.get("/performance", authMiddleware, async (req, res) => {
    try {
        const { userId, startDate, endDate } = req.query;
        const currentUser = await User.findById(req.user.id);

        // Validate date range if provided
        let dateQuery = {};
        if (startDate && endDate) {
            dateQuery = {
                createdAt: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        // Determine which users' performance data to fetch based on role
        let targetUsers = [];
        if (req.user.role === "admin") {
            // Admin can see all users' performance
            const allUsers = await User.find();
            targetUsers = allUsers.map(user => user._id);
        } else if (req.user.role === "manager") {
            // Manager can only see OPIC users' performance
            const opicUsers = await User.find({ role: "opic" });
            targetUsers = opicUsers.map(user => user._id);
        } else {
            // OPIC users can only see their own performance
            targetUsers = [req.user.id];
        }

        // If specific userId is provided and user has permission to view it
        if (userId) {
            const targetUser = await User.findById(userId);
            if (!targetUser) {
                return res.status(404).json({ message: "User not found" });
            }

            // Check if current user has permission to view this user's performance
            if (req.user.role === "manager" && targetUser.role !== "opic") {
                return res.status(403).json({ message: "You can only view OPIC users' performance" });
            }
            if (req.user.role === "opic" && userId !== req.user.id) {
                return res.status(403).json({ message: "You can only view your own performance" });
            }

            targetUsers = [userId];
        }

        // Get performance data for each target user
        const performanceData = await Promise.all(targetUsers.map(async (userId) => {
            const user = await User.findById(userId).select('name email role');
            
            // Get all projects where user is either projectOwner or assignedUser
            const userProjects = await Project.find({
                $or: [
                    { projectOwner: userId },
                    { assignedUsers: userId }
                ],
                ...dateQuery
            });

            // Calculate metrics
            const totalProjects = userProjects.length;
            const completedProjects = userProjects.filter(project => project.status === "Completed").length;
            const notCompletedProjects = totalProjects - completedProjects; // All projects that are not completed

            // Get recent projects (last 5)
            const recentProjects = userProjects
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, 5)
                .map(project => ({
                    projectId: project.projectId,
                    projectName: project.projectName,
                    status: project.status,
                    completionDate: project.completionDate,
                    submissionStatus: project.submissionStatus
                }));

            return {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                metrics: {
                    totalProjects,
                    completedProjects,
                    notCompletedProjects
                },
                recentProjects
            };
        }));

        res.status(200).json({
            success: true,
            data: performanceData
        });

    } catch (error) {
        console.error("Error fetching performance data:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching performance data",
            error: error.message
        });
    }
});

// Get subtasks with 'In Review' status
router.get("/review-subtasks", authMiddleware, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Only admin can view all subtasks in review."
            });
        }

        // First get all projects
        const projects = await Project.find()
            .populate({
                path: 'tasks',
                populate: {
                    path: 'subtasks',
                    match: { status: "In Review" },
                    populate: [
                        {
                            path: 'assignee',
                            select: 'name email role'
                        },
                        {
                            path: 'assigner',
                            select: 'name email role'
                        }
                    ]
                }
            });

            console.log('projects', projects);

        // Format the response and collect statistics
        const formattedSubtasks = [];
        const stats = {
            totalInReview: 0,
            byProject: {},
            byAssignee: {},
            byAssigner: {},
            overdue: 0
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        
        projects.forEach(project => {
            // Process each task in the project
            project.tasks.forEach(task => {
                // Process each subtask in the task
                task.subtasks.forEach(subtask => {
                    if (subtask.status === "In Review") {
                        // Format subtask data
                        const formattedSubtask = {
                            subtaskId: subtask._id,
                            name: subtask.name,
                            status: subtask.status,
                            submission: subtask.submission,
                            dueDate: subtask.dueDate,
                            assignee: {
                                id: subtask.assignee?._id,
                                name: subtask.assignee?.name,
                                email: subtask.assignee?.email,
                                role: subtask.assignee?.role
                            },
                            assigner: {
                                id: subtask.assigner?._id,
                                name: subtask.assigner?.name,
                                email: subtask.assigner?.email,
                                role: subtask.assigner?.role
                            },
                            task: {
                                id: task._id,
                                name: task.taskName,
                                taskId: task.taskId
                            },
                            project: {
                                id: project._id,
                                name: project.projectName,
                                projectId: project.projectId
                            }
                        };

                        formattedSubtasks.push(formattedSubtask);

                        // Update statistics
                        stats.totalInReview++;

                        // Count by project
                        stats.byProject[project.projectId] = (stats.byProject[project.projectId] || 0) + 1;

                        // Count by assignee
                        if (subtask.assignee?._id) {
                            stats.byAssignee[subtask.assignee._id] = (stats.byAssignee[subtask.assignee._id] || 0) + 1;
                        }

                        // Count by assigner
                        if (subtask.assigner?._id) {
                            stats.byAssigner[subtask.assigner._id] = (stats.byAssigner[subtask.assigner._id] || 0) + 1;
                        }

                        // Count overdue
                        if (subtask.dueDate) {
                            const dueDate = new Date(subtask.dueDate);
                            dueDate.setHours(0, 0, 0, 0);
                            if (dueDate < today) {
                                stats.overdue++;
                            }
                        }
                    }
                });
            });
        });

        res.status(200).json({
            success: true,
            message: "Subtasks in review fetched successfully",
            data: {
                subtasks: formattedSubtasks,
                stats: {
                    totalInReview: stats.totalInReview,
                    overdue: stats.overdue,
                    byProject: Object.entries(stats.byProject).map(([projectId, count]) => ({
                        projectId,
                        count
                    })),
                    byAssignee: Object.entries(stats.byAssignee).map(([assigneeId, count]) => ({
                        assigneeId,
                        count
                    })),
                    byAssigner: Object.entries(stats.byAssigner).map(([assignerId, count]) => ({
                        assignerId,
                        count
                    }))
                }
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
