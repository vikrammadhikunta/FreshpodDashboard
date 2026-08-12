const db = require("./firebase.js");
const Log = require("../Model/logSchema.js");
const Machine = require("../Model/machineSchema.js");

function startSync() {
  console.log("🚀 Firebase → MongoDB sync started...");

  const machinesRef = db.ref("machines");

  // ✅ Print all existing machines
  machinesRef.once("value", (snapshot) => {
    console.log("📋 Machines in Firebase:");

    snapshot.forEach((machineSnap) => {
      console.log(machineSnap.key, machineSnap.val());
    });
  });

  // Existing listener (unchanged)
  machinesRef.on("child_added", (machineSnap) => {
    const machineId = machineSnap.key;
    console.log(`🆕 Machine detected: ${machineId}`);

    listenToMachineLogs(machineId);
  });
}


// ===============================
// 📡 Listen to logs
// ===============================
function listenToMachineLogs(machineId) {
  const logsRef = db.ref(`machines/${machineId}/logs`);

  logsRef.on("child_added", (logSnap) => {
    syncLog(machineId, logSnap);
  });

  logsRef.on("child_changed", (logSnap) => {
    syncLog(machineId, logSnap);
  });
}


// ===============================
// 🔄 Sync single log
// ===============================
async function syncLog(machineId, logSnap) {
  try {
    const date = logSnap.key;
    const data = logSnap.val();

    // ❌ skip invalid date
    if (!date || date === "1970-01-01") return;

    const tapCount = data?.tapCount || 0;

    // ✅ upsert log
    await Log.updateOne(
      { machineId, date },
      { $set: { tapCount } },
      { upsert: true }
    );

    // ===============================
    // 🔥 UPDATE MACHINE TOTAL TAPS
    // ===============================

    const allLogs = await Log.find({ machineId });

    const totalTaps = allLogs.reduce((sum, log) => {
      return sum + (log.tapCount || 0);
    }, 0);

    await Machine.updateOne(
      { machineId },
      { $set: { totalTaps } }
    );

    console.log(`🔄 Synced: ${machineId} | ${date} | taps: ${tapCount}`);

  } catch (error) {
    console.error("❌ Sync error:", error);
  }
}

module.exports = startSync;