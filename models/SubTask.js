const mongoose = require("mongoose");

const subtaskSchema = new mongoose.Schema({
    name: { type: String, required: true },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assigner: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, 
    startDate: { type: Date }, // Added startDate field
    dueDate: { type: Date }, // Added dueDate field
    submission: { type: String }, // URL to the PDF file
    status: { type: String, default: "In Progress" }, // Example: Not Started, In Progress, Completed
}); 

// module.exports = mongoose.model("Subtask", subtaskSchema);
const Subtask = mongoose.models.Subtask || mongoose.model("Subtask", subtaskSchema);
module.exports = Subtask;
