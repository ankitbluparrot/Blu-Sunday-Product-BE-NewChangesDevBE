const mongoose = require('mongoose');

const todayTaskSchema = new mongoose.Schema({
    taskDescription: {
        type: String,
        required: [true, 'Task description is required'],
        trim: true
    },
    projectName: {
        type: String,
        required: [true, 'Project name is required'],
        trim: true
    },
    status: {
        type: String,
        enum: ['Not Started', 'In Progress', 'Completed', 'Blocker'],
        default: 'Not Started'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Task must be assigned to a user']
    },
    date: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Add index for better query performance
todayTaskSchema.index({ date: 1, assignedTo: 1 });

const TodayTask = mongoose.model('TodayTask', todayTaskSchema);

module.exports = TodayTask; 