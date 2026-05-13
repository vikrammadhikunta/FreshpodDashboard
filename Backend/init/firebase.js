const admin = require("firebase-admin");

const serviceAccount = require("./fpsl-rfid-firebase-adminsdk-fbsvc-2cad86f524.json"); // download from Firebase

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://fpsl-rfid-default-rtdb.firebaseio.com"
});

const db = admin.database();

module.exports = db;