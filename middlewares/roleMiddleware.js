const roleMiddleware = (requiredRoles) => {
    return (req, res, next) => {
        if (!requiredRoles.includes(req.user.role)) {
            return res.status(403).json({ message: "Access Forbidden: Insufficient Role Permissions" });
        }
        next();
    };
};

module.exports = roleMiddleware;
