const RoleConfig = require('../models/RoleConfig');

const permissionMiddleware = (requiredPermission) => {
    return async (req, res, next) => {
        try {
            // Skip permission check for admin role
            if (req.user.role === 'admin') {
                return next();
            }

            // Get role configuration
            const roleConfig = await RoleConfig.findOne({ roleName: req.user.role });
  
            console.log("roleConfig of user", req.user.role, roleConfig);
            
            if (!roleConfig) {
                return res.status(403).json({ 
                    message: 'Role configuration not found. Please contact administrator.' 
                });
            }

            // Check if user has the required permission
            if (!roleConfig.permissions.includes(requiredPermission)) {
                return res.status(403).json({ 
                    message: 'You do not have permission to perform this action' 
                });
            }

            next();
        } catch (error) {
            console.log('Error in permission middleware:', error);
            res.status(500).json({ message: 'Error checking permissions', error: error.message });
        }
    };
};

module.exports = permissionMiddleware;
