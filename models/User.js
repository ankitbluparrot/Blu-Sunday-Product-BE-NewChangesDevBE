const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    googleId: { type: String },  // Add this field
    role: { type: String, enum: ["admin", "manager", "opic"], default: "opic" },
    team:{ type: String },
    location:{ type: String },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    designation:{ type: String },
    profilePicture: {
        url: { type: String },
        publicId: { type: String }
    },
    permissions: [{ type: String, default: [] }],
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
     