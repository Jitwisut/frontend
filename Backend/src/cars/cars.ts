import { Elysia } from "elysia";
import { cookie } from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import dotenv from "dotenv";
import redis from "redis";
import { Connectdb } from "../../lib/connect";
import mongoose from "mongoose";
import cookies from "cookie";
dotenv.config();

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

export const Carts = (app: Elysia) => {
  app
    .use(cookie())

    .use(
      jwt({
        name: "jwt",
        secret: process.env.JWT_SECRET!,
      })
    )
    .derive(async () => {
      const db = await Connectdb();
    })
    .post("/add-cars", async ({ body, request, set, jwt }) => {
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

      const { productId, quantity, price } = body as {
        productId: string;
        quantity: number;
        price: number;
      };
      const checkcars = await car.findOne({ userName: decoded.username });
      const exitcars = checkcars?.items.find(
        (item) => item.productId?.toString() === productId.toString()
      );
      if (exitcars) {
        set.status = 400;
        return { message: "Item already exists in the cart" };
      }
      const cart = await car.findOneAndUpdate(
        { userName: decoded.username },
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
      return { message: "Item added to cart", cart };
    })
    .get("/get-cars", async ({ body, request, set, jwt }) => {
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
      const checkcars = await car.findOne({ userName: decoded.username });
      let items = 0;
      if (checkcars) {
        items = checkcars.items.length;
      }
      return { message: "Get cart success", items };
    });
  return app;
};
