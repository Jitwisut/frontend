import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const client = pg;

const clients = new client.Client({
  host: "localhost",
  database: "New2",
  user: "postgres",
  password: process.env.PostgrePass || "0805555za",
  port: 5432,
});

async function Connectsql() {
  // เช็คว่ามีการเชื่อมต่ออยู่หรือไม่
  try {
    await clients.connect();
    console.log("คุณเชื่อมต่อกับฐานข้อมูลสำเร็จ.");
  } catch (err) {
    console.error("Error connecting to database:", err);
    throw err;
  }
}

export { Connectsql, clients }; // ส่งออก client และฟังก์ชันเชื่อมต่อ
