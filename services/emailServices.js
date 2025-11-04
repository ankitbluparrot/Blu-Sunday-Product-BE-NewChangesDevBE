const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USERS,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

const sendTaskEmail = async (to, subject, text) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USERS,
      to,
      subject,
      text
    });
    console.log('✅ Email sent to:', to, '| Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Error sending email to', to, ':', error.message);
  }
};

module.exports = { sendTaskEmail };
