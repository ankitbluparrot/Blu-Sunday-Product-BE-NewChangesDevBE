const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const path = require("path");
const passport = require("passport");
const http = require("http");
const socketIo = require("socket.io");

dotenv.config();

const app = express();

// Detect if running on Vercel (serverless) or locally
const isVercel = !!process.env.VERCEL || !!process.env.NOW;

app.use(express.json());

// ✅ Centralized CORS configuration
const allowedOrigin = "https://blusunday.netlify.app";

const corsOptions = {
  origin: allowedOrigin,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  optionsSuccessStatus: 204,
};

// Apply CORS globally
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(passport.initialize());

// ✅ API routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/role-config", require("./routes/roleConfigRoutes"));
app.use("/api/project", require("./routes/projectRoutes"));
app.use("/api/templates", require("./routes/templateRoutes"));
app.use("/api/task", require("./routes/taskRoutes"));
app.use("/api/todaytask", require("./routes/todayTaskRoutes"));
app.use("/api/comment", require("./routes/commentRoutes"));
app.use("/api/audit", require("./routes/auditRoute"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/calendar", require("./routes/calendarRoutes"));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/hello", (req, res) => {
  res.json({ message: "Welcome to BluSunday Backend!" });
});

// =============================
// ✅ LOCAL SERVER MODE
// =============================
if (!isVercel) {
  const PORT = process.env.PORT || 8001;

  const server = http.createServer(app);

  // Setup Socket.IO (only locally)
  const io = socketIo(server, {
    cors: {
      origin: allowedOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  connectDB()
    .then(() => {
      console.log("✅ Database connected successfully.");
      server.listen(PORT, () => {
        console.log(`🚀 Server running locally on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error("❌ Database connection failed:", err);
    });
}

// =============================
// ✅ SERVERLESS EXPORT (Vercel)
// =============================
let __dbConnectedForHandler = false;

module.exports = async (req, res) => {
  try {
    // Handle CORS preflight manually for serverless
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    if (!__dbConnectedForHandler) {
      await connectDB();
      __dbConnectedForHandler = true;
    }

    // Pass request to Express app
    return app(req, res);
  } catch (err) {
    console.error("Serverless handler error:", err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
};
