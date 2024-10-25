import { Elysia } from "elysia";
import { cookie } from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import dotenv from "dotenv";
import redis from "redis";
import mongoose from "mongoose";
import cookies from "cookie";

dotenv.config();

// กำหนดประเภทข้อมูลสำหรับ store

// Define Schemas
const ProductSchema = new mongoose.Schema({
  name: String,
  price: Number,
});

const CartItemSchema = new mongoose.Schema({
  productId: { type: Number },
  quantity: Number,
  price: Number,
});

const CartSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  items: [CartItemSchema],
  userName: { type: String },
});

// Define Models
const Product = mongoose.model("Product", ProductSchema);
const car = mongoose.model("Cart", CartSchema);

// Redis Client setup
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => console.log("Redis Client Error", err));

// เชื่อมต่อ Redis
await redisClient.connect();

const Checkauth = (decoded: any, set: any) => {
  if (!decoded) {
    set.status = 401;
    return { error: "Unauthorized" };
  }
};

export const Carts = (app: Elysia) => {
  app
    .use(cookie())

    .use(
      jwt({
        name: "jwt",
        secret: process.env.JWT_SECRET!,
      })
    )

    .derive(async ({ request, set, jwt }) => {
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

    // เพิ่มสินค้าเข้ารถเข็น
    .post("/add-cars", async ({ body, set, decoded }) => {
      if (!decoded) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const { username } = decoded as { username: string };

      let cart;
      const { productId, quantity, price } = body as {
        productId: string;
        quantity: number;
        price: number;
      };
      if (!productId || !quantity || !price) {
        set.status = 400;
        return { error: "Missing required fields" };
      }

      // ค้นหารถเข็นในฐานข้อมูล
      const checkcars = await car
        .findOne({
          userName: username,
        })
        .select("items");

      const exitcars = checkcars?.items.find(
        (item) => item.productId?.toString() === productId.toString()
      );

      if (exitcars) {
        // อัปเดตจำนวนสินค้าหากเจอสินค้าในรถเข็น
        await car.findOneAndUpdate(
          {
            userName: username,
            "items.productId": productId,
          },
          {
            $inc: { "items.$.quantity": quantity },
          },
          { new: true }
        );
      } else {
        // เพิ่มสินค้าลงรถเข็นหากยังไม่มี
        cart = await car.findOneAndUpdate(
          { userName: username },
          {
            $push: {
              items: {
                productId: productId,
                quantity: quantity,
                price: price,
              },
            },
          },
          { upsert: true, new: true }
        );
      }

      // ลบข้อมูลใน Redis Cache หลังจากที่มีการอัปเดต
      await redisClient.del(`cart:${username}`);

      return { message: "Item added to cart", cart };
    })

    // ดึงข้อมูลสินค้าในรถเข็น
    .get("/get-cars", async ({ set, decoded }) => {
      if (!decoded) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const { username } = decoded as { username: string };

      // ลองดึงข้อมูลจาก Redis Cache ก่อน
      const cachedCart = await redisClient.get(`cart:${username}`);

      if (cachedCart) {
        // คืนค่าข้อมูลที่ถูกเก็บไว้ใน Redis
        return {
          message: "Get cart success (from cache)",
          items: JSON.parse(cachedCart).items.length,
        };
      }

      // หากไม่มีใน Redis ให้ดึงข้อมูลจาก MongoDB
      const checkcars = await car.findOne({
        userName: username,
      });

      let items = 0;
      if (checkcars) {
        items = checkcars.items.length;

        // เก็บข้อมูลลงใน Redis Cache เพื่อใช้ในครั้งถัดไป
        await redisClient.setEx(
          `cart:${username}`,
          3600,
          JSON.stringify(checkcars)
        ); // เก็บ 1 ชั่วโมง
      }

      return { message: "Get cart success", items };
    })

    // ลบสินค้าในรถเข็น
    .delete("/delete-cars", async ({ body, set, decoded }) => {
      const { productId } = body as { productId: string };
      if (!decoded) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!productId) {
        set.status = 400;
        return { error: "Missing required fields" };
      }

      const beforecars = await car.findOne({
        userName: (decoded! as { username: string }).username,
        "items.productId": productId,
      });

      if (!beforecars) {
        set.status = 400;
        return { message: "Not found Products ID" };
      }

      const cars = await car.findOneAndUpdate(
        {
          userName: (decoded! as { username: string }).username,
        },
        {
          $pull: {
            items: {
              productId: productId,
            },
          },
        },
        { new: true }
      );

      if (!cars) {
        set.status = 404;
        return { error: "Products not found or couldn't be deleted" };
      }

      // ลบ Cache ของผู้ใช้ใน Redis เพื่อให้ข้อมูลอัปเดต
      await redisClient.del(
        `cart:${(decoded! as { username: string }).username}`
      );

      set.status = 200;
      return { message: "You delete Products success" };
    })
    .put("/checkout", async ({ body, set, decoded }) => {
      if (!decoded) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { username } = decoded as { username: string };
      const Usercart = await car
        .findOne({ userName: username })
        .select("items");

      if (!Usercart) {
        set.status = 404;
        return { error: "Error not found Cartuser" };
      }

      let total = 0;
      const sumtotal = Usercart.items.forEach((item) => {
        total += item.price! * item.quantity!;
      });
      const totalPrice = total.toFixed(2);
      return {
        message: "Checkout success",
        user: username,
        totalPrice: totalPrice,
      };
      //เดี๋ยวมาทำต่อ
      //จะต้องทำเลข orderidด้วย PostgreSQL
    });

  return app;
};
