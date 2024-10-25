import cookie from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import cookies from "cookie";
import { ConnectionStates, set } from "mongoose";
import User from "../../lib/model";
import { setRandomSeed } from "bun:jsc";

interface Products {
  title: string;
  category: string;
}

export const Profile = (app: Elysia) =>
  app.group("/user", (app) =>
    app
      .use(
        jwt({
          name: "jwt",
          secret: "your-secret-key",
        })
      )
      .derive(async ({ jwt, set, request }) => {
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
        set.status = 200;
        return { decoded };
      })
      .use(cookie())
      .get("/profile", async ({ decoded, set }) => {
        if (!decoded) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        const { username, email } = decoded as {
          username: string;
          email: string;
        };
        return {
          User: username,
          Email: email,
        };
      })
      .post("/update-email", async ({ set, decoded, body, query }) => {
        try {
          if (!decoded) {
            set.status = 401;
            return { error: "Unauthorized" };
          }

          const { username } = decoded as { username: string };
          const { newEmail } = body as { newEmail: string };
          if (!newEmail) {
            set.status = 400;
            return { error: "Please input Email" };
          }
          if (!username) {
            set.status = 400;
            return { error: "Username not found" };
          }

          const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
          if (!emailRegex.test(newEmail)) {
            set.status = 400;
            return { error: "Invalid Email format" };
          }
          //อัพเดท email
          const exitemail = await User.findOne({ email: newEmail });
          if (exitemail) {
            set.status = 400;
            return { error: "Please try again, email is already in use" };
          }
          const updatemail = await User.findOneAndUpdate(
            { username: username },
            { email: newEmail },
            { new: true }
          );
          set.status = 200;
          return {
            message: "Success fully Update Your Email",
            email: updatemail.email,
          };
        } catch (err) {
          set.status = 500;
          return { error: "Error Serverruning" };
        }
      })
      .get("/api/search", async ({ query }) => {
        const { query: searchQuery, category } = query;

        try {
          // ดึงข้อมูลสินค้าจาก API ภายนอก
          const res = await fetch("https://fakestoreapi.com/products");

          // ตรวจสอบสถานะของการตอบสนอง (Response Status)
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }

          // แปลงผลลัพธ์เป็น JSON
          const products = await res.json();

          // กรองข้อมูลตาม searchQuery และ category (ถ้ามี)
          const filteredProducts = products.filter((product: Products) => {
            const matchesQuery = searchQuery
              ? product.title.toLowerCase().includes(searchQuery.toLowerCase())
              : true;
            const matchesCategory = category
              ? product.category.toLowerCase() === category.toLowerCase()
              : true;

            return matchesQuery && matchesCategory;
          });

          // ส่งผลลัพธ์ที่กรองกลับไปยังผู้ใช้
          return {
            products: filteredProducts,
          };
        } catch (err) {
          // จัดการข้อผิดพลาดและส่งข้อความแจ้งเตือน
          console.error("Error fetching products:", err);
          return {
            error: "Failed to fetch products",
            message: (err as Error).message,
          };
        }
      })
  );
