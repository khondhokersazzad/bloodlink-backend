const { ObjectId } = require('mongodb');
const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const port = process.env.PORT || 3000;
const app = express();
app.use(cors());
app.use(express.json());

// For Jwt
const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// --- GLOBAL VARIABLES ---
// Declaring these here makes them accessible to  middlewares
let userCollections;
let requestCollections;

// MiddleWare
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "unauthorize access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorize access" });
  }
};

const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.decoded_email;

    // Safety check: ensure DB is connected before querying
    if (!userCollections) {
      return res.status(500).send({ message: "Database not initialized" });
    }

    const user = await userCollections.findOne({ email: email });

    if (!user || user.role !== "admin") {
      return res.status(403).send({ message: "forbidden access" });
    }

    next();
  } catch (error) {
    console.error("SERVER ERROR IN VERIFYADMIN:", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

// ---- Mongo credentials ---
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.eb48hh2.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = client.db("lifeadviceDB");

    userCollections = database.collection("user");
    requestCollections = database.collection("request");

    console.log("Connected to MongoDB");

    // --- ROUTES ---

    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      userInfo.role = "donor";
      userInfo.status = "active";
      userInfo.createdAt = new Date(new Date().getTime() + 6 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      const result = await userCollections.insertOne(userInfo);
      res.send(result);
    });

    app.get("/users", verifyFBToken, async (req, res) => {
      const result = await userCollections.find().toArray();
      res.send(result);
    });
    //Logged user data
    app.get("/users/data", verifyFBToken, async (req, res) => {
      const email = req.decoded_email;
      const result = await userCollections.findOne({ email });
      res.send(result);
    });

    app.put("/users/data", verifyFBToken, async (req, res) => {
      const email = req.decoded_email;
      const data = req.body;
      const result = await userCollections.updateOne({ email }, { $set: data });
      res.send(result);
    });
    //New Request
    app.post("/request", verifyFBToken, async (req, res) => {
      const requestInfo = req.body;
      requestInfo.donation_status = "pending";
      const result = await requestCollections.insertOne(requestInfo);
      res.send(result);
    });

    //Request details 
    app.get('/request-details/:id', verifyFBToken, async(req,res)=>{
      const {id} = req.params;

      const query = {_id: new ObjectId(id)}
      const result = await requestCollections.findOne(query);
      res.send(result);
    })

    //Get Request details 
    app.get('/update-request-details/:id', verifyFBToken, async(req,res)=>{
      const {id} = req.params;

      const query = {_id: new ObjectId(id)}
      const result = await requestCollections.findOne(query);
      res.send(result);
    })

    //Update Request details

    app.put("/update-request-details/:id", async (req, res) => {
      const data = req.body;
      const id = req.params;
      const query = { _id: new ObjectId(id) };

      const updateServices = {
        $set: data,
      };
      const result = await requestCollections.updateOne(query, updateServices);

      res.send(result);
    });

    //Request update status only
    app.patch("/request-details/:id", verifyFBToken, async (req, res) => {
      const {id} = req.params;
      const { donation_status } = req.query;
      const result = await requestCollections.updateOne(
        {_id: new ObjectId(id) },
        { $set: { donation_status } }
      );
      res.send(result);
    });

    //Request Delete
    app.delete("/request/delete/:id",verifyFBToken,verifyAdmin, async(req,res)=>{
      const {id} = req.params;
      const query = {_id :new ObjectId(id)};
      const result = await requestCollections.deleteOne(query);
      res.send(result);
    })

    app.get("/search-request", async (req, res) => {
      const { bloodgrp, district, upazilla } = req.query;
      const query = { donation_status: "pending" };
      if (district && district !== "Select Your District") {
        query.rec_district = { $regex: `^${district}$`, $options: "i" };
      }
      if (upazilla && upazilla !== "Select Your Upazilla") {
        query.rec_upazilla = { $regex: `^${upazilla}$`, $options: "i" };
      }
      if (bloodgrp && bloodgrp !== "Select Blood Group") {
        const escapedBloodGroup = bloodgrp.replace(/\+/g, "\\+");
        query.rec_blood = { $regex: `^${escapedBloodGroup}$`, $options: "i" };
      }
      const result = await requestCollections.find(query).toArray();
      res.send(result);
    });

    app.get("/my-request", verifyFBToken, async (req, res) => {
      const email = req.decoded_email;
      const query = { req_email: email };
      const size = Number(req.query.size) || 10;
      const page = Number(req.query.page) || 0;

      const result = await requestCollections
        .find(query)
        .limit(size)
        .skip(size * page)
        .toArray();
      const totalRequest = await requestCollections.countDocuments(query);
      res.send({ request: result, totalRequest });
    });

    app.get("/all-request", verifyFBToken, verifyAdmin, async (req, res) => {
      const size = Number(req.query.size) || 10;
      const page = Number(req.query.page) || 0;

      const result = await requestCollections
        .find()
        .limit(size)
        .skip(size * page)
        .toArray();
      const totalRequest = await requestCollections.countDocuments();
      res.send({ request: result, totalRequest });
    });

    app.get("/users/role/:email", async (req, res) => {
      const { email } = req.params;
      const result = await userCollections.findOne({ email });
      res.send(result);
    });

    app.patch("/update/user/status", verifyFBToken, async (req, res) => {
      const { email,status } = req.query;
      const result = await requestCollections.updateOne(
        { email },
        { $set: { status } }
      );
      res.send(result);
    });
  } catch (error) {
    console.error("Database connection error:", error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Devs!");
});

app.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
