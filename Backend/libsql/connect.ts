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

async function createOrdersTable() {
  const createTableQuery = `
        CREATE TABLE IF NOT EXISTS orders (
            orderid SERIAL PRIMARY KEY,
            customer_id INT NOT NULL,
            order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(50) NOT NULL,
            total_amount DECIMAL(10, 2) NOT NULL
        );
    `;
  try {
    await clients.connect();
    const res = await clients.query("SELECT version();");
    console.log("คุณเชื่อมต่อกับฐานข้อมูล:", res.rows[0]);
  } catch (err) {
    console.log("Error", err);
  } finally {
    await clients.end();
  }
}
export default createOrdersTable();
// ยังไม่สมบูรณ์ เพราะยังไม่ได้เชื่อมกับ server
// เดี๋ยวมาทำต่ออีกไอสัสกูท้อแทร่
