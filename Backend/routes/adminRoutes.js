const express = require("express");
const router = express.Router();
const Machine = require("../Model/machineSchema");
const User = require("../Model/userSchema");
const Log = require("../Model/logSchema");
const { auth, allowRoles } = require("../middleware/auth");

/* ======================================================
   HELPER FUNCTIONS
====================================================== */

// Normalize ObjectId
const normalizeId = (val) => {
  if (!val) return null;
  return typeof val === "object" ? val._id?.toString() : val.toString();
};

// Format machine response (FIXED)
const formatMachineResponse = (machine, logsMap = {}) => ({
  _id: machine._id.toString(),
  machineId: machine.machineId,
  location: machine.location,
  state: machine.state,
  country: machine.country,
  totalTaps: machine.totalTaps || 0,
  costPerTap: machine.costPerTap || 70,
  status: machine.status || "active",
  assignedTo: normalizeId(machine.assignedTo),
  dealership: normalizeId(machine.dealership),
  logs: logsMap[machine.machineId] || {},
  createdAt: machine.createdAt,
  updatedAt: machine.updatedAt
});

// Get machines by role
const getMachinesByRole = async (user) => {
  if (user.role === "admin") return await Machine.find();
  if (user.role === "customer") return await Machine.find({ assignedTo: user.id });
  if (user.role === "dealership") {
    return await Machine.find({ dealership: user.id });
  }
  return [];
};

// Logs map
const getLogsMap = async (machineIds) => {
  const logs = await Log.find({ machineId: { $in: machineIds } });
  const logsMap = {};
  logs.forEach(log => {
    if (!logsMap[log.machineId]) logsMap[log.machineId] = {};
    logsMap[log.machineId][log.date] = { tapCount: log.tapCount };
  });
  return logsMap;
};

/* ======================================================
   GET MACHINE DATA
====================================================== */
router.get("/machine/data", auth, allowRoles("admin", "customer", "dealership"), async (req, res) => {
  try {
    const machines = await getMachinesByRole(req.user);
    const machineIds = machines.map(m => m.machineId);
    const logsMap = await getLogsMap(machineIds);

    const response = machines.map(m => formatMachineResponse(m, logsMap));
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   GET USERS
====================================================== */
router.get("/users", auth, allowRoles("admin", "dealership"), async (req, res) => {
  try {
    let query = {};

    if (req.user.role === "dealership") {
      query = { parent: req.user.id, role: "customer" };
    }

    const users = await User.find(query)
      .select("-password -refreshToken")
      .populate("assignedMachines", "machineId location status");

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   GET AVAILABLE MACHINES (BEST PRACTICE)
====================================================== */
router.get("/user/:id/available-machines", auth, allowRoles("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    const currentMachines = await Machine.find({
      _id: { $in: user.assignedMachines || [] }
    }).select("_id machineId location");

    let availableMachines = [];

    if (user.role === "dealership") {
      availableMachines = await Machine.find({
        dealership: null,
        assignedTo: null
      }).select("_id machineId location");
    }

    if (user.role === "customer") {
      availableMachines = await Machine.find({
        dealership: user.parent,
        assignedTo: null
      }).select("_id machineId location");
    }

    res.json({
      currentMachines,
      availableMachines
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   CREATE MACHINE
====================================================== */
router.post("/machine", auth, allowRoles("admin"), async (req, res) => {
  try {
    const { machineId, location, state, country, costPerTap } = req.body;

    if (!machineId || !location || !state) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const exists = await Machine.findOne({ machineId });
    if (exists) return res.status(400).json({ message: "Machine exists" });

    const machine = await Machine.create({
      machineId,
      location,
      state,
      country: country || "India",
      costPerTap,
      assignedTo: null,
      dealership: null
    });

    res.status(201).json(machine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   CREATE USER
====================================================== */
router.post("/createUser", auth, allowRoles("admin"), async (req, res) => {
  try {
    const { name, email, phoneNumber, state, role, assignedMachineIds = [] } = req.body;

    // Validate role
    const validRoles = ["admin", "dealership", "operator", "customer"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role specified" });
    }

    // Check if phone number already exists (UNIQUE VALIDATION)
    const existingUserByPhone = await User.findOne({ phoneNumber });
    if (existingUserByPhone) {
      return res.status(400).json({ 
        error: "DUPLICATE_PHONE_NUMBER",
        message: "This mobile number is already registered with another account"
      });
    }

    // Check if email already exists
    const existingUserByEmail = await User.findOne({ email });
    if (existingUserByEmail) {
      return res.status(400).json({ 
        error: "DUPLICATE_EMAIL",
        message: "This email is already registered with another account"
      });
    }

    // Check if assigned machines exist and are available
    if (assignedMachineIds.length > 0) {
      const machines = await Machine.find({ _id: { $in: assignedMachineIds } });
      
      if (machines.length !== assignedMachineIds.length) {
        return res.status(400).json({ 
          error: "INVALID_MACHINES",
          message: "Some machines do not exist in the system" 
        });
      }
      
      // Check which machines are already assigned
      const alreadyAssigned = machines.filter(m => m.assignedTo !== null);
      if (alreadyAssigned.length > 0) {
        return res.status(400).json({ 
          error: "MACHINES_ALREADY_ASSIGNED",
          message: "Some machines are already assigned to other users",
          assignedMachines: alreadyAssigned.map(m => ({
            machineId: m.machineId,
            currentAssignedTo: m.assignedTo
          }))
        });
      }
    }

    // Create the user
    const user = await User.create({
      name,
      email,
      phoneNumber,
      state,
      role,
      parent: req.user.id,
      assignedMachines: []
    });

    // Assign machines based on role
    if (assignedMachineIds.length > 0) {
      const updateData = {};
      
      // Set the appropriate fields based on user role
      switch (role) {
        case "dealership":
          updateData.dealership = user._id;
          break;
        case "operator":
          updateData.operatorId = user._id;
          break;
        case "customer":
          updateData.assignedTo = user._id;
          break;
        case "admin":
          // Admins don't get assigned machines directly
          break;
      }

      // Only update if we have fields to set
      if (Object.keys(updateData).length > 0) {
        await Machine.updateMany(
          { _id: { $in: assignedMachineIds } },
          updateData
        );
      }
      
      user.assignedMachines = assignedMachineIds;
      await user.save();
    }

    // Return the created user with populated data
    const populatedUser = await User.findById(user._id)
      .select("-password") // Exclude password if it exists
      .populate('assignedMachines', 'machineId location status totalTaps');

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: populatedUser
    });

  } catch (err) {
    // Handle MongoDB duplicate key error (backup validation)
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({ 
        error: "DUPLICATE_ENTRY",
        message: `${field} already exists in the system`
      });
    }
    
    console.error("Error creating user:", err);
    res.status(500).json({ 
      error: "INTERNAL_SERVER_ERROR",
      message: err.message 
    });
  }
});
/* ======================================================
   UPDATE MACHINE
====================================================== */
router.put("/machine/:id", auth, allowRoles("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { machineId, location, state, country, costPerTap, machineCost, status } = req.body;

    const machine = await Machine.findById(id);
    if (!machine) {
      return res.status(404).json({ message: "Machine not found" });
    }

    // Check if machineId is being changed and if it already exists
    if (machineId && machineId !== machine.machineId) {
      const exists = await Machine.findOne({ machineId });
      if (exists) {
        return res.status(400).json({ message: "Machine ID already exists" });
      }
    }

    machine.machineId = machineId || machine.machineId;
    machine.location = location || machine.location;
    machine.state = state || machine.state;
    machine.country = country || machine.country;
    machine.costPerTap = costPerTap || machine.costPerTap;
    machine.machineCost = machineCost || machine.machineCost;
    machine.status = status || machine.status;

    await machine.save();

    res.json(machine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   UPDATE USER (FIXED CORE ISSUE)
====================================================== */
router.put("/user/:id", auth, allowRoles("admin"), async (req, res) => {
  try {
    const { assignedMachineIds = [] } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    const currentIds = user.assignedMachines.map(id => id.toString());
    const newIds = assignedMachineIds.map(id => id.toString());

    const toRemove = currentIds.filter(id => !newIds.includes(id));
    const toAdd = newIds.filter(id => !currentIds.includes(id));

    // REMOVE
    if (toRemove.length) {
      await Machine.updateMany(
        { _id: { $in: toRemove } },
        { assignedTo: null }
      );
    }

    // ADD (only unassigned machines)
    if (toAdd.length) {
      const validMachines = await Machine.find({
        _id: { $in: toAdd },
        assignedTo: null
      });

      await Machine.updateMany(
        { _id: { $in: validMachines.map(m => m._id) } },
        { assignedTo: user._id }
      );
    }

    user.assignedMachines = assignedMachineIds;
    await user.save();

    res.json({ message: "Updated successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   DELETE USER
====================================================== */
/* ======================================================
   DELETE USER (CLEARS ALL MACHINE REFERENCES)
====================================================== */
router.delete("/user/:id", auth, allowRoles("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    // Clear machine references based on user role
    if (user.role === "dealership") {
      // If dealership is deleted, clear dealership, assignedTo, and operatorId
      await Machine.updateMany(
        { dealership: user._id },
        { 
          $set: { 
            dealership: null,
            assignedTo: null,
            operatorId: null
          }
        }
      );
    } 
    else if (user.role === "customer") {
      // If customer is deleted, clear assignedTo and operatorId
      await Machine.updateMany(
        { assignedTo: user._id },
        { 
          $set: { 
            assignedTo: null,
            operatorId: null
          }
        }
      );
    }
    else if (user.role === "operator") {
      // If operator is deleted, clear operatorId only
      await Machine.updateMany(
        { operatorId: user._id },
        { $set: { operatorId: null } }
      );
    }
    else {
      // For any other role, just clear assignedTo
      await Machine.updateMany(
        { assignedTo: user._id },
        { $set: { assignedTo: null } }
      );
    }

    await user.deleteOne();

    res.json({ message: "User deleted successfully. All machine references cleared." });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;

