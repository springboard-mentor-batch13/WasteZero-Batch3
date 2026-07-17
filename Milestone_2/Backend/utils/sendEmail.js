// Backend\utils\sendEmail.js

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (to, subject, html) => {
  await transporter.sendMail({
    from: `"WasteZero" <${process.env.EMAIL}>`,
    to,
    subject,
    html,
  });
};

module.exports = sendEmail;