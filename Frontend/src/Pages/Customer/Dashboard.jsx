// pages/customer/CustomerDashboard.jsx
import React, { useState, useEffect, useContext } from 'react';
import { DataContext } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import axiosInstance from '../../config/axios';

import {
  FiCpu, FiActivity, FiDollarSign, FiUsers, FiMapPin, FiSettings,
  FiUserPlus, FiUser, FiTrash2, FiX, FiRefreshCw,
  FiCheckCircle, FiAlertCircle, FiBarChart2, FiClock,
} from 'react-icons/fi';

const CustomerDashboard = () => {
  const { machines, loading, refetch } = useContext(DataContext);
  const { user, accessToken } = useAuth();

  const [dashboardStats, setDashboardStats] = useState(null);
  const [operators, setOperators] = useState([]);
  const [customerMachines, setCustomerMachines] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState(null);

  // Modals
  const [showOperatorModal, setShowOperatorModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedMachineForSettings, setSelectedMachineForSettings] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Operator form
  const [operatorForm, setOperatorForm] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    assignedMachineIds: [],
  });

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    costPerTap: '',
    rentPerMonth: '',
    maintenanceCostPerMonth: '',
  });

  // ---------- Data fetching ----------
  useEffect(() => {
    fetchDashboardData();
    fetchOperators();
    fetchCustomerMachines();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const { data } = await axiosInstance.get('/customer/dashboard', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setDashboardStats(data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    }
  };

  const fetchOperators = async () => {
    try {
      const { data } = await axiosInstance.get('/customer/operators', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setOperators(data.operators || []);
    } catch (error) {
      console.error('Error fetching operators:', error);
    }
  };

  const fetchCustomerMachines = async () => {
    try {
      const { data } = await axiosInstance.get('/customer/customer-machines', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setCustomerMachines(data.machines || []);
    } catch (error) {
      console.error('Error fetching machines:', error);
    }
  };

  // ---------- Helpers ----------
  const showMessage = (type, text, duration = 3000) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), duration);
  };

  // ---------- Operators ----------
  const handleCreateOperator = async (e) => {
    e.preventDefault();

    if (!operatorForm.phoneNumber || operatorForm.phoneNumber.length !== 10) {
      showMessage('error', 'Please enter a valid 10-digit phone number');
      return;
    }

    setSubmitting(true);
    try {
      await axiosInstance.post(
        '/customer/operator/create',
        {
          name: operatorForm.name,
          email: operatorForm.email,
          phoneNumber: operatorForm.phoneNumber,
          assignedMachineIds: operatorForm.assignedMachineIds,
        },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      showMessage('success', 'Operator created successfully!');
      setOperatorForm({ name: '', email: '', phoneNumber: '', assignedMachineIds: [] });
      setShowOperatorModal(false);
      fetchOperators();
      fetchCustomerMachines();
      refetch();
    } catch (error) {
      console.error('Error creating operator:', error);
      showMessage('error', error.response?.data?.message || 'Failed to create operator');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOperator = async (operatorId, operatorName) => {
    if (!confirm(`Are you sure you want to delete operator "${operatorName}"?`)) return;

    try {
      await axiosInstance.delete(`/customer/operator/${operatorId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      showMessage('success', 'Operator deleted successfully!');
      fetchOperators();
      fetchCustomerMachines();
      refetch();
    } catch (error) {
      showMessage('error', error.response?.data?.message || 'Failed to delete operator');
    }
  };

  // ---------- Settings ----------
  const openSettingsModal = (machine) => {
    setSelectedMachineForSettings(machine._id);
    setSettingsForm({
      costPerTap: machine.costPerTap || '',
      rentPerMonth: machine.rentPerMonth || '',
      maintenanceCostPerMonth: machine.maintenanceCostPerMonth || '',
    });
    setShowSettingsModal(true);
  };

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const promises = [];

      if (settingsForm.costPerTap) {
        promises.push(
          axiosInstance.put(
            `/customer/machine/${selectedMachineForSettings}/cost`,
            { costPerTap: parseFloat(settingsForm.costPerTap) },
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
        );
      }
      if (settingsForm.rentPerMonth) {
        promises.push(
          axiosInstance.put(
            `/customer/machine/${selectedMachineForSettings}/rent`,
            { rentPerMonth: parseFloat(settingsForm.rentPerMonth) },
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
        );
      }
      if (settingsForm.maintenanceCostPerMonth) {
        promises.push(
          axiosInstance.put(
            `/customer/machine/${selectedMachineForSettings}/maintenance`,
            { maintenanceCostPerMonth: parseFloat(settingsForm.maintenanceCostPerMonth) },
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
        );
      }

      await Promise.all(promises);

      showMessage('success', 'Settings updated successfully!');
      setShowSettingsModal(false);
      setSettingsForm({ costPerTap: '', rentPerMonth: '', maintenanceCostPerMonth: '' });
      refetch();
    } catch (error) {
      showMessage('error', error.response?.data?.message || 'Failed to update settings');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMachineSelection = (machineId) => {
    setOperatorForm((prev) => ({
      ...prev,
      assignedMachineIds: prev.assignedMachineIds.includes(machineId)
        ? prev.assignedMachineIds.filter((id) => id !== machineId)
        : [...prev.assignedMachineIds, machineId],
    }));
  };

  // ---------- Derived ----------
  const machinesArray = machines ? Object.values(machines) : [];
  const totalRevenue = machinesArray.reduce(
    (sum, m) => sum + (m.totalTaps || 0) * (m.costPerTap || 0),
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.name || 'Customer'}!
          </h1>
          <p className="text-gray-500 mt-1">Manage your machines and track performance</p>
        </div>

        {/* Message */}
        {message.text && (
          <div
            className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <FiCheckCircle size={20} />
            ) : (
              <FiAlertCircle size={20} />
            )}
            {message.text}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={<FiCpu className="text-blue-600 text-xl" />}
            iconBg="bg-blue-100"
            value={dashboardStats?.totalMachines || machinesArray.length}
            label="Total Machines"
            sub={`${dashboardStats?.activeMachines || 0} active`}
            subColor="text-green-600"
          />
          <StatCard
            icon={<FiActivity className="text-green-600 text-xl" />}
            iconBg="bg-green-100"
            value={(dashboardStats?.totalTapsMonth || 0).toLocaleString()}
            label="Monthly Taps"
            sub={`Avg ${dashboardStats?.avgDailyTaps || 0} taps/day`}
          />
          <StatCard
            icon={<FiDollarSign className="text-purple-600 text-xl" />}
            iconBg="bg-purple-100"
            value={`₹${(dashboardStats?.totalRevenueMonth || totalRevenue).toLocaleString()}`}
            label="Monthly Revenue"
            sub={`Total: ₹${totalRevenue.toLocaleString()}`}
          />
          <StatCard
            icon={<FiUsers className="text-orange-600 text-xl" />}
            iconBg="bg-orange-100"
            value={dashboardStats?.totalOperators || operators.length}
            label="Total Operators"
            action={
              <button
                onClick={() => setShowOperatorModal(true)}
                className="text-xs text-blue-600 hover:text-blue-700 mt-2 flex items-center gap-1"
              >
                <FiUserPlus size={12} /> Add Operator
              </button>
            }
          />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Machines */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Your Machines</h2>
                  <p className="text-sm text-gray-500">Monitor and manage all your machines</p>
                </div>
                <button onClick={refetch} className="p-2 hover:bg-gray-100 rounded-lg">
                  <FiRefreshCw className="text-gray-500" />
                </button>
              </div>

              <div className="divide-y divide-gray-100">
                {machinesArray.length === 0 ? (
                  <div className="p-12 text-center">
                    <FiCpu className="text-6xl text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No machines assigned yet</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Contact your dealership to get machines
                    </p>
                  </div>
                ) : (
                  machinesArray.map((machine) => (
                    <div key={machine._id} className="p-5 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-gray-900">{machine.machineId}</h3>
                          <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                            <FiMapPin size={14} /> {machine.location}, {machine.state}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openSettingsModal(machine)}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Settings"
                          >
                            <FiSettings size={18} />
                          </button>
                          <button
                            onClick={() => setSelectedMachine(machine)}
                            className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <FiBarChart2 size={18} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <p className="text-xs text-gray-500">Total Taps</p>
                          <p className="text-lg font-bold text-gray-800">
                            {(machine.totalTaps || 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Cost/Tap</p>
                          <p className="text-lg font-bold text-blue-600">
                            ₹{machine.costPerTap || 0}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 text-xs">
                        {machine.operatorId ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <FiUser size={12} /> Assigned to Operator
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-yellow-600">
                            <FiUser size={12} /> No operator assigned
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-gray-500">
                          <FiClock size={12} /> Since{' '}
                          {new Date(machine.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Operators */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Operators</h2>
                  <p className="text-sm text-gray-500">Manage your team</p>
                </div>
                <button
                  onClick={() => setShowOperatorModal(true)}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1"
                >
                  <FiUserPlus size={14} /> Add
                </button>
              </div>

              <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                {operators.length === 0 ? (
                  <div className="p-8 text-center">
                    <FiUsers className="text-5xl text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">No operators yet</p>
                    <button
                      onClick={() => setShowOperatorModal(true)}
                      className="mt-3 text-blue-600 text-sm hover:text-blue-700"
                    >
                      Create your first operator
                    </button>
                  </div>
                ) : (
                  operators.map((operator) => (
                    <div key={operator._id} className="p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <FiUser className="text-blue-500" />
                            <h3 className="font-semibold text-gray-900">{operator.name}</h3>
                          </div>
                          <p className="text-xs text-gray-500">{operator.email}</p>
                          <p className="text-xs text-gray-500">{operator.phoneNumber}</p>

                          <div className="mt-2 flex gap-3 text-xs">
                            <span className="text-gray-600">
                              {operator.totalMachines} machines
                            </span>
                            <span className="text-blue-600">
                              {operator.totalTapsToday} taps today
                            </span>
                            <span className="text-green-600">
                              {operator.totalTapsMonth} this month
                            </span>
                          </div>

                          {operator.assignedMachines?.slice(0, 2).map((m) => (
                            <div
                              key={m._id}
                              className="text-xs text-gray-400 mt-1 flex items-center gap-1"
                            >
                              <FiCpu size={10} /> {m.machineId} - {m.location}
                            </div>
                          ))}
                          {operator.assignedMachines?.length > 2 && (
                            <p className="text-xs text-gray-400 mt-1">
                              +{operator.assignedMachines.length - 2} more
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteOperator(operator._id, operator.name)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <FiTrash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- CREATE OPERATOR MODAL ---------- */}
      {showOperatorModal && (
        <Modal
          onClose={() => setShowOperatorModal(false)}
          title="Create New Operator"
          subtitle="Add an operator to manage your machines"
        >
          <form onSubmit={handleCreateOperator} className="p-6 space-y-4">
            <InputField
              label="Full Name *"
              type="text"
              required
              value={operatorForm.name}
              onChange={(e) => setOperatorForm({ ...operatorForm, name: e.target.value })}
              placeholder="John Doe"
            />
            <InputField
              label="Email *"
              type="email"
              required
              value={operatorForm.email}
              onChange={(e) => setOperatorForm({ ...operatorForm, email: e.target.value })}
              placeholder="operator@example.com"
            />
            <InputField
              label="Phone Number *"
              type="tel"
              required
              value={operatorForm.phoneNumber}
              onChange={(e) =>
                setOperatorForm({ ...operatorForm, phoneNumber: e.target.value })
              }
              placeholder="10-digit mobile number"
              pattern="[0-9]{10}"
              hint="Password will be set as phone number initially"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assign Machines
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {customerMachines
                  .filter(
                    (m) =>
                      !m.hasOperator || operatorForm.assignedMachineIds.includes(m._id)
                  )
                  .map((machine) => (
                    <label
                      key={machine._id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={operatorForm.assignedMachineIds.includes(machine._id)}
                        onChange={() => toggleMachineSelection(machine._id)}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium">{machine.machineId}</span>
                        <span className="text-xs text-gray-400 ml-2">
                          {machine.location}
                        </span>
                      </div>
                      {machine.hasOperator &&
                        !operatorForm.assignedMachineIds.includes(machine._id) && (
                          <span className="text-xs text-yellow-600">Already assigned</span>
                        )}
                    </label>
                  ))}
                {customerMachines.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No machines available to assign
                  </p>
                )}
              </div>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700">
              <p className="font-bold">📝 Note:</p>
              <p>
                The operator will receive login credentials. They must change password on
                first login.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowOperatorModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FiUserPlus /> Create Operator
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------- SETTINGS MODAL ---------- */}
      {showSettingsModal && selectedMachineForSettings && (
        <Modal
          onClose={() => setShowSettingsModal(false)}
          title="Machine Settings"
          compact
        >
          <form onSubmit={handleUpdateSettings} className="p-6 space-y-4">
            <InputField
              label="Cost Per Tap (₹)"
              type="number"
              step="0.01"
              value={settingsForm.costPerTap}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, costPerTap: e.target.value })
              }
              placeholder="0.50"
            />
            <InputField
              label="Rent Per Month (₹)"
              type="number"
              value={settingsForm.rentPerMonth}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, rentPerMonth: e.target.value })
              }
              placeholder="0"
            />
            <InputField
              label="Maintenance Cost Per Month (₹)"
              type="number"
              value={settingsForm.maintenanceCostPerMonth}
              onChange={(e) =>
                setSettingsForm({
                  ...settingsForm,
                  maintenanceCostPerMonth: e.target.value,
                })
              }
              placeholder="0"
            />

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------- MACHINE DETAILS MODAL ---------- */}
      {selectedMachine && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={() => setSelectedMachine(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b p-5 flex justify-between items-center z-10">
              <div>
                <h2 className="text-xl font-bold">{selectedMachine.machineId}</h2>
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <FiMapPin size={14} /> {selectedMachine.location}, {selectedMachine.state}
                </p>
              </div>
              <button
                onClick={() => setSelectedMachine(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <FiX size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500">Total Lifetime Taps</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {(selectedMachine.totalTaps || 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">
                    ₹
                    {(
                      (selectedMachine.totalTaps || 0) * (selectedMachine.costPerTap || 0)
                    ).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <FiSettings /> Current Settings
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500">Cost/Tap</p>
                    <p className="font-bold text-blue-600">
                      ₹{selectedMachine.costPerTap || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Maintenance</p>
                    <p className="font-bold">
                      ₹{selectedMachine.maintenanceCostPerMonth || 0}
                    </p>
                  </div>
                </div>
              </div>

              {selectedMachine.logs && Object.keys(selectedMachine.logs).length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <FiClock /> Recent Activity
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {Object.entries(selectedMachine.logs)
                      .slice(0, 10)
                      .map(([date, log]) => (
                        <div
                          key={date}
                          className="flex justify-between items-center p-2 bg-gray-50 rounded"
                        >
                          <span className="text-sm">{date}</span>
                          <span className="text-sm font-medium text-blue-600">
                            {log.tapCount || 0} taps
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="mt-6 pt-4 border-t">
                <button
                  onClick={() => {
                    const m = selectedMachine;
                    setSelectedMachine(null);
                    openSettingsModal(m);
                  }}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Edit Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------- Reusable pieces ----------

const StatCard = ({ icon, iconBg, value, label, sub, subColor = 'text-gray-400', action }) => (
  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-2 ${iconBg} rounded-lg`}>{icon}</div>
      <span className="text-2xl font-bold text-gray-800">{value}</span>
    </div>
    <p className="text-gray-600 text-sm">{label}</p>
    {sub && <p className={`text-xs ${subColor} mt-2`}>{sub}</p>}
    {action}
  </div>
);

const Modal = ({ children, onClose, title, subtitle, compact = false }) => (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
    <div
      className={`bg-white rounded-2xl w-full max-h-[90vh] overflow-y-auto relative ${
        compact ? 'max-w-md' : 'max-w-lg'
      }`}
    >
      <div className="sticky top-0 bg-white border-b p-5 flex justify-between items-center z-10">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
          <FiX size={20} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const InputField = ({ label, hint, ...props }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input
      {...props}
      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
    />
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

export default CustomerDashboard;
