import { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazyWithRetry as lazy } from './utils/lazyWithRetry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { CookieConsentProvider } from './contexts/CookieConsentContext';
import { LocationProvider } from './contexts/LocationContext';
import { CookieConsentBanner, CookiePreferencesModal } from './components/common/CookieConsent';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { CategoryShell } from './components/admin/CategoryShell';
import { ADMIN_NAV } from './components/admin/AdminNav';
import Loading from './components/common/Loading/Loading';
import ScrollToTop from './components/common/ScrollToTop/ScrollToTop';
import ScrollToTopButton from './components/common/ScrollToTopButton/ScrollToTopButton';

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
const PartnerMenusPage = lazy(() => import('./pages/PartnerMenusPage'));
const NearbyOffersPage = lazy(() => import('./pages/NearbyOffersPage'));
const RewardsPage = lazy(() => import('./pages/RewardsPage'));
const PromotionsPage = lazy(() => import('./pages/PromotionsPage'));
const ExperiencesPage = lazy(() => import('./pages/ExperiencesPage'));
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'));
const LocationsPage = lazy(() => import('./pages/LocationsPage'));
const UploadReceiptInfoPage = lazy(() => import('./pages/UploadReceiptInfoPage'));
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'));
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

// Venues pages
const VenuesRestaurantTypesPage = lazy(() => import('./pages/VenuesRestaurantTypesPage'));
const VenuesHotelTypesPage = lazy(() => import('./pages/VenuesHotelTypesPage'));
const VenuesSpaPage = lazy(() => import('./pages/VenuesSpaPage'));
const VenuesWineriesPage = lazy(() => import('./pages/VenuesWineriesPage'));
const VenuesClubsPage = lazy(() => import('./pages/VenuesClubsPage'));
const VenuesCafesPage = lazy(() => import('./pages/VenuesCafesPage'));

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
// CareersPage temporarily removed
const SecurityPage = lazy(() => import('./pages/SecurityPage'));
const CookiePolicyPage = lazy(() => import('./pages/CookiePolicyPage'));
const RefundPolicyPage = lazy(() => import('./pages/RefundPolicyPage'));

// Admin pages
const AdminComingSoonPage = lazy(() => import('./pages/admin/AdminComingSoonPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminPartnerRequestsPage = lazy(() => import('./pages/admin/AdminPartnerRequestsPage'));
const AdminSubscribersAllPage = lazy(() => import('./pages/admin/AdminSubscribersAllPage'));
const AdminPayoutsPage = lazy(() => import('./pages/admin/AdminPayoutsPage'));
const AdminTransactionsPage = lazy(() => import('./pages/admin/AdminTransactionsPage'));
const AdminSubscriptionsPage = lazy(() => import('./pages/admin/AdminSubscriptionsPage'));
const AdminPartnersPage = lazy(() => import('./pages/AdminPartnersPage'));
const AdminScanReviewPage = lazy(() => import('./pages/AdminScanReviewPage'));
const AdminCashbackPage = lazy(() => import('./pages/admin/AdminCashbackPage'));
const AdminCashbackRatesPage = lazy(() => import('./pages/AdminCashbackRatesPage'));
const AdminPartnerOnboardingPage = lazy(() => import('./pages/AdminPartnerOnboardingPage'));
const AdminAdminsAllPage = lazy(() => import('./pages/admin/AdminAdminsAllPage'));
const AdminAdminsCreatePage = lazy(() => import('./pages/admin/AdminAdminsCreatePage'));
const AdminAdminsPendingPage = lazy(() => import('./pages/admin/AdminAdminsPendingPage'));
const AdminAdminsAuditPage = lazy(() => import('./pages/admin/AdminAdminsAuditPage'));
const AdminAlertsPage = lazy(() => import('./pages/admin/AdminAlertsPage'));

// Receipt pages
const ReceiptsPage = lazy(() => import('./pages/ReceiptsPage'));
const ReceiptDetailPage = lazy(() => import('./pages/ReceiptDetailPage'));
const ReceiptAnalyticsPage = lazy(() => import('./pages/ReceiptAnalyticsPage'));
const AdminReceiptsPage = lazy(() => import('./pages/AdminReceiptsPage'));
const AdminVenueFraudConfigPage = lazy(() => import('./pages/AdminVenueFraudConfigPage'));
const AdminReceiptTemplatesPage = lazy(() => import('./pages/AdminReceiptTemplatesPage'));

// Payment pages
const PaymentSuccessPage = lazy(() => import('./pages/PaymentSuccessPage'));
const PaymentCancelPage = lazy(() => import('./pages/PaymentCancelPage'));
const SubscriptionSuccessPage = lazy(() => import('./pages/SubscriptionSuccessPage'));
const SubscriptionCancelPage = lazy(() => import('./pages/SubscriptionCancelPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        // Don't retry on 4xx errors (client errors) except 429 (rate limit)
        if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
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
          <CookieConsentProvider>
          <AuthProvider>
            <FavoritesProvider>
              <LocationProvider>
              <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <ScrollToTop />
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
                        <ProtectedRoute requiredRole="admin">
                          <CreateOfferPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="partners/offers/:id/edit"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <EditOfferPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="partners/menus"
                      element={
                        <ProtectedRoute>
                          <PartnerMenusPage />
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

                    {/* Offers routes (renamed from promotions) */}
                    <Route path="offers" element={<PromotionsPage />} />
                    <Route path="offers/type" element={<PromotionsTypePage />} />
                    <Route path="offers/gastronomy" element={<PromotionsGastronomyPage />} />
                    <Route path="offers/extreme" element={<PromotionsExtremePage />} />
                    <Route path="offers/cultural" element={<PromotionsCulturalPage />} />

                    {/* Venues routes */}
                    <Route path="venues" element={<CategoryListingPage />} />
                    <Route path="venues/restaurants" element={<VenuesRestaurantTypesPage />} />
                    <Route path="venues/restaurants/types" element={<VenuesRestaurantTypesPage />} />
                    <Route path="venues/hotels" element={<VenuesHotelTypesPage />} />
                    <Route path="venues/hotels/types" element={<VenuesHotelTypesPage />} />
                    <Route path="venues/accommodation" element={<VenuesHotelTypesPage />} />
                    <Route path="venues/spa" element={<VenuesSpaPage />} />
                    <Route path="venues/wineries" element={<VenuesWineriesPage />} />
                    <Route path="venues/clubs" element={<VenuesClubsPage />} />
                    <Route path="venues/cafes" element={<VenuesCafesPage />} />
                    <Route path="venues/panoramic" element={<VenuesClubsPage />} />

                    {/* Experiences routes */}
                    <Route path="experiences" element={<ExperiencesPage />} />
                    {/* Gastronomic */}
                    <Route path="experiences/gastronomic" element={<ExperiencesGastronomyPage />} />
                    <Route path="experiences/gastronomic/degustations" element={<ExperiencesGastronomyPage />} />
                    <Route path="experiences/gastronomic/food-traditions" element={<ExperiencesFoodToursPage />} />
                    {/* Historical & Cultural */}
                    <Route path="experiences/historical-cultural" element={<ExperiencesCulturalPage />} />
                    <Route path="experiences/historical-cultural/walking-tours" element={<ExperiencesCulturalPage />} />
                    <Route path="experiences/historical-cultural/historical-tours" element={<ExperiencesCulturalPage />} />
                    <Route path="experiences/historical-cultural/museums-galleries" element={<ExperiencesMuseumsPage />} />
                    {/* Active & Adventure */}
                    <Route path="experiences/active-adventure" element={<ExperiencesAdventurePage />} />
                    <Route path="experiences/active-adventure/nature-tours" element={<ExperiencesAdventurePage />} />
                    <Route path="experiences/active-adventure/bike-tours" element={<ExperiencesAdventurePage />} />
                    <Route path="experiences/active-adventure/offroad-atv" element={<ExperiencesAdventurePage />} />
                    <Route path="experiences/active-adventure/water-activities" element={<ExperiencesAdventurePage />} />
                    {/* Extreme */}
                    <Route path="experiences/extreme" element={<ExperiencesExtremePage />} />
                    <Route path="experiences/extreme/aerial" element={<ExperiencesExtremePage />} />
                    <Route path="experiences/extreme/jumping" element={<ExperiencesExtremePage />} />
                    <Route path="experiences/extreme/motorcycles" element={<ExperiencesExtremePage />} />
                    <Route path="experiences/extreme/water" element={<ExperiencesExtremePage />} />
                    {/* Educational & Creative */}
                    <Route path="experiences/educational-creative" element={<ExperiencesEducationalPage />} />
                    <Route path="experiences/educational-creative/cooking" element={<ExperiencesLearningPage />} />
                    <Route path="experiences/educational-creative/workshops" element={<ExperiencesLearningPage />} />
                    <Route path="experiences/educational-creative/arts" element={<ExperiencesLearningPage />} />
                    {/* Relax & Wellness */}
                    <Route path="experiences/relax-wellness" element={<ExperiencesRomanticPage />} />
                    <Route path="experiences/relax-wellness/spa-thermal" element={<ExperiencesRomanticPage />} />
                    <Route path="experiences/relax-wellness/massages-therapies" element={<ExperiencesRomanticPage />} />
                    <Route path="experiences/relax-wellness/relax-experiences" element={<ExperiencesRomanticPage />} />
                    <Route path="experiences/relax-wellness/yoga-meditation" element={<ExperiencesRomanticPage />} />
                    {/* Legacy routes (keep for backwards compatibility) */}
                    <Route path="experiences/gastronomy" element={<ExperiencesGastronomyPage />} />
                    <Route path="experiences/gastronomy/food-tours" element={<ExperiencesFoodToursPage />} />
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
                    <Route path="cookies" element={<CookiePolicyPage />} />
                    <Route path="refund-policy" element={<RefundPolicyPage />} />
                    <Route path="faq" element={<FAQPage />} />

                    {/* New public pages */}
                    <Route path="product" element={<ProductPage />} />
                    <Route path="features" element={<FeaturesPage />} />
                    <Route path="pricing" element={<PricingPublicPage />} />
                    <Route path="contact" element={<ContactPublicPage />} />
                    <Route path="security" element={<SecurityPage />} />

                    {/* Admin routes - Role-protected */}
                    <Route path="admin-preview" element={<AdminDashboardPage />} />
                    {/* /admin/receipts kept as a real route (not yet mapped to new IA category) */}
                    <Route
                      path="admin/receipts"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <AdminReceiptsPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* ── New 10-category admin IA (Phase 0) ──────────────────────── */}
                    {/* /admin/dashboard */}
                    <Route
                      path="admin/dashboard"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <CategoryShell category={ADMIN_NAV[0]} />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<AdminDashboardPage />} />
                      <Route path="alerts" element={<AdminAlertsPage />} />
                    </Route>

                    {/* /admin/subscribers */}
                    <Route
                      path="admin/subscribers"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <CategoryShell category={ADMIN_NAV[1]} />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<Navigate to="all" replace />} />
                      <Route path="all" element={<AdminSubscribersAllPage />} />
                      <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
                      <Route path="transactions" element={<AdminTransactionsPage />} />
                      <Route path="cashback" element={<AdminCashbackPage />} />
                    </Route>

                    {/* /admin/partners (new IA) */}
                    <Route
                      path="admin/partners/new"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <CategoryShell category={ADMIN_NAV[2]} />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<Navigate to="requests" replace />} />
                      <Route path="requests" element={<AdminPartnerRequestsPage />} />
                      <Route path="onboarding" element={<AdminPartnerOnboardingPage />} />
                      <Route path="active" element={<AdminPartnersPage />} />
                      <Route path="locations" element={<AdminComingSoonPage />} />
                      <Route path="receipt-profiles" element={<AdminReceiptTemplatesPage />} />
                    </Route>

                    {/* /admin/finance */}
                    <Route
                      path="admin/finance"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <CategoryShell category={ADMIN_NAV[3]} />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<Navigate to="payouts" replace />} />
                      <Route path="payouts" element={<AdminPayoutsPage />} />
                      <Route path="invoices" element={<AdminComingSoonPage />} />
                      <Route path="periods" element={<AdminComingSoonPage />} />
                      <Route path="reports" element={<AdminComingSoonPage />} />
                    </Route>

                    {/* /admin/control */}
                    <Route
                      path="admin/control"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <CategoryShell category={ADMIN_NAV[4]} />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<Navigate to="risk" replace />} />
                      <Route path="risk" element={<AdminScanReviewPage />} />
                      <Route path="security" element={<AdminComingSoonPage />} />
                      <Route path="disputes" element={<AdminComingSoonPage />} />
                      <Route path="rules" element={<AdminVenueFraudConfigPage />} />
                    </Route>

                    {/* /admin/marketing — placeholder */}
                    <Route
                      path="admin/marketing"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <CategoryShell category={ADMIN_NAV[5]} />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<Navigate to="campaigns" replace />} />
                      <Route path="campaigns" element={<AdminComingSoonPage />} />
                      <Route path="templates" element={<AdminComingSoonPage />} />
                      <Route path="automations" element={<AdminComingSoonPage />} />
                      <Route path="lists" element={<AdminComingSoonPage />} />
                    </Route>

                    {/* /admin/settings */}
                    <Route
                      path="admin/settings"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <CategoryShell category={ADMIN_NAV[6]} />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<Navigate to="thresholds" replace />} />
                      <Route path="thresholds" element={<AdminComingSoonPage />} />
                      <Route path="percentages" element={<AdminCashbackRatesPage />} />
                      <Route path="validity" element={<AdminComingSoonPage />} />
                      <Route path="mobile" element={<AdminComingSoonPage />} />
                      <Route path="system" element={<AdminComingSoonPage />} />
                    </Route>

                    {/* /admin/admins */}
                    <Route
                      path="admin/admins"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <CategoryShell category={ADMIN_NAV[7]} />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<Navigate to="all" replace />} />
                      <Route path="all" element={<AdminAdminsAllPage />} />
                      <Route path="create" element={<AdminAdminsCreatePage />} />
                      <Route path="pending" element={<AdminAdminsPendingPage />} />
                      <Route path="audit" element={<AdminAdminsAuditPage />} />
                    </Route>

                    {/* /admin/help — placeholder */}
                    <Route
                      path="admin/help"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <CategoryShell category={ADMIN_NAV[8]} />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<Navigate to="all" replace />} />
                      <Route path="new" element={<AdminComingSoonPage />} />
                      <Route path="mine" element={<AdminComingSoonPage />} />
                      <Route path="all" element={<AdminComingSoonPage />} />
                    </Route>

                    {/* /admin/profile */}
                    <Route
                      path="admin/profile"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <CategoryShell category={ADMIN_NAV[9]} />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<Navigate to="my-data" replace />} />
                      <Route path="my-data" element={<AdminComingSoonPage />} />
                      <Route path="security" element={<AdminComingSoonPage />} />
                    </Route>

                    {/* Legacy deep-link redirects — keep old URLs working */}
                    <Route path="admin/partners" element={<Navigate to="/admin/partners/new/active" replace />} />
                    <Route path="admin/cashback" element={<Navigate to="/admin/subscribers/cashback" replace />} />
                    <Route path="admin/cashback/rates" element={<Navigate to="/admin/settings/percentages" replace />} />
                    <Route path="admin/partner-onboarding" element={<Navigate to="/admin/partners/new/onboarding" replace />} />
                    <Route path="admin/scan-review" element={<Navigate to="/admin/control/risk" replace />} />
                    <Route path="admin/venue-fraud-config" element={<Navigate to="/admin/control/rules" replace />} />
                    <Route path="admin/receipt-templates" element={<Navigate to="/admin/partners/new/receipt-profiles" replace />} />
                    <Route path="admin/merchant-whitelist" element={<Navigate to="/admin/control/rules" replace />} />
                    <Route path="admin/menu-approvals" element={<Navigate to="/admin/partners/new/active" replace />} />
                    <Route path="admin/bulk-import" element={<Navigate to="/admin/partners/new/active" replace />} />
                    <Route path="admin/partner-types" element={<Navigate to="/admin/settings/thresholds" replace />} />
                    <Route path="admin/top-discounts" element={<Navigate to="/admin/control/risk" replace />} />

                    {/* /admin (bare) → /admin/dashboard */}
                    <Route path="admin" element={<Navigate to="/admin/dashboard" replace />} />

                    {/* Checkout route */}
                    <Route path="checkout" element={<CheckoutPage />} />

                    {/* Payment routes */}
                    <Route path="payments/success" element={<PaymentSuccessPage />} />
                    <Route path="payments/cancel" element={<PaymentCancelPage />} />
                    <Route path="subscription/success" element={<SubscriptionSuccessPage />} />
                    <Route path="subscription/cancel" element={<SubscriptionCancelPage />} />

                    {/* Other routes */}
                    <Route path="favorites" element={<FavoritesPage />} />
                    <Route path="upload-receipt" element={<UploadReceiptInfoPage />} />
                    <Route path="subscription" element={<SubscriptionPage />} />
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
            <ScrollToTopButton />
            <CookieConsentBanner />
            <CookiePreferencesModal />
              </LocationProvider>
          </FavoritesProvider>
        </AuthProvider>
          </CookieConsentProvider>
      </LanguageProvider>
    </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;