import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import { LanguageProvider } from './contexts/LanguageContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Loading from './components/common/Loading/Loading';
import InstallPrompt from './components/common/InstallPrompt/InstallPrompt';

// Eager load critical pages
import Layout from './components/Layout';
import HomePage from './pages/HomePage';

// Lazy load all other pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const ComponentsPage = lazy(() => import('./pages/ComponentsPage'));
const CategoryListingPage = lazy(() => import('./pages/CategoryListingPage'));
const VenueDetailPage = lazy(() => import('./pages/VenueDetailPage'));
const PartnersPage = lazy(() => import('./pages/PartnersPage'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'));
const MyOffersPage = lazy(() => import('./pages/MyOffersPage'));
const CreateOfferPage = lazy(() => import('./pages/CreateOfferPage'));
const EditOfferPage = lazy(() => import('./pages/EditOfferPage'));
const NearbyOffersPage = lazy(() => import('./pages/NearbyOffersPage'));
const RewardsPage = lazy(() => import('./pages/RewardsPage'));
const PromotionsPage = lazy(() => import('./pages/PromotionsPage'));
const ExperiencesPage = lazy(() => import('./pages/ExperiencesPage'));
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'));
const LocationsPage = lazy(() => import('./pages/LocationsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <FavoritesProvider>
            <Router>
              <Suspense fallback={<Loading fullScreen />}>
                <Routes>
                  <Route path="/" element={<Layout />}>
                    <Route index element={<HomePage />} />
                    <Route
                      path="dashboard"
                      element={
                        <ProtectedRoute>
                          <DashboardPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="profile"
                      element={
                        <ProtectedRoute>
                          <ProfilePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="settings"
                      element={
                        <ProtectedRoute>
                          <SettingsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="analytics"
                      element={
                        <ProtectedRoute>
                          <AnalyticsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="search" element={<SearchPage />} />
                    <Route path="nearby" element={<NearbyOffersPage />} />
                    <Route path="rewards" element={<RewardsPage />} />
                    <Route path="components" element={<ComponentsPage />} />
                    <Route path="categories" element={<CategoryListingPage />} />
                    <Route path="categories/:category" element={<CategoryListingPage />} />
                    <Route path="top-offers" element={<CategoryListingPage />} />
                    <Route path="offers/:id" element={<VenueDetailPage />} />
                    <Route path="partners" element={<PartnersPage />} />
                    <Route
                      path="partners/offers"
                      element={
                        <ProtectedRoute>
                          <MyOffersPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="partners/offers/new"
                      element={
                        <ProtectedRoute>
                          <CreateOfferPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="partners/offers/:id/edit"
                      element={
                        <ProtectedRoute>
                          <EditOfferPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="favorites" element={<FavoritesPage />} />
                    <Route path="promotions" element={<PromotionsPage />} />
                    <Route path="experiences" element={<ExperiencesPage />} />
                    <Route path="integrations" element={<IntegrationsPage />} />
                    <Route path="locations" element={<LocationsPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                  <Route
                    path="/login"
                    element={
                      <ProtectedRoute requireAuth={false}>
                        <LoginPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/register"
                    element={
                      <ProtectedRoute requireAuth={false}>
                        <RegisterPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/forgot-password"
                    element={
                      <ProtectedRoute requireAuth={false}>
                        <ForgotPasswordPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reset-password"
                    element={
                      <ProtectedRoute requireAuth={false}>
                        <ResetPasswordPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/verify-email"
                    element={
                      <ProtectedRoute requireAuth={false}>
                        <VerifyEmailPage />
                      </ProtectedRoute>
                    }
                  />
                </Routes>
              </Suspense>
            </Router>
            <Toaster position="top-right" />
            <InstallPrompt />
          </FavoritesProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;