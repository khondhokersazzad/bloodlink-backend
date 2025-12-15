const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const port = process.env.PORT || 3000;
console.log(port);
const app = express();
app.use(cors());
app.use(express.json());

//For Jwt
const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//MiddleWare 

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: 'unauthorize access' });
  }

  try {
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log("decoded info", decoded);

    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: 'unauthorize access' });
  }
};


//----Mongo credentials---

const uri =
  "mongodb+srv://Sazzad:opSBhbtpfPfavN2i@cluster0.eb48hh2.mongodb.net/?appName=Cluster0";

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
    // Connect the client to the server	(optional starting in v4.7)
    //await client.connect();
    // Send a ping to confirm a successful connection
    //await client.db("admin").command({ ping: 1 });

    const database = client.db("lifeadviceDB");
    const userCollections = database.collection("user");
    const requestCollections = database.collection("request");

    //User data save on db
    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      userInfo.role = "donor";
      userInfo.status = "pending"
      userInfo.createdAt = new Date(new Date().getTime() + 6 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      const result = await userCollections.insertOne(userInfo);

      res.send(result);
    });
    //Request data 
    app.post("/request", verifyFBToken ,async(req,res) =>{
      const requestInfo = req.body;
      requestInfo.donation_status = "pending"
      const result = await requestCollections.insertOne(requestInfo);
      res.send(result);

    })

    app.get("/users/role/:email", async (req, res) => {
      const { email } = req.params;
      const query = { email: email };
      const result = await userCollections.findOne(query);
      res.send(result);
      console.log(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Devs!");
});

app.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
