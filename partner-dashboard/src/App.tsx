import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Loading from './components/common/Loading/Loading';
import InstallPrompt from './components/common/InstallPrompt/InstallPrompt';

// Eager load critical pages
import Layout from './components/Layout';
import HomePage from './pages/HomePage';

// Lazy load all other pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const RegisterPartnerPage = lazy(() => import('./pages/RegisterPartnerPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
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

// Media pages
const MediaPage = lazy(() => import('./pages/MediaPage'));
const MediaGalleryPage = lazy(() => import('./pages/MediaGalleryPage'));
const MediaPhotosPage = lazy(() => import('./pages/MediaPhotosPage'));
const MediaVideosPage = lazy(() => import('./pages/MediaVideosPage'));

// Promotions pages
const PromotionsTypePage = lazy(() => import('./pages/PromotionsTypePage'));
const PromotionsGastronomyPage = lazy(() => import('./pages/PromotionsGastronomyPage'));
const PromotionsExtremePage = lazy(() => import('./pages/PromotionsExtremePage'));
const PromotionsCulturalPage = lazy(() => import('./pages/PromotionsCulturalPage'));

// Categories pages
const CategoriesRestaurantTypesPage = lazy(() => import('./pages/CategoriesRestaurantTypesPage'));
const CategoriesHotelTypesPage = lazy(() => import('./pages/CategoriesHotelTypesPage'));
const CategoriesSpaPage = lazy(() => import('./pages/CategoriesSpaPage'));
const CategoriesWineriesPage = lazy(() => import('./pages/CategoriesWineriesPage'));
const CategoriesClubsPage = lazy(() => import('./pages/CategoriesClubsPage'));
const CategoriesCafesPage = lazy(() => import('./pages/CategoriesCafesPage'));

// Experiences pages
const ExperiencesGastronomyPage = lazy(() => import('./pages/ExperiencesGastronomyPage'));
const ExperiencesFoodToursPage = lazy(() => import('./pages/ExperiencesFoodToursPage'));
const ExperiencesExtremePage = lazy(() => import('./pages/ExperiencesExtremePage'));
const ExperiencesAdventurePage = lazy(() => import('./pages/ExperiencesAdventurePage'));
const ExperiencesCulturalPage = lazy(() => import('./pages/ExperiencesCulturalPage'));
const ExperiencesMuseumsPage = lazy(() => import('./pages/ExperiencesMuseumsPage'));
const ExperiencesRomanticPage = lazy(() => import('./pages/ExperiencesRomanticPage'));
const ExperiencesRomanticActivitiesPage = lazy(() => import('./pages/ExperiencesRomanticActivitiesPage'));
const ExperiencesFamilyPage = lazy(() => import('./pages/ExperiencesFamilyPage'));
const ExperiencesFamilyActivitiesPage = lazy(() => import('./pages/ExperiencesFamilyActivitiesPage'));
const ExperiencesEducationalPage = lazy(() => import('./pages/ExperiencesEducationalPage'));
const ExperiencesLearningPage = lazy(() => import('./pages/ExperiencesLearningPage'));

// Locations pages
const LocationsCitiesPage = lazy(() => import('./pages/LocationsCitiesPage'));
const LocationsSofiaPage = lazy(() => import('./pages/LocationsSofiaPage'));
const LocationsPlovdivPage = lazy(() => import('./pages/LocationsPlovdivPage'));
const LocationsVarnaPage = lazy(() => import('./pages/LocationsVarnaPage'));
const LocationsBanskoPage = lazy(() => import('./pages/LocationsBanskoPage'));
const LocationsPricePage = lazy(() => import('./pages/LocationsPricePage'));
const LocationsPriceBudgetPage = lazy(() => import('./pages/LocationsPriceBudgetPage'));
const LocationsPricePremiumPage = lazy(() => import('./pages/LocationsPricePremiumPage'));
const LocationsPriceLuxuryPage = lazy(() => import('./pages/LocationsPriceLuxuryPage'));
const LocationsTypeAllPage = lazy(() => import('./pages/LocationsTypeAllPage'));

// Partners pages
const PartnersCategoriesPage = lazy(() => import('./pages/PartnersCategoriesPage'));
const PartnersRestaurantsPage = lazy(() => import('./pages/PartnersRestaurantsPage'));
const PartnersRegionsPage = lazy(() => import('./pages/PartnersRegionsPage'));
const PartnersSofiaPage = lazy(() => import('./pages/PartnersSofiaPage'));
const PartnersPlovdivPage = lazy(() => import('./pages/PartnersPlovdivPage'));
const PartnersVarnaPage = lazy(() => import('./pages/PartnersVarnaPage'));
const PartnersBanskoPage = lazy(() => import('./pages/PartnersBanskoPage'));
const PartnersStatusPage = lazy(() => import('./pages/PartnersStatusPage'));
const PartnersNewPage = lazy(() => import('./pages/PartnersNewPage'));
const PartnersVIPPage = lazy(() => import('./pages/PartnersVIPPage'));
const PartnersExclusivePage = lazy(() => import('./pages/PartnersExclusivePage'));

// Footer pages
const AboutPage = lazy(() => import('./pages/AboutPage'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const FAQPage = lazy(() => import('./pages/FAQPage'));

// New public pages
const ProductPage = lazy(() => import('./pages/ProductPage'));
const FeaturesPage = lazy(() => import('./pages/FeaturesPage'));
const PricingPublicPage = lazy(() => import('./pages/PricingPublicPage'));
const ContactPublicPage = lazy(() => import('./pages/ContactPublicPage'));
const CareersPage = lazy(() => import('./pages/CareersPage'));
const SecurityPage = lazy(() => import('./pages/SecurityPage'));

// Admin pages
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AdminOffersPage = lazy(() => import('./pages/AdminOffersPage'));
const AdminScanReviewPage = lazy(() => import('./pages/AdminScanReviewPage'));

// Receipt pages
const ReceiptsPage = lazy(() => import('./pages/ReceiptsPage'));
const ReceiptDetailPage = lazy(() => import('./pages/ReceiptDetailPage'));
const ReceiptAnalyticsPage = lazy(() => import('./pages/ReceiptAnalyticsPage'));
const AdminReceiptsPage = lazy(() => import('./pages/AdminReceiptsPage'));

// Payment pages
const PaymentSuccessPage = lazy(() => import('./pages/PaymentSuccessPage'));
const PaymentCancelPage = lazy(() => import('./pages/PaymentCancelPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors (client errors) except 429 (rate limit)
        if (error?.response?.status >= 400 && error?.response?.status < 500 && error?.response?.status !== 429) {
          return false;
        }
        // Retry up to 2 times for network errors and 5xx errors
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff: 1s, 2s, 4s, etc. up to 30s
      refetchOnWindowFocus: false, // Prevent refetch on window focus
      refetchOnReconnect: true,
      refetchOnMount: false, // Prevent automatic refetch on component mount
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
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
                    <Route
                      path="receipts"
                      element={
                        <ProtectedRoute>
                          <ReceiptsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="receipts/analytics"
                      element={
                        <ProtectedRoute>
                          <ReceiptAnalyticsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="receipts/:id"
                      element={
                        <ProtectedRoute>
                          <ReceiptDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="categories" element={<CategoryListingPage />} />
                    <Route path="categories/:category" element={<CategoryListingPage />} />
                    <Route path="top-offers" element={<CategoryListingPage />} />
                    <Route path="offers/:id" element={<VenueDetailPage />} />
                    <Route path="partners" element={<PartnersPage />} />

                    {/* ⚠️ ROUTE ORDER CRITICAL: Specific routes MUST come before dynamic params */}
                    {/* Partner offer management routes - MUST come before :category route */}
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

                    {/* Dynamic category route - MUST come after specific routes */}
                    <Route path="partners/:category" element={<CategoryListingPage />} />

                    {/* Media routes */}
                    <Route path="media" element={<MediaPage />} />
                    <Route path="media/gallery" element={<MediaGalleryPage />} />
                    <Route path="media/photos" element={<MediaPhotosPage />} />
                    <Route path="media/videos" element={<MediaVideosPage />} />

                    {/* Promotions routes */}
                    <Route path="promotions" element={<PromotionsPage />} />
                    <Route path="promotions/type" element={<PromotionsTypePage />} />
                    <Route path="promotions/gastronomy" element={<PromotionsGastronomyPage />} />
                    <Route path="promotions/extreme" element={<PromotionsExtremePage />} />
                    <Route path="promotions/cultural" element={<PromotionsCulturalPage />} />

                    {/* Categories routes */}
                    <Route path="categories/restaurants" element={<CategoriesRestaurantTypesPage />} />
                    <Route path="categories/restaurants/types" element={<CategoriesRestaurantTypesPage />} />
                    <Route path="categories/hotels" element={<CategoriesHotelTypesPage />} />
                    <Route path="categories/hotels/types" element={<CategoriesHotelTypesPage />} />
                    <Route path="categories/spa" element={<CategoriesSpaPage />} />
                    <Route path="categories/wineries" element={<CategoriesWineriesPage />} />
                    <Route path="categories/clubs" element={<CategoriesClubsPage />} />
                    <Route path="categories/cafes" element={<CategoriesCafesPage />} />

                    {/* Experiences routes */}
                    <Route path="experiences" element={<ExperiencesPage />} />
                    <Route path="experiences/gastronomy" element={<ExperiencesGastronomyPage />} />
                    <Route path="experiences/gastronomy/food-tours" element={<ExperiencesFoodToursPage />} />
                    <Route path="experiences/extreme" element={<ExperiencesExtremePage />} />
                    <Route path="experiences/extreme/adventure" element={<ExperiencesAdventurePage />} />
                    <Route path="experiences/cultural" element={<ExperiencesCulturalPage />} />
                    <Route path="experiences/cultural/museums" element={<ExperiencesMuseumsPage />} />
                    <Route path="experiences/romantic" element={<ExperiencesRomanticPage />} />
                    <Route path="experiences/romantic/activities" element={<ExperiencesRomanticActivitiesPage />} />
                    <Route path="experiences/family" element={<ExperiencesFamilyPage />} />
                    <Route path="experiences/family/activities" element={<ExperiencesFamilyActivitiesPage />} />
                    <Route path="experiences/educational" element={<ExperiencesEducationalPage />} />
                    <Route path="experiences/educational/learning" element={<ExperiencesLearningPage />} />

                    {/* Locations routes */}
                    <Route path="locations" element={<LocationsPage />} />
                    <Route path="locations/cities" element={<LocationsCitiesPage />} />
                    <Route path="locations/sofia" element={<LocationsSofiaPage />} />
                    <Route path="locations/plovdiv" element={<LocationsPlovdivPage />} />
                    <Route path="locations/varna" element={<LocationsVarnaPage />} />
                    <Route path="locations/bansko" element={<LocationsBanskoPage />} />
                    <Route path="locations/price" element={<LocationsPricePage />} />
                    <Route path="locations/price/budget" element={<LocationsPriceBudgetPage />} />
                    <Route path="locations/price/premium" element={<LocationsPricePremiumPage />} />
                    <Route path="locations/price/luxury" element={<LocationsPriceLuxuryPage />} />
                    <Route path="locations/type/all" element={<LocationsTypeAllPage />} />

                    {/* Partners routes */}
                    <Route path="partners/categories" element={<PartnersCategoriesPage />} />
                    <Route path="partners/restaurants" element={<PartnersRestaurantsPage />} />
                    <Route path="partners/regions" element={<PartnersRegionsPage />} />
                    <Route path="partners/sofia" element={<PartnersSofiaPage />} />
                    <Route path="partners/plovdiv" element={<PartnersPlovdivPage />} />
                    <Route path="partners/varna" element={<PartnersVarnaPage />} />
                    <Route path="partners/bansko" element={<PartnersBanskoPage />} />
                    <Route path="partners/status" element={<PartnersStatusPage />} />
                    <Route path="partners/new" element={<PartnersNewPage />} />
                    <Route path="partners/vip" element={<PartnersVIPPage />} />
                    <Route path="partners/exclusive" element={<PartnersExclusivePage />} />

                    {/* Footer routes */}
                    <Route path="about" element={<AboutPage />} />
                    <Route path="subscriptions" element={<SubscriptionsPage />} />
                    <Route path="contacts" element={<ContactsPage />} />
                    <Route path="support" element={<SupportPage />} />
                    <Route path="terms" element={<TermsPage />} />
                    <Route path="privacy" element={<PrivacyPage />} />
                    <Route path="faq" element={<FAQPage />} />

                    {/* New public pages */}
                    <Route path="product" element={<ProductPage />} />
                    <Route path="features" element={<FeaturesPage />} />
                    <Route path="pricing" element={<PricingPublicPage />} />
                    <Route path="contact" element={<ContactPublicPage />} />
                    <Route path="careers" element={<CareersPage />} />
                    <Route path="security" element={<SecurityPage />} />

                    {/* Admin routes - Role-protected */}
                    <Route
                      path="admin"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <AdminDashboardPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="admin/offers"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <AdminOffersPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="admin/receipts"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <AdminReceiptsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="admin/scan-review"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <AdminScanReviewPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Payment routes */}
                    <Route path="payments/success" element={<PaymentSuccessPage />} />
                    <Route path="payments/cancel" element={<PaymentCancelPage />} />

                    {/* Other routes */}
                    <Route path="favorites" element={<FavoritesPage />} />
                    <Route path="integrations" element={<IntegrationsPage />} />
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
                    path="/register/partner"
                    element={
                      <ProtectedRoute requireAuth={false}>
                        <RegisterPartnerPage />
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
    </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;