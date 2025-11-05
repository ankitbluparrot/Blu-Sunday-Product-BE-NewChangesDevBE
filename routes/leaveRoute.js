const express = require("express");
const Leave = require("../models/Leave");
const User = require("../models/User");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const { sendTaskEmail } = require("../services/emailServices");

const router = express.Router();

// ✅ Manager IDs (who should receive leave requests)
const MANAGER_IDS = [
  "682db9b50ebdecdad0af6234",
  "68301cc63517dcbb1dd6ab32",
  "682dbad70ebdecdad0af623d",
  "68401b69fdc3b95e30e9840f",
];

// ==============================
// Apply for Leave
// ==============================
// ==============================
// Apply for Leave (max 2 per month)
// ==============================
router.post("/apply", authMiddleware, async (req, res) => {
  try {
    const { employeeId, leaveType, startDate, endDate, reason } = req.body;
    const employee = employeeId || req.user.id;

    // Fetch full user details
    const user = await User.findById(employee).select("name email");
    if (!user) return res.status(404).json({ message: "User not found" });

    // Calculate the month of the requested leave
    const leaveMonth = new Date(startDate).getMonth(); // 0-based month
    const leaveYear = new Date(startDate).getFullYear();

    // Count leaves already applied in the same month (Approved + Pending)
    const leavesThisMonth = await Leave.find({
      employee,
      $or: [{ status: "Approved" }, { status: "Pending" }],
      startDate: {
        $gte: new Date(leaveYear, leaveMonth, 1),
        $lte: new Date(leaveYear, leaveMonth + 1, 0),
      },
    });

    if (leavesThisMonth.length >= 2) {
      return res
        .status(400)
        .json({ message: "You can apply for a maximum of 2 leaves per month" });
    }

    // Save leave request
    const leave = await Leave.create({
      employee,
      leaveType,
      startDate,
      endDate,
      reason,
      status: "Pending",
    });

    // Fetch managers’ emails
    const managers = await User.find({ _id: { $in: MANAGER_IDS } });
    const managerEmails = managers.map((m) => m.email);

    // Email message
    const message = `
📝 NEW LEAVE REQUEST

EMPLOYEE: ${user.name}
EMAIL: ${user.email}

LEAVE TYPE: ${leaveType}
DATES: ${new Date(startDate).toLocaleDateString()} → ${new Date(endDate).toLocaleDateString()}
REASON: ${reason}

Please review and update the status in the Leave Management System.
    `;

    // Send email to managers
    await sendTaskEmail(
      managerEmails,
      `📝 New Leave Request from ${user.name}`,
      message
    );

    res.status(201).json({ message: "Leave applied successfully", leave });
  } catch (error) {
    console.error("Error applying leave:", error);
    res.status(500).json({ message: error.message });
  }
});


// ==============================
// Get All Leaves (Manager/Admin)
// ==============================
router.get(
  "/all",
  authMiddleware,
  permissionMiddleware("view_all_leaves"),
  async (req, res) => {
    try {
      const leaves = await Leave.find()
        .populate("employee", "name email")
        .sort({ createdAt: -1 });
      res.status(200).json(leaves);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// ==============================
// Get Leave Summary (per employee)
// ==============================
// ==============================
// Get Leave Summary (per employee per month)
// ==============================
router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const userId = req.query.employeeId || req.user.id;
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const totalLeavesPerMonth = 2; // max leaves per month

    // Count Approved leaves in the current month
    const leaves = await Leave.find({
      employee: userId,
      status: "Approved",
      startDate: { $gte: monthStart, $lte: monthEnd },
    });

    const leavesTaken = leaves.length;
    const remainingLeaves = totalLeavesPerMonth - leavesTaken;

    res.status(200).json({ totalLeaves: totalLeavesPerMonth, leavesTaken, remainingLeaves });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});


// ==============================
// Get My Leaves
// ==============================
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const userId = req.query.employeeId || req.user.id;
    const leaves = await Leave.find({ employee: userId }).sort({ createdAt: -1 });
    res.status(200).json(leaves);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==============================
// Approve / Reject Leave
// ==============================
router.put(
  "/:id/status",
  authMiddleware,
  permissionMiddleware("manage_leaves"),
  async (req, res) => {
    try {
      const { status, managerId } = req.body;

      const leave = await Leave.findByIdAndUpdate(
        req.params.id,
        {
          status,
          approvedBy: managerId || req.user.id,
        },
        { new: true }
      )
        .populate("employee", "name email")
        .populate("approvedBy", "name email");

      if (!leave) return res.status(404).json({ message: "Leave not found" });

      // Email notification
      const subject =
        status === "Approved"
          ? "✅ Your Leave Request Has Been Approved"
          : "❌ Your Leave Request Has Been Rejected";

      const message = `
LEAVE STATUS UPDATE

EMPLOYEE: ${leave.employee.name}
LEAVE TYPE: ${leave.leaveType}
DATES: ${new Date(leave.startDate).toLocaleDateString()} → ${new Date(leave.endDate).toLocaleDateString()}

STATUS: ${status.toUpperCase()}
APPROVED BY: ${leave.approvedBy.name}

Please log in to check full details.
      `;

      await sendTaskEmail(leave.employee.email, subject, message);

      res.status(200).json({ message: "Leave status updated", leave });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;
