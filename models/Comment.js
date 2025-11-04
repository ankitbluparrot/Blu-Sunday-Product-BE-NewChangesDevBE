const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
    content: { type: String},
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Who posted the comment
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true }, // Which task the comment is for
    attachments: [{
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileType: { type: String, required: true },
        fileSize: { type: Number, required: true },
        publicId: { type: String, required: true } // Cloudinary public ID for deletion
    }],
    createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("Comment", commentSchema);
