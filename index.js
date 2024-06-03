const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");

// MIDDLEWARE
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1ekltq6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const userCollection = client.db("picopai").collection("users");
    const TaskCollection = client.db("picopai").collection("allTasks");

    app.post("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const existingUser = await userCollection.findOne(filter);

      if (existingUser) {
        return res.send({ message: "User Already Exist.", insertedId: null });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };

      const result = await userCollection.findOne(query);

      res.send(result);
    });

    app.post("/add-task", async (req, res) => {
      const tasks = req.body;
      const query = { email: tasks.email };
      const payableCoin = parseInt(tasks.payable);
      const quantity = parseInt(tasks.quantity);
      const tasksCoin = payableCoin * quantity;

      const minusCoin = { $inc: { coin: -tasksCoin } };
      await userCollection.updateOne(query, minusCoin);

      const result = await TaskCollection.insertOne(tasks);

      res.send(result);
    });

    // app.get("/users/coin/:email", async (req, res) => {
    //   const user = req.params.email;
    //   const filter = { email: user };
    //   const options = {
    //     projection: {
    //       _id: 0,
    //       name: 0,
    //       email: 1,
    //       password: 0,
    //       role: 1,
    //       coin: 0,
    //       photo: 0,
    //     },
    //   };

    //   const result = await userCollection.findOne(filter, options);
    //   res.send(result);
    // });

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  const result = "Picopai Server is Running";

  res.send(result);
});

app.listen(port, () => {
  console.log(`Picopai server is Running at port: ${port}`);
});
