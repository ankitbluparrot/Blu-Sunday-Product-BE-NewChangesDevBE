const mongoose = require("mongoose");

const leaveSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  leaveType: {
    type: String,
    enum: ["Casual Leave", "Sick Leave", "Paid Leave", "Unpaid Leave", "Work From Home"],
    required: true,
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
}, { timestamps: true });

// ✅ Export model correctly
module.exports = mongoose.model("Leave", leaveSchema);
