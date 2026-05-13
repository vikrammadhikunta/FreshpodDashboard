// App.jsx - Add operator routes
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/sidebar';
import Header from './components/header';
import Loading from './Pages/loading';
import LoginPage from './Pages/LoginPage';
import Unauthorized from './Pages/Unauthorized';

// Admin Pages
import Dashboard from './Pages/Admin/Dashboard';
import Machine from './Pages/Admin/Machine';
import UserDirective from './Pages/Admin/UserDirective';
import Analytics from './Pages/Admin/Analytics';
import SystemHealth from './Pages/Admin/SystemHealth';
import Settings from './Pages/Admin/Settings';

// Customer Pages
import CustomerDashboard from './Pages/Customer/Dashboard';
import CustomerMachines from './Pages/Customer/Machines';
import CustomerAnalytics from './Pages/Customer/Analytics';

// Dealership Pages
import DealershipDashboard from './Pages/Dealership/Dashboard';
import DealershipMachines from './Pages/Dealership/Machines';
import DealershipUsers from './Pages/Dealership/Users';
import DealershipAnalytics from './Pages/Dealership/Analytics';

// Operator Pages - ADD THESE IMPORTS
import OperatorDashboard from './Pages/Operator/Dashboard';
import OperatorMachines from './Pages/Operator/Machines';
import OperatorHistory from './Pages/Operator/History';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, userRole, loading } = useAuth();
  
  if (loading) return <Loading />;
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/unauthorized" replace />;
  }
  
  return children;
};

const Layout = ({ children }) => {
  const { userRole } = useAuth();
  // Show sidebar for all roles including operator
  const showSidebar = userRole === 'admin' || userRole === 'dealership' || userRole === 'customer' || userRole === 'operator';
  
  return (
    <div className="min-h-screen bg-gray-50">
      {showSidebar && <Sidebar />}
      {showSidebar && <Header />}
      <main className={`${showSidebar ? 'lg:pl-72 pt-20' : ''}`}>
        {children}
      </main>
    </div>
  );
};

function App() {
  const { loading, userRole } = useAuth();
  
  if (loading) {
    return <Loading />;
  }
  
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      
      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/admin/machine" element={<ProtectedRoute allowedRoles={['admin']}><Layout><Machine /></Layout></ProtectedRoute>} />
      <Route path="/admin/user" element={<ProtectedRoute allowedRoles={['admin']}><Layout><UserDirective /></Layout></ProtectedRoute>} />
      <Route path="/admin/analytics" element={<ProtectedRoute allowedRoles={['admin']}><Layout><Analytics /></Layout></ProtectedRoute>} />
      <Route path="/admin/health" element={<ProtectedRoute allowedRoles={['admin']}><Layout><SystemHealth /></Layout></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin']}><Layout><Settings /></Layout></ProtectedRoute>} />
      
      {/* Dealership Routes */}
      <Route path="/dealership" element={<ProtectedRoute allowedRoles={['dealership']}><Layout><DealershipDashboard /></Layout></ProtectedRoute>} />
      <Route path="/dealership/machines" element={<ProtectedRoute allowedRoles={['dealership']}><Layout><DealershipMachines /></Layout></ProtectedRoute>} />
      <Route path="/dealership/users" element={<ProtectedRoute allowedRoles={['dealership']}><Layout><DealershipUsers /></Layout></ProtectedRoute>} />
      <Route path="/dealership/analytics" element={<ProtectedRoute allowedRoles={['dealership']}><Layout><DealershipAnalytics /></Layout></ProtectedRoute>} />
      <Route path="/dealership/settings" element={<ProtectedRoute allowedRoles={['dealership']}><Layout><Settings /></Layout></ProtectedRoute>} />
      
      {/* Customer Routes */}
      <Route path="/customer" element={<ProtectedRoute allowedRoles={['customer']}><Layout><CustomerDashboard /></Layout></ProtectedRoute>} />
      <Route path="/customer/machines" element={<ProtectedRoute allowedRoles={['customer']}><Layout><CustomerMachines /></Layout></ProtectedRoute>} />
      <Route path="/customer/analytics" element={<ProtectedRoute allowedRoles={['customer']}><Layout><CustomerAnalytics /></Layout></ProtectedRoute>} />
      <Route path="/customer/settings" element={<ProtectedRoute allowedRoles={['customer']}><Layout><Settings /></Layout></ProtectedRoute>} />
      
      {/* Operator Routes - ADD THESE */}
      <Route path="/operator" element={<ProtectedRoute allowedRoles={['operator']}><Layout><OperatorDashboard /></Layout></ProtectedRoute>} />
      <Route path="/operator/machines" element={<ProtectedRoute allowedRoles={['operator']}><Layout><OperatorMachines /></Layout></ProtectedRoute>} />
      <Route path="/operator/history" element={<ProtectedRoute allowedRoles={['operator']}><Layout><OperatorHistory /></Layout></ProtectedRoute>} />
      
      {/* Default Redirect based on role */}
      <Route path="/" element={
        userRole === 'admin' ? <Navigate to="/admin" replace /> :
        userRole === 'dealership' ? <Navigate to="/dealership" replace /> :
        userRole === 'customer' ? <Navigate to="/customer" replace /> :
        userRole === 'operator' ? <Navigate to="/operator" replace /> :
        <Navigate to="/login" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;