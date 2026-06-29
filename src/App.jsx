import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'

// Páginas internas carregadas sob demanda (code-splitting por rota).
// Mantém a tela de login leve — o resto só baixa quando o usuário navega.
const AdmLayout = lazy(() => import('./pages/adm/AdmLayout'))
const AdmDashboard = lazy(() => import('./pages/adm/AdmDashboard'))
const AdmCompanies = lazy(() => import('./pages/adm/AdmCompanies'))
const AdmCompanyDetail = lazy(() => import('./pages/adm/AdmCompanyDetail'))
const AdmEspiao = lazy(() => import('./pages/adm/AdmEspiao'))
const AdmOperacao = lazy(() => import('./pages/adm/AdmOperacao'))
const AdmSupport = lazy(() => import('./pages/adm/AdmSupport'))
const AdmQualidade = lazy(() => import('./pages/adm/AdmQualidade'))
const AdmAnalise = lazy(() => import('./pages/adm/AdmAnalise'))
const AdmLanding = lazy(() => import('./pages/adm/AdmLanding'))
const CompanyLayout = lazy(() => import('./pages/company/CompanyLayout'))
const CompanyHistory = lazy(() => import('./pages/company/CompanyHistory'))
const CompanyAlerts = lazy(() => import('./pages/company/CompanyAlerts'))
const CompanyConversations = lazy(() => import('./pages/company/CompanyConversations'))
const CompanyContacts = lazy(() => import('./pages/company/CompanyContacts'))
const CompanyPatientDetail = lazy(() => import('./pages/company/CompanyPatientDetail'))
const CompanyAgenda = lazy(() => import('./pages/company/CompanyAgenda'))
const CompanyKanban = lazy(() => import('./pages/company/CompanyKanban'))
const CompanyCatalog = lazy(() => import('./pages/company/CompanyCatalog'))
const CompanyTutorial = lazy(() => import('./pages/company/CompanyTutorial'))
const CompanyInstagram = lazy(() => import('./pages/company/CompanyInstagram'))
const CompanyNews = lazy(() => import('./pages/company/CompanyNews'))
const CompanyMetrics = lazy(() => import('./pages/company/CompanyMetrics'))
const CompanyAdmin = lazy(() => import('./pages/company/CompanyAdmin'))
const CompanySeguranca = lazy(() => import('./pages/company/CompanySeguranca'))
const CompanyFeedback = lazy(() => import('./pages/company/CompanyFeedback'))
const CompanyGroups = lazy(() => import('./pages/company/CompanyGroups'))
const CompanyFinanceiro = lazy(() => import('./pages/company/CompanyFinanceiro'))
const CompanyCRM = lazy(() => import('./pages/company/CompanyCRM'))

function PrivateAdm({ children }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  if (session.role !== 'adm') return <Navigate to="/painel" replace />
  return children
}

function PrivateCompany({ children }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  if (session.role !== 'company') return <Navigate to="/adm" replace />
  return children
}

function RouteFallback() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '100%', minHeight: '60vh',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid #E5E7EB', borderTopColor: '#2563EB',
        animation: 'mm-spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes mm-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />

            <Route path="/adm" element={<PrivateAdm><AdmLayout /></PrivateAdm>}>
              <Route index element={<AdmDashboard />} />
              <Route path="empresas" element={<AdmCompanies />} />
              <Route path="empresas/:id" element={<AdmCompanyDetail />} />
              <Route path="espiao" element={<AdmEspiao />} />
              <Route path="operacao" element={<AdmOperacao />} />
              <Route path="suporte" element={<AdmSupport />} />
              <Route path="qualidade" element={<AdmQualidade />} />
              <Route path="analise" element={<AdmAnalise />} />
              <Route path="landing" element={<AdmLanding />} />
            </Route>

            <Route path="/painel" element={<PrivateCompany><CompanyLayout /></PrivateCompany>}>
              <Route index element={<Navigate to="/painel/conversas" replace />} />
              <Route path="conversas" element={<CompanyConversations />} />
              <Route path="historico" element={<CompanyHistory />} />
              <Route path="contatos" element={<CompanyContacts />} />
              <Route path="contatos/:id" element={<CompanyPatientDetail />} />
              <Route path="agenda" element={<CompanyAgenda />} />
              <Route path="atividades" element={<CompanyKanban />} />
              <Route path="catalogo" element={<CompanyCatalog />} />
              <Route path="tutorial" element={<CompanyTutorial />} />
              <Route path="instagram" element={<CompanyInstagram />} />
              <Route path="novidades" element={<CompanyNews />} />
              <Route path="alertas" element={<CompanyAlerts />} />
              <Route path="metricas" element={<CompanyMetrics />} />
              <Route path="admin" element={<CompanyAdmin />} />
              <Route path="seguranca" element={<CompanySeguranca />} />
              <Route path="feedback"  element={<CompanyFeedback />} />
              <Route path="grupos"    element={<CompanyGroups />} />
              <Route path="financeiro" element={<CompanyFinanceiro />} />
              <Route path="crm" element={<CompanyCRM />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
