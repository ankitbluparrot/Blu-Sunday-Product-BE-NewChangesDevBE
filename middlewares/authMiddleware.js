const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    const authHeader = req.header("Authorization");
    if (!authHeader) return res.status(401).json({ message: "Access Denied: No Token Provided" });

    const token = authHeader.split(" ")[1]; // Extract token after "Bearer"

    if (!token) return res.status(401).json({ message: "Access Denied: Invalid Token Format" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        console.log('decoded', decoded);
        next();
    } catch (error) {
        res.status(401).json({ message: "Invalid Token" });
    }
};

module.exports = authMiddleware;
