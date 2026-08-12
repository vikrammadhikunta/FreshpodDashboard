// pages/admin/AdminReports.jsx - WITH REACT-TOASTIFY NOTIFICATIONS

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axiosInstance from '../../config/axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { 
  FileText, 
  Search, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Trash2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';

const AdminReports = () => {
  const { accessToken } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showSolveModal, setShowSolveModal] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [statistics, setStatistics] = useState({
    total: 0,
    pending: 0,
    solved: 0
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0
  });

  // Fetch reports
  const fetchReports = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: filterStatus,
        page: page,
        limit: 10
      });
      
      if (searchTerm) {
        params.append('search', searchTerm);
      }

      const response = await axiosInstance.get(
        `/admin/reports?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.data.success) {
        setReports(response.data.reports || []);
        setStatistics(response.data.statistics || { total: 0, pending: 0, solved: 0 });
        setPagination({
          currentPage: response.data.pagination?.currentPage || 1,
          totalPages: response.data.pagination?.totalPages || 1,
          totalItems: response.data.pagination?.totalItems || 0
        });
        toast.success('Reports loaded successfully!');
      } else {
        setError(response.data.message || 'Failed to fetch reports');
        toast.error(response.data.message || 'Failed to fetch reports');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Session expired. Please login again.');
        toast.error('Session expired. Please login again.');
      } else {
        setError(err.response?.data?.message || 'Failed to fetch reports. Please try again.');
        toast.error(err.response?.data?.message || 'Failed to fetch reports');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      fetchReports();
    } else {
      setError('Please login to view reports');
      setLoading(false);
    }
  }, [filterStatus, accessToken]);

  // Handle solve report
  const handleSolveReport = async (reportId) => {
    if (!resolutionNotes.trim()) {
      toast.warning('Please enter resolution notes');
      return;
    }

    const loadingToast = toast.loading('Solving report...');

    try {
      const response = await axiosInstance.put(
        `/admin/report/${reportId}/solve`,
        { resolutionNotes },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.data.success) {
        toast.update(loadingToast, {
          render: '✅ Report marked as solved!',
          type: 'success',
          isLoading: false,
          autoClose: 3000
        });
        setShowSolveModal(false);
        setResolutionNotes('');
        fetchReports(pagination.currentPage);
      } else {
        toast.update(loadingToast, {
          render: response.data.message || 'Failed to solve report',
          type: 'error',
          isLoading: false,
          autoClose: 4000
        });
      }
    } catch (err) {
      toast.update(loadingToast, {
        render: '❌ Failed to solve report: ' + (err.response?.data?.message || 'Unknown error'),
        type: 'error',
        isLoading: false,
        autoClose: 4000
      });
    }
  };

  // Handle delete report
  const handleDeleteReport = async (reportId, e) => {
    e.stopPropagation();
    
    if (!window.confirm('Are you sure you want to delete this report?')) return;

    const loadingToast = toast.loading('Deleting report...');

    try {
      const response = await axiosInstance.delete(
        `/admin/report/${reportId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.data.success) {
        toast.update(loadingToast, {
          render: '✅ Report deleted successfully!',
          type: 'success',
          isLoading: false,
          autoClose: 3000
        });
        fetchReports(pagination.currentPage);
      } else {
        toast.update(loadingToast, {
          render: response.data.message || 'Failed to delete report',
          type: 'error',
          isLoading: false,
          autoClose: 4000
        });
      }
    } catch (err) {
      toast.update(loadingToast, {
        render: '❌ Failed to delete report',
        type: 'error',
        isLoading: false,
        autoClose: 4000
      });
    }
  };

  // View report details - triggered by row click
  const viewReportDetails = async (reportId) => {
    const loadingToast = toast.loading('Loading report details...');
    
    try {
      const response = await axiosInstance.get(
        `/admin/report/${reportId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.data.success) {
        setSelectedReport(response.data);
        setShowDetailModal(true);
        toast.update(loadingToast, {
          render: 'Report details loaded!',
          type: 'success',
          isLoading: false,
          autoClose: 2000
        });
      } else {
        toast.update(loadingToast, {
          render: 'Failed to fetch report details',
          type: 'error',
          isLoading: false,
          autoClose: 4000
        });
      }
    } catch (err) {
      toast.update(loadingToast, {
        render: 'Failed to fetch report details: ' + (err.response?.data?.message || 'Unknown error'),
        type: 'error',
        isLoading: false,
        autoClose: 4000
      });
    }
  };

  // Handle solve button click from row
  const handleSolveClick = (report, e) => {
    e.stopPropagation();
    setSelectedReport(report);
    setShowSolveModal(true);
  };

  // Get priority badge
  const getPriorityBadge = (priority) => {
    const styles = {
      critical: 'bg-red-100 text-red-800 border-red-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      normal: 'bg-green-100 text-green-800 border-green-200'
    };
    return styles[priority] || styles.normal;
  };

  // Get status badge
  const getStatusBadge = (status) => {
    if (status === 'solved') {
      return 'bg-green-100 text-green-800 border-green-200';
    }
    return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  };

  // Format date
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // If no token, show message
  if (!accessToken) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <ToastContainer position="top-right" autoClose={3000} />
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
          <AlertCircle size={48} className="mx-auto text-yellow-500 mb-4" />
          <h2 className="text-xl font-bold text-yellow-800">Authentication Required</h2>
          <p className="text-yellow-700 mt-2">Please login to access reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ToastContainer position="top-right" autoClose={3000} />
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports Management</h1>
          <p className="text-gray-500 mt-1">Manage customer reports and issues</p>
        </div>
        <button
          onClick={() => fetchReports(1)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition flex items-center gap-2"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertCircle size={24} className="text-red-500" />
            <div>
              <p className="font-medium text-red-800">Error</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Total Reports</p>
              <p className="text-2xl font-bold text-gray-900">{statistics.total || 0}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <FileText size={24} className="text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{statistics.pending || 0}</p>
            </div>
            <div className="bg-yellow-100 p-3 rounded-lg">
              <Clock size={24} className="text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Solved</p>
              <p className="text-2xl font-bold text-green-600">{statistics.solved || 0}</p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <CheckCircle size={24} className="text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Resolution Rate</p>
              <p className="text-2xl font-bold text-purple-600">
                {statistics.total > 0 
                  ? `${Math.round((statistics.solved / statistics.total) * 100)}%`
                  : '0%'}
              </p>
            </div>
            <div className="bg-purple-100 p-3 rounded-lg">
              <AlertCircle size={24} className="text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search reports..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && fetchReports(1)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2 rounded-lg transition ${
                filterStatus === 'all' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-4 py-2 rounded-lg transition ${
                filterStatus === 'pending' 
                  ? 'bg-yellow-500 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilterStatus('solved')}
              className={`px-4 py-2 rounded-lg transition ${
                filterStatus === 'solved' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Solved
            </button>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Report ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subject
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      <span className="ml-3">Loading reports...</span>
                    </div>
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    <FileText size={48} className="mx-auto text-gray-300 mb-3" />
                    <p>No reports found</p>
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr 
                    key={report.reportId} 
                    onClick={() => viewReportDetails(report.reportId)}
                    className="hover:bg-gray-50 transition cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{report.reportId}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{report.subject}</div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {report.description?.substring(0, 60)}...
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{report.customer?.name || 'N/A'}</div>
                      <div className="text-sm text-gray-500">{report.customer?.phone || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusBadge(report.status)}`}>
                        {report.status === 'solved' ? '✅ Solved' : '⏳ Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getPriorityBadge(report.priority)}`}>
                        {report.priority?.toUpperCase() || 'NORMAL'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">{formatDate(report.createdAt)}</div>
                      <div className="text-xs text-gray-400">{report.timeElapsed || 'N/A'} ago</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {report.status === 'pending' && (
                          <button
                            onClick={(e) => handleSolveClick(report, e)}
                            className="px-3 py-1.5 bg-green-500 text-white text-xs font-medium rounded-lg hover:bg-green-600 transition flex items-center gap-1"
                          >
                            <Check size={14} />
                            Resolve
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDeleteReport(report.reportId, e)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {((pagination.currentPage - 1) * 10) + 1} to{' '}
              {Math.min(pagination.currentPage * 10, pagination.totalItems)} of {pagination.totalItems}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => fetchReports(pagination.currentPage - 1)}
                disabled={pagination.currentPage === 1}
                className="px-3 py-1 border border-gray-200 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center gap-1"
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <button
                onClick={() => fetchReports(pagination.currentPage + 1)}
                disabled={pagination.currentPage === pagination.totalPages}
                className="px-3 py-1 border border-gray-200 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center gap-1"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal - with white background instead of black */}
      {showDetailModal && selectedReport && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="sticky top-0 bg-white z-10 p-6 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Report Details</h2>
                <p className="text-gray-500 text-sm">{selectedReport.report?.reportId}</p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              {/* Report Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Subject</h3>
                  <p className="text-gray-900 font-medium">{selectedReport.report?.subject}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Status</h3>
                  <span className={`px-3 py-1 text-sm font-medium rounded-full border ${getStatusBadge(selectedReport.report?.status)}`}>
                    {selectedReport.report?.status === 'solved' ? '✅ Solved' : '⏳ Pending'}
                  </span>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Description</h3>
                <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">{selectedReport.report?.description}</p>
              </div>

              {selectedReport.report?.status === 'solved' && (
                <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-green-700 mb-1">Resolution Notes</h3>
                  <p className="text-green-800">{selectedReport.report?.resolutionNotes}</p>
                  <p className="text-xs text-green-600 mt-2">
                    Resolved at: {formatDate(selectedReport.report?.resolvedAt)}
                  </p>
                </div>
              )}

              {/* Customer Info */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Customer Details</h3>
                <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Name</p>
                    <p className="font-medium">{selectedReport.customer?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium">{selectedReport.customer?.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p className="font-medium">{selectedReport.customer?.phone}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <p className="font-medium">{selectedReport.customer?.location || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Machines */}
              {selectedReport.machines?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Machines ({selectedReport.machines.length})</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {selectedReport.machines.map((machine, index) => (
                        <div key={index} className="bg-white p-3 rounded-lg border border-gray-200">
                          <p className="font-medium text-sm">{machine.machineId}</p>
                          <p className="text-xs text-gray-500">{machine.location}</p>
                          <p className="text-xs text-gray-500">Status: {machine.status}</p>
                          {machine.operator && (
                            <p className="text-xs text-blue-600">Operator: {machine.operator.name}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Operators */}
              {selectedReport.operators?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Operators ({selectedReport.operators.length})</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedReport.operators.map((operator, index) => (
                        <div key={index} className="bg-white p-3 rounded-lg border border-gray-200">
                          <p className="font-medium text-sm">{operator.name}</p>
                          <p className="text-xs text-gray-500">{operator.phone}</p>
                          <p className="text-xs text-gray-500">{operator.email}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Statistics */}
              {selectedReport.statistics && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Statistics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-sm text-blue-600">Total Machines</p>
                      <p className="text-xl font-bold text-blue-800">{selectedReport.statistics.totalMachines}</p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <p className="text-sm text-green-600">Total Operators</p>
                      <p className="text-xl font-bold text-green-800">{selectedReport.statistics.totalOperators}</p>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg">
                      <p className="text-sm text-purple-600">Total Taps</p>
                      <p className="text-xl font-bold text-purple-800">{selectedReport.statistics.totalTaps}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Solve Modal */}
      {showSolveModal && selectedReport && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Mark as Solved</h2>
                <p className="text-gray-500 text-sm">{selectedReport.reportId}</p>
              </div>
              <button
                onClick={() => {
                  setShowSolveModal(false);
                  setResolutionNotes('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Resolution Notes
              </label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Describe how the issue was resolved..."
                className="w-full border border-gray-200 rounded-lg p-3 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-yellow-700 flex items-center gap-2">
                <AlertCircle size={16} />
                This will mark the report as solved and notify the customer.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleSolveReport(selectedReport.reportId)}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center justify-center gap-2"
              >
                <Check size={18} />
                Mark as Solved
              </button>
              <button
                onClick={() => {
                  setShowSolveModal(false);
                  setResolutionNotes('');
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReports;