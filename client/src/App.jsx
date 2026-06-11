import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Deliveries from "./pages/Deliveries.jsx";
import DeviceDetail from "./pages/DeviceDetail.jsx";
import DeviceFormPage from "./pages/DeviceFormPage.jsx";
import Devices from "./pages/Devices.jsx";
import Institutions from "./pages/Institutions.jsx";
import Login from "./pages/Login.jsx";
import Maintenance from "./pages/Maintenance.jsx";
import RentPage from "./pages/RentPage.jsx";
import ReturnPage from "./pages/ReturnPage.jsx";
import Scan from "./pages/Scan.jsx";
import SearchPage from "./pages/SearchPage.jsx";
import Settings from "./pages/Settings.jsx";
import Transactions from "./pages/Transactions.jsx";
import Users from "./pages/Users.jsx";
import { isAdminUser } from "./auth.js";

function fullPath(location) {
  return `${location.pathname}${location.search}${location.hash}`;
}

function loginPath(location) {
  return `/login?next=${encodeURIComponent(fullPath(location))}`;
}

function ProtectedRoute() {
  const location = useLocation();
  if (!localStorage.getItem("deviceManagerUser")) {
    return <Navigate to={loginPath(location)} replace state={{ from: location }} />;
  }
  return <Layout />;
}

function AdminRoute({ children }) {
  const location = useLocation();
  if (!isAdminUser()) {
    return <Navigate to="/devices" replace state={{ from: location }} />;
  }
  return children;
}

function DeviceQrRedirect() {
  const { deviceId } = useParams();
  const location = useLocation();
  return <Navigate to={`/devices/${encodeURIComponent(deviceId || "")}${location.search}${location.hash}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route index element={<Dashboard />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/d/:deviceId" element={<DeviceQrRedirect />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/devices/new" element={<AdminRoute><DeviceFormPage mode="create" /></AdminRoute>} />
        <Route path="/devices/:deviceId" element={<DeviceDetail />} />
        <Route path="/devices/:deviceId/edit" element={<AdminRoute><DeviceFormPage mode="edit" /></AdminRoute>} />
        <Route path="/devices/:deviceId/rent" element={<RentPage />} />
        <Route path="/devices/:deviceId/return" element={<ReturnPage />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/deliveries" element={<AdminRoute><Deliveries /></AdminRoute>} />
        <Route path="/users" element={<AdminRoute><Users /></AdminRoute>} />
        <Route path="/institutions" element={<AdminRoute><Institutions /></AdminRoute>} />
        <Route path="/maintenance" element={<AdminRoute><Maintenance /></AdminRoute>} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
