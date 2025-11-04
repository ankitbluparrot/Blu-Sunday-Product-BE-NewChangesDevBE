const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema({
    projectId: { type: String, required: true},
    projectName: { type: String, required: true },
    projectType: { type: String, required: true },
    projectDescription: { type: String },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    targetDate: { type: String },   
    status: { type: String, default: "Pending" }, //  Pending, In Progress, Completed
    completionDate: { type: Date },
    submissionStatus: { type: String, enum: ["On Time", "OverDue", "Before Time"] },
    tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }], 
    projectOwner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Person responsible for the project
    assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Multiple users assigned to the project
    team: { type: String, required: true }, // Team identifier (e.g., "Team 1", "Team 2")
    teamMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // All users in the team
    expectedDuration: { type: Number },
}, { timestamps: true });

// Add validation for completion date and calculate submission status
projectSchema.pre('save', function(next) {
    if (this.status === "Completed") {
        // If project is being marked as completed
        if (!this.completionDate) {
            // Set completion date to current date if not provided
            this.completionDate = new Date();
        } else {
            // Validate that completion date is not in the future
            const now = new Date();
            if (this.completionDate > now) {
                return next(new Error("Completion date cannot be in the future"));
            }
        }

        // Calculate submission status
        if (this.endDate && this.completionDate) {
            // Convert both dates to start of day for comparison
            const endDateOnly = new Date(this.endDate);
            endDateOnly.setHours(0, 0, 0, 0);
            
            const completionDateOnly = new Date(this.completionDate);
            completionDateOnly.setHours(0, 0, 0, 0);

            // Compare dates
            if (completionDateOnly.getTime() === endDateOnly.getTime()) {
                this.submissionStatus = "On Time";
            } else if (completionDateOnly.getTime() < endDateOnly.getTime()) {
                this.submissionStatus = "Before Time";
            } else {
                this.submissionStatus = "OverDue";
            }
        }
    } else if (this.isModified('status') && this._oldStatus === "Completed") {
        // If trying to change status from Completed to something else
        return next(new Error("Cannot change status of a completed project"));
    }
    next();
});

// Store old status before update
projectSchema.pre('findOneAndUpdate', function(next) {
    this._oldStatus = this._update.status;
    next();
});

module.exports = mongoose.model("Project", projectSchema);
