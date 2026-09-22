import { HashRouter, Routes, Route } from "react-router-dom";
import { ToastProvider } from "./components/ui/ToastProvider";
import Dashboard from "./pages/Dashboard";
import FeedbackPage from "./pages/Feedback";
import GoalsPage from "./pages/Goals";
import SchedulePage from "./pages/Schedule";

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}
