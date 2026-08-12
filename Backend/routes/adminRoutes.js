const express = require("express");
const router = express.Router();
const Machine = require("../Model/machineSchema");
const User = require("../Model/userSchema");
const Report = require("../Model/reportSchema");
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

// Format machine response
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

// FIXED: Properly aggregate logs by date (sum tapCounts for same date)
const getLogsMap = async (machineIds) => {
  if (!machineIds || machineIds.length === 0) return {};
  
  // Find all logs for the given machine IDs
  const logs = await Log.find({ machineId: { $in: machineIds } });
  
  const logsMap = {};
  
  // Aggregate tapCounts by machineId and date
  logs.forEach(log => {
    if (!logsMap[log.machineId]) {
      logsMap[log.machineId] = {};
    }
    
    // Sum tapCounts for the same date
    if (logsMap[log.machineId][log.date]) {
      logsMap[log.machineId][log.date].tapCount += log.tapCount;
    } else {
      logsMap[log.machineId][log.date] = { tapCount: log.tapCount };
    }
  });
  
  return logsMap;
};

// Alternative: Using MongoDB aggregation for better performance
const getLogsMapAggregated = async (machineIds) => {
  if (!machineIds || machineIds.length === 0) return {};
  
  const aggregation = await Log.aggregate([
    {
      $match: { machineId: { $in: machineIds } }
    },
    {
      $group: {
        _id: {
          machineId: "$machineId",
          date: "$date"
        },
        totalTapCount: { $sum: "$tapCount" }
      }
    },
    {
      $group: {
        _id: "$_id.machineId",
        logs: {
          $push: {
            date: "$_id.date",
            tapCount: "$totalTapCount"
          }
        }
      }
    }
  ]);
  
  const logsMap = {};
  aggregation.forEach(item => {
    logsMap[item._id] = {};
    item.logs.forEach(log => {
      logsMap[item._id][log.date] = { tapCount: log.tapCount };
    });
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
    const logsMap = await getLogsMap(machineIds); // Using the fixed version

    const response = machines.map(m => formatMachineResponse(m, logsMap));
    res.json(response);
  } catch (err) {
    console.error("Error in /machine/data:", err);
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
   GET AVAILABLE MACHINES
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
   RECORD TAP (NEW ENDPOINT)
====================================================== */
router.post("/machine/:machineId/tap", auth, async (req, res) => {
  try {
    const { machineId } = req.params;
    const { tapCount, amount, initiatedBy, sessionId } = req.body;
    
    const today = new Date().toISOString().split('T')[0];
    
    // Find the machine
    const machine = await Machine.findOne({ machineId });
    if (!machine) {
      return res.status(404).json({ message: "Machine not found" });
    }
    
    // Create log entry
    const log = await Log.create({
      machineId,
      date: today,
      tapCount: tapCount || 1,
      action: "TAP_DISPENSED",
      status: "completed",
      initiatedBy: initiatedBy || req.user.id,
      amount: amount || machine.costPerTap,
      sessionId: sessionId || `session_${Date.now()}`,
      sessionDuration: 0,
      sessionTaps: tapCount || 1,
      timestamp: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    // Update machine totalTaps
    machine.totalTaps = (machine.totalTaps || 0) + (tapCount || 1);
    await machine.save();
    
    res.status(201).json({
      success: true,
      message: "Tap recorded successfully",
      log,
      machine: {
        machineId: machine.machineId,
        totalTaps: machine.totalTaps
      }
    });
  } catch (err) {
    console.error("Error recording tap:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   GET MACHINE LOGS WITH AGGREGATION
====================================================== */
router.get("/machine/:machineId/logs", auth, async (req, res) => {
  try {
    const { machineId } = req.params;
    
    const logs = await Log.find({ machineId }).sort({ date: -1 });
    
    // Aggregate by date
    const aggregatedLogs = {};
    logs.forEach(log => {
      if (!aggregatedLogs[log.date]) {
        aggregatedLogs[log.date] = 0;
      }
      aggregatedLogs[log.date] += log.tapCount;
    });
    
    const machine = await Machine.findOne({ machineId });
    
    res.json({
      machineId,
      machineTotalTaps: machine?.totalTaps || 0,
      logs: logs,
      aggregatedLogs: aggregatedLogs,
      totalTapsFromLogs: Object.values(aggregatedLogs).reduce((a, b) => a + b, 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   CREATE USER
====================================================== */
router.post("/createUser", auth, allowRoles("admin"), async (req, res) => {
  try {
    const { name, email, phoneNumber , location , state, role, assignedMachineIds = [] } = req.body;

    // Validate role
    const validRoles = ["admin", "dealership", "operator", "customer"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role specified" });
    }

    // Check if phone number already exists
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
      location,
      role,
      parent: req.user.id,
      assignedMachines: []
    });

    // Assign machines based on role
    if (assignedMachineIds.length > 0) {
      const updateData = {};
      
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
      }

      if (Object.keys(updateData).length > 0) {
        await Machine.updateMany(
          { _id: { $in: assignedMachineIds } },
          updateData
        );
      }
      
      user.assignedMachines = assignedMachineIds;
      await user.save();
    }

    const populatedUser = await User.findById(user._id)
      .select("-password")
      .populate('assignedMachines', 'machineId location status totalTaps');

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: populatedUser
    });

  } catch (err) {
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
   UPDATE USER
====================================================== */
router.put("/user/:id", auth, allowRoles("admin"), async (req, res) => {
  try {
    const { assignedMachineIds = [], role } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    // Get current assigned machine IDs
    const currentIds = user.assignedMachines.map(id => id.toString());
    const newIds = assignedMachineIds.map(id => id.toString());

    const toRemove = currentIds.filter(id => !newIds.includes(id));
    const toAdd = newIds.filter(id => !currentIds.includes(id));

    // Handle removal of machines
    if (toRemove.length) {
      const updateData = {};
      
      // Clear the appropriate field based on user role
      if (user.role === "dealership") {
        updateData.dealership = null;
      } else if (user.role === "operator") {
        updateData.operatorId = null;
      } else if (user.role === "customer") {
        updateData.assignedTo = null;
      }
      
      await Machine.updateMany(
        { _id: { $in: toRemove } },
        updateData
      );
    }

    // Handle addition of machines
    if (toAdd.length) {
      // Check if machines exist and are available
      const validMachines = await Machine.find({
        _id: { $in: toAdd }
      });

      if (validMachines.length !== toAdd.length) {
        return res.status(400).json({ 
          error: "INVALID_MACHINES",
          message: "Some machines do not exist in the system" 
        });
      }

      // Check which machines are already assigned
      const alreadyAssigned = validMachines.filter(m => {
        if (user.role === "dealership") {
          return m.dealership !== null && m.dealership !== undefined;
        } else if (user.role === "operator") {
          return m.operatorId !== null && m.operatorId !== undefined;
        } else if (user.role === "customer") {
          return m.assignedTo !== null && m.assignedTo !== undefined;
        }
        return false;
      });

      if (alreadyAssigned.length > 0) {
        return res.status(400).json({ 
          error: "MACHINES_ALREADY_ASSIGNED",
          message: "Some machines are already assigned to other users",
          assignedMachines: alreadyAssigned.map(m => ({
            machineId: m.machineId,
            currentAssignedTo: m.assignedTo || m.dealership || m.operatorId
          }))
        });
      }

      // Assign machines based on user role
      const updateData = {};
      
      switch (user.role) {
        case "dealership":
          updateData.dealership = user._id;
          break;
        case "operator":
          updateData.operatorId = user._id;
          break;
        case "customer":
          updateData.assignedTo = user._id;
          break;
        default:
          // For other roles, use assignedTo as fallback
          updateData.assignedTo = user._id;
      }

      await Machine.updateMany(
        { _id: { $in: validMachines.map(m => m._id) } },
        updateData
      );
    }

    // Update user's assigned machines
    user.assignedMachines = assignedMachineIds;
    await user.save();

    // Return populated user data
    const updatedUser = await User.findById(user._id)
      .select("-password")
      .populate('assignedMachines', 'machineId location status totalTaps');

    res.json({
      success: true,
      message: "User updated successfully",
      user: updatedUser
    });

  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ 
      error: "INTERNAL_SERVER_ERROR",
      message: err.message 
    });
  }
});


router.delete("/user/:id", auth, allowRoles("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ 
        error: "USER_NOT_FOUND",
        message: "User not found" 
      });
    }

    // Track which machines will be affected for the response
    let affectedMachines = [];
    let updateResult = {};

    // Clear machine assignments based on user role
    if (user.role === "dealership") {
      // Get affected machines
      affectedMachines = await Machine.find({ dealership: user._id });
      
      // Clear ALL assignments for dealership's machines
      updateResult = await Machine.updateMany(
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
      // Get affected machines
      affectedMachines = await Machine.find({ assignedTo: user._id });
      
      // Clear assignments for customer's machines
      updateResult = await Machine.updateMany(
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
      // Get affected machines
      affectedMachines = await Machine.find({ operatorId: user._id });
      
      // Clear operator assignment
      updateResult = await Machine.updateMany(
        { operatorId: user._id },
        { 
          $set: { 
            operatorId: null
          }
        }
      );
    }
    else if (user.role === "admin") {
      // Admins usually don't have machines assigned, but just in case
      affectedMachines = await Machine.find({ 
        $or: [
          { dealership: user._id },
          { assignedTo: user._id },
          { operatorId: user._id }
        ]
      });
      
      updateResult = await Machine.updateMany(
        { 
          $or: [
            { dealership: user._id },
            { assignedTo: user._id },
            { operatorId: user._id }
          ]
        },
        { 
          $set: { 
            dealership: null,
            assignedTo: null,
            operatorId: null
          }
        }
      );
    }
    else {
      // Fallback for any other roles
      affectedMachines = await Machine.find({ assignedTo: user._id });
      
      updateResult = await Machine.updateMany(
        { assignedTo: user._id },
        { 
          $set: { 
            assignedTo: null,
            operatorId: null,
            dealership: null
          }
        }
      );
    }

    // Also clean up any references in the user's assignedMachines array
    // This ensures the user document is clean before deletion
    user.assignedMachines = [];
    await user.save();

    // Store user data for response before deletion
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phoneNumber: user.phoneNumber
    };

    // Delete the user
    await user.deleteOne();

    // Log the deletion for audit purposes
    console.log(`User deleted by ${req.user.id}:`, {
      deletedUser: userData,
      affectedMachines: affectedMachines.length,
      machinesUpdated: updateResult.modifiedCount || 0,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: "User deleted successfully. All machine references cleared.",
      data: {
        deletedUser: userData,
        machinesAffected: affectedMachines.map(m => ({
          id: m._id,
          machineId: m.machineId,
          location: m.location
        })),
        totalMachinesUpdated: updateResult.modifiedCount || 0
      }
    });

  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ 
      error: "INTERNAL_SERVER_ERROR",
      message: err.message 
    });
  }
});

/* ======================================================
   DATA CONSISTENCY CHECK (DEBUG ENDPOINT)
====================================================== */
router.get("/debug/consistency", auth, allowRoles("admin"), async (req, res) => {
  try {
    const machines = await Machine.find();
    const results = [];
    
    for (const machine of machines) {
      const logs = await Log.find({ machineId: machine.machineId });
      const calculatedTotal = logs.reduce((sum, log) => sum + log.tapCount, 0);
      
      results.push({
        machineId: machine.machineId,
        storedTotalTaps: machine.totalTaps,
        calculatedTotalFromLogs: calculatedTotal,
        logsCount: logs.length,
        isConsistent: machine.totalTaps === calculatedTotal,
        discrepancy: machine.totalTaps - calculatedTotal
      });
    }
    
    res.json({
      totalMachines: machines.length,
      consistentMachines: results.filter(r => r.isConsistent).length,
      inconsistentMachines: results.filter(r => !r.isConsistent).length,
      details: results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   FIX INCONSISTENT DATA (ADMIN ONLY)
====================================================== */
router.post("/debug/fix-consistency", auth, allowRoles("admin"), async (req, res) => {
  try {
    const machines = await Machine.find();
    const fixes = [];
    
    for (const machine of machines) {
      const logs = await Log.find({ machineId: machine.machineId });
      const calculatedTotal = logs.reduce((sum, log) => sum + log.tapCount, 0);
      
      if (machine.totalTaps !== calculatedTotal) {
        const oldTotal = machine.totalTaps;
        machine.totalTaps = calculatedTotal;
        await machine.save();
        
        fixes.push({
          machineId: machine.machineId,
          oldTotalTaps: oldTotal,
          newTotalTaps: calculatedTotal,
          fixed: true
        });
      }
    }
    
    res.json({
      message: "Data consistency fix completed",
      fixes: fixes,
      totalFixed: fixes.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET ALL REPORTS (with filters)
// ======================================================
router.get("/reports", auth, allowRoles("admin"), async (req, res) => {
  console.log("\n🔵 [GET /admin/reports]");
  
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    
    // Build filter
    let filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
        { reportId: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get reports with pagination
    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalReports = await Report.countDocuments(filter);
    const pendingCount = await Report.countDocuments({ status: 'pending' });
    const solvedCount = await Report.countDocuments({ status: 'solved' });
    
    // Get additional details for each report
    const reportsWithDetails = await Promise.all(reports.map(async (report) => {
      const customerMachines = await Machine.find({ 
        assignedTo: report.customer.id 
      }).select('machineId location status totalTaps operatorId');
      
      const operatorIds = customerMachines
        .map(m => m.operatorId)
        .filter(id => id);
      
      const operators = await User.find({
        _id: { $in: operatorIds },
        role: 'operator'
      }).select('name email phoneNumber');
      
      const customer = await User.findById(report.customer.id)
        .select('name email phoneNumber location state');
      
      const hoursOld = Math.floor((Date.now() - new Date(report.createdAt)) / (1000 * 60 * 60));
      const daysOld = Math.floor(hoursOld / 24);
      
      let priority = 'normal';
      if (daysOld > 7) priority = 'critical';
      else if (daysOld > 3) priority = 'high';
      else if (daysOld > 1) priority = 'medium';
      
      return {
        reportId: report.reportId,
        subject: report.subject,
        description: report.description,
        status: report.status,
        priority: priority,
        createdAt: report.createdAt,
        resolvedAt: report.resolvedAt,
        resolutionNotes: report.resolutionNotes,
        timeElapsed: daysOld > 0 ? `${daysOld}d ${hoursOld % 24}h` : `${hoursOld}h`,
        customer: {
          id: customer?._id || report.customer.id,
          name: customer?.name || report.customer.name,
          email: customer?.email || report.customer.email,
          phone: customer?.phoneNumber || report.customer.phone || 'N/A',
          location: customer?.location || 'N/A'
        },
        machines: customerMachines.map(m => ({
          machineId: m.machineId,
          location: m.location,
          status: m.status
        })),
        operators: operators.map(o => ({
          name: o.name,
          phone: o.phoneNumber
        })),
        totalMachines: customerMachines.length,
        totalOperators: operators.length
      };
    }));
    
    res.json({
      success: true,
      statistics: {
        total: totalReports,
        pending: pendingCount,
        solved: solvedCount
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalReports / parseInt(limit)),
        totalItems: totalReports,
        itemsPerPage: parseInt(limit)
      },
      reports: reportsWithDetails
    });
    
  } catch (err) {
    console.error("❌ Error fetching reports:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// ======================================================
// GET SINGLE REPORT DETAILS
// ======================================================
router.get("/report/:reportId", auth, allowRoles("admin"), async (req, res) => {
  console.log("\n🔵 [GET /admin/report/:reportId]");
  console.log("📌 Report ID:", req.params.reportId);
  
  try {
    const { reportId } = req.params;
    
    const report = await Report.findOne({ reportId });
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }
    
    // Get customer details
    const customer = await User.findById(report.customer.id)
      .select('name email phoneNumber location state country');
    
    // Get machines with operators
    const machines = await Machine.find({ 
      assignedTo: report.customer.id 
    }).populate('operatorId', 'name email phoneNumber');
    
    // Get all operators
    const operators = await User.find({
      parent: report.customer.id,
      role: 'operator'
    }).select('name email phoneNumber assignedMachines');
    
    // Get recent logs
    const machineIds = machines.map(m => m.machineId);
    const recentLogs = await Log.find({
      machineId: { $in: machineIds }
    })
    .sort({ date: -1, timestamp: -1 })
    .limit(50);
    
    res.json({
      success: true,
      report: {
        reportId: report.reportId,
        subject: report.subject,
        description: report.description,
        status: report.status,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        resolvedAt: report.resolvedAt,
        resolutionNotes: report.resolutionNotes
      },
      customer: {
        id: customer?._id || report.customer.id,
        name: customer?.name || report.customer.name,
        email: customer?.email || report.customer.email,
        phone: customer?.phoneNumber || report.customer.phone || 'N/A',
        location: customer?.location || 'N/A',
        state: customer?.state || 'N/A'
      },
      machines: machines.map(m => ({
        machineId: m.machineId,
        location: m.location,
        status: m.status,
        totalTaps: m.totalTaps || 0,
        operator: m.operatorId ? {
          name: m.operatorId.name,
          email: m.operatorId.email,
          phone: m.operatorId.phoneNumber
        } : null
      })),
      operators: operators.map(o => ({
        name: o.name,
        email: o.email,
        phone: o.phoneNumber
      })),
      recentActivity: recentLogs.map(log => ({
        date: log.date,
        machineId: log.machineId,
        tapCount: log.tapCount || 0,
        time: log.timestamp
      })),
      statistics: {
        totalMachines: machines.length,
        totalOperators: operators.length,
        totalTaps: machines.reduce((sum, m) => sum + (m.totalTaps || 0), 0)
      }
    });
    
  } catch (err) {
    console.error("❌ Error fetching report:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ======================================================
// MARK REPORT AS SOLVED (PUT)
// ======================================================
router.put("/report/:reportId/solve", auth, allowRoles("admin"), async (req, res) => {
  console.log("\n🔵 [PUT /admin/report/:reportId/solve]");
  console.log("📌 Report ID:", req.params.reportId);
  
  try {
    const { reportId } = req.params;
    const { resolutionNotes } = req.body;
    
    const report = await Report.findOne({ reportId });
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }
    
    if (report.status === 'solved') {
      return res.status(400).json({
        success: false,
        message: "This report is already solved"
      });
    }
    
    // Update report
    report.status = 'solved';
    report.resolvedAt = new Date();
    report.resolutionNotes = resolutionNotes || `Resolved by ${req.user.name || 'Admin'}`;
    await report.save();
    
    // Get admin details
    const admin = await User.findById(req.user.id).select('name email');
    
    res.json({
      success: true,
      message: "Report marked as solved successfully",
      report: {
        reportId: report.reportId,
        subject: report.subject,
        status: report.status,
        resolvedAt: report.resolvedAt,
        resolutionNotes: report.resolutionNotes
      },
      resolvedBy: {
        name: admin?.name || 'Admin',
        email: admin?.email || 'admin@system.com'
      }
    });
    
  } catch (err) {
    console.error("❌ Error solving report:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ======================================================
// DELETE REPORT
// ======================================================
router.delete("/report/:reportId", auth, allowRoles("admin"), async (req, res) => {
  console.log("\n🔵 [DELETE /admin/report/:reportId]");
  console.log("📌 Report ID:", req.params.reportId);
  
  try {
    const { reportId } = req.params;
    
    const report = await Report.findOne({ reportId });
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }
    
    // Store report data for response
    const reportData = {
      reportId: report.reportId,
      subject: report.subject,
      customer: report.customer.name,
      status: report.status
    };
    
    await report.deleteOne();
    
    console.log(`✅ Report ${reportId} deleted successfully`);
    
    res.json({
      success: true,
      message: "Report deleted successfully",
      deletedReport: reportData
    });
    
  } catch (err) {
    console.error("❌ Error deleting report:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;