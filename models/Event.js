const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true 
    },
    description: { 
        type: String 
    },
    startDate: { 
        type: Date, 
        required: true 
    },
    endDate: { 
        type: Date, 
        required: true 
    },
    allDay: { 
        type: Boolean, 
        default: false 
    },
    color: { 
        type: String, 
        default: '#3788d8' // Default blue color
    },
    reminder: {
        type: Number, // Minutes before event to remind
        enum: [0, 5, 10, 15, 30, 60, 1440], // 0 = no reminder, 1440 = 1 day
        default: 0
    },
    recurrence: {
        type: String,
        enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'],
        default: 'none'
    },
    creator: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    attendees: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    }],
    team: { 
        type: String 
    },
    location: { 
        type: String 
    },
    status: {
        type: String,
        enum: ['confirmed', 'tentative', 'cancelled'],
        default: 'confirmed'
    }
}, { timestamps: true });

module.exports = mongoose.model("Event", eventSchema); 