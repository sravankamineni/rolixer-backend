const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.port || 3004;


const dbPath = path.join(__dirname, "TransactionsData.db");

let db = null;

const fetchAndInsert = async () => {
    const response = await axios.get(
        "https://s3.amazonaws.com/roxiler.com/product_transaction.json"
    );
    const data = response.data;

    const createTable = async () => {
        const createTableQuery = `
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        price REAL,
        description TEXT,
        category TEXT,
        image TEXT,
        sold BOOLEAN,
        dateOfSale DATETIME
      );`;
        await db.exec(createTableQuery); 
        console.log("Creation Successful");
    };
    

    for (let item of data) {
        const queryData = `SELECT id FROM transactions WHERE id = ${item.id}`;
        const existingData = await db.get(queryData);
        if (existingData === undefined) {
            const query = `
   INSERT INTO transactions (id, title, price, description, category, image, sold, dateOfSale) 
   VALUES (
       ${item.id},
       '${item.title.replace(/'/g, "''")}',
       ${item.price},
       '${item.description.replace(/'/g, "''")}',
       '${item.category.replace(/'/g, "''")}',
       '${item.image.replace(/'/g, "''")}',
       ${item.sold},
       '${item.dateOfSale.replace(/'/g, "''")}'
   );
`;
            await db.run(query);
        }
    }
    console.log("Transactions added");
};

fetchAndInsert();





const initializeDBAndServer = async () => {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}/`);
        });
    } catch (e) {
        console.log(`DB Error ${e.message}`);
        process.exit(1);
    }
};

initializeDBAndServer();



app.get("/transactions", async (req, res) => {
    const { month = "", s_query = "", limit = 10, offset = 0 } = req.query;
    const searchQuery = `
    SELECT *
    FROM transactions
    WHERE
      (title LIKE ? OR description LIKE ? OR price LIKE ?)
      AND strftime('%m', dateOfSale) LIKE ?
    LIMIT ? OFFSET ?;
  `;
    const params = [
        `%${s_query}%`,
        `%${s_query}%`,
        `%${s_query}%`,
        `%${month}%`,
        limit,
        offset,
    ];
    const totalItemQuery = `SELECT COUNT(id) AS total
  FROM transactions
  WHERE
      (title LIKE ? OR description LIKE ? OR price LIKE ?)
      AND strftime('%m', dateOfSale) LIKE ?;`;
    const totalParams = [
        `%${s_query}%`,
        `%${s_query}%`,
        `%${s_query}%`,
        `%${month}%`,
    ];
    const data = await db.all(searchQuery, params);
    const total = await db.get(totalItemQuery, totalParams);
    res.send({ transactions: data, total });
});


app.get("/statistics", async (req, res) => {
    const { month = "" } = req.query;
    const totalSaleAmount = await db.get(
        `SELECT SUM(price) as total FROM transactions WHERE strftime('%m', dateOfSale) LIKE '%${month}%';`
    );
    const soldItems = await db.get(
        `SELECT COUNT(id) as count FROM transactions WHERE strftime('%m', dateOfSale) LIKE '%${month}%' AND sold = 1;`
    );
    const notSoldItems = await db.get(
        `SELECT COUNT(id) as count FROM transactions WHERE strftime('%m', dateOfSale) LIKE '%${month}%' AND sold = 0;`
    );

    res.json({ totalSaleAmount, soldItems, notSoldItems });
});


app.get("/bar-chart", async (req, res) => {
    const { month = "" } = req.query;

    const priceRanges = [
        { min: 0, max: 100 },
        { min: 101, max: 200 },
        { min: 201, max: 300 },
        { min: 301, max: 400 },
        { min: 401, max: 500 },
        { min: 501, max: 600 },
        { min: 601, max: 700 },
        { min: 701, max: 800 },
        { min: 801, max: 900 },
        { min: 901, max: 10000 },
    ];
    const barChartData = [];
    for (const range of priceRanges) {
        const count = await db.get(
            `SELECT COUNT(id) as count FROM transactions
      WHERE strftime('%m', dateOfSale) LIKE '%${month}%' AND price >= ${range.min} AND price <= ${range.max};`
        );

        barChartData.push({
            range: `${range.min} - ${range.max}`,
            count: count.count,
        });
    }

    res.json({ barChartData });
});



app.get("/pie-chart", async (req, res) => {
    const { month = "" } = req.query;

    const pieChartData = await db.all(
        `SELECT category, COUNT(id) as count FROM transactions
    WHERE strftime('%m', dateOfSale) LIKE '%${month}%'
    GROUP BY category;`
    );

    res.json({ pieChartData });
});
