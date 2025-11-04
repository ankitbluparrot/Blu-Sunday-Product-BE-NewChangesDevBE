const express = require("express");
const router = express.Router();
const Event = require("../models/Event");
const authMiddleware = require("../middlewares/authMiddleware");
const User = require("../models/User");
const { sendNotification } = require("../services/notificationService");

// Create a new event
router.post("/create", authMiddleware, async (req, res) => {

    console.log('enter in create');

    try {
        const {
            title,
            description,
            startDate,
            endDate,
            allDay,
            color,
            reminder,
            recurrence,
            attendees,
            team,
            location
        } = req.body;

        const newEvent = new Event({
            title,
            description,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            allDay,
            color,
            reminder,
            recurrence,
            creator: req.user.id,
            attendees,
            team,
            location
        });

        await newEvent.save();

        // Send notifications to attendees
        // if (attendees && attendees.length > 0) {
        //     for (const attendeeId of attendees) {
        //         await sendNotification(
        //             attendeeId,
        //             `You have been invited to an event: ${title}`,
        //             `/calendar/event/${newEvent._id}`
        //         );
        //     }
        // }

        res.status(201).json({
            message: "Event created successfully",
            event: await newEvent.populate('creator attendees', 'name email')
        });
    } catch (error) {
        console.error("Error creating event:", error);
        res.status(500).json({ message: "Error creating event", error: error.message });
    }
});

// Get events for a specific date range
router.get("/events", authMiddleware, async (req, res) => {
    try {
        const { start, end } = req.query;
        const user = await User.findById(req.user.id);

        let query = {
            $or: [
                { creator: req.user.id }, // Events created by user
                { attendees: req.user.id }, // Events where user is an attendee
                { team: user.team } // Events for user's team
            ],
            startDate: { $gte: new Date(start) },
            endDate: { $lte: new Date(end) }
        };

        const events = await Event.find(query)
            .populate('creator', 'name email')
            .populate('attendees', 'name email')
            .sort({ startDate: 1 });

        res.status(200).json(events);
    } catch (error) {
        console.error("Error fetching events:", error);
        res.status(500).json({ message: "Error fetching events", error: error.message });
    }
});

// Update an event
router.put("/update/:eventId", authMiddleware, async (req, res) => {
    try {
        const { eventId } = req.params;
        const updateData = req.body;
        
        // Convert dates if provided
        if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
        if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);

        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }

        // Check if user has permission to update
        if (event.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: "Not authorized to update this event" });
        }

        const updatedEvent = await Event.findByIdAndUpdate(
            eventId,
            updateData,
            { new: true }
        ).populate('creator attendees', 'name email');

        // Notify attendees about the update
        if (event.attendees.length > 0) {
            for (const attendeeId of event.attendees) {
                await sendNotification(
                    attendeeId,
                    `Event "${event.title}" has been updated`,
                    `/calendar/event/${eventId}`
                );
            }
        }

        res.status(200).json({
            message: "Event updated successfully",
            event: updatedEvent
        });
    } catch (error) {
        console.error("Error updating event:", error);
        res.status(500).json({ message: "Error updating event", error: error.message });
    }
});

// Delete an event
router.delete("/delete/:eventId", authMiddleware, async (req, res) => {
    try {
        const { eventId } = req.params;
        
        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }

        // Check if user has permission to delete
        if (event.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: "Not authorized to delete this event" });
        }

        // Notify attendees about the cancellation
        if (event.attendees.length > 0) {
            for (const attendeeId of event.attendees) {
                await sendNotification(
                    attendeeId,
                    `Event "${event.title}" has been cancelled`,
                    `/calendar`
                );
            }
        }

        await Event.findByIdAndDelete(eventId);

        res.status(200).json({ message: "Event deleted successfully" });
    } catch (error) {
        console.error("Error deleting event:", error);
        res.status(500).json({ message: "Error deleting event", error: error.message });
    }
});

// Get event details
router.get("/event/:eventId", authMiddleware, async (req, res) => {
    try {
        const { eventId } = req.params;
        
        const event = await Event.findById(eventId)
            .populate('creator', 'name email')
            .populate('attendees', 'name email');

        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }

        // Check if user has permission to view
        if (event.creator.toString() !== req.user.id && 
            !event.attendees.some(a => a._id.toString() === req.user.id) &&
            event.team !== req.user.team) {
            return res.status(403).json({ message: "Not authorized to view this event" });
        }

        res.status(200).json(event);
    } catch (error) {
        console.error("Error fetching event details:", error);
        res.status(500).json({ message: "Error fetching event details", error: error.message });
    }
});

module.exports = router; 