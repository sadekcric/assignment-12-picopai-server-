const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    const submitCollection = client.db("picopai").collection("allSubmits");
    const withdrawalCollection = client.db("picopai").collection("allWithdrawals");

    // For User Collection APi
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

    // for Task Collection Api
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

    app.get("/tasks", async (req, res) => {
      const result = await TaskCollection.find().toArray();
      res.send(result);
    });

    app.get("/tasks/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await TaskCollection.findOne(query);
      res.send(result);
    });

    app.get("/get_task/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await TaskCollection.find(query).toArray();
      res.send(result);
    });

    app.put("/tasks/:id", async (req, res) => {
      const id = req.params.id;
      const tasks = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          details: tasks.details,
          title: tasks.title,
          submissionInfo: tasks.submissionInfo,
        },
      };
      const result = await TaskCollection.updateOne(query, update);
    });

    app.delete("/tasks/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const task = await TaskCollection.findOne(query);

      const { email, payable, quantity } = task;
      const payableAmount = parseInt(payable);
      const remainQuantity = parseInt(quantity);

      const remainCoin = payableAmount * remainQuantity;

      await userCollection.updateOne({ email: email }, { $inc: { coin: remainCoin } });

      const result = await TaskCollection.deleteOne(query);
      res.send(result);
    });

    // for Submit Collection API
    app.post("/submits", async (req, res) => {
      const data = req.body;
      const result = await submitCollection.insertOne(data);
      res.send(result);
    });

    app.get("/submits/:worker_email", async (req, res) => {
      const email = req.params.worker_email;
      const query = { worker_email: email };
      const result = await submitCollection.find(query).toArray();

      res.send(result);
    });

    app.get("/users/coin/:email", async (req, res) => {
      const user = req.params.email;
      const filter = { email: user };
      const options = {
        projection: {
          _id: 0,
          coin: 1,
        },
      };

      const result = await userCollection.findOne(filter, options);
      res.send({ coin: result.coin });
    });

    // for Withdrawal Collection API
    app.post("/withdrawals", async (req, res) => {
      const data = req.body;
      const result = await withdrawalCollection.insertOne(data);
      res.send(result);
    });

    app.get("/withdrawals/:email", async (req, res) => {
      const email = req.params.email;
      const query = { worker_email: email };
      const result = await withdrawalCollection.find(query).toArray();

      res.send(result);
    });

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
