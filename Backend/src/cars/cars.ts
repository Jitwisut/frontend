import { Elysia, error, t } from "elysia";
import { cookie } from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import dotenv from "dotenv";
import redis from "redis";
import mongoose, { set } from "mongoose";
import cookies from "cookie";
import swagger from "@elysiajs/swagger";
import { clients } from "../../libsql/connect";
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

async function getdecoded(cookie: any, jwt: any, set: any) {
  try {
    const auth = cookie.auth.value;
    if (!auth) {
      set.status = 400;
      return { error: "Unauthorized" };
    }
    const decoded = await jwt.verify(auth);
    if (typeof decoded !== "object" || decoded === null) {
      set.status = 401;
      return { error: "Invalid token" };
    }
    return decoded;
  } catch (error) {
    set.status = 401;
    return { error: "Invalid token" };
  }
}

redisClient.on("error", (err) => console.log("Redis Client Error", err));

// เชื่อมต่อ Redis
await redisClient.connect();

export const Carts = (app: Elysia) =>
  app.group("/api", (app) =>
    app
      // เริ่มต้น Swagger สำหรับเส้นทางในกลุ่ม /api เท่านั้น
      .use(swagger())

      // ใช้ cookie และ jwt หลังจาก Swagger
      .use(cookie())
      .use(
        jwt({
          name: "jwt",
          secret: process.env.JWT_SECRET!,
        })
      )

      // Middleware สำหรับตรวจสอบ JWT
      .derive(async ({ request, set, jwt, cookie }) => {
        try {
          return { decoded: await getdecoded(cookie, jwt, set) };
        } catch (error) {
          set.status = 401;
          return { Error: (error as Error).message };
        }
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
            Listitems: JSON.parse(cachedCart).items,
            User: username,
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
          if (username && checkcars) {
            await redisClient.setEx(
              `cart:${username}`,
              3600,
              JSON.stringify(checkcars)
            );
          } else {
            console.log("Username or checkcars is missing.");
          }
        }
        const Listitems = await checkcars?.items;
        return {
          message: "Get cart success",
          items,
          Listitems: Listitems,
          User: username,
        };
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
      .post("/checkout", async ({ body, set, decoded }) => {
        // สมมติว่า `client` คือ PostgreSQL client และ `cart` คือ MongoDB collection
        try {
          // 1. ตรวจสอบการยืนยันตัวตน
          if (!decoded) {
            set.status = 401;

            return { error: "Unauthorized" };
          }

          const { username } = decoded as { username: string };

          if (!username) {
            set.status = 400;
            return { error: "Invalid token: username missing" };
          }

          // 2. ดึงข้อมูลรถเข็นของผู้ใช้จาก MongoDB
          const userCart = await car
            .findOne({ userName: username })
            .select("items");

          if (!userCart) {
            set.status = 404;
            return { error: "Cart not found for the user" };
          }

          if (!Array.isArray(userCart.items) || userCart.items.length === 0) {
            set.status = 400;
            return { error: "Cart is empty" };
          }

          // 3. คำนวณราคาทั้งหมด
          const total = userCart.items.reduce((accumulator, item) => {
            if (!item.price || !item.quantity) {
              throw new Error("Invalid item data");
            }
            return accumulator + item.price * item.quantity;
          }, 0);

          const totalPrice = parseFloat(total.toFixed(2)); // ทำให้เป็นตัวเลข

          // 4. เริ่มต้นธุรกรรม PostgreSQL
          await clients.query("BEGIN");

          try {
            // 4.1 แทรกคำสั่งซื้อใน PostgreSQL
            const createOrderQuery = `
              INSERT INTO orders (customer_id, status, total_amount)
              VALUES ($1, $2, $3) RETURNING orderid;
            `;
            const result = await clients.query(createOrderQuery, [
              username,
              "pending",
              totalPrice,
            ]);

            if (result.rows.length === 0) {
              throw new Error("Failed to create order");
            }

            const orderId = result.rows[0].orderid;

            // 4.2 ล้างรถเข็นใน MongoDB
            const clearCartResult = await car.updateOne(
              { userName: username },
              { $set: { items: [] } } // หรือใช้ $unset เพื่อลบฟิลด์ 'items' หากต้องการ
            );

            if (clearCartResult.modifiedCount === 0) {
              throw new Error("Failed to clear cart");
            }
            //4.3 ล้างข้อมูลในredis
            await redisClient.del(`cart:${username}`);
            // 4.4 ยืนยันธุรกรรม PostgreSQL
            await clients.query("COMMIT");

            // 5. ส่งคืนการตอบสนองสำเร็จ
            return {
              message: "Checkout success",
              user: username,
              totalPrice: totalPrice,
              orderID: orderId,
              peoducts: userCart.items,
            };
          } catch (error) {
            // 6. ยกเลิกธุรกรรม PostgreSQL ในกรณีเกิดข้อผิดพลาด
            await clients.query("ROLLBACK");
            throw error; // ส่งต่อข้อผิดพลาดไปยัง catch ภายนอก
          }
        } catch (err) {
          console.error("Error:", err);
          set.status = 500;
          return { error: "Internal Server Error" };
        }
      })

      .group("/orders/:id", (order) =>
        order
          .get("/status", async ({ set, decoded, params }) => {
            try {
              const { id } = params as { id: string };
              if (!decoded) {
                set.status = 401;
                return { error: "Unauthorized" };
              }
              const checkorder = await clients.query(
                "SELECT * FROM orders WHERE orderid = $1",
                [id]
              );
              if (!checkorder.rows[0]) {
                set.status = 404;
                return { error: "Order not found" };
              }
              const order = await clients.query(
                "SELECT status,orderid,customer_id,total_amount FROM orders WHERE orderid=$1",
                [id]
              );
              if (!order) {
                set.status = 400;
                return { error: "Error order please try again" };
              }
              return {
                status: order.rows[0].status,
                user: order.rows[0].customer_id,
                total: order.rows[0].total_amount,
              }; // ส่งคืนสถานะของคำสั่งซื้อ
            } catch (err: unknown) {
              set.status = 500;
              return { Error: err as Error };
            }
            //เดี๋ยวมาทำต่อ เพิ่มสถานะการจัดส่ง และ เพิ่มสถานะการชำระเงิน และ เพิ่มสถานะการยกเลิกคำสั่งซื้อ เพิ่ม  handle error
          })
          .post("/cancel", async ({ set, decoded, params }) => {
            try {
              if (!decoded) {
                set.status = 400; // แก้ไขจาก set.status = 400;
                return { Error: "Unauthorized" };
              }

              const { id } = params as { id: string }; // ดึง orderId จากพารามิเตอร์ URL
              if (!/^\d+$/.test(id)) {
                // ตรวจสอบว่า id เป็นตัวเลข
                set.status = 400;
                return { Error: "Invalid order ID format" };
              }
              const order = await clients.query(
                `SELECT * FROM orders WHERE orderid=$1`,
                [id]
              );
              if (!order.rows[0]) {
                // ตรวจสอบว่ามีคำสั่งซื้อนี้ในระบบหรือไม่
                set.status = 404;
                return { Error: `Order with ID ${id} not found` };
              }
              const query = `UPDATE orders SET status = 'Cancelled' WHERE orderid = $1 RETURNING *`; // อัปเดตสถานะคำสั่งซื้อเป็น "Cancelled" โดยใช้ orderId
              const connect = await clients.query(query, [id]); // ดำเนินการคำสั่ง SQL ด้วยพารามิเตอร์ orderId
              return {
                message: "Order cancelled successfully",
                order: connect.rows[0], // ส่งคืนข้อมูลคำสั่งซื้อที่ถูกยกเลิก
              };
            } catch (err: unknown) {
              console.log("Error:", (err as Error).message); // ปรับการแสดง error message ให้ชัดเจน
              return { Error: (err as Error).message };
            }
          })
          .post("/upstatus", async ({ set, decoded, params }) => {
            try {
              if (!decoded) {
                set.status = 401;
                return { Error: "Unauthorized" };
              }
              const { id } = params as { id: string };
              const query = `UPDATE orders SET status = 'Delivered' WHERE orderid = $1 RETURNING *`;
              const connect = await clients.query(query, [id]); // ดำเนินการคำสั่ง SQL ด้วยพารามิเตอร์ orderId
              return {
                message: "Order status updated successfully",
                order: connect.rows[0],
              }; // ส่งคืนข้อมูลคำสั่งซื้อที่ถูกอัปเดตสถานะ
            } catch (err: unknown) {
              return { error: (err as Error).message };
            }
          })
      )
      .get("/orders", async ({ set, decoded, body }) => {
        if (!decoded) {
          set.status = 400;
          return { error: "Unauthorized" };
        }
        const { username } = decoded as { username: string };

        try {
          const cacheorder = await redisClient.get(`orders:${username}`); // ดึงข้อมูลคำสั่งซื้อจาก Redis โดยใช้ username เป็น key
          if (cacheorder) {
            set.status = 200;
            return {
              message: "Orders retrieved successfully (from cache)",
              orders: JSON.parse(cacheorder), // ส่งคืนข้อมูลคำสั่งซื้อจาก Redis (ถ้ามีใน cache)referto the cache order
            };
          }
          const orders = await clients.query(
            `SELECT * FROM orders WHERE customer_id = $1`,
            [username]
          ); // ดึงข้อมูลคำสั่งซื้อจากฐานข้อมูลโดยใช้ username เป็นเงื่อนไขการค้นหาreferto the database order
          if (orders.rows.length === 0) {
            set.status = 404;
            return { message: "No orders found for this user" };
          }
          await redisClient.setEx(
            `orders:${username}`,
            3600,
            JSON.stringify(orders.rows)
          ); // เก็บข้อมูลคำสั่งซื้อลงใน Redis พร้อมกำหนดเวลาหมดอายุ (1 ชั่วโมง)referto the cache order
          return {
            message: "Search Order successfully",
            order: orders.rows,
          };
        } catch (err) {
          console.log("Error:", (err as Error).message); // ปรับการแสดง error message ให้ชัดเจน
        }
      })
      .get("/allorder", async ({ set, decoded }) => {
        try {
          const order = await clients.query("SELECT COUNT(*) FROM orders");
          if (!order) {
            return { message: "NOT FOUND ALLORDER" };
          }
          set.status = 200;
          return { message: "ALLORDER", order: order.rows[0].count }; // ส่งคืนจำนวนทั้งหมดของคำสั่งซื้อในระบบreferto the total number of orders in the system
        } catch (err) {
          return { error: (err as Error).message };
        }
      })
  );

export default Carts;
