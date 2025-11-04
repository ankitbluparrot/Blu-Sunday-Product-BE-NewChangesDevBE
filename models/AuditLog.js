const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        action: { type: String, required: true },
        objectId: { type: mongoose.Schema.Types.ObjectId, required: true },
        objectType: { type: String, required: true }, // Type of object like 'task', 'project'
        additionalInfo: { type: String, default: "" },
        parentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Parent user (admin/manager)
        timestamp: { type: Date, default: Date.now }, // Timestamp of the action
    },
    { timestamps: true }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
