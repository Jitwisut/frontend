import { jwt } from "@elysiajs/jwt";
import { Context, Elysia, t } from "elysia";
import { cookie } from "@elysiajs/cookie";
import cookies from "cookie";
import { Connectdb } from "../lib/connect";
import bcrypt from "bcrypt";
import User from "../lib/model";
import dotenv from "dotenv";
import { set } from "mongoose";
import swagger from "@elysiajs/swagger";
import { clients } from "../libsql/connect";
dotenv.config();

interface RegisterBody {
  username: string;
  password: string;
  email: string;
}

export interface SignBody {
  username: string;
  password: string;
}

interface VerifiedToken {
  username: string;
  email: string;
}
interface DecodedToken {
  username: string;
  // เพิ่ม properties อื่นๆ ตามที่มีใน decoded token ของคุณ
}

export const auth4 = (app: Elysia) =>
  app.group("/auth", (app) => {
    app
      .use(swagger())
      .use(
        jwt({
          name: "jwt",
          secret: process.env.JWT_SECRET!,
          exp: "30m",
        })
      )
      .guard(
        {
          beforeHandle: async ({ request, set, jwt, store }) => {
            const Cookieheaders = request.headers.get("cookie") || "";
            const cookieparse = cookies.parse(Cookieheaders);
            const auth = cookieparse.auth;
            if (!auth) {
              set.status = 401;
              return { error: "Unauthorized" };
            }
            const decoded = await jwt.verify(auth);
            if (typeof decoded !== "object" || decoded === null) {
              set.status = 401;
              return { error: "Invalid token" };
            }
            //ต้่องเปลี่ยนชื่อไฟล์เพิ่ม.dเข้าไปstore จะไม่ Error
            (store as any).decoded = decoded;
            set.status = 200;
            //  const tokenname=decoded.username

            //  console.log("Token user:",decoded )
          },
        },
        (app) => {
          app.get("/user/:id", ({ params }) => {
            const users = [
              { id: "1", name: "Alice" },
              { id: "2", name: "BlacKEa" },
            ];
            const userid = params.id;
            const user = users.find((u) => u.id === userid);
            return user;
          });
          app.get("/products", async ({ set, jwt, store, cookie }) => {
            try {
              //       const Cookieheaders = request.headers.get("cookie") || "";
              //     const cookieparse = cookies.parse(Cookieheaders);
              const auth = cookie.auth.value;
              if (!auth) {
                set.status = 401;
                return { error: "Unauthorized" };
              }
              const decoded = await jwt.verify(auth);
              if (typeof decoded !== "object" || decoded === null) {
                set.status = 401;
                return { error: "Invalid token" };
              }
              const username = decoded.username;

              const res = await fetch("https://fakestoreapi.com/products");

              set.status = 200;
              const data = await res.json();

              return { products: data, user: { username } };
            } catch (err) {
              console.log("Error:", err);
            }
          });
          app.get("/products/:id", async ({ params, set }) => {
            const { id } = params;
            try {
              const res = await fetch(
                `https://fakestoreapi.com/products/${id}`
              );
              if (res.ok) {
                set.status = 200;
                const data = await res.json();
                return data;
              } else {
                set.status = res.status;
                return { message: "Product not found" };
              }
            } catch (err) {
              console.log("Error:", err);
              set.status = 500;
              return { message: "Server error" };
            }
          });
          app.get("/profile", ({ store }) => {
            return (store as any).decoded;
          });

          return app;
        }
      )
      .use(cookie())
      .post(
        "/register",
        async ({ body, set }) => {
          try {
            const { username, password, email } = body;

            if (!username || !password || !email) {
              return {
                error: "All fields (username, password, email) are required",
              };
            }

            // ห้ามไม่ให้ผู้ใช้ป้อนอัขระพิเศษในผู้ใช้
            const usernameRegex = /^[a-zA-z0-9]+$/;

            //ตรวจสอบว่าใน username มีอักขระพิเศษหรือไม่ ด้วย .test ถ้ามันมีจะส่งค่าเป็น flase แต่ถ้าไม่มีจะส่งเป็น true
            if (!usernameRegex.test(username)) {
              set.status = 400;
              return {
                error:
                  "Cannot Username can only contain alphanumeric characters.",
              };
            }
            const passwordRegex = /^(?=(.*[!@#$%^&*]))[a-zA-Z0-9!@#$%^&*]{6,}$/;

            if (!passwordRegex.test(password)) {
              set.status = 400;
              return {
                error:
                  "Password must contain at least two special characters (!@#$%^&*) and be at least 6 characters long.",
              };
            }

            /*  const checkemail = await User.findOne({ email });
            if (checkemail) {
              set.status = 400;
              return { error: "Error email already in use" };
            }*/
            await clients.query("BEGIN");
            const exituser = await clients.query(
              "SELECT * FROM users WHERE username = $1",
              [username]
            );
            if (exituser.rows.length > 0) {
              set.status = 409;
              await clients.query("ROLLBACK");
              return { error: "Error username already in use" };
            }
            const exitemail = await clients.query(
              "SELECT * FROM users WHERE email = $1",
              [email]
            );

            if (exitemail.rows.length > 0) {
              set.status = 409;
              await clients.query("ROLLBACK");
              return { error: "Error username already in use" };
            }

            const hashpass = await bcrypt.hash(password, 10);
            const query =
              "INSERT INTO users (username,password,email) VALUES ($1,$2,$3)";
            await clients.query(query, [username, hashpass, email]);
            /*  const user = await User.create({
              username,
              email,
              password: hashpass,
            });
            if (!user) {
              set.status = 500;
              return { message: "Error not user" };
            }*/

            // ตรวจสอบอีเมล

            await clients.query("COMMIT");
            set.status = 201;
            return { message: "User data received successfully" };
          } catch (err) {
            set.status = 500;
            await clients.query("ROLLBACK");
            return { Error: (err as Error).message };
          }
        },
        {
          body: t.Object({
            username: t.String(),
            password: t.String(),
            email: t.String(),
          }),
        }
      )
      .post(
        "/login",
        async ({ body, set, jwt, cookie }) => {
          const { username, password } = body;

          if (!username || !password) {
            set.status = 400;
            return { error: "Username and password are required" };
          }
          if (typeof username !== "string" || typeof password !== "string") {
            set.status = 400;
            return { error: "Invalid Input" };
          }
          //ทำให้ usernameไม่มีอีกขระพิเศษ มีแค่ตัวที่อณุญาติเท่านั้น
          const usernameRegex = /^[a-zA-Z0-9]+$/;

          if (!usernameRegex.test(username)) {
            set.status = 400;
            return {
              error: "Username can only contain alphanumeric characters.",
            };
          }

          const sanitizedUsername = username.trim();
          const sanitizedPassword = password.trim();

          const user = await User.findOne(
            { username: sanitizedUsername },
            //สำคัญตรงนี้ไว้กำหนดมาให้ Database แสดงข้อมูลอะไรของuserบ้าง
            //ซึ่งมันจะแสดงข้อมูลที่เราส่งมาในส่วนของ login เพื่อนำไปเก็บไว้ในToken
            {
              _id: 1,
              username: 1,
              password: 1,
              isLocked: 1,
              lockoutEndTime: 1,
              loginAttempts: 1,
              email: 1,
            }
          );
          if (!user) {
            set.status = 400;
            return { error: "Invalid User" };
          }
          if (user.isLocked) {
            const currentime = Date.now();
            if (currentime < user.lockoutEndTime) {
              set.status = 403;
              return { error: "Account locked. Try again later." };
            } else {
              user.isLocked = false;
              user.loginAttempts = 0;
              await user.save();
            }
          }
          const isMatch = await bcrypt.compare(
            sanitizedPassword,
            user.password
          );
          if (!isMatch) {
            set.status = 400;
            user.loginAttempts++;
            if (user.loginAttempts >= 5) {
              user.isLocked = true;
              user.lockoutEndTime = Date.now() + 15 * 60 * 1000; // ล็อกเป็นเวลา 15 นาที
              await user.save(); // บันทึกการเปลี่ยนแปลงในฐานข้อมูล
              set.status = 403;
              return {
                error:
                  "Too many failed attempts. Account locked for 15 minutes.",
              };
            }
            await user.save();
            set.status = 400;
            return { error: "Invalid password" };
          }
          user.loginAttempts = 0;
          await user.save();
          const payload = {
            username: user.username,
            email: user.email,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 30 * 60, // หมดอายุใน 30 นาที
          };

          set.status = 200;
          const token = await jwt.sign(payload);
          cookie.auth.set({
            value: token, // ค่า session ที่คุณต้องการตั้ง
            httpOnly: true, // ตัวเลือก cookie
            secure: true, // ใช้ secure ถ้าใช้ HTTPS
            path: "/",
          });

          /* set.cookie = {
          auth: {
            value: token,
            httpOnly: true,
            path: "/",
            secure: true,
          },
        };*/

          console.log("user:", user);
          return {
            message: "Login successful",
            user,
          };
        },
        {
          body: t.Object({
            username: t.String(),
            password: t.String(),
          }),
        }
      )
      .put("/sign-out", ({ set, cookie }) => {
        //ทำให้cookieเป็นว่าง

        cookie.auth.remove();

        set.status = 200;
        return { message: "You Signout Success" };
      });

    return app;
  });
export default auth4;
