const mongoose = require('mongoose');

const roleConfigSchema = new mongoose.Schema({
    roleName: {
        type: String,
        required: true,
        unique: true,
        enum: ['admin', 'manager', 'opic']
    },
    permissions: [{
        type: String,
        required: true,
        enum: [
            'create_project',
            'edit_project',
            'delete_project',
            'create_task',
            'edit_task',
            'delete_task',
            'create_subtask',
            'edit_subtask',
            'delete_subtask',
            'create_user',
            'edit_user',
            'delete_user',
            'view_analytics',
            'manage_roles'
        ]
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
roleConfigSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('RoleConfig', roleConfigSchema); 