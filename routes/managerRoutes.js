const express = require("express");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();
 
// Email setup (Nodemailer transporter)
const transporter = nodemailer.createTransport({
    service: "gmail", // You can choose other providers too
    auth: {
        user: "parmarkrrish2643@gmail.com",  // Your email
        pass: "ldcu jxam bazk ands",   // Your email password (or use OAuth for more security)
    },
});
 
// Route to create a new manager
// "/create/manager", authMiddleware, roleMiddleware(["admin"])
router.post("/create/manager", async (req, res) => {
    const { name, email, team, location } = req.body;

    console.log('data from backend to create manager', req.body);

    // Generate a random password or you can create your own logic
    const generatedPassword = Math.random().toString(36).slice(-8); // Random 8-character password
    const hashedPassword = await bcrypt.hash(generatedPassword, 10); // Hash the password

    // Create a new manager object
    const newManager = new User({ 
        name,
        email,
        password: hashedPassword,
        role: "manager", // Assign the role as 'manager'
        team,
        location,
    });

    try {
        // Save the manager to the database
        await newManager.save();

        // Send email to the new manager with the login credentials
        const mailOptions = {
            from: "parmarkrrish2643@gmail.com", // Sender address
            to: email,                   // Receiver address
            subject: "Welcome to the platform!", // Subject
            text: `Hello ${name},\n\nWelcome to the platform. Here are your login credentials:\n\nEmail: ${email}\nPassword: ${generatedPassword}\n\nPlease use these credentials to log in.\n\nBest Regards, The Team`, // Email body
        };

        // Send the email
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return res.status(500).json({ message: "Error sending email", error });
            }
            res.status(200).json({ message: "Manager created and email sent successfully!" });
        });
    } catch (error) {
        res.status(500).json({ message: "Error creating manager", error });
    }
});

router.post("/test-email", async (req, res) => {
    const mailOptions = {
        from: "parmarkrrish2643@gmail.com",
        to: "parmarkrish2002@gmail.com",  // You can use your own email to test
        subject: "Test Email",
        text: "This is a test email sent using Nodemailer.",
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("Error sending test email:", error);
            return res.status(500).json({ message: "Error sending email", error: error.message });
        }
        res.status(200).json({ message: "Test email sent successfully!", info });
    });
});


module.exports = router;
