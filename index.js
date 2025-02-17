const express = require("express");

const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;
var jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_API_KEY);
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
    const paymentCollection = client.db("picopai").collection("allPayments");
    const notificationCollection = client.db("picopai").collection("notifications");

    // JWT ==========================================
    // JWT Implementation,
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET_KEY, { expiresIn: "1d" });

      res.send({ token });
    });

    // middleWare
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = req.headers.authorization.split(" ")[1];

      jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };
    // =============================================

    //For Admin Home: Total User + Total Coin + Total Payment
    app.get("/total", async (req, res) => {
      // Total User
      const totalUser = await userCollection.estimatedDocumentCount();

      // Total Coin
      const TotalCoinGroup = await userCollection.aggregate([{ $group: { _id: null, totalCoin: { $sum: "$coin" } } }]).toArray();

      const totalCoin = TotalCoinGroup[0].totalCoin;

      // TotalPayment
      const groupPayment = await paymentCollection.aggregate([{ $group: { _id: null, totalPayment: { $sum: "$price" } } }]).toArray();

      const totalPayment = groupPayment[0].totalPayment;

      res.send({ totalUser, totalCoin, totalPayment });
    });

    // For Worker Home: Available Coin + Total submission + Total Earning + Verified By JWT
    app.get("/workerState/:email", verifyToken, async (req, res) => {
      if (req.decoded.email !== req.params.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const email = req.params.email;
      const query = { email: email };
      //
      // AvailableCoin
      const worker = await userCollection.findOne(query);
      const availableCoin = worker.coin;

      // TotalSubmission
      const submissionQuery = { worker_email: email };
      const submission = await submitCollection.estimatedDocumentCount(submissionQuery);

      // Total Earning
      const totalEarningQuery = { worker_email: email, status: "approved" };
      const totalEarningResult = await submitCollection
        .aggregate([{ $match: totalEarningQuery }, { $group: { _id: null, totalEarning: { $sum: "$payable" } } }])
        .toArray();
      const totalEarning = totalEarningResult.length > 0 ? totalEarningResult[0].totalEarning : 0;

      res.send({ availableCoin, submission, totalEarning });
    });

    // For TaskCreator Home: Available Coin + Pending Task + Payment Paid by Admin.
    app.get("/task-creator-state/:email", verifyToken, async (req, res) => {
      if (req.decoded.email !== req.params.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      // for Available Coin
      const email = req.params.email;
      const query = { email: email };
      const availableCoinResult = await userCollection.findOne(query);
      const availableCoin = availableCoinResult.coin;

      // Pending Task
      const queryTask = { email: email };
      const pendingTaskResult = await TaskCollection.aggregate([
        { $match: queryTask },
        { $group: { _id: null, pendingTask: { $sum: "$quantity" } } },
      ]).toArray();

      const pendingTask = pendingTaskResult.length > 0 ? pendingTaskResult[0].pendingTask : 0;

      // Total Payment paid by User
      const queryPayment = { email: email };
      const totalPaidResult = await paymentCollection
        .aggregate([{ $match: queryPayment }, { $group: { _id: null, totalPayment: { $sum: "$price" } } }])
        .toArray();

      const totalPaid = totalPaidResult.length > 0 ? totalPaidResult[0].totalPayment : 0;

      res.send({ availableCoin, pendingTask, totalPaid });
    });

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

    // top 6 earned user
    app.get("/toper", async (req, res) => {
      const toper = await userCollection
        .aggregate([
          { $match: { role: "Worker" } },
          { $sort: { coin: -1 } },
          { $limit: 6 },
          { $project: { photo: 1, coin: 1, email: 1, name: 1, completionTask: 1 } },
        ])
        .toArray();

      res.send(toper);
    });

    // Get Worker Info
    app.get("/worker", async (req, res) => {
      const worker = await userCollection.aggregate([{ $match: { role: "Worker" } }]).toArray();

      res.send(worker);
    });

    // Delete Worker
    app.delete("/worker/:id", verifyToken, async (req, res) => {
      const user = req.params.id;
      const query = { _id: new ObjectId(user) };
      const result = await userCollection.deleteOne(query);

      res.send(result);
    });

    // User Role Update
    app.patch("/role/:email", verifyToken, async (req, res) => {
      if (req.decoded.email !== req.params.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const role = req.body.role;
      const email = req.params.email;
      const query = { email: email };

      const option = {
        $set: {
          role: role,
        },
      };

      const result = await userCollection.updateOne(query, option);

      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };

      const result = await userCollection.findOne(query);

      res.send(result);
    });

    // for Task Collection Api
    app.post("/add-task", verifyToken, async (req, res) => {
      if (req.decoded.email !== req.body.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
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

    app.get("/get_task/:email", verifyToken, async (req, res) => {
      if (req.decoded.email !== req.params.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
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
      res.send(result);
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
      const queryByTitle = { email: data.creator_email, title: data.title };

      // notification API Implementation
      const worker = data.worker_name;
      const email = data.creator_email;
      const title = data.title;
      const info = {
        message: `${worker} has Submitted Your "${title}" Task`,
        email: email,
        date: new Date(),
        status: "unread",
      };

      await notificationCollection.insertOne(info);
      // ================================================

      await TaskCollection.updateOne(queryByTitle, { $inc: { quantity: -1 } });
      const result = await submitCollection.insertOne(data);
      res.send(result);
    });

    app.get("/submit/:creator_email", verifyToken, async (req, res) => {
      if (req.decoded.email !== req.params.creator_email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const email = req.params.creator_email;
      const query = { creator_email: email };
      const result = await submitCollection.find(query).toArray();

      res.send(result);
    });

    // when TaskCreator Clicking the Approve Button, status will be "Approve"
    app.put("/approve/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const status = req.body.status;
      const updateDoc = {
        $set: { status: status },
      };

      // Coin Received by Worker API
      const receiver = req.body.worker_email;
      const payable = parseInt(req.body.payable);
      const filterWorker = { email: receiver };
      const title = req.body.title;
      await userCollection.updateOne(filterWorker, { $inc: { coin: payable, completionTask: 1 } });

      // Notification Implement
      const info = {
        email: receiver,
        message: `Your "${title}" Task has Approved!`,
        status: "unread",
        date: new Date(),
      };
      await notificationCollection.insertOne(info);

      // for Status Change Api
      const result = await submitCollection.updateOne(query, updateDoc);

      res.send(result);
    });

    // When TaskCreator will click the reject Button , Status Will be Changed by "Rejected", and notifications Your ${task} has rejected.
    app.patch("/reject/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const status = req.body.status;
      const updateDoc = {
        $set: { status: status },
      };

      // Notification Implementation.
      const worker = await submitCollection.findOne(filter);
      const workerEmail = worker.worker_email;
      const title = worker.title;

      const info = {
        date: new Date(),
        message: `Your "${title}" Task has Rejected!`,
        status: "unread",
        email: workerEmail,
      };

      await notificationCollection.insertOne(info);

      // Rejection Implementation.
      const result = await submitCollection.updateOne(filter, updateDoc);

      res.send(result);
    });

    app.get("/submits/:worker_email", verifyToken, async (req, res) => {
      if (req.decoded.email !== req.params.worker_email) {
        return res.status(403).send({ message: "forbidden access" });
      }

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
    app.post("/withdrawals", verifyToken, async (req, res) => {
      if (req.decoded.email !== req.body.worker_email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const data = req.body;

      // Notification implement
      const info = {
        email: "Admin",
        status: "unread",
        date: new Date(),
        message: `${data.worker_name} send a $${data.withdrawal_dollar} withdrawal Request.`,
      };

      await notificationCollection.insertOne(info);

      // ==============================================

      const result = await withdrawalCollection.insertOne(data);
      res.send(result);
    });

    app.get("/withdrawals", async (req, res) => {
      const result = await withdrawalCollection.find().toArray();
      res.send(result);
    });

    app.put("/pay/:email", verifyToken, async (req, res) => {
      const withdraw = parseInt(req.body.coin);
      const email = req.params.email;
      const query = { email: email };
      const update = {
        $inc: { coin: -withdraw },
      };
      await userCollection.updateOne(query, update);

      const filter = { worker_email: email };
      const updateStatus = {
        $set: {
          withdrawal_status: "success",
        },
      };

      // Notification Implement
      const info = {
        email: email,
        message: `Your Withdraw has Done. Please Check Your Balance.`,
        date: new Date(),
        status: "unread",
      };

      await notificationCollection.insertOne(info);

      // =====================================

      const status = await withdrawalCollection.updateOne(filter, updateStatus);

      res.send(status);
    });

    app.delete("/withdraw/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        worker_email: email,
      };

      const result = await withdrawalCollection.deleteOne(query);

      res.send(result);
    });

    app.get("/withdrawals/:email", async (req, res) => {
      const email = req.params.email;
      const query = { worker_email: email };
      const result = await withdrawalCollection.find(query).toArray();

      res.send(result);
    });

    // Payment Related API
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      console.log(price);
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payment", async (req, res) => {
      const payment = req.body;
      const pay = parseInt(payment.price);
      let bayCoin = 0;
      if (pay === 1) {
        bayCoin = 10;
      }

      if (pay === 9) {
        bayCoin = 100;
      }

      if (pay === 19) {
        bayCoin = 500;
      }

      if (pay === 39) {
        bayCoin = 1000;
      }
      const email = payment.email;

      await userCollection.updateOne({ email: email }, { $inc: { coin: bayCoin } });

      const result = await paymentCollection.insertOne(payment);

      res.send(result);
    });

    app.get("/payment/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();

      res.send(result);
    });

    // Notification Related API
    app.get("/notification/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };

      const result = await notificationCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/notification", async (req, res) => {
      const query = { email: "Admin" };
      const result = await notificationCollection.find(query).toArray();

      res.send(result);
    });

    app.patch("/notification/status/:email", async (req, res) => {
      const email = req.params.email;
      const status = req.body.status;
      const query = { email: email };
      const updateDoc = {
        $set: { status },
      };

      const findAdmin = await notificationCollection.findOne(query);

      if (!findAdmin) {
        const query = { email: "Admin" };
        const result = await notificationCollection.updateMany(query, updateDoc);

        return res.send(result);
      }

      const result = await notificationCollection.updateMany(query, updateDoc);

      res.send(result);
    });

    // ================================================================

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
