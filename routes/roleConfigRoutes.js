const express = require('express');
const router = express.Router();
const RoleConfig = require('../models/RoleConfig');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Create or update role configuration (admin only)
router.post('/configure', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    try {
        const { roleName, permissions } = req.body;

        // Validate role name
        if (!['admin', 'manager', 'opic'].includes(roleName)) {
            return res.status(400).json({ message: 'Invalid role name' });
        }

        // Validate permissions
        const validPermissions = [
            'create_project', 'edit_project', 'delete_project',
            'create_task', 'edit_task', 'delete_task',
            'create_subtask', 'edit_subtask', 'delete_subtask',
            'create_user', 'edit_user', 'delete_user',
            'view_analytics', 'manage_roles'
        ];

        const invalidPermissions = permissions.filter(perm => !validPermissions.includes(perm));
        if (invalidPermissions.length > 0) {
            return res.status(400).json({ 
                message: 'Invalid permissions', 
                invalidPermissions 
            });
        }

        // Find existing configuration or create new one
        const roleConfig = await RoleConfig.findOne({ roleName });
        
        if (roleConfig) {
            // Update existing configuration
            roleConfig.permissions = permissions;
            await roleConfig.save();
        } else {
            // Create new configuration
            const newRoleConfig = new RoleConfig({
                roleName,
                permissions
            });
            await newRoleConfig.save();
        }

        res.status(200).json({ 
            message: 'Role configuration updated successfully',
            roleName,
            permissions
        });
    } catch (error) {
        console.error('Error configuring role:', error);
        res.status(500).json({ message: 'Error configuring role', error: error.message });
    }
});

// Get all role configurations (admin only)
router.get('/all', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    try {
        const roleConfigs = await RoleConfig.find();
        res.status(200).json({
            message: 'Role configurations fetched successfully',
            configurations: roleConfigs
        });
    } catch (error) {
        console.error('Error fetching role configurations:', error);
        res.status(500).json({ message: 'Error fetching role configurations', error: error.message });
    }
});

// Get specific role configuration (admin only)
router.get('/:roleName', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    try {
        const { roleName } = req.params;
        const roleConfig = await RoleConfig.findOne({ roleName });

        if (!roleConfig) {
            return res.status(404).json({ message: 'Role configuration not found' });
        }

        res.status(200).json({
            message: 'Role configuration fetched successfully',
            configuration: roleConfig
        });
    } catch (error) {
        console.error('Error fetching role configuration:', error);
        res.status(500).json({ message: 'Error fetching role configuration', error: error.message });
    }
});

// Delete role configuration (admin only)
router.delete('/:roleName', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    try {
        const { roleName } = req.params;
        
        // Prevent deletion of admin role configuration
        if (roleName === 'admin') {
            return res.status(403).json({ message: 'Cannot delete admin role configuration' });
        }

        const roleConfig = await RoleConfig.findOneAndDelete({ roleName });

        if (!roleConfig) {
            return res.status(404).json({ message: 'Role configuration not found' });
        }

        res.status(200).json({ 
            message: 'Role configuration deleted successfully',
            deletedConfiguration: roleConfig
        });
    } catch (error) {
        console.error('Error deleting role configuration:', error);
        res.status(500).json({ message: 'Error deleting role configuration', error: error.message });
    }
});

module.exports = router; 