const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
// Function to create an audit log
// const logActivity = async (userId, action, objectId, objectType, additionalInfo = "", parentId = null) => {
//     try {
//         const auditLog = new AuditLog({
//             userId,
//             action,
//             objectId,
//             objectType,
//             additionalInfo,
//             parentId,  
//         });

//         await auditLog.save();
//         console.log("Audit log saved successfully");
//     } catch (error) {
//         console.error("Error logging activity:", error);
//     }
// };


const logActivity = async (userId, action, objectId, objectType, additionalInfo = "", parentId = null) => {
    try {
        
        if (!parentId) {
            // If no parentId is provided, we check the role of the user
            const user = await User.findById(userId);
            if (user.role === "manager") {
                parentId = user._id; // Manager's own ID is the parentId
            } else if (user.role === "opic" && user.managerId) {
                parentId = user.managerId; // OPIC's manager ID is the parentId
            }
        }

        const auditLog = new AuditLog({
            userId,
            action,
            objectId,
            objectType,
            additionalInfo,
            parentId, // Parent user (manager or admin)
        });

        await auditLog.save();
        // console.log("Audit log saved successfully", auditLog);
    } catch (error) {
        console.error("Error logging activity:", error);
    }
};


// Example of using logActivity when creating a task
const createTask = async (req, res) => {
    const { taskId, assignee, teamStatus, progress, dueDate } = req.body;
    const userId = req.user._id; // Logged-in user
    const parentId = req.user.parentId; // Parent user (admin/manager)

    try {
        // Create a new task (you can modify this based on your task creation logic)
        const newTask = new Task({
            taskId,
            assignee,
            teamStatus,
            progress,
            dueDate,
        });

        await newTask.save();

        // Log the activity
        await logActivity(userId, "Created Task", newTask._id, "task", `Task created with ID: ${taskId}`, parentId);

        res.status(200).json({ message: "Task created and logged successfully", task: newTask });
    } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ message: "Error creating task", error });
    }
};

module.exports = {logActivity };
