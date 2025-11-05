const express = require("express");
const Leave = require("../models/Leave");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");

const router = express.Router();

// ✅ Apply for Leave
router.post("/apply", authMiddleware, async (req, res) => {
  try {
    const { employeeId, leaveType, startDate, endDate, reason } = req.body;
    const employee = employeeId || req.user.id;

    console.log("Applying leave for employee:", employee); // ✅ fixed variable name

    const leave = await Leave.create({
      employee,
      leaveType,
      startDate,
      endDate,
      reason,
      status: "Pending",
    });

    res.status(201).json({ message: "Leave applied successfully", leave });
  } catch (error) {
    console.error("Error applying leave:", error);
    res.status(500).json({ message: error.message });
  }
});


// ✅ Get All Leaves (For Manager/Admin)
router.get("/all", authMiddleware, permissionMiddleware("view_all_leaves"), async (req, res) => {
  try {
    const leaves = await Leave.find()
      .populate("employee", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json(leaves);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Get Logged-in Employee’s Leaves
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const userId = req.query.employeeId || req.user.id;
    console.log("Fetching leaves for employee:", userId); // ✅ fixed variable name
    const leaves = await Leave.find({ employee: userId }).sort({ createdAt: -1 });
    res.status(200).json(leaves);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Approve or Reject Leave (Manager/Admin)
router.put("/:id/status", authMiddleware, permissionMiddleware("manage_leaves"), async (req, res) => {
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

    res.status(200).json({ message: "Leave status updated", leave });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
