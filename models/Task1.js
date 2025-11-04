const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({ 
    taskId: { type: String, required: true, },
    taskName: { type: String, required: true },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Assignee can be OPIC
    assigner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, 
    teamStatus: { type: String, default: "Not Started" }, // Example: Not Started, In Progress, Completed  
    progress: { type: Number, min: 0, max: 100, default: 0 }, 
    startDate: { type: Date }, // Added startDate field
    dueDate: { type: Date }, 
    completionDate: { type: Date },
    submissionStatus: { type: String, enum: ["On Time", "OverDue", "Before Time"] },
     dependencies: [
      {
        personId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        description: {
          type: String,
          trim: true,
          required: true,
        },
        status: {
          type: String,
          enum: ["Pending", "In Progress", "Completed"],
          default: "Pending",
        },
      },
    ],
    subtasks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subtask" }], // Referencing Subtask
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }], // Referencing Comments
}, { timestamps: true }); // Enable timestamps to get createdAt and updatedAt fields 

// Add validation for completion date and calculate submission status
taskSchema.pre('save', function(next) {
    if (this.teamStatus === "Completed") {
        // If task is being marked as completed
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
        if (this.dueDate && this.completionDate) {
            // Convert both dates to start of day for comparison
            const dueDateOnly = new Date(this.dueDate);
            dueDateOnly.setHours(0, 0, 0, 0);
            
            const completionDateOnly = new Date(this.completionDate);
            completionDateOnly.setHours(0, 0, 0, 0);

            // Compare dates
            if (completionDateOnly.getTime() === dueDateOnly.getTime()) {
                this.submissionStatus = "On Time";
            } else if (completionDateOnly.getTime() < dueDateOnly.getTime()) {
                this.submissionStatus = "Before Time";
            } else {
                this.submissionStatus = "OverDue";
            }
        }
    } else if (this.isModified('teamStatus') && this._oldStatus === "Completed") {
        // If trying to change status from Completed to something else
        return next(new Error("Cannot change status of a completed task"));
    }
    next();
});

// Store old status before update
taskSchema.pre('findOneAndUpdate', function(next) {
    this._oldStatus = this._update.teamStatus;
    next();
});

// module.exports = mongoose.model("Task", taskSchema);
const Task = mongoose.models.Task || mongoose.model("Task", taskSchema);
module.exports = Task;
