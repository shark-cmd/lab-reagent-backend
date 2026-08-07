import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import ScanPage from "@/pages/ScanPage";
import Dashboard from "@/pages/Dashboard";
import History from "@/pages/History";
import Users from "@/pages/Users";
import Labels from "@/pages/Labels";
import PurchaseOrders from "@/pages/PurchaseOrders";
import Reports from "@/pages/Reports";

const Protected = ({ children }) => {
  const { isAuthed } = useAuth();
  if (!isAuthed) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <Protected>
                  <AppLayout />
                </Protected>
              }
            >
              <Route path="/" element={<Navigate to="/scan" replace />} />
              <Route path="/scan" element={<ScanPage />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/purchase-orders" element={<PurchaseOrders />} />
              <Route path="/labels" element={<Labels />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/history" element={<History />} />
              <Route path="/users" element={<Users />} />
            </Route>
            <Route path="*" element={<Navigate to="/scan" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors closeButton />
      </AuthProvider>
    </div>
  );
}

export default App;
