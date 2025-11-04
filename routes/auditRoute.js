const express = require("express");
const AuditLog = require("../models/AuditLog");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();


router.get("/view-logs", authMiddleware, async (req, res) => {
    const userId = req.user.id;  // Logged-in user (admin/manager/OPIC)
    const parentId = req.user.parentId; // Parent ID of the logged-in user (manager)
    const role = req.user.role;  // User's role (admin, manager, or OPIC)

    try {
        let auditLogs;
        
        if (role === "admin") {
            // Admin can see all audit logs
            auditLogs = await AuditLog.find({})
                .populate("userId", "name email role")
                .sort({ createdAt: -1 });
        } else if (role === "manager") {
            // Manager can see their own logs and logs of OPICs they created
            auditLogs = await AuditLog.find({
                $or: [
                    { userId: userId }, // Manager's own logs
                    { parentId: userId } // Logs of OPICs they created
                ]
            })
            .populate("userId", "name email role")
            .sort({ createdAt: -1 });
        } else if (role === "opic") {
            // OPIC can only see their own audit logs
            auditLogs = await AuditLog.find({ userId: userId })
                .populate("userId", "name email role")
                .sort({ createdAt: -1 });
        }

        res.status(200).json({ auditLogs });
    } catch (error) {
        console.error("Error fetching audit logs:", error);
        res.status(500).json({ message: "Error fetching audit logs", error });
    }
});


module.exports = router;
