import { Elysia } from "elysia";
import crypto from "crypto";
import bcrypt from "bcrypt";
import User from "../lib/model"; // โมเดลของผู้ใช้
import nodemailer from "nodemailer"; // ใช้สำหรับส่งอีเมล

export const ResetPassword = (app: Elysia) =>
  app.group("/user", (app) =>
    app
      .post("/reset-password-request", async ({ body, set }) => {
        try {
          const { email } = body as { email: string };
          if (!email) {
            set.status = 400;
            return { error: "Please provide an email" };
          }

          const user = await User.findOne({ email });
          if (!user) {
            set.status = 404;
            return { error: "User not found" };
          }

          // สร้างโทเค็นรีเซ็ตรหัสผ่าน
          const resetToken = crypto.randomBytes(32).toString("hex");
          const hashedToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

          // ตั้งค่าโทเค็นและวันหมดอายุในโมเดลผู้ใช้
          user.passwordResetToken = hashedToken;
          user.passwordResetExpires = Date.now() + 3600000; // 1 ชั่วโมง
          await user.save();

          // ส่งอีเมลพร้อมลิงก์รีเซ็ตรหัสผ่าน
          const resetURL = `https://your-app.com/reset-password/${resetToken}`;
          const transporter = nodemailer.createTransport({
            service: "Gmail",
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
          });

          await transporter.sendMail({
            to: email,
            subject: "Password Reset Request",
            text: `You requested a password reset. Click the following link to reset your password: ${resetURL}`,
          });

          set.status = 200;
          return { message: "Password reset link sent to your email" };
        } catch (err) {
          console.error("Error in reset password request:", err);
          set.status = 500;
          return {
            error: "Internal Server Error",
            details: (err as Error).message,
          };
        }
      })

      .post("/reset-password/:token", async ({ params, body, set }) => {
        try {
          const { token } = params as { token: string };
          const { newPassword } = body as { newPassword: string };

          if (!newPassword) {
            set.status = 400;
            return { error: "Please provide a new password" };
          }

          // แปลงโทเค็นที่รับมาเป็นแฮชเพื่อเทียบกับในฐานข้อมูล
          const hashedToken = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");
          const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }, // ตรวจสอบวันหมดอายุ
          });

          if (!user) {
            set.status = 400;
            return { error: "Invalid or expired token" };
          }

          // แฮชรหัสผ่านใหม่และบันทึกลงฐานข้อมูล
          const saltRounds = 10;
          user.password = await bcrypt.hash(newPassword, saltRounds);
          user.passwordResetToken = undefined;
          user.passwordResetExpires = undefined;
          await user.save();

          set.status = 200;
          return { message: "Password has been reset successfully" };
        } catch (err) {
          console.error("Error in password reset:", err);
          set.status = 500;
          return {
            error: "Internal Server Error",
            details: (err as Error).message,
          };
        }
      })
  );
