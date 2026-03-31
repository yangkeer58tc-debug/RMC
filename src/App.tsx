import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import ImportPage from '@/pages/Import'
import ResumesPage from '@/pages/Resumes'
import ResumeDetailPage from '@/pages/ResumeDetail'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/import" replace />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/resumes" element={<ResumesPage />} />
        <Route path="/resumes/:id" element={<ResumeDetailPage />} />
        <Route path="*" element={<Navigate to="/import" replace />} />
      </Routes>
    </Router>
  )
}
