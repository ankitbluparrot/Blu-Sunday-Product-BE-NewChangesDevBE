const mongoose = require('mongoose');

const projectTemplateSchema = new mongoose.Schema({
    projectName: {
        type: String,
        required: true,
        unique: true
    },
    expectedDuration: {
        type: Number,
        min: 1
    },
    tasks: [{
        taskName: {
            type: String,
            required: true 
        },
        expectedDuration: {
            type: Number
        },
        subtasks: [{
            name: {
                type: String,
                required: true
            },
            expectedDuration: {
                type: Number
            }
        }]
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('ProjectTemplate', projectTemplateSchema);